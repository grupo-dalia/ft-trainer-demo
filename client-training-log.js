/* Historial visual por sesiones, accesible desde la ficha de cada cliente. */
(function () {
  const esc = (value) => escapeHtml(String(value ?? ""));
  const sessionDate = (session) =>
    session.planned_for || session.completed_at?.slice(0, 10) || session.started_at?.slice(0, 10);
  function dateLabel(value, options = {}) {
    if (!value) return "Fecha sin registrar";
    return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      ...options,
    });
  }
  const number = (value) => Number(value || 0);
  const weightLabel = (value) => `${number(value).toLocaleString("es-ES", { maximumFractionDigits: 1 })} kg`;
  function overlayNode(id) {
    let node = document.getElementById(id);
    if (!node) {
      node = document.createElement("div");
      node.id = id;
      node.className = "admin-form-overlay";
      document.body.appendChild(node);
    }
    return node;
  }

  window.openClientTraining = async function(clientId, clientName) {
    const node = overlayNode("client-training-overlay");
    node.innerHTML = `<section class="admin-form training-log-form"><button type="button" class="admin-form-close" aria-label="Cerrar">×</button><p class="eyebrow">HISTÓRICO POR RUTINA</p><h2>${esc(clientName)}</h2><p class="muted">Cada rutina, sus ejercicios y sus series, semana a semana.</p><div class="training-log-body"></div></section>`;
    node.classList.add('open');
    node.querySelector('.admin-form-close').onclick=()=>node.classList.remove('open');
    node.onclick=event=>{if(event.target===node)node.classList.remove('open')};
    await window.ftRoutineHistory.mount(node.querySelector('.training-log-body'),ftSupabase,clientId);
  };

  window.openClientRoutine = async function (clientId, clientName) {
    const { data: routine, error } = await ftSupabase
      .from("routines")
      .select("id,name")
      .eq("client_id", clientId)
      .in("status", ["active", "draft"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      toast("No se pudo abrir la rutina del cliente.");
      return;
    }
    if (!routine) {
      toast(
        `${clientName} todavia no tiene rutina asignada. Asignale una desde Rutinas.`,
      );
      return;
    }
    window.openRoutineEditor(routine.id);
  };

  function attachTrainingButtons() {
    document.querySelectorAll("#real-client-rows tr").forEach((row) => {
      const action = row.querySelector(".activation-btn");
      if (!action) return;
      const id = (action.getAttribute("onclick") || "").split("'")[1];
      if (!id) return;
      const name = row.querySelector(".client-cell b")?.textContent || "Cliente";
      if (!row.querySelector(".view-training"))
        action.insertAdjacentHTML(
          "afterend",
          ` <button type="button" class="view-training activation-btn" data-client="${id}" data-name="${esc(name)}">Entrenamientos</button>`,
        );
      if (!row.querySelector(".edit-client-routine"))
        action.insertAdjacentHTML(
          "afterend",
          ` <button type="button" class="edit-client-routine activation-btn" data-client="${id}" data-name="${esc(name)}">Editar rutina</button>`,
        );
    });
    document.querySelectorAll(".view-training").forEach((button) => {
      button.onclick = () =>
        window.openClientTraining(button.dataset.client, button.dataset.name);
    });
    document.querySelectorAll(".edit-client-routine").forEach((button) => {
      button.onclick = () =>
        window.openClientRoutine(button.dataset.client, button.dataset.name);
    });
  }
  const oldLoadClients = window.loadSupabaseClients;
  window.loadSupabaseClients = async () => {
    await oldLoadClients();
    attachTrainingButtons();
  };
})();
