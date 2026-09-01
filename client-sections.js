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
      node.querySelector(".client-panel-back").onclick = () => {
        node.classList.remove("open");
        document.body.classList.remove("client-panel-open");
        setActive("home");
      };
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
    document.body.classList.add("client-panel-open");
    setActive(name);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  let routine = null,
    availableRoutines = [],
    allRoutineItems = [],
    routineItems = [],
    selectedRoutineDay = 1,
    completedExerciseIds = new Set(),
    sessionId = null,
    sessionStartedAt = Date.now(),
    selectedItem = null;
  let workoutTimerId = null;
  let restTimerId = null;
  let workoutPausedAt = null;

  function formatWorkoutTime(milliseconds) {
    const total = Math.max(0, Math.floor(milliseconds / 1000));
    return `${String(Math.floor(total / 3600)).padStart(2, "0")}:${String(Math.floor((total % 3600) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  function updateWorkoutClock() {
    const output = document.getElementById("live-workout-time");
    if (output) output.textContent = formatWorkoutTime(Date.now() - sessionStartedAt);
  }

  function startWorkoutClock() {
    document.body.classList.add("workout-in-progress");
    updateWorkoutClock();
    clearInterval(workoutTimerId);
    workoutTimerId = setInterval(updateWorkoutClock, 1000);
  }

  function startRestTimer(seconds) {
    clearInterval(restTimerId);
    let remaining = Math.max(0, Number(seconds) || 90);
    const toolbar = document.querySelector(".live-workout-toolbar");
    let box = toolbar?.querySelector(".live-rest-chip");
    if (toolbar && !box) {
      box = document.createElement("button");
      box.type = "button";
      box.className = "live-rest-chip";
      box.innerHTML = `<small>DESCANSO</small><b id="live-rest-time">1:30</b>`;
      box.onclick = () => { clearInterval(restTimerId); box.remove(); };
      toolbar.querySelector("button").before(box);
    }
    const output = document.getElementById("live-rest-time");
    if (!output || !box) return;
    const paint = () => {
      output.textContent = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
      if (remaining-- <= 0) {
        clearInterval(restTimerId);
        box.classList.add("finished");
        if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
      }
    };
    paint();
    restTimerId = setInterval(paint, 1000);
  }

  function ensureWorkoutToolbar() {
    const content = document.querySelector(".workout-content");
    if (!content || content.querySelector(".live-workout-toolbar")) return;
    const toolbar = document.createElement("div");
    toolbar.className = "live-workout-toolbar";
    toolbar.innerHTML = `<div><span>${icon("clock")}</span><small>TIEMPO DE SESION</small><b id="live-workout-time">00:00:00</b></div><button type="button" id="pause-live-workout">Pausar</button><button type="button" id="finish-live-workout">Finalizar</button>`;
    content.prepend(toolbar);
    toolbar.querySelector("#pause-live-workout").onclick = (event) => {
      if (workoutPausedAt) {
        sessionStartedAt += Date.now() - workoutPausedAt;
        workoutPausedAt = null;
        event.currentTarget.textContent = "Pausar";
        startWorkoutClock();
      } else {
        workoutPausedAt = Date.now();
        clearInterval(workoutTimerId);
        event.currentTarget.textContent = "Continuar";
        toast("Entrenamiento pausado");
      }
    };
    toolbar.querySelector("#finish-live-workout").onclick = finishWorkout;
  }

  async function finishWorkout() {
    if (!sessionId) {
      toast("Completa al menos una serie antes de finalizar");
      return;
    }
    if (!confirm("¿Finalizar y guardar este entrenamiento?")) return;
    const duration = Math.max(1, Math.round((Date.now() - sessionStartedAt) / 60000));
    const result = await db.from("workout_sessions").update({
      completed_at: new Date().toISOString(),
      duration_minutes: duration,
    }).eq("id", sessionId);
    if (result.error) {
      toast("No se pudo finalizar. Comprueba la conexion.");
      return;
    }
    clearInterval(workoutTimerId);
    document.body.classList.remove("workout-in-progress");
    toast("Entrenamiento guardado · gran trabajo");
  }

  function showRoutines() {
    const node = panel("client-routine-panel", "Entrenar", "dumbbell"),
      host = node.querySelector(".client-panel-content"),
      session = document.getElementById("routine-session");
    if (!host.querySelector(".routine-hub-intro")) {
      host.innerHTML = `<section class="routine-hub-intro"><div><small>PLAN DE FERNANDO</small><h2>Tu semana de entrenamiento</h2><p>Elige una rutina y registra cada serie mientras entrenas.</p></div><button type="button" id="begin-live-workout"><span>${icon("play")}</span><b>Iniciar entrenamiento</b><small>Se guardara automaticamente</small></button></section><div class="client-workout-actions"><button type="button" data-workout-view="routines">${icon("dumbbell")}<span><b>Mis rutinas</b><small>Planes asignados</small></span></button><button type="button" data-workout-view="history">${icon("calendar")}<span><b>Historial</b><small>Calendario y sesiones</small></span></button><button type="button" data-workout-view="library">${icon("play")}<span><b>Ejercicios</b><small>Biblioteca y tecnica</small></span></button></div><section class="routine-picker"><div class="routine-picker-title"><div><small>MIS RUTINAS</small><h3>Elige tu entrenamiento</h3></div><button type="button" id="start-empty-workout">+ Entrenamiento libre</button></div><div id="client-routine-cards"></div></section><div class="workout-secondary-view" id="workout-secondary-view"></div><div class="routine-session-host"></div>`;
      host.querySelector("#begin-live-workout").onclick = () => {
        sessionStartedAt = Date.now();
        startWorkoutClock();
        ensureWorkoutToolbar();
        host.querySelector(".routine-session-host").scrollIntoView({ behavior: "smooth", block: "start" });
      };
      host.querySelectorAll("[data-workout-view]").forEach((button) => button.onclick = () => {
        const view = button.dataset.workoutView;
        host.querySelectorAll("[data-workout-view]").forEach((item) => item.classList.toggle("active", item === button));
        host.querySelector(".routine-picker").hidden = view !== "routines";
        host.querySelector(".routine-session-host").hidden = view !== "routines";
        host.querySelector("#workout-secondary-view").hidden = view === "routines";
        if (view === "history") renderWorkoutHistory(host.querySelector("#workout-secondary-view"));
        if (view === "library") renderClientLibrary(host.querySelector("#workout-secondary-view"));
      });
      host.querySelector("#start-empty-workout").onclick = startEmptyWorkout;
    }
    host.querySelector(".routine-session-host").appendChild(session);
    ensureWorkoutToolbar();
    renderRoutinePicker();
    openPanel(node, "routine");
  }

  function startEmptyWorkout() {
    routine = { id: null, name: "Entrenamiento libre", description: "Sesion creada por ti", status: "active" };
    allRoutineItems = [];
    routineItems = [];
    selectedRoutineDay = 1;
    sessionId = null;
    completedExerciseIds.clear();
    renderRoutine();
    renderRoutinePicker();
    document.querySelector('[data-workout-view="library"]')?.click();
    toast("Busca ejercicios y anadelos a tu entrenamiento libre");
  }

  function renderRoutinePicker() {
    const host = document.getElementById("client-routine-cards");
    if (!host) return;
    host.innerHTML = availableRoutines.length ? availableRoutines.map((item) => `<button type="button" class="client-routine-choice ${item.id === routine?.id ? "active" : ""}" data-select-routine="${item.id}"><span>${icon("dumbbell")}</span><div><b>${esc(item.name)}</b><small>${esc(item.description || item.objective || "Plan de Fernando")}</small></div><strong>${item.id === routine?.id ? "Seleccionada" : "Abrir"}</strong></button>`).join("") : '<div class="client-empty-state">Fernando todavia no te ha asignado rutinas.</div>';
    host.querySelectorAll("[data-select-routine]").forEach((button) => button.onclick = () => selectRoutine(button.dataset.selectRoutine));
  }

  async function selectRoutine(id) {
    if (routine?.id === id) return;
    routine = availableRoutines.find((item) => item.id === id);
    sessionId = null;
    completedExerciseIds.clear();
    await loadRoutineItems();
    renderRoutinePicker();
  }
  function renderRoutineLocked() {
    const cover = document.querySelector(".workout-cover"),
      totalText = document.querySelector(".workout-top b");
    cover.classList.add("is-empty");
    cover.querySelector("h3").innerHTML =
      "Tu cuota esta<br><mark>pendiente de confirmar</mark>";
    document.getElementById("done-count").textContent = "0";
    if (totalText) totalText.lastChild.textContent = " de 0 completados";
    document.getElementById("percent").textContent = "0%";
    document.getElementById("session-progress").style.width = "0%";
    document.getElementById("exercise-list").innerHTML =
      '<div class="client-empty-state"><b>Rutinas bloqueadas</b><p>Fernando debe confirmar tu cuota en el gimnasio para desbloquear tus rutinas y el generador FT Coach. Mientras tanto puedes consultar tu perfil y tus resultados anteriores.</p></div>';
    document.getElementById("next-session-title").textContent =
      "Cuota pendiente de confirmar";
    document.getElementById("next-session-detail").textContent =
      "Habla con Fernando en el gimnasio para activar tu acceso";
  }
  async function loadRoutine() {
    if (db && clientId && window.ftMembershipActive === false) {
      renderRoutineLocked();
      return;
    }
    if (!db || !clientId) {
      if (
        location.hostname === "127.0.0.1" ||
        location.hostname === "localhost"
      ) {
        ensureShareButton();
        document.getElementById("share-workout").hidden = false;
      }
      return;
    }
    const { data: routines } = await db
      .from("routines")
      .select("id,name,description,objective,status,week_start,created_at")
      .eq("client_id", clientId)
      .in("status", ["active", "draft"])
      .order("created_at", { ascending: false });
    availableRoutines = routines || [];
    routine = availableRoutines[0] || null;
    if (!routine) {
      renderRoutineEmpty();
      return;
    }
    await loadRoutineItems();
  }

  async function loadRoutineItems() {
    if (!routine) return;
    const { data: items } = await db
      .from("routine_exercises")
      .select(
        "id,exercise_id,day_number,position,target_sets,target_reps_min,target_reps_max,target_weight_kg,target_rir,rest_seconds,notes,superset_group,exercises(name,body_group,primary_muscle,instructions,media_url,thumbnail_url,media_type)",
      )
      .eq("routine_id", routine.id)
      .order("day_number")
      .order("position");
    allRoutineItems = items || [];
    const routineDays = [
      ...new Set(allRoutineItems.map((item) => Number(item.day_number) || 1)),
    ].sort((a, b) => a - b);
    selectedRoutineDay = routineDays[0] || 1;
    routineItems = allRoutineItems.filter(
      (item) => (Number(item.day_number) || 1) === selectedRoutineDay,
    );
    renderRoutine();
    await restoreTodaySession();
  }
  function renderRoutineEmpty() {
    const cover = document.querySelector(".workout-cover"),
      totalText = document.querySelector(".workout-top b");
    cover.classList.add("is-empty");
    cover.querySelector("h3").innerHTML =
      "Tu proxima rutina<br><mark>esta en preparacion</mark>";
    document.getElementById("done-count").textContent = "0";
    if (totalText) totalText.lastChild.textContent = " de 0 completados";
    document.getElementById("percent").textContent = "0%";
    document.getElementById("session-progress").style.width = "0%";
    document.getElementById("exercise-list").innerHTML =
      '<div class="client-empty-state">Fernando todavia no ha activado una rutina para ti.</div>';
    document.getElementById("next-session-title").textContent =
      "No tienes una sesion programada";
    document.getElementById("next-session-detail").textContent =
      "Fernando te avisara cuando tu rutina este lista";
  }
  function renderRoutine() {
    const days = [
        ...new Set(allRoutineItems.map((item) => Number(item.day_number) || 1)),
      ].sort((a, b) => a - b),
      muscles = [
        ...new Set(
          routineItems
            .map(
              (item) =>
                item.exercises?.primary_muscle || item.exercises?.body_group,
            )
            .filter(Boolean),
        ),
      ];
    document.querySelector(".workout-cover").classList.remove("is-empty");
    document.querySelector(".workout-cover h3").innerHTML =
      `${esc(routine.name)}<br><mark>${routine.status === "active" ? "Activa" : "Borrador"}</mark>`;
    document.getElementById("next-session-title").textContent = routine.name;
    document.getElementById("next-session-detail").textContent =
      `${days.length} ${days.length === 1 ? "sesion" : "sesiones"} · ${allRoutineItems.length} ejercicios · Fernando`;
    document.getElementById("done-count").textContent = "0";
    document.querySelector(".workout-top b").lastChild.textContent =
      ` de ${routineItems.length} completados`;
    document.getElementById("percent").textContent = "0%";
    document.getElementById("session-progress").style.width = "0%";
    document.getElementById("exercise-list").innerHTML =
      `<div class="session-plan-head"><div><span>SESION ${selectedRoutineDay}</span><b>${esc(muscles.join(" · ") || "Entrenamiento completo")}</b></div><small>${routineItems.length} ejercicios</small></div>` +
      (days.length > 0
        ? `<div class="session-day-tabs weekly-plan-tabs" role="tablist" aria-label="Entrenamiento semanal">${[1,2,3,4,5]
            .map((day) => {
              const dayItems = allRoutineItems.filter(
                  (item) => (Number(item.day_number) || 1) === day,
                ),
                dayMuscles = [
                  ...new Set(
                    dayItems
                      .map(
                        (item) =>
                          item.exercises?.primary_muscle ||
                          item.exercises?.body_group,
                      )
                      .filter(Boolean),
                  ),
                ]
                  .slice(0, 2)
                  .join(" + ");
              return `<button type="button" role="tab" aria-selected="${day === selectedRoutineDay}" class="${day === selectedRoutineDay ? "active" : ""}" data-routine-day="${day}"><span>Dia ${day}</span><small>${esc(dayMuscles || "Entrenamiento")}</small></button>`;
            })
            .join("")}</div>`
        : "") +
      (routineItems
        .map((item, index) => {
          const ex = item.exercises || {},
            reps =
              item.target_reps_min === item.target_reps_max
                ? item.target_reps_min
                : `${item.target_reps_min || "—"}–${item.target_reps_max || "—"}`,
            image = ex.thumbnail_url || "assets/brand/ft-symbol-color.png";
          return `<button type="button" class="exercise-row live-exercise ${item.superset_group ? "superset-exercise" : ""}" data-live-index="${index}" ${item.superset_group ? `data-superset="${item.superset_group}"` : ""}><span class="exercise-thumb"><img src="${esc(image)}" alt="${esc(ex.name)}" loading="lazy"><i>${icon("play")}</i></span><span>${item.superset_group ? `<mark>SUPERSET ${item.superset_group}</mark>` : ""}<b>${esc(ex.name || "Ejercicio")}</b><small>${item.target_sets} series · ${reps} repeticiones${item.target_weight_kg != null ? ` · ${item.target_weight_kg} kg` : ""}</small><em>Ver tecnica y registrar</em></span><strong>›</strong></button>`;
        })
        .join("") ||
        '<div class="client-empty-state">Esta sesion aun no contiene ejercicios.</div>');
    document.querySelectorAll("[data-routine-day]").forEach((button) => {
      button.onclick = () => {
        const targetDay = Number(button.dataset.routineDay) || 1;
        if (targetDay === selectedRoutineDay) return;
        if (!confirm(`¿Seguro que quieres empezar el dia ${targetDay}?`))
          return;
        selectedRoutineDay = targetDay;
        routineItems = allRoutineItems.filter(
          (item) => (Number(item.day_number) || 1) === selectedRoutineDay,
        );
        renderRoutine();
        updateWorkoutProgress(
          routineItems.filter((item) =>
            completedExerciseIds.has(item.exercise_id),
          ).length,
        );
      };
    });
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
    document.querySelectorAll(".live-exercise").forEach((row, index) => {
      if (!completedExerciseIds.has(routineItems[index]?.exercise_id)) return;
      row.classList.add("done");
      row.querySelector("strong").textContent = "✓";
    });
    ensureShareButton();
  }

  function ensureShareButton() {
    const host = document.getElementById("exercise-list");
    if (!host || document.getElementById("share-workout")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.id = "share-workout";
    button.className = "share-workout-button";
    button.hidden = false;
    button.innerHTML = `<span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></svg></span><span><b>Compartir resumen</b><small>Story de tu entrenamiento</small></span><strong>Abrir</strong>`;
    button.onclick = openWorkoutShare;
    host.after(button);
  }

  function updateWorkoutProgress(done) {
    const total = routineItems.length,
      percent = total ? Math.round((done / total) * 100) : 0;
    document.getElementById("done-count").textContent = done;
    document.getElementById("percent").textContent = percent + "%";
    document.getElementById("session-progress").style.width = percent + "%";
    const share = document.getElementById("share-workout");
    if (share) share.hidden = false;
    return { total, percent };
  }

  async function restoreTodaySession() {
    if (!db || !clientId || !routine) return;
    const today = new Date().toISOString().slice(0, 10),
      { data: session } = await db
        .from("workout_sessions")
        .select("id,started_at,completed_at,duration_minutes")
        .eq("client_id", clientId)
        .eq("routine_id", routine.id)
        .eq("planned_for", today)
        .maybeSingle();
    if (!session) return;
    sessionId = session.id;
    sessionStartedAt = session.started_at
      ? new Date(session.started_at).getTime()
      : Date.now();
    if (!session.completed_at) startWorkoutClock();
    const { data: logs } = await db
      .from("set_logs")
      .select("exercise_id")
      .eq("session_id", sessionId);
    const completedIds = new Set((logs || []).map((log) => log.exercise_id));
    completedExerciseIds = completedIds;
    document.querySelectorAll(".live-exercise").forEach((row, index) => {
      if (!completedIds.has(routineItems[index]?.exercise_id)) return;
      row.classList.add("done");
      row.querySelector("strong").textContent = "✓";
    });
    updateWorkoutProgress(
      routineItems.filter((item) => completedIds.has(item.exercise_id)).length,
    );
  }
  async function openExercise(item, row) {
    if (!document.body.classList.contains("workout-in-progress")) startWorkoutClock();
    selectedItem = { item, row };
    const ex = item.exercises || {},
      sheet = document.getElementById("set-sheet");
    document.getElementById("sheet-title").textContent = ex.name || "Ejercicio";
    const gif = document.getElementById("sheet-gif");
    if (gif) {
      gif.src =
        ex.media_url || ex.thumbnail_url || "assets/brand/ft-symbol-color.png";
      gif.alt = `Demostracion de ${ex.name || "ejercicio"}`;
    }
    const tip = document.querySelector(".technique-tip");
    if (tip)
      tip.textContent =
        ex.instructions ||
        item.notes ||
        "Sigue las indicaciones de Fernando y controla la tecnica.";
    let logsQuery = db
      .from("set_logs")
      .select("session_id,set_number,reps,weight_kg,created_at")
      .eq("exercise_id", item.exercise_id)
      .order("created_at", { ascending: false })
      .limit(60);
    if (sessionId) logsQuery = logsQuery.neq("session_id", sessionId);
    const { data: recentLogs } = await logsQuery;
    const previousSessionId = recentLogs?.[0]?.session_id,
      previousSets = (recentLogs || [])
        .filter((log) => log.session_id === previousSessionId)
        .sort((a, b) => a.set_number - b.set_number);
    const last = document.querySelector(".last-record");
    if (last) {
      const top = (recentLogs || []).reduce(
        (best, set) =>
          Number(set.weight_kg) > Number(best?.weight_kg || 0) ? set : best,
        null,
      );
      last.innerHTML = `<div><span>SEMANA PASADA</span><b>${previousSets[0] ? `${previousSets[0].weight_kg ?? 0} kg × ${previousSets[0].reps ?? 0}` : "Sin registros"}</b></div><div><span>MEJOR CARGA</span><b>${top ? `${top.weight_kg || 0} kg` : "—"}</b></div>`;
    }
    const sets = sheet.querySelector(".sets");
    sets.classList.add("hevy-set-table");
    sets.innerHTML =
      `<div class="hevy-set-head"><b>SET</b><b>ANTERIOR</b><b>KG</b><b>REPS</b><b>RIR</b><b>✓</b></div>` +
      Array.from({ length: item.target_sets || 3 }, (_, index) => {
        const previous = previousSets[index],
          reps = previous?.reps ?? item.target_reps_min ?? "",
          weight = previous?.weight_kg ?? item.target_weight_kg ?? "";
        const previousLabel = previous ? `${previous.weight_kg ?? 0} × ${previous.reps ?? 0}` : "—";
        return `<label class="hevy-set-row"><select class="live-set-type" aria-label="Tipo de serie ${index + 1}"><option value="normal">${index + 1}</option><option value="warmup">W</option><option value="drop">D</option><option value="failure">F</option></select><small>${previousLabel}</small><input class="live-weight" value="${weight}" inputmode="decimal" aria-label="Peso serie ${index + 1}"><input class="live-reps" value="${reps}" inputmode="numeric" aria-label="Repeticiones serie ${index + 1}"><input class="live-rir" value="${item.target_rir ?? ""}" inputmode="numeric" aria-label="RIR serie ${index + 1}"><input class="live-complete" type="checkbox" checked aria-label="Completar serie ${index + 1}"></label>`;
      }).join("") + `<button type="button" class="add-live-set">+ Anadir serie</button><div class="exercise-rest-timer" hidden><span>${icon("clock")}</span><div><small>DESCANSO</small><b id="exercise-rest-time">1:30</b></div><button type="button">Omitir</button></div>`;
    sets.querySelector(".add-live-set").onclick = () => {
      const rows = sets.querySelectorAll(".hevy-set-row"),
        lastRow = rows[rows.length - 1],
        clone = lastRow.cloneNode(true),
        number = rows.length + 1;
      clone.querySelector('.live-set-type option[value="normal"]').textContent = number;
      clone.querySelector("small").textContent = "—";
      clone.querySelectorAll("input").forEach((input) => {
        input.setAttribute("aria-label", input.getAttribute("aria-label").replace(/\d+$/, number));
        if (input.type === "checkbox") input.checked = true;
      });
      lastRow.after(clone);
    };
    sets.querySelector(".exercise-rest-timer button").onclick = () => {
      clearInterval(restTimerId);
      sets.querySelector(".exercise-rest-timer").hidden = true;
    };
    sheet.classList.add("open");
  }
  async function ensureSession() {
    if (sessionId) return sessionId;
    const today = new Date().toISOString().slice(0, 10),
      existingQuery = db.from("workout_sessions").select("id,started_at")
        .eq("client_id", clientId).eq("planned_for", today),
      existing = routine?.id ? await existingQuery.eq("routine_id", routine.id).maybeSingle() : { data: null };
    if (existing.data?.id) {
      sessionId = existing.data.id;
      sessionStartedAt = existing.data.started_at
        ? new Date(existing.data.started_at).getTime()
        : Date.now();
      return sessionId;
    }
    const startedAt = new Date().toISOString();
    const created = await db
      .from("workout_sessions")
      .insert({
        client_id: clientId,
        routine_id: routine?.id || null,
        day_number: selectedItem.item.day_number,
        planned_for: today,
        started_at: startedAt,
      })
      .select("id")
      .single();
    if (created.error) throw created.error;
    sessionId = created.data.id;
    sessionStartedAt = new Date(startedAt).getTime();
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
        rirs = [...document.querySelectorAll(".live-rir")],
        types = [...document.querySelectorAll(".live-set-type")],
        checked = [...document.querySelectorAll(".live-complete")],
        logs = reps.map((input, index) => ({
          session_id: currentSession,
          routine_exercise_id: selectedItem.item.id || null,
          exercise_id: selectedItem.item.exercise_id,
          set_number: index + 1,
          reps: Number(input.value) || null,
          weight_kg:
            weights[index].value === ""
              ? null
              : Number(String(weights[index].value).replace(",", ".")),
          rir: rirs[index].value === "" ? null : Number(rirs[index].value),
          set_type: types[index].value,
          completed: checked[index].checked,
        })).filter((_, index) => checked[index].checked);
      if (!logs.length) throw new Error("No hay series completadas");
      const { error } = await db
        .from("set_logs")
        .upsert(logs, { onConflict: "session_id,exercise_id,set_number" });
      if (error) throw error;
      selectedItem.row.classList.add("done");
      selectedItem.row.querySelector("strong").textContent = "✓";
      completedExerciseIds.add(selectedItem.item.exercise_id);
      const done = document.querySelectorAll(".live-exercise.done").length,
        { total } = updateWorkoutProgress(done),
        duration = Math.max(
          1,
          Math.round((Date.now() - sessionStartedAt) / 60000),
        );
      if (done === total) {
        await db
          .from("workout_sessions")
          .update({
            completed_at: new Date().toISOString(),
            duration_minutes: duration,
          })
          .eq("id", currentSession);
        toast("¡Entrenamiento completado! Ya puedes compartirlo");
      }
      document.getElementById("set-sheet").classList.remove("open");
      startRestTimer(selectedItem.item.rest_seconds || 90);
      toast("Series guardadas correctamente");
    } catch (error) {
      toast("No se pudo guardar. Comprueba la conexion.");
    } finally {
      save.disabled = false;
      save.textContent = "Guardar y completar ✓";
    }
  };

  async function getWorkoutShareData() {
    if (
      !db &&
      (location.hostname === "127.0.0.1" || location.hostname === "localhost")
    ) {
      return {
        routineName: "Fuerza · Torso A",
        duration: 64,
        series: 14,
        volume: 5840,
        exercises: [
          {
            name: "Press de banca",
            sets: [
              { weight_kg: 70, reps: 10 },
              { weight_kg: 72.5, reps: 8 },
              { weight_kg: 72.5, reps: 8 },
            ],
          },
          {
            name: "Remo con barra",
            sets: [
              { weight_kg: 55, reps: 10 },
              { weight_kg: 55, reps: 10 },
              { weight_kg: 55, reps: 9 },
            ],
          },
          {
            name: "Press inclinado",
            sets: [
              { weight_kg: 24, reps: 12 },
              { weight_kg: 24, reps: 11 },
              { weight_kg: 24, reps: 10 },
            ],
          },
          {
            name: "Jalon al pecho",
            sets: [
              { weight_kg: 50, reps: 12 },
              { weight_kg: 50, reps: 12 },
              { weight_kg: 50, reps: 10 },
            ],
          },
          {
            name: "Elevaciones laterales",
            sets: [
              { weight_kg: 8, reps: 15 },
              { weight_kg: 8, reps: 14 },
            ],
          },
        ],
      };
    }
    const duration = Math.max(
      1,
      Math.round((Date.now() - sessionStartedAt) / 60000),
    );
    let logs = [];
    if (db && sessionId) {
      const result = await db
        .from("set_logs")
        .select("exercise_id,set_number,reps,weight_kg")
        .eq("session_id", sessionId)
        .order("set_number");
      logs = result.data || [];
    }
    const grouped = new Map();
    logs.forEach((log) => {
      if (!grouped.has(log.exercise_id)) grouped.set(log.exercise_id, []);
      grouped.get(log.exercise_id).push(log);
    });
    const exercises = routineItems
      .filter((item) => grouped.has(item.exercise_id))
      .map((item) => ({
        name: item.exercises?.name || "Ejercicio",
        sets: grouped.get(item.exercise_id),
      }));
    return {
      routineName: routine?.name || "Mi entrenamiento",
      duration,
      exercises,
      series: logs.length,
      volume: Math.round(
        logs.reduce(
          (sum, log) =>
            sum + Number(log.reps || 0) * Number(log.weight_kg || 0),
          0,
        ),
      ),
    };
  }

  function roundRect(ctx, x, y, width, height, radius, fill) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function fittedShareFont(ctx, text, size, maxWidth, family) {
    let current = size;
    do {
      ctx.font = `${current}px ${family}`;
      current -= 2;
    } while (ctx.measureText(text).width > maxWidth && current > 28);
  }

  const loadCanvasImage = (src) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });

  async function drawShareCard(canvas, data) {
    const ctx = canvas.getContext("2d");
    await Promise.all([
      document.fonts?.load('80px "Clean Sports"'),
      document.fonts?.load('30px "Sporter"'),
    ]).catch(() => {});
    const [hero, logo] = await Promise.all([
      loadCanvasImage("assets/brand/ft-social-preview.png"),
      loadCanvasImage("assets/brand/ft-horizontal-white.png"),
    ]);

    ctx.fillStyle = "#061c18";
    ctx.fillRect(0, 0, 1080, 1920);
    ctx.drawImage(hero, 700, 0, 1220, 1080, 0, 0, 1080, 710);
    const heroShade = ctx.createLinearGradient(0, 0, 0, 760);
    heroShade.addColorStop(0, "rgba(2,18,17,.18)");
    heroShade.addColorStop(0.54, "rgba(4,27,24,.54)");
    heroShade.addColorStop(1, "#061c18");
    ctx.fillStyle = heroShade;
    ctx.fillRect(0, 0, 1080, 780);
    const sideShade = ctx.createLinearGradient(0, 0, 780, 0);
    sideShade.addColorStop(0, "rgba(2,20,20,.82)");
    sideShade.addColorStop(1, "rgba(2,20,20,0)");
    ctx.fillStyle = sideShade;
    ctx.fillRect(0, 0, 850, 710);

    ctx.drawImage(logo, 240, 1350, 3680, 1300, 60, 45, 530, 188);
    ctx.textAlign = "right";
    ctx.fillStyle = "#d3e7dc";
    ctx.font = '22px "Sporter", Arial';
    ctx.fillText("GYM-FT.COM", 1010, 100);
    ctx.fillStyle = "#45bd7b";
    ctx.fillText("@GYM_FT_TRAINING", 1010, 138);
    ctx.textAlign = "left";

    ctx.fillStyle = "#fff";
    fittedShareFont(
      ctx,
      "ENTRENAMIENTO",
      82,
      940,
      '"Clean Sports", "Oswald", sans-serif',
    );
    ctx.fillText("ENTRENAMIENTO", 66, 405);
    ctx.fillStyle = "#2dac6c";
    fittedShareFont(
      ctx,
      "COMPLETADO",
      105,
      940,
      '"Clean Sports", "Oswald", sans-serif',
    );
    ctx.fillText("COMPLETADO", 66, 515);
    ctx.fillStyle = "#d5e7dd";
    ctx.font = '25px "Sporter", "DM Sans", sans-serif';
    ctx.fillText(data.routineName.toUpperCase().slice(0, 39), 70, 572);
    ctx.fillStyle = "#3b99ae";
    ctx.fillRect(70, 605, 145, 7);
    ctx.fillStyle = "#2dac6c";
    ctx.fillRect(215, 605, 230, 7);

    const cards = [
      [String(data.duration), "MINUTOS"],
      [String(data.exercises.length), "EJERCICIOS"],
      [String(data.series), "SERIES"],
    ];
    cards.forEach(([value, label], index) => {
      const x = 66 + index * 326;
      roundRect(ctx, x, 690, 296, 168, 22, "rgba(255,255,255,.085)");
      ctx.strokeStyle = index === 0 ? "#3b99ae" : "#2dac6c";
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 1.5, 690 + 1.5, 293, 165);
      ctx.fillStyle = "#fff";
      ctx.font = '68px "Clean Sports", "Oswald", sans-serif';
      ctx.fillText(value, x + 25, 780);
      ctx.fillStyle = "#91cdb0";
      ctx.font = '18px "Sporter", Arial';
      ctx.fillText(label, x + 27, 824);
    });

    ctx.fillStyle = "#fff";
    ctx.font = '25px "Sporter", Arial';
    ctx.fillText("RESUMEN DE LA SESION", 70, 945);
    ctx.fillStyle = "#2dac6c";
    ctx.fillRect(70, 967, 940, 2);
    const list = data.exercises.slice(0, 6);
    list.forEach((exercise, index) => {
      const y = 1000 + index * 111,
        best = exercise.sets.reduce(
          (max, set) =>
            Number(set.weight_kg || 0) > Number(max.weight_kg || 0) ? set : max,
          exercise.sets[0] || {},
        );
      roundRect(ctx, 70, y, 940, 90, 16, "rgba(255,255,255,.055)");
      ctx.fillStyle = index % 2 ? "#3b99ae" : "#2dac6c";
      ctx.fillRect(70, y, 8, 90);
      ctx.fillStyle = "#7bd79f";
      ctx.font = '24px "Sporter", Arial';
      ctx.fillText(String(index + 1).padStart(2, "0"), 100, y + 56);
      ctx.fillStyle = "#fff";
      ctx.font = '26px "DM Sans", Arial';
      ctx.fillText(exercise.name.slice(0, 35), 170, y + 38);
      ctx.fillStyle = "#9db9ad";
      ctx.font = '19px "DM Sans", Arial';
      ctx.fillText(
        `${exercise.sets.length} series · ${best.weight_kg || 0} kg × ${best.reps || 0}`,
        170,
        y + 69,
      );
    });

    const footerY = 1735;
    ctx.fillStyle = "rgba(255,255,255,.075)";
    ctx.fillRect(0, footerY, 1080, 185);
    if (data.volume > 0) {
      ctx.fillStyle = "#fff";
      ctx.font = '44px "Clean Sports", "Oswald", sans-serif';
      ctx.fillText(`${data.volume.toLocaleString("es-ES")} KG`, 70, 1810);
      ctx.fillStyle = "#75c997";
      ctx.font = '16px "Sporter", Arial';
      ctx.fillText("VOLUMEN TOTAL MOVIDO", 72, 1845);
    }
    ctx.textAlign = "right";
    ctx.fillStyle = "#fff";
    ctx.font = '22px "Sporter", Arial';
    ctx.fillText("ENTRENA · SUPERATE · COMPARTE", 1010, 1805);
    ctx.fillStyle = "#42b879";
    ctx.font = '18px "Sporter", Arial';
    ctx.fillText("@GYM_FT_TRAINING  ·  #FTTRAINER", 1010, 1846);
    ctx.fillStyle = "#678579";
    ctx.font = '14px "DM Sans", Arial';
    ctx.fillText("Fernando Tienda Training", 1010, 1880);
    ctx.textAlign = "left";
  }

  async function canvasBlob(canvas) {
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
  }

  async function openWorkoutShare() {
    const data = await getWorkoutShareData();
    if (!data.exercises.length) {
      toast("Registra al menos un ejercicio antes de compartir");
      return;
    }
    let overlay = document.getElementById("workout-share-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "workout-share-overlay";
      overlay.className = "workout-share-overlay";
      overlay.innerHTML = `<section class="workout-share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title"><header><div><small>LISTO PARA PUBLICAR</small><h2 id="share-title">Comparte tu entrenamiento</h2></div><button type="button" class="share-close" aria-label="Cerrar">×</button></header><div class="story-preview"><canvas width="1080" height="1920"></canvas></div><p>Imagen vertical optimizada para Instagram Stories. En movil se abrira el menu de compartir.</p><div class="share-actions"><button type="button" class="share-native">Compartir ahora</button><button type="button" class="share-download">Descargar Story</button></div></section>`;
      document.body.appendChild(overlay);
      overlay.querySelector(".share-close").onclick = () =>
        overlay.classList.remove("open");
      overlay.onclick = (event) => {
        if (event.target === overlay) overlay.classList.remove("open");
      };
    }
    const canvas = overlay.querySelector("canvas");
    await drawShareCard(canvas, data);
    overlay.classList.add("open");
    const makeFile = async () => {
      const blob = await canvasBlob(canvas);
      return new File(
        [blob],
        `ft-entrenamiento-${new Date().toISOString().slice(0, 10)}.png`,
        { type: "image/png" },
      );
    };
    overlay.querySelector(".share-native").onclick = async () => {
      const file = await makeFile();
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "Mi entrenamiento FT Trainer",
          text: "Entrenamiento completado con Fernando Tienda Training 💪 @gym_ft_training #FTTrainer",
          files: [file],
        });
      } else {
        overlay.querySelector(".share-download").click();
        toast("Imagen descargada. Ya puedes subirla a Instagram");
      }
    };
    overlay.querySelector(".share-download").onclick = async () => {
      const file = await makeFile(),
        link = document.createElement("a");
      link.href = URL.createObjectURL(file);
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    };
  }

  window.ftWorkoutShare = { open: openWorkoutShare };

  async function renderWorkoutHistory(host) {
    host.innerHTML = '<div class="panel-loading">Cargando historial…</div>';
    const { data: sessions, error } = await db.from("workout_sessions")
      .select("id,routine_id,day_number,planned_for,started_at,completed_at,duration_minutes,notes,routines(name)")
      .eq("client_id", clientId).order("planned_for", { ascending: false }).limit(100);
    if (error) { host.innerHTML = '<div class="client-empty-state">No se pudo cargar el historial.</div>'; return; }
    const ids = (sessions || []).map((item) => item.id);
    let logs = [];
    if (ids.length) {
      const result = await db.from("set_logs").select("session_id,weight_kg,reps,completed").in("session_id", ids);
      logs = result.data || [];
    }
    const stats = new Map();
    logs.forEach((set) => {
      const value = stats.get(set.session_id) || { sets: 0, volume: 0 };
      if (set.completed) { value.sets += 1; value.volume += Number(set.weight_kg || 0) * Number(set.reps || 0); }
      stats.set(set.session_id, value);
    });
    const doneDates = new Set((sessions || []).filter((item) => item.completed_at).map((item) => item.planned_for));
    const now = new Date(), year = now.getFullYear(), month = now.getMonth(), first = new Date(year, month, 1), days = new Date(year, month + 1, 0).getDate(), offset = (first.getDay() + 6) % 7;
    const calendar = `${Array.from({length: offset}, () => '<i></i>').join("")}${Array.from({length: days}, (_, index) => { const day = index + 1, iso = `${year}-${String(month + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`; return `<button type="button" class="${doneDates.has(iso) ? "trained" : ""}" data-history-date="${iso}">${day}</button>`; }).join("")}`;
    host.innerHTML = `<section class="history-calendar client-panel-card"><div class="panel-title"><div><small>CONSTANCIA</small><h2>${now.toLocaleDateString("es-ES", {month:"long",year:"numeric"})}</h2></div><b>${doneDates.size} entrenamientos</b></div><div class="calendar-week"><span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span><span>D</span></div><div class="calendar-days">${calendar}</div></section><section class="client-panel-card"><div class="panel-title"><div><small>DIARIO DE ENTRENAMIENTO</small><h2>Sesiones recientes</h2></div></div><div class="client-session-history">${(sessions || []).map((item) => { const stat = stats.get(item.id) || {sets:0,volume:0}; return `<article data-session-date="${item.planned_for}"><span class="history-status ${item.completed_at ? "done" : "open"}">${item.completed_at ? "✓" : "…"}</span><div><small>${new Date(`${item.planned_for}T12:00:00`).toLocaleDateString("es-ES", {weekday:"short",day:"numeric",month:"short"})}</small><b>${esc(item.routines?.name || "Entrenamiento libre")}</b><em>${stat.sets} series · ${Math.round(stat.volume).toLocaleString("es-ES")} kg · ${item.duration_minutes || "—"} min</em></div>${item.routine_id ? `<button type="button" data-repeat-routine="${item.routine_id}">Repetir</button>` : ""}</article>`; }).join("") || '<div class="client-empty-state">Todavia no has completado entrenamientos.</div>'}</div></section>`;
    host.querySelectorAll("[data-history-date]").forEach((button) => button.onclick = () => {
      host.querySelectorAll("[data-session-date]").forEach((item) => item.hidden = item.dataset.sessionDate !== button.dataset.historyDate);
    });
    host.querySelectorAll("[data-repeat-routine]").forEach((button) => button.onclick = async () => {
      await selectRoutine(button.dataset.repeatRoutine);
      host.closest(".client-panel-content").querySelector('[data-workout-view="routines"]').click();
      toast("Rutina preparada para repetir");
    });
  }

  let clientExerciseLibrary = null;
  async function renderClientLibrary(host) {
    host.innerHTML = '<div class="panel-loading">Cargando ejercicios…</div>';
    if (!clientExerciseLibrary) {
      const { data } = await db.from("exercises").select("id,name,body_group,primary_muscle,equipment,instructions,media_url,thumbnail_url,media_type").eq("is_active", true).order("name").limit(1000);
      clientExerciseLibrary = (data || []).map((item) => ({ id:item.id, nombre_es:item.name, grupo:item.primary_muscle || item.body_group, equipo:item.equipment || "Sin material", imagen:item.thumbnail_url || item.media_url || "assets/brand/ft-symbol-color.png", gif:item.media_url || item.thumbnail_url, instrucciones:item.instructions ? [item.instructions] : [], database:item }));
    }
    host.innerHTML = `<section class="client-panel-card client-library"><div class="panel-title"><div><small>BIBLIOTECA FT</small><h2>Ejercicios y tecnica</h2></div><button type="button" id="create-client-exercise">+ Crear ejercicio</button></div><div class="client-library-tools"><input id="client-exercise-search" placeholder="Buscar ejercicio o musculo…"><select id="client-exercise-group"><option value="">Todos los grupos</option>${[...new Set(clientExerciseLibrary.map((item) => item.grupo).filter(Boolean))].sort().map((group) => `<option>${esc(group)}</option>`).join("")}</select></div><div class="client-library-results"></div></section>`;
    const paint = () => {
      const query = host.querySelector("#client-exercise-search").value.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g,""), group = host.querySelector("#client-exercise-group").value;
      const items = clientExerciseLibrary.filter((item) => (!group || item.grupo === group) && `${item.nombre_es || item.nombre} ${item.grupo} ${item.equipo}`.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g,"").includes(query)).slice(0,80);
      host.querySelector(".client-library-results").innerHTML = items.map((item) => `<button type="button" class="client-library-exercise"><img src="${esc(item.imagen)}" alt=""><span><b>${esc(item.nombre_es || item.nombre)}</b><small>${esc(item.grupo)} · ${esc(item.equipo)}</small></span><strong>›</strong></button>`).join("") || '<div class="client-empty-state">No se encontraron ejercicios.</div>';
      host.querySelectorAll(".client-library-exercise").forEach((button, index) => button.onclick = () => openLibraryExercise(items[index]));
    };
    host.querySelector("#client-exercise-search").oninput = paint;
    host.querySelector("#client-exercise-group").onchange = paint;
    host.querySelector("#create-client-exercise").onclick = openCustomExerciseForm;
    paint();
  }

  function openCustomExerciseForm() {
    const overlay = document.createElement("div");
    overlay.className = "client-exercise-preview custom-exercise-modal";
    overlay.innerHTML = `<section><button type="button" class="exercise-preview-close">×</button><small>EJERCICIO PERSONALIZADO</small><h2>Crear ejercicio</h2><form><label>Nombre<input name="name" required></label><label>Grupo muscular<input name="muscle" required placeholder="Pecho, espalda, piernas…"></label><label>Material<input name="equipment" placeholder="Barra, mancuerna, maquina…"></label><label>Indicaciones<textarea name="instructions" rows="4"></textarea></label><button type="submit" class="client-add-exercise">Guardar ejercicio</button><p class="form-feedback"></p></form></section>`;
    document.body.appendChild(overlay);
    overlay.querySelector(".exercise-preview-close").onclick = () => overlay.remove();
    overlay.querySelector("form").onsubmit = async (event) => {
      event.preventDefault();
      const form = event.currentTarget, data = new FormData(form), feedback = form.querySelector(".form-feedback"), { data: auth } = await db.auth.getUser();
      const result = await db.from("exercises").insert({ created_by:auth.user?.id, name:String(data.get("name")).trim(), body_group:String(data.get("muscle")).trim(), primary_muscle:String(data.get("muscle")).trim(), equipment:String(data.get("equipment")).trim() || null, instructions:String(data.get("instructions")).trim() || null, is_custom:true, is_active:true }).select().single();
      if (result.error) { feedback.textContent = "No se pudo crear el ejercicio."; return; }
      clientExerciseLibrary = null;
      overlay.remove();
      renderClientLibrary(document.getElementById("workout-secondary-view"));
      toast("Ejercicio personalizado creado");
    };
  }

  function openLibraryExercise(exercise) {
    const overlay = document.createElement("div");
    overlay.className = "client-exercise-preview";
    overlay.innerHTML = `<section><button type="button" class="exercise-preview-close">×</button><img src="${esc(exercise.gif || exercise.imagen)}" alt="Demostracion de ${esc(exercise.nombre_es || exercise.nombre)}"><small>${esc(exercise.grupo)} · ${esc(exercise.equipo)}</small><h2>${esc(exercise.nombre_es || exercise.nombre)}</h2><ol>${(exercise.instrucciones || []).map((step) => `<li>${esc(step)}</li>`).join("") || '<li>Consulta las indicaciones de Fernando antes de realizar el ejercicio.</li>'}</ol><button type="button" class="client-add-exercise">+ Anadir al entrenamiento</button></section>`;
    document.body.appendChild(overlay);
    overlay.querySelector("button").onclick = () => overlay.remove();
    overlay.querySelector(".client-add-exercise").onclick = () => {
      const source = exercise.database;
      if (!source) return;
      const item = { id:null, exercise_id:source.id, day_number:selectedRoutineDay || 1, position:routineItems.length + 1, target_sets:3, target_reps_min:8, target_reps_max:12, target_weight_kg:null, target_rir:2, rest_seconds:90, notes:"", exercises:source };
      routineItems.push(item);
      allRoutineItems.push(item);
      renderRoutine();
      overlay.remove();
      document.querySelector('[data-workout-view="routines"]')?.click();
      toast(`${source.name} anadido al entrenamiento`);
    };
    overlay.onclick = (event) => { if (event.target === overlay) overlay.remove(); };
  }

  function weekKey(dateStr) {
    const date = new Date(`${dateStr}T12:00:00`),
      offset = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - offset);
    return date.toISOString().slice(0, 10);
  }
  function weekLabel(week) {
    return new Date(`${week}T12:00:00`).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
    });
  }
  async function renderStrengthHistory(host) {
    const { data: sessions } = await db
      .from("workout_sessions")
      .select("id,planned_for")
      .eq("client_id", clientId)
      .not("completed_at", "is", null)
      .order("planned_for", { ascending: false })
      .limit(160);
    if (!sessions?.length) {
      host.innerHTML =
        '<p class="client-empty-state">Todavia no hay entrenamientos completados.</p>';
      return;
    }
    const sessionDate = new Map(sessions.map((s) => [s.id, s.planned_for]));
    const { data: logs } = await db
      .from("set_logs")
      .select("session_id,exercise_id,weight_kg,reps")
      .in(
        "session_id",
        sessions.map((s) => s.id),
      );
    const nameMap = new Map(
      allRoutineItems.map((item) => [item.exercise_id, item.exercises?.name]),
    );
    const missing = [
      ...new Set((logs || []).map((log) => log.exercise_id)),
    ].filter((id) => !nameMap.has(id));
    if (missing.length) {
      const { data: extra } = await db
        .from("exercises")
        .select("id,name")
        .in("id", missing);
      (extra || []).forEach((ex) => nameMap.set(ex.id, ex.name));
    }
    const byExercise = new Map();
    (logs || []).forEach((log) => {
      if (log.weight_kg == null) return;
      const planned = sessionDate.get(log.session_id);
      if (!planned) return;
      const week = weekKey(planned);
      if (!byExercise.has(log.exercise_id))
        byExercise.set(log.exercise_id, new Map());
      const weeks = byExercise.get(log.exercise_id),
        current = weeks.get(week);
      if (!current || Number(log.weight_kg) > Number(current.weight_kg))
        weeks.set(week, { weight_kg: log.weight_kg, reps: log.reps });
    });
    const rows = [...byExercise.entries()]
      .map(([exerciseId, weeks]) => ({
        name: nameMap.get(exerciseId) || "Ejercicio",
        weeks: [...weeks.entries()]
          .sort((a, b) => (a[0] < b[0] ? 1 : -1))
          .slice(0, 6),
      }))
      .filter((row) => row.weeks.length)
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
    host.innerHTML = rows.length
      ? rows
          .map((row) => {
            const best = row.weeks.reduce((winner, current) => {
              const entry = current[1], score = Number(entry.weight_kg) * (1 + Number(entry.reps || 0) / 30);
              return !winner || score > winner.score ? { score, entry } : winner;
            }, null);
            const chartWeeks = [...row.weeks].reverse(), chartValues = chartWeeks.map(([,entry]) => Number(entry.weight_kg) * (1 + Number(entry.reps || 0) / 30));
            const chartMin = Math.min(...chartValues), chartMax = Math.max(...chartValues), chartRange = chartMax-chartMin || 1;
            const chartPoints = chartValues.map((value,index) => `${12 + index*(176/Math.max(1,chartValues.length-1))},${72-((value-chartMin)/chartRange)*54}`).join(" ");
            const cells = row.weeks
              .map(([week, entry], index) => {
                const prev = row.weeks[index + 1]?.[1],
                  delta = prev
                    ? Number(entry.weight_kg) - Number(prev.weight_kg)
                    : null,
                  deltaLabel =
                    delta == null
                      ? ""
                      : delta > 0
                        ? `<em class="up">↑ ${delta.toFixed(1)} kg</em>`
                        : delta < 0
                          ? `<em class="down">↓ ${Math.abs(delta).toFixed(1)} kg</em>`
                          : `<em class="flat">= kg</em>`;
                return `<div class="strength-week"><time>${weekLabel(week)}</time><b>${entry.weight_kg} kg × ${entry.reps ?? "—"}</b>${deltaLabel}</div>`;
              })
              .join("");
            return `<article class="strength-row"><div class="strength-heading"><h3>${esc(row.name)}</h3><b>RECORD · ${best.score.toFixed(1)} kg e1RM</b></div><svg class="strength-chart" viewBox="0 0 200 84" preserveAspectRatio="none" aria-label="Grafica de fuerza"><path d="M12 72H188"/><polyline points="${chartPoints}"/></svg><div class="strength-weeks">${cells}</div></article>`;
          })
          .join("")
      : '<p class="client-empty-state">Todavia no hay cargas registradas.</p>';
  }

  const progressPanel = panel("real-progress-panel", "Mi progreso", "chart");
  function measurementChart(items, key, unit) {
    const values = [...(items || [])].reverse().filter((item) => item[key] != null);
    if (values.length < 2) return '<div class="client-empty-state">Registra al menos dos medidas para ver la grafica.</div>';
    const numbers = values.map((item) => Number(item[key])), min = Math.min(...numbers), max = Math.max(...numbers), range = max - min || 1;
    const points = numbers.map((value, index) => `${30 + index * (640 / Math.max(1, numbers.length - 1))},${170 - ((value - min) / range) * 120}`).join(" ");
    return `<div class="measurement-chart"><div><b>${numbers[numbers.length - 1]} ${unit}</b><span>${numbers[0]} → ${numbers[numbers.length - 1]} ${unit}</span></div><svg viewBox="0 0 700 200" preserveAspectRatio="none" aria-label="Evolucion"><path d="M30 170 H670"/><polyline points="${points}"/></svg><div>${values.map((item) => `<small>${new Date(`${item.recorded_on}T12:00:00`).toLocaleDateString("es-ES", {day:"2-digit",month:"short"})}</small>`).join("")}</div></div>`;
  }
  async function showProgress() {
    openPanel(progressPanel, "progress");
    const host = progressPanel.querySelector(".client-panel-content");
    host.innerHTML = '<div class="panel-loading">Cargando tu evolucion…</div>';
    if (!db) {
      host.innerHTML =
        '<div class="client-empty-state">Inicia sesion para consultar tu progreso.</div>';
      return;
    }
    const [{ data: measurements }, { data: sessions }, { data: photos }] = await Promise.all([
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
      db.from("progress_photos").select("id,recorded_on,storage_path,caption").eq("client_id", clientId).order("recorded_on", { ascending: false }).limit(24),
    ]);
    const latest = measurements?.[0],
      completed = (sessions || []).filter((s) => s.completed_at).length;
    host.innerHTML = `<div class="client-metric-grid"><article><small>PESO ACTUAL</small><b>${latest?.weight_kg ?? "—"} <em>kg</em></b></article><article><small>GRASA CORPORAL</small><b>${latest?.body_fat_pct ?? "—"}<em>%</em></b></article><article><small>SESIONES COMPLETADAS</small><b>${completed}</b></article></div><section class="client-panel-card"><div class="panel-title"><div><small>SEGUIMIENTO SEMANAL</small><h2>Registrar medidas</h2></div></div><form id="measurement-form" class="client-form-grid"><label>Peso (kg)<input name="weight_kg" type="number" min="20" max="350" step="0.1" value="${latest?.weight_kg ?? ""}" required></label><label>Altura (cm)<input name="height_cm" type="number" min="100" max="240" step="0.1" value="${latest?.height_cm ?? ""}"></label><label>Grasa corporal (%)<input name="body_fat_pct" type="number" min="2" max="70" step="0.1" value="${latest?.body_fat_pct ?? ""}"></label><label>Cintura (cm)<input name="waist_cm" type="number" min="30" max="250" step="0.1" value="${latest?.waist_cm ?? ""}"></label><button class="client-primary" type="submit">Guardar registro semanal</button><p class="form-feedback"></p></form></section><section class="client-panel-card"><div class="panel-title"><div><small>HISTORIAL</small><h2>Ultimos registros</h2></div></div><div class="measurement-history">${(measurements || []).map((item) => `<div><time>${new Date(item.recorded_on + "T12:00:00").toLocaleDateString("es-ES")}</time><b>${item.weight_kg ?? "—"} kg</b><span>${item.body_fat_pct ?? "—"}% grasa</span></div>`).join("") || '<p class="client-empty-state">Todavia no hay mediciones.</p>'}</div></section><section class="client-panel-card"><div class="panel-title"><div><small>COMPARATIVA SEMANAL</small><h2>Tus cargas por ejercicio</h2></div></div><div class="strength-history" id="strength-history"><p class="panel-loading">Cargando comparativa…</p></div></section>`;
    const metricGrid = host.querySelector(".client-metric-grid");
    if (metricGrid) metricGrid.insertAdjacentHTML("beforeend", `<article><small>ALTURA</small><b>${latest?.height_cm ?? "—"}<em>cm</em></b></article>`);
    metricGrid?.insertAdjacentHTML("afterend", `<section class="client-panel-card progress-chart-card"><div class="panel-title"><div><small>EVOLUCION</small><h2>Peso corporal</h2></div></div>${measurementChart(measurements,"weight_kg","kg")}</section>`);
    const photoUrls = await Promise.all((photos || []).map(async (photo) => ({ photo, signed: (await db.storage.from("progress-photos").createSignedUrl(photo.storage_path, 3600)).data?.signedUrl || "" })));
    metricGrid?.insertAdjacentHTML("afterend", `<section class="client-panel-card progress-photos-card"><div class="panel-title"><div><small>FOTOS DE PROGRESO</small><h2>Tu evolucion visual</h2></div></div><form id="progress-photo-form" class="progress-photo-form"><label>Foto privada<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required></label><input name="caption" maxlength="80" placeholder="Nota opcional"><button class="client-primary" type="submit">Guardar foto</button><p class="form-feedback"></p></form><div class="progress-photo-grid">${photoUrls.map(({photo,signed}) => `<figure><img src="${esc(signed)}" alt="Foto de progreso"><figcaption><b>${new Date(photo.recorded_on+"T12:00:00").toLocaleDateString("es-ES")}</b><span>${esc(photo.caption || "Progreso")}</span></figcaption></figure>`).join("") || '<p class="client-empty-state">Todavia no has subido fotografias.</p>'}</div></section>`);
    renderStrengthHistory(host.querySelector("#strength-history"));
    host.querySelector("#progress-photo-form").onsubmit = async (event) => {
      event.preventDefault(); const form=event.currentTarget,file=form.photo.files?.[0],feedback=form.querySelector(".form-feedback");
      if(!file || file.size>5242880){ feedback.textContent="Selecciona una foto de menos de 5 MB."; return; }
      const {data:auth}=await db.auth.getUser(), ext=(file.name.split(".").pop()||"jpg").toLowerCase(), path=`${auth.user.id}/${clientId}/${Date.now()}.${ext}`;
      feedback.textContent="Subiendo foto…"; const upload=await db.storage.from("progress-photos").upload(path,file,{contentType:file.type});
      if(upload.error){ feedback.textContent="No se pudo subir la foto."; return; }
      const saved=await db.from("progress_photos").insert({client_id:clientId,storage_path:path,caption:String(new FormData(form).get("caption")||"").trim()||null});
      if(saved.error){ await db.storage.from("progress-photos").remove([path]); feedback.textContent="No se pudo guardar la foto."; return; }
      toast("Foto de progreso guardada"); showProgress();
    };
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
        .upsert(payload, { onConflict: "client_id,recorded_on" })
        .select()
        .single();
      if (!result.error && payload.height_cm != null) {
        await db
          .from("clients")
          .update({ height_cm: payload.height_cm, updated_at: new Date().toISOString() })
          .eq("id", clientId);
      }
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
        '<div class="client-empty-state">Inicia sesion para consultar tu perfil.</div>';
      return;
    }
    const { data: client, error: profileError } = await db
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .maybeSingle();
    if (profileError || !client) {
      host.innerHTML = `<div class="client-empty-state"><b>No hemos podido abrir tu perfil.</b><br>Recarga la pagina o vuelve a iniciar sesion.</div>`;
      return;
    }
    const initials = (client?.first_name || "FT").slice(0, 2).toUpperCase(),
      avatarContent = client?.avatar_url
        ? `<img src="${esc(client.avatar_url)}" alt="Foto de perfil">`
        : esc(initials);
    host.innerHTML = `<section class="client-profile-hero"><span class="client-profile-avatar">${avatarContent}</span><div><h2>${esc(client?.full_name || `${client?.first_name || ""} ${client?.last_name || ""}`.trim() || "Cliente FT")}</h2><p>${esc(client?.email || "")}</p><b>${client?.access_status === "active" ? "Acceso activo" : "Acceso pendiente"}</b></div></section><section class="client-panel-card avatar-card"><div class="panel-title"><div><small>IMAGEN DE PERFIL</small><h2>Tu foto</h2></div></div><label class="avatar-upload"><span>${icon("user")}</span><div><b>Subir una foto</b><small>JPG, PNG o WebP · maximo 5 MB</small></div><input id="avatar-file" type="file" accept="image/jpeg,image/png,image/webp"><strong>Elegir imagen</strong></label><p class="avatar-feedback"></p></section><section class="client-panel-card"><div class="panel-title"><div><small>DATOS PERSONALES</small><h2>Informacion de contacto</h2></div></div><form id="profile-form" class="client-form-grid"><label>Nombre<input name="first_name" value="${esc(client?.first_name || "")}" required></label><label>Apellidos<input name="last_name" value="${esc(client?.last_name || "")}"></label><label>Telefono<input name="phone" value="${esc(client?.phone || "")}"></label><label>Privacidad<select name="profile_visibility"><option value="private" ${client?.profile_visibility !== "gym" ? "selected" : ""}>Perfil privado</option><option value="gym" ${client?.profile_visibility === "gym" ? "selected" : ""}>Visible en comunidad FT</option></select></label><button class="client-primary" type="submit">Guardar cambios</button><p class="form-feedback"></p></form></section><button type="button" class="client-logout">${icon("logout")} Cerrar sesion</button>`;
    host.querySelector("#avatar-file").onchange = async (event) => {
      const file = event.target.files?.[0],
        feedback = host.querySelector(".avatar-feedback"),
        uploadLabel = host.querySelector(".avatar-upload");
      if (!file) return;
      if (!file.type.match(/^image\/(jpeg|png|webp)$/) || file.size > 5242880) {
        feedback.textContent =
          "Selecciona una imagen JPG, PNG o WebP de menos de 5 MB.";
        return;
      }
      uploadLabel.classList.add("uploading");
      feedback.textContent = "Subiendo tu foto…";
      const { data: authData } = await db.auth.getUser(),
        userId = authData.user?.id,
        extension = file.type.split("/")[1].replace("jpeg", "jpg"),
        path = `${userId}/avatar.${extension}`;
      if (!userId) {
        feedback.textContent =
          "Tu sesion ha caducado. Vuelve a iniciar sesion.";
        uploadLabel.classList.remove("uploading");
        return;
      }
      const uploaded = await db.storage
        .from("client-avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploaded.error) {
        feedback.textContent = "No se pudo subir la foto. Intentalo de nuevo.";
        uploadLabel.classList.remove("uploading");
        return;
      }
      const publicUrl = db.storage.from("client-avatars").getPublicUrl(path)
          .data.publicUrl,
        avatarUrl = `${publicUrl}?v=${Date.now()}`,
        saved = await db
          .from("clients")
          .update({
            avatar_url: avatarUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", clientId);
      uploadLabel.classList.remove("uploading");
      if (saved.error) {
        feedback.textContent =
          "La foto subio, pero no se pudo guardar en tu perfil.";
        return;
      }
      host.querySelector(".client-profile-avatar").innerHTML =
        `<img src="${esc(avatarUrl)}" alt="Foto de perfil">`;
      window.ftApplyClientAvatar?.(avatarUrl);
      feedback.textContent = "Foto de perfil actualizada.";
    };
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
            profile_visibility: String(data.get("profile_visibility") || "private"),
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
          document.body.classList.remove("client-panel-open");
          setActive("home");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
        if (action === "routine") {
          showRoutines();
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
  window.ftClientSections = { showProgress, showProfile, showRoutines, loadRoutine };
  let lastRoutineRefresh = Date.now();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastRoutineRefresh < 15000) return;
    lastRoutineRefresh = Date.now();
    loadRoutine();
  });
})();
