/* Ficha de entrenamientos por cliente: comparativa semanal de cargas, accesible desde Clientes. */
(function () {
  const esc = (value) => escapeHtml(String(value ?? ""));
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
    node.innerHTML = `<section class="admin-form training-log-form"><button type="button" class="admin-form-close" aria-label="Cerrar">×</button><p class="eyebrow">REGISTROS DE ENTRENAMIENTO</p><h2>${esc(clientName)}</h2><p class="muted">Comparativa semanal de las cargas registradas por el cliente.</p><div class="training-log-body"><p class="training-empty">Cargando entrenamientos…</p></div></section>`;
    node.classList.add("open");
    node.querySelector(".admin-form-close").onclick = () =>
      node.classList.remove("open");
    node.onclick = (event) => {
      if (event.target === node) node.classList.remove("open");
    };
    const body = node.querySelector(".training-log-body");
    const [{ data: sessions, error: sessionsError }, { data: routines }] =
      await Promise.all([
        ftSupabase
          .from("workout_sessions")
          .select("id,planned_for")
          .eq("client_id", clientId)
          .not("completed_at", "is", null)
          .order("planned_for", { ascending: false })
          .limit(160),
        ftSupabase.from("routines").select("id").eq("client_id", clientId),
      ]);
    if (sessionsError) {
      body.innerHTML =
        '<p class="training-empty">No se pudieron cargar los entrenamientos.</p>';
      return;
    }
    if (!sessions?.length) {
      body.innerHTML =
        '<p class="training-empty">Todavía no hay entrenamientos completados.</p>';
      return;
    }
    const sessionDate = new Map(sessions.map((s) => [s.id, s.planned_for]));
    const { data: logs } = await ftSupabase
      .from("set_logs")
      .select("session_id,exercise_id,weight_kg,reps")
      .in(
        "session_id",
        sessions.map((s) => s.id),
      );
    const routineIds = (routines || []).map((r) => r.id);
    const nameMap = new Map();
    if (routineIds.length) {
      const { data: items } = await ftSupabase
        .from("routine_exercises")
        .select("exercise_id,exercises(name)")
        .in("routine_id", routineIds);
      (items || []).forEach((item) =>
        nameMap.set(item.exercise_id, item.exercises?.name),
      );
    }
    const missing = [
      ...new Set((logs || []).map((log) => log.exercise_id)),
    ].filter((id) => !nameMap.has(id));
    if (missing.length) {
      const { data: extra } = await ftSupabase
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
          .slice(0, 8),
      }))
      .filter((row) => row.weeks.length)
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
    body.innerHTML = rows.length
      ? rows
          .map((row) => {
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
                        ? `<em class="training-up">↑ ${delta.toFixed(1)} kg</em>`
                        : delta < 0
                          ? `<em class="training-down">↓ ${Math.abs(delta).toFixed(1)} kg</em>`
                          : `<em class="training-flat">= kg</em>`;
                return `<div class="training-week"><time>${weekLabel(week)}</time><b>${entry.weight_kg} kg × ${entry.reps ?? "—"}</b>${deltaLabel}</div>`;
              })
              .join("");
            return `<article class="training-row"><h3>${esc(row.name)}</h3><div class="training-weeks">${cells}</div></article>`;
          })
          .join("")
      : '<p class="training-empty">Todavía no hay cargas registradas.</p>';
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
        `${clientName} todavía no tiene rutina asignada. Asígnale una desde Rutinas.`,
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
