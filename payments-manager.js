/* Control mensual de cuotas FT. Los perfiles se conservan al pausar el acceso. */
(function () {
  const feeState = {
      clients: [],
      payments: [],
      query: "",
      filter: "all",
      grace: localStorage.getItem("ft-fee-grace") !== "off",
    },
    esc = (value) => escapeHtml(String(value ?? "")),
    euro = (value) =>
      new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency: "EUR",
      }).format(Number(value) || 0),
    iso = (date) => date.toISOString().slice(0, 10),
    currentMonth = () => new Date().toISOString().slice(0, 7),
    monthRange = (month) => {
      const [year, number] = month.split("-").map(Number);
      return {
        start: `${month}-01`,
        end: iso(new Date(Date.UTC(year, number, 0))),
      };
    },
    clientName = (client) =>
      (
        client.full_name ||
        `${client.first_name || ""} ${client.last_name || ""}`
      ).trim(),
    initials = (client) =>
      clientName(client)
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

  function feeStatus(client) {
    const today = new Date(),
      todayIso = iso(today),
      paid = feeState.payments.find(
        (payment) =>
          payment.client_id === client.id &&
          payment.period_start <= todayIso &&
          payment.period_end >= todayIso,
      );
    if (paid) return { key: "paid", label: "Al dia", payment: paid };
    const priorMonthEnd = iso(
        new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0)),
      ),
      prior = feeState.payments.find(
        (payment) =>
          payment.client_id === client.id &&
          payment.period_end >= priorMonthEnd,
      );
    if (feeState.grace && today.getDate() <= 10 && prior)
      return { key: "grace", label: `Tregua hasta el dia 10`, payment: prior };
    return { key: "due", label: "Pendiente", payment: null };
  }

  pages.payments = () => `<div class="fees-page">
    <section class="fees-hero"><div><p class="eyebrow">CONTROL MENSUAL</p><h2>Cuotas y accesos</h2><p>Registra el pago en efectivo. El acceso se activa hasta el fin del periodo.</p></div><button type="button" class="primary" id="new-fee-payment">+ Registrar pago</button></section>
    <section class="fees-summary" id="fees-summary">
      <article class="card fee-stat"><span class="fee-stat-icon">${icons.users}</span><div><b>--</b><small>Socios totales</small></div></article>
      <article class="card fee-stat"><span class="fee-stat-icon">${icons.card}</span><div><b>--</b><small>Cuotas al dia</small></div></article>
      <article class="card fee-stat"><span class="fee-stat-icon">${icons.bell}</span><div><b>--</b><small>Pendientes</small></div></article>
      <article class="card fee-stat"><span class="fee-stat-icon">${icons.chart}</span><div><b>--</b><small>Cobrado este mes</small></div></article>
    </section>
    <section class="fees-toolbar">
      <label class="fees-search"><span data-icon="search"></span><input id="fee-search" type="search" placeholder="Buscar por nombre, abonado, DNI o telefono"></label>
      <select id="fee-filter" aria-label="Filtrar cuotas"><option value="all">Todos los estados</option><option value="paid">Al dia</option><option value="grace">En tregua</option><option value="due">Pendientes</option></select>
      <label class="fees-grace"><input id="fee-grace" type="checkbox" ${feeState.grace ? "checked" : ""}> Tregua del dia 1 al 10</label>
    </section>
    <section class="card fees-table-card"><table class="fees-table"><thead><tr><th>SOCIO</th><th>ESTADO</th><th>PERIODO PAGADO</th><th>ULTIMO PAGO</th><th>IMPORTE</th><th>ACCIONES</th></tr></thead><tbody id="fee-rows"><tr><td colspan="6" class="fees-empty">Cargando cuotas...</td></tr></tbody></table></section>
  </div>`;
  titles.payments = ["CONTROL DE SOCIOS", "Cuotas mensuales"];

  async function loadFees() {
    const target = document.getElementById("fee-rows");
    if (!target) return;
    const [clientsResult, paymentsResult] = await Promise.all([
      ftSupabase
        .from("clients")
        .select(
          "id,subscriber_number,first_name,last_name,full_name,dni,phone,email,access_status,activated_at",
        )
        .order("full_name"),
      ftSupabase
        .from("payments")
        .select(
          "id,client_id,amount_eur,paid_on,period_start,period_end,method,notes,created_at",
        )
        .order("paid_on", { ascending: false }),
    ]);
    if (clientsResult.error || paymentsResult.error) {
      target.innerHTML =
        '<tr><td colspan="6" class="fees-empty">No se pudieron cargar las cuotas.</td></tr>';
      return;
    }
    feeState.clients = clientsResult.data || [];
    feeState.payments = paymentsResult.data || [];
    await reconcileAccess();
    renderFees();
    bindFeeControls();
  }

  async function reconcileAccess() {
    const changes = feeState.clients
      .map((client) => ({ client, status: feeStatus(client) }))
      .filter(({ client, status }) => {
        const shouldBeActive = status.key === "paid" || status.key === "grace";
        return shouldBeActive
          ? client.access_status !== "active"
          : client.access_status === "active";
      });
    for (const { client, status } of changes) {
      const active = status.key === "paid" || status.key === "grace";
      const { error } = await ftSupabase
        .from("clients")
        .update({
          access_status: active ? "active" : "paused",
          activated_at: active ? client.activated_at || new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", client.id);
      if (!error) client.access_status = active ? "active" : "paused";
    }
  }

  function renderFees() {
    const rows = document.getElementById("fee-rows");
    if (!rows) return;
    let clients = feeState.clients.map((client) => ({
      client,
      status: feeStatus(client),
      history: feeState.payments.filter((payment) => payment.client_id === client.id),
    }));
    if (feeState.query)
      clients = clients.filter(({ client }) =>
        [
          clientName(client),
          client.subscriber_number,
          client.dni,
          client.phone,
          client.email,
        ].some((value) =>
          String(value || "")
            .toLocaleLowerCase("es")
            .includes(feeState.query),
        ),
      );
    if (feeState.filter !== "all")
      clients = clients.filter(({ status }) => status.key === feeState.filter);
    rows.innerHTML = clients.length
      ? clients
          .map(({ client, status, history }) => {
            const last = history[0];
            return `<tr><td><div class="fee-client"><span class="fee-client-avatar">${esc(initials(client))}</span><div><b>${esc(clientName(client))}</b><small>Abonado #${esc(client.subscriber_number || "--")} · ${esc(client.phone || "Sin telefono")}</small></div></div></td><td><span class="fee-status ${status.key}">${status.label}</span></td><td>${status.payment ? `${formatDate(status.payment.period_start)} - ${formatDate(status.payment.period_end)}` : "Sin periodo activo"}</td><td>${last ? formatDate(last.paid_on) : "Nunca"}</td><td><b>${last ? euro(last.amount_eur) : "--"}</b></td><td><div class="fee-actions"><button type="button" class="primary" data-pay-client="${client.id}">Registrar</button><button type="button" class="fee-history" data-fee-history="${client.id}">Historial (${history.length})</button></div></td></tr>`;
          })
          .join("")
      : '<tr><td colspan="6" class="fees-empty">No hay socios con estos filtros.</td></tr>';
    const statuses = feeState.clients.map((client) => feeStatus(client)),
      paid = statuses.filter((status) => status.key === "paid").length,
      due = statuses.filter((status) => status.key === "due").length,
      month = currentMonth(),
      revenue = feeState.payments
        .filter((payment) => payment.period_start?.startsWith(month))
        .reduce((sum, payment) => sum + Number(payment.amount_eur || 0), 0),
      values = [feeState.clients.length, paid, due, euro(revenue)];
    document
      .querySelectorAll("#fees-summary .fee-stat b")
      .forEach((node, index) => (node.textContent = values[index]));
    rows.querySelectorAll("[data-pay-client]").forEach(
      (button) => (button.onclick = () => openPaymentForm(button.dataset.payClient)),
    );
    rows.querySelectorAll("[data-fee-history]").forEach(
      (button) =>
        (button.onclick = () => openPaymentHistory(button.dataset.feeHistory)),
    );
  }

  function bindFeeControls() {
    const search = document.getElementById("fee-search"),
      filter = document.getElementById("fee-filter"),
      grace = document.getElementById("fee-grace"),
      add = document.getElementById("new-fee-payment");
    search.oninput = () => {
      feeState.query = search.value.trim().toLocaleLowerCase("es");
      renderFees();
    };
    filter.onchange = () => {
      feeState.filter = filter.value;
      renderFees();
    };
    grace.onchange = async () => {
      feeState.grace = grace.checked;
      localStorage.setItem("ft-fee-grace", grace.checked ? "on" : "off");
      await reconcileAccess();
      renderFees();
      toast(grace.checked ? "Tregua activada hasta el dia 10" : "Tregua desactivada");
    };
    add.onclick = () => openPaymentForm("");
  }

  function formatDate(value) {
    if (!value) return "--";
    return new Date(`${value}T12:00:00`).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function overlay(id) {
    let node = document.getElementById(id);
    if (!node) {
      node = document.createElement("div");
      node.id = id;
      node.className = "admin-form-overlay";
      document.body.appendChild(node);
    }
    node.classList.add("open");
    node.onclick = (event) => {
      if (event.target === node) node.classList.remove("open");
    };
    return node;
  }

  function openPaymentForm(selectedClient) {
    const node = overlay("payment-form-overlay"),
      month = currentMonth();
    node.innerHTML = `<form class="admin-form payment-form"><button type="button" class="admin-form-close" aria-label="Cerrar">×</button><p class="eyebrow">REGISTRAR CUOTA</p><h2>Confirmar pago en efectivo</h2><p class="muted">Al guardar, el socio recupera todo el acceso durante el periodo elegido.</p><div class="admin-fields"><label class="wide">Socio<select name="client_id" required><option value="">Selecciona un socio</option>${feeState.clients.map((client) => `<option value="${client.id}" ${client.id === selectedClient ? "selected" : ""}>#${esc(client.subscriber_number || "--")} · ${esc(clientName(client))} · ${esc(client.phone || "")}</option>`).join("")}</select></label><label>Mes de la cuota<input type="month" name="period" value="${month}" required></label><label>Importe<input type="number" name="amount" value="45" min="0" step="0.01" required></label><label>Fecha del pago<input type="date" name="paid_on" value="${iso(new Date())}" required></label><label>Metodo<input value="Efectivo" disabled></label><label class="wide">Nota<textarea name="notes" placeholder="Opcional: descuento, beca, ajuste..."></textarea></label></div><div class="payment-period-preview"><span><small>Acceso desde</small><b id="payment-period-start"></b></span><span><small>Acceso hasta</small><b id="payment-period-end"></b></span></div><p class="form-feedback" aria-live="polite"></p><button class="primary full" type="submit">Guardar pago y activar acceso</button></form>`;
    const form = node.querySelector("form"),
      period = form.querySelector('[name="period"]'),
      updatePreview = () => {
        const range = monthRange(period.value);
        form.querySelector("#payment-period-start").textContent = formatDate(range.start);
        form.querySelector("#payment-period-end").textContent = formatDate(range.end);
      };
    updatePreview();
    period.onchange = updatePreview;
    form.querySelector(".admin-form-close").onclick = () => node.classList.remove("open");
    form.onsubmit = async (event) => {
      event.preventDefault();
      const data = new FormData(form),
        clientId = String(data.get("client_id")),
        range = monthRange(String(data.get("period"))),
        feedback = form.querySelector(".form-feedback"),
        button = form.querySelector('[type="submit"]');
      if (!clientId) {
        feedback.textContent = "Selecciona un socio.";
        return;
      }
      const duplicate = feeState.payments.some(
        (payment) =>
          payment.client_id === clientId && payment.period_start === range.start,
      );
      if (duplicate && !confirm("Ya existe una cuota para este mes. Quieres registrar otro pago?")) return;
      button.disabled = true;
      button.textContent = "Guardando...";
      const { data: auth } = await ftSupabase.auth.getUser(),
        { error } = await ftSupabase.from("payments").insert({
          client_id: clientId,
          amount_eur: Number(data.get("amount")),
          paid_on: String(data.get("paid_on")),
          period_start: range.start,
          period_end: range.end,
          method: "cash",
          recorded_by: auth.user?.id || null,
          notes: String(data.get("notes") || "").trim() || null,
        });
      if (error) {
        feedback.textContent = "No se pudo registrar el pago.";
        button.disabled = false;
        button.textContent = "Guardar pago y activar acceso";
        return;
      }
      await ftSupabase
        .from("clients")
        .update({
          access_status: "active",
          activated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", clientId);
      node.classList.remove("open");
      toast("Pago registrado y acceso activado");
      await loadFees();
    };
  }

  function openPaymentHistory(clientId) {
    const client = feeState.clients.find((item) => item.id === clientId),
      history = feeState.payments.filter((payment) => payment.client_id === clientId),
      node = overlay("payment-history-overlay");
    node.innerHTML = `<section class="admin-form payment-form"><button type="button" class="admin-form-close" aria-label="Cerrar">×</button><p class="eyebrow">HISTORIAL DE CUOTAS</p><h2>${esc(clientName(client))}</h2><p class="muted">${history.length} pagos registrados. El perfil y este historial nunca se borran al pausar el acceso.</p><div class="payment-history-list">${history.length ? history.map((payment) => `<article class="payment-history-row"><div><b>${formatDate(payment.period_start)} - ${formatDate(payment.period_end)}</b><small>Pagado el ${formatDate(payment.paid_on)} · Efectivo${payment.notes ? ` · ${esc(payment.notes)}` : ""}</small></div><strong>${euro(payment.amount_eur)}</strong><span class="fee-status ${new Date(payment.period_end + "T23:59:59") >= new Date() ? "paid" : "due"}">${new Date(payment.period_end + "T23:59:59") >= new Date() ? "Vigente" : "Finalizada"}</span></article>`).join("") : '<div class="fees-empty">Todavia no hay pagos registrados.</div>'}</div><button type="button" class="primary full" data-history-pay>Registrar nueva cuota</button></section>`;
    node.querySelector(".admin-form-close").onclick = () => node.classList.remove("open");
    node.querySelector("[data-history-pay]").onclick = () => {
      node.classList.remove("open");
      openPaymentForm(clientId);
    };
  }

  const feesBaseRender = render;
  render = function (page = "dashboard") {
    feesBaseRender(page);
    if (page === "payments") setTimeout(loadFees, 0);
  };
})();
