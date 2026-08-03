(async () => {
  const db = window.ftSupabase,
    clientId = window.ftClientId,
    esc = (value) =>
      String(value ?? "").replace(
        /[&<>'"]/g,
        (char) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "'": "&#39;",
            '"': "&quot;",
          })[char],
      );
  const icon = (id) => `<svg aria-hidden="true"><use href="#ico-${id}"/></svg>`;
  const toast = (message) => {
    const node = document.getElementById("client-toast");
    node.textContent = message;
    node.classList.add("show");
    setTimeout(() => node.classList.remove("show"), 2400);
  };
  const panel = (id, title, iconName) => {
    let node = document.getElementById(id);
    if (!node) {
      node = document.createElement("section");
      node.id = id;
      node.className = "client-section-panel";
      node.innerHTML = `<header><button type="button" class="client-panel-back" aria-label="Volver">←</button><span>${icon(iconName)}</span><div><small>FT TRAINER</small><h1>${title}</h1></div></header><div class="client-panel-content"></div>`;
      document.body.appendChild(node);
      node.querySelector(".client-panel-back").onclick = () =>
        node.classList.remove("open");
    }
    return node;
  };
  const setActive = (name) =>
    document
      .querySelectorAll("[data-client-nav]")
      .forEach((button) =>
        button.classList.toggle("active", button.dataset.clientNav === name),
      );
  const openPanel = (node, name) => {
    document
      .querySelectorAll(".client-section-panel.open")
      .forEach((item) => item.classList.remove("open"));
    node.classList.add("open");
    setActive(name);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  let routine = null,
    routineItems = [],
    sessionId = null,
    selectedItem = null;
  async function loadRoutine() {
    if (!db || !clientId) return;
    const { data: routines } = await db
      .from("routines")
      .select("id,name,description,status,week_start")
      .eq("client_id", clientId)
      .in("status", ["active", "draft"])
      .order("created_at", { ascending: false })
      .limit(1);
    routine = routines?.[0] || null;
    if (!routine) {
      renderRoutineEmpty();
      return;
    }
    const { data: items } = await db
      .from("routine_exercises")
      .select(
        "id,exercise_id,day_number,position,target_sets,target_reps_min,target_reps_max,target_weight_kg,target_rir,rest_seconds,notes,exercises(name,body_group,primary_muscle,instructions,media_url,thumbnail_url,media_type)",
      )
      .eq("routine_id", routine.id)
      .order("day_number")
      .order("position");
    routineItems = items || [];
    renderRoutine();
  }
  function renderRoutineEmpty() {
    document.querySelector(".workout-cover h3").innerHTML =
      "Sin rutina<br><mark>asignada</mark>";
    document.getElementById("exercise-list").innerHTML =
      '<div class="client-empty-state">Fernando todavía no ha activado una rutina para ti.</div>';
    document.getElementById("next-session-title").textContent =
      "No tienes una sesión programada";
    document.getElementById("next-session-detail").textContent =
      "Fernando te avisará cuando tu rutina esté lista";
  }
  function renderRoutine() {
    document.querySelector(".workout-cover h3").innerHTML =
      `${esc(routine.name)}<br><mark>${routine.status === "active" ? "Activa" : "Borrador"}</mark>`;
    document.getElementById("next-session-title").textContent = routine.name;
    document.getElementById("next-session-detail").textContent =
      `${routineItems.length} ejercicios · planificación de Fernando`;
    document.getElementById("done-count").textContent = "0";
    document.querySelector(".workout-top b").lastChild.textContent =
      ` de ${routineItems.length} completados`;
    document.getElementById("percent").textContent = "0%";
    document.getElementById("session-progress").style.width = "0%";
    document.getElementById("exercise-list").innerHTML =
      routineItems
        .map((item, index) => {
          const ex = item.exercises || {},
            reps =
              item.target_reps_min === item.target_reps_max
                ? item.target_reps_min
                : `${item.target_reps_min || "—"}–${item.target_reps_max || "—"}`,
            image = ex.thumbnail_url || "assets/brand/ft-symbol-color.png";
          return `<button type="button" class="exercise-row live-exercise" data-live-index="${index}"><span class="exercise-thumb"><img src="${esc(image)}" alt="${esc(ex.name)}" loading="lazy"><i>${icon("play")}</i></span><span><b>${esc(ex.name || "Ejercicio")}</b><small>${item.target_sets} series · ${reps} repeticiones${item.target_weight_kg != null ? ` · ${item.target_weight_kg} kg` : ""}</small><em>Ver técnica y registrar</em></span><strong>›</strong></button>`;
        })
        .join("") ||
      '<div class="client-empty-state">Esta rutina aún no contiene ejercicios.</div>';
    document
      .querySelectorAll(".live-exercise")
      .forEach(
        (button) =>
          (button.onclick = () =>
            openExercise(
              routineItems[Number(button.dataset.liveIndex)],
              button,
            )),
      );
  }
  async function openExercise(item, row) {
    selectedItem = { item, row };
    const ex = item.exercises || {},
      sheet = document.getElementById("set-sheet");
    document.getElementById("sheet-title").textContent = ex.name || "Ejercicio";
    const gif = document.getElementById("sheet-gif");
    if (gif) {
      gif.src =
        ex.media_url || ex.thumbnail_url || "assets/brand/ft-symbol-color.png";
      gif.alt = `Demostración de ${ex.name || "ejercicio"}`;
    }
    const tip = document.querySelector(".technique-tip");
    if (tip)
      tip.textContent =
        ex.instructions ||
        item.notes ||
        "Sigue las indicaciones de Fernando y controla la técnica.";
    const { data: lastSets } = await db
      .from("set_logs")
      .select("reps,weight_kg,created_at")
      .eq("exercise_id", item.exercise_id)
      .order("created_at", { ascending: false })
      .limit(item.target_sets || 3);
    const last = document.querySelector(".last-record");
    if (last) {
      const top = (lastSets || []).reduce(
        (best, set) =>
          Number(set.weight_kg) > Number(best?.weight_kg || 0) ? set : best,
        null,
      );
      last.innerHTML = `<div><span>ÚLTIMA VEZ</span><b>${lastSets?.[0] ? `${lastSets[0].weight_kg || 0} kg × ${lastSets[0].reps || 0}` : "Sin registros"}</b></div><div><span>MEJOR CARGA</span><b>${top ? `${top.weight_kg || 0} kg` : "—"}</b></div>`;
    }
    const sets = sheet.querySelector(".sets");
    sets.innerHTML =
      "<div><b>SERIE</b><b>REPS</b><b>PESO</b></div>" +
      Array.from(
        { length: item.target_sets || 3 },
        (_, index) =>
          `<label><span>${index + 1}</span><input class="live-reps" value="${item.target_reps_min || ""}" inputmode="numeric" aria-label="Repeticiones serie ${index + 1}"><span><input class="live-weight" value="${item.target_weight_kg ?? ""}" inputmode="decimal" aria-label="Peso serie ${index + 1}"> kg</span></label>`,
      ).join("");
    sheet.classList.add("open");
  }
  async function ensureSession() {
    if (sessionId) return sessionId;
    const today = new Date().toISOString().slice(0, 10),
      existing = await db
        .from("workout_sessions")
        .select("id")
        .eq("client_id", clientId)
        .eq("routine_id", routine.id)
        .eq("planned_for", today)
        .maybeSingle();
    if (existing.data?.id) {
      sessionId = existing.data.id;
      return sessionId;
    }
    const created = await db
      .from("workout_sessions")
      .insert({
        client_id: clientId,
        routine_id: routine.id,
        day_number: selectedItem.item.day_number,
        planned_for: today,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (created.error) throw created.error;
    sessionId = created.data.id;
    return sessionId;
  }
  const oldSave = document.getElementById("save-set"),
    save = oldSave.cloneNode(true);
  oldSave.replaceWith(save);
  save.onclick = async () => {
    if (!selectedItem || !db) return;
    save.disabled = true;
    save.textContent = "Guardando…";
    try {
      const currentSession = await ensureSession(),
        reps = [...document.querySelectorAll(".live-reps")],
        weights = [...document.querySelectorAll(".live-weight")],
        logs = reps.map((input, index) => ({
          session_id: currentSession,
          routine_exercise_id: selectedItem.item.id,
          exercise_id: selectedItem.item.exercise_id,
          set_number: index + 1,
          reps: Number(input.value) || null,
          weight_kg:
            weights[index].value === ""
              ? null
              : Number(String(weights[index].value).replace(",", ".")),
          completed: true,
        }));
      const { error } = await db
        .from("set_logs")
        .upsert(logs, { onConflict: "session_id,exercise_id,set_number" });
      if (error) throw error;
      selectedItem.row.classList.add("done");
      selectedItem.row.querySelector("strong").textContent = "✓";
      const done = document.querySelectorAll(".live-exercise.done").length,
        total = routineItems.length,
        percent = total ? Math.round((done / total) * 100) : 0;
      document.getElementById("done-count").textContent = done;
      document.getElementById("percent").textContent = percent + "%";
      document.getElementById("session-progress").style.width = percent + "%";
      if (done === total)
        await db
          .from("workout_sessions")
          .update({ completed_at: new Date().toISOString() })
          .eq("id", currentSession);
      document.getElementById("set-sheet").classList.remove("open");
      toast("Series guardadas correctamente");
    } catch (error) {
      toast("No se pudo guardar. Comprueba la conexión.");
    } finally {
      save.disabled = false;
      save.textContent = "Guardar y completar ✓";
    }
  };

  const progressPanel = panel("real-progress-panel", "Mi progreso", "chart");
  async function showProgress() {
    openPanel(progressPanel, "progress");
    const host = progressPanel.querySelector(".client-panel-content");
    host.innerHTML = '<div class="panel-loading">Cargando tu evolución…</div>';
    if (!db) {
      host.innerHTML =
        '<div class="client-empty-state">Inicia sesión para consultar tu progreso.</div>';
      return;
    }
    const [{ data: measurements }, { data: sessions }] = await Promise.all([
      db
        .from("measurements")
        .select("*")
        .eq("client_id", clientId)
        .order("recorded_on", { ascending: false })
        .limit(12),
      db
        .from("workout_sessions")
        .select("id,completed_at,planned_for")
        .eq("client_id", clientId)
        .order("planned_for", { ascending: false })
        .limit(30),
    ]);
    const latest = measurements?.[0],
      completed = (sessions || []).filter((s) => s.completed_at).length;
    host.innerHTML = `<div class="client-metric-grid"><article><small>PESO ACTUAL</small><b>${latest?.weight_kg ?? "—"} <em>kg</em></b></article><article><small>GRASA CORPORAL</small><b>${latest?.body_fat_pct ?? "—"}<em>%</em></b></article><article><small>SESIONES COMPLETADAS</small><b>${completed}</b></article></div><section class="client-panel-card"><div class="panel-title"><div><small>SEGUIMIENTO SEMANAL</small><h2>Registrar medidas</h2></div></div><form id="measurement-form" class="client-form-grid"><label>Peso (kg)<input name="weight_kg" type="number" min="20" max="350" step="0.1" value="${latest?.weight_kg ?? ""}" required></label><label>Altura (cm)<input name="height_cm" type="number" min="100" max="240" step="0.1" value="${latest?.height_cm ?? ""}"></label><label>Grasa corporal (%)<input name="body_fat_pct" type="number" min="2" max="70" step="0.1" value="${latest?.body_fat_pct ?? ""}"></label><label>Cintura (cm)<input name="waist_cm" type="number" min="30" max="250" step="0.1" value="${latest?.waist_cm ?? ""}"></label><button class="client-primary" type="submit">Guardar registro semanal</button><p class="form-feedback"></p></form></section><section class="client-panel-card"><div class="panel-title"><div><small>HISTORIAL</small><h2>Últimos registros</h2></div></div><div class="measurement-history">${(measurements || []).map((item) => `<div><time>${new Date(item.recorded_on + "T12:00:00").toLocaleDateString("es-ES")}</time><b>${item.weight_kg ?? "—"} kg</b><span>${item.body_fat_pct ?? "—"}% grasa</span></div>`).join("") || '<p class="client-empty-state">Todavía no hay mediciones.</p>'}</div></section>`;
    host.querySelector("#measurement-form").onsubmit = async (event) => {
      event.preventDefault();
      const form = event.currentTarget,
        data = new FormData(form),
        payload = {
          client_id: clientId,
          recorded_on: new Date().toISOString().slice(0, 10),
        };
      ["weight_kg", "height_cm", "body_fat_pct", "waist_cm"].forEach(
        (key) =>
          (payload[key] = data.get(key) === "" ? null : Number(data.get(key))),
      );
      const result = await db
        .from("measurements")
        .upsert(payload, { onConflict: "client_id,recorded_on" });
      form.querySelector(".form-feedback").textContent = result.error
        ? "No se pudo guardar el registro."
        : "Registro guardado correctamente.";
      if (!result.error) setTimeout(showProgress, 500);
    };
  }

  const profilePanel = panel("client-profile-panel", "Mi perfil", "user");
  async function showProfile() {
    openPanel(profilePanel, "profile");
    const host = profilePanel.querySelector(".client-panel-content");
    host.innerHTML = '<div class="panel-loading">Cargando tu perfil…</div>';
    if (!db) {
      host.innerHTML =
        '<div class="client-empty-state">Inicia sesión para consultar tu perfil.</div>';
      return;
    }
    const { data: client } = await db
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .maybeSingle();
    host.innerHTML = `<section class="client-profile-hero"><span>${esc((client?.first_name || "FT").slice(0, 2).toUpperCase())}</span><div><h2>${esc(client?.full_name || `${client?.first_name || ""} ${client?.last_name || ""}`.trim() || "Cliente FT")}</h2><p>${esc(client?.email || "")}</p><b>${client?.access_status === "active" ? "Acceso activo" : "Acceso pendiente"}</b></div></section><section class="client-panel-card"><div class="panel-title"><div><small>DATOS PERSONALES</small><h2>Información de contacto</h2></div></div><form id="profile-form" class="client-form-grid"><label>Nombre<input name="first_name" value="${esc(client?.first_name || "")}" required></label><label>Apellidos<input name="last_name" value="${esc(client?.last_name || "")}"></label><label>Teléfono<input name="phone" value="${esc(client?.phone || "")}"></label><label>Objetivo<input name="goal" value="${esc(client?.goal || "")}"></label><button class="client-primary" type="submit">Guardar cambios</button><p class="form-feedback"></p></form></section><button type="button" class="client-logout">${icon("logout")} Cerrar sesión</button>`;
    host.querySelector("#profile-form").onsubmit = async (event) => {
      event.preventDefault();
      const form = event.currentTarget,
        data = new FormData(form),
        first = String(data.get("first_name")).trim(),
        last = String(data.get("last_name")).trim(),
        result = await db
          .from("clients")
          .update({
            first_name: first,
            last_name: last,
            full_name: `${first} ${last}`.trim(),
            phone: String(data.get("phone")).trim(),
            objective: String(data.get("goal")).trim(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", clientId);
      form.querySelector(".form-feedback").textContent = result.error
        ? "No se pudieron guardar los cambios."
        : "Perfil actualizado.";
    };
    host.querySelector(".client-logout").onclick = async () => {
      await db.auth.signOut();
      location.replace("index.html");
    };
  }

  document.querySelectorAll("[data-client-nav]").forEach(
    (button) =>
      (button.onclick = () => {
        const action = button.dataset.clientNav;
        if (action === "home") {
          document
            .querySelectorAll(".client-section-panel.open")
            .forEach((item) => item.classList.remove("open"));
          setActive("home");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
        if (action === "routine") {
          document
            .querySelectorAll(".client-section-panel.open")
            .forEach((item) => item.classList.remove("open"));
          setActive("routine");
          document
            .getElementById("routine-session")
            .scrollIntoView({ behavior: "smooth" });
        }
        if (action === "progress") showProgress();
        if (action === "profile") showProfile();
      }),
  );
  document
    .querySelectorAll('[data-home-action="progress"]')
    .forEach((button) => (button.onclick = showProgress));
  document
    .querySelectorAll('[data-home-action="profile"]')
    .forEach((button) => (button.onclick = showProfile));
  document.querySelector(".card-title a").onclick = (event) => {
    event.preventDefault();
    showProgress();
  };
  await loadRoutine();
  window.ftClientSections = { showProgress, showProfile, loadRoutine };
})();
