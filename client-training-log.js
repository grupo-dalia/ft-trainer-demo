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

  window.openClientTraining = async function (clientId, clientName) {
    const node = overlayNode("client-training-overlay");
    node.innerHTML = `<section class="admin-form training-log-form"><button type="button" class="admin-form-close" aria-label="Cerrar">×</button><div class="training-log-heading"><div><p class="eyebrow">SEGUIMIENTO INDIVIDUAL</p><h2>${esc(clientName)}</h2><p class="muted">Estadisticas y entrenamientos registrados exclusivamente por este cliente.</p></div></div><div class="training-log-body"><p class="training-empty">Cargando entrenamientos...</p></div></section>`;
    node.classList.add("open");
    node.querySelector(".admin-form-close").onclick = () =>
      node.classList.remove("open");
    node.onclick = (event) => {
      if (event.target === node) node.classList.remove("open");
    };
    const body = node.querySelector(".training-log-body");
    const { data: sessions, error: sessionsError } = await ftSupabase
      .from("workout_sessions")
      .select("id,routine_id,day_number,planned_for,started_at,completed_at,duration_minutes,perceived_effort,notes,routines(name)")
      .eq("client_id", clientId)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: true })
      .limit(160);
    if (sessionsError) {
      body.innerHTML =
        '<p class="training-empty">No se pudieron cargar los entrenamientos.</p>';
      return;
    }
    if (!sessions?.length) {
      body.innerHTML =
        '<p class="training-empty">Todavia no hay entrenamientos completados.</p>';
      return;
    }
    const { data: logs, error: logsError } = await ftSupabase
      .from("set_logs")
      .select("session_id,exercise_id,set_number,weight_kg,reps,rir,pain_level,completed,exercises(name)")
      .in(
        "session_id",
        sessions.map((s) => s.id),
      );
    if (logsError) {
      body.innerHTML = '<p class="training-empty">No se pudo cargar el desglose de los entrenamientos.</p>';
      return;
    }
    const logsBySession = new Map(sessions.map((session) => [session.id, []]));
    (logs || []).filter((log) => log.completed !== false).forEach((log) => logsBySession.get(log.session_id)?.push(log));
    const ordered = sessions.map((session, index) => ({ ...session, trainingNumber: index + 1, logs: logsBySession.get(session.id) || [] }));

    function exercisesFor(session) {
      const groups = new Map();
      session.logs.forEach((log) => {
        if (!groups.has(log.exercise_id)) groups.set(log.exercise_id, { id: log.exercise_id, name: log.exercises?.name || "Ejercicio", sets: [] });
        groups.get(log.exercise_id).sets.push(log);
      });
      return [...groups.values()].map((exercise) => ({ ...exercise, sets: exercise.sets.sort((a, b) => number(a.set_number) - number(b.set_number)) }));
    }
    const sessionVolume = (session) => session.logs.reduce((sum, log) => sum + number(log.weight_kg) * number(log.reps), 0);
    function previousExercise(sessionIndex, exerciseId) {
      for (let index = sessionIndex - 1; index >= 0; index -= 1) {
        const found = exercisesFor(ordered[index]).find((exercise) => exercise.id === exerciseId);
        if (found) return found;
      }
      return null;
    }
    function compactSets(sets) {
      const grouped = [];
      sets.forEach((set) => {
        const key = `${number(set.reps)}|${number(set.weight_kg)}`;
        const last = grouped[grouped.length - 1];
        if (last?.key === key) last.count += 1;
        else grouped.push({ key, count: 1, reps: number(set.reps), weight: number(set.weight_kg) });
      });
      return grouped.map((group) => `<span class="training-set-summary"><b>${group.count} series</b><em>${group.reps} rep · ${weightLabel(group.weight)}</em></span>`).join("");
    }
    function renderDetail(sessionIndex) {
      const session = ordered[sessionIndex], exercises = exercisesFor(session), volume = sessionVolume(session);
      const exerciseCards = exercises.map((exercise) => {
        const previous = previousExercise(sessionIndex, exercise.id),
          currentMax = Math.max(...exercise.sets.map((set) => number(set.weight_kg))),
          previousMax = previous ? Math.max(...previous.sets.map((set) => number(set.weight_kg))) : null,
          delta = previousMax == null ? null : currentMax - previousMax,
          progress = delta == null ? '<span class="training-new">Primer registro</span>' : delta > 0 ? `<span class="training-up">+${weightLabel(delta)} desde la anterior</span>` : delta < 0 ? `<span class="training-down">-${weightLabel(Math.abs(delta))} desde la anterior</span>` : '<span class="training-flat">Misma carga que la anterior</span>';
        return `<article class="training-exercise-card"><header><div><small>EJERCICIO</small><h3>${esc(exercise.name)}</h3></div>${progress}</header><div class="training-set-summaries">${compactSets(exercise.sets)}</div><details><summary>Ver cada serie</summary><div class="training-set-table">${exercise.sets.map((set, index) => `<div><span>Serie ${number(set.set_number) || index + 1}</span><b>${set.reps ?? "--"} rep</b><strong>${weightLabel(set.weight_kg)}</strong>${set.rir == null ? "" : `<em>RIR ${esc(set.rir)}</em>`}</div>`).join("")}</div></details></article>`;
      }).join("");
      body.innerHTML = `<button type="button" class="training-back">← Todos los entrenamientos</button><section class="training-detail-hero"><div><p class="eyebrow">ENTRENAMIENTO ${session.trainingNumber}</p><h3>${esc(session.routines?.name || `Sesion ${session.day_number || session.trainingNumber}`)}</h3><span>${dateLabel(sessionDate(session))}${session.day_number ? ` · Dia ${session.day_number}` : ""}</span></div></section><div class="training-session-stats"><article><b>${exercises.length}</b><span>Ejercicios</span></article><article><b>${session.logs.length}</b><span>Series</span></article><article><b>${Math.round(volume).toLocaleString("es-ES")}</b><span>Kg de volumen</span></article><article><b>${session.duration_minutes || "--"}</b><span>Minutos</span></article></div>${session.perceived_effort ? `<p class="training-effort">Esfuerzo percibido: <b>${session.perceived_effort}/10</b></p>` : ""}${exerciseCards || '<p class="training-empty">Esta sesion no tiene series registradas.</p>'}${session.notes ? `<div class="training-session-notes"><b>Notas del cliente</b><p>${esc(session.notes)}</p></div>` : ""}`;
      body.querySelector(".training-back").onclick = renderList;
    }
    function renderList() {
      const newest = [...ordered].reverse();
      const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);
      const recentSessions = ordered.filter((session) => new Date(`${sessionDate(session)}T12:00:00`) >= monthAgo).length,
        totalSets = ordered.reduce((sum, session) => sum + session.logs.length, 0),
        totalVolume = ordered.reduce((sum, session) => sum + sessionVolume(session), 0);
      body.innerHTML = `<div class="training-client-summary"><p class="eyebrow">RESUMEN DE ${esc(clientName)}</p><div><article><b>${ordered.length}</b><span>Entrenamientos</span></article><article><b>${recentSessions}</b><span>Ultimos 30 dias</span></article><article><b>${totalSets}</b><span>Series realizadas</span></article><article><b>${Math.round(totalVolume).toLocaleString("es-ES")}</b><span>Kg acumulados</span></article></div></div><div class="training-history-title"><b>Historial del cliente</b><span>Pulsa un entrenamiento para ver sus ejercicios</span></div><div class="training-session-list">${newest.map((session) => {
        const exercises = exercisesFor(session), volume = sessionVolume(session), originalIndex = ordered.findIndex((item) => item.id === session.id);
        return `<button type="button" class="training-session-card" data-session-index="${originalIndex}"><span class="training-session-number">${session.trainingNumber}</span><span class="training-session-copy"><small>ENTRENAMIENTO ${session.trainingNumber}</small><b>${esc(session.routines?.name || `Sesion ${session.day_number || session.trainingNumber}`)}</b><em>${dateLabel(sessionDate(session), { year: undefined })}${session.day_number ? ` · Dia ${session.day_number}` : ""}</em></span><span class="training-session-resume"><b>${exercises.length} ejercicios</b><em>${session.logs.length} series · ${Math.round(volume).toLocaleString("es-ES")} kg</em></span><span class="training-session-arrow">→</span></button>`;
      }).join("")}</div>`;
      body.querySelectorAll("[data-session-index]").forEach((button) => button.onclick = () => renderDetail(number(button.dataset.sessionIndex)));
    }
    renderList();
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
