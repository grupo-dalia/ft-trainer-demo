/* Planificador FT: creacion guiada y navegacion por sesiones/musculos. */
(function () {
  const esc = (value) => escapeHtml(String(value ?? ""));
  const icons = {
    day: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>',
    week: '<svg viewBox="0 0 24 24"><path d="M4 5h16v15H4zM4 10h16M9 5v15M15 5v15"/></svg>',
  };

  window.openRoutineTemplate = async () => {
    const { data: folders } = await ftSupabase
      .from("routine_folders")
      .select("id,name")
      .order("name");
    let node = document.getElementById("routine-planner-wizard");
    if (!node) {
      node = document.createElement("div");
      node.id = "routine-planner-wizard";
      node.className = "admin-form-overlay";
      document.body.appendChild(node);
    }
    node.innerHTML = `<form class="admin-form planner-wizard">
      <button type="button" class="admin-form-close" aria-label="Cerrar">×</button>
      <p class="eyebrow">NUEVA PLANIFICACION</p>
      <h2>¿Que quieres preparar?</h2>
      <p class="muted">Crea una sesion para un dia concreto o una programacion completa para toda la semana.</p>
      <div class="planner-mode-choice"><label class="plan-choice"><input type="radio" name="mode" value="guided" checked><span><b>Asistente guiado</b><small>Define objetivo, experiencia, dias y grupos musculares.</small></span></label><label class="plan-choice"><input type="radio" name="mode" value="manual"><span><b>Creacion manual</b><small>Abre una rutina vacia y anade ejercicios libremente.</small></span></label></div>
      <div class="plan-choice-grid">
        <label class="plan-choice"><input type="radio" name="scope" value="daily" checked><span>${icons.day}<b>Rutina diaria</b><small>Una unica sesion organizada por musculos.</small></span></label>
        <label class="plan-choice"><input type="radio" name="scope" value="weekly"><span>${icons.week}<b>Plan semanal</b><small>Varias sesiones separadas por dias y grupos musculares.</small></span></label>
      </div>
      <div class="admin-fields">
        <label class="wide">Nombre<input name="name" required placeholder="Ej. Fuerza · Semana 1"></label>
        <label>Objetivo<select name="goal"><option>Hipertrofia</option><option>Fuerza</option><option>Perdida de grasa</option><option>Movilidad</option><option>Readaptacion</option></select></label>
        <label>Experiencia<select name="experience"><option value="principiante">Principiante</option><option value="intermedio" selected>Intermedio</option><option value="avanzado">Avanzado</option></select></label>
        <label>Carpeta<select name="folder_id"><option value="">Sin carpeta</option>${(folders || []).map((folder) => `<option value="${folder.id}">${esc(folder.name)}</option>`).join("")}</select></label>
      </div>
      <p class="planner-days-question">Cuantos dias va a entrenar esta persona?</p><div class="planner-days" aria-label="Dias de entrenamiento">${["L", "M", "X", "J", "V", "S", "D"].map((day, index) => `<label><input type="checkbox" name="day" value="${index + 1}" ${index < 3 ? "checked" : ""}><span>${day}</span></label>`).join("")}</div>
      <label>Indicaciones generales<textarea name="description" placeholder="Objetivo, nivel, restricciones o notas para el cliente"></textarea></label>
      <p class="form-feedback" aria-live="polite"></p>
      <button class="primary full" type="submit">Crear y anadir ejercicios →</button>
    </form>`;
    node.classList.add("open");
    const form = node.querySelector("form"),
      days = node.querySelector(".planner-days"),
      dayQuestion = node.querySelector(".planner-days-question"),
      dayConfig = document.createElement("div");
    dayConfig.className = "planner-day-config";
    days.after(dayConfig);
    const defaultMuscles = ["Pecho", "Hombros", "Piernas", "Espalda", "Brazos", "Core", "Full body"];
    const labels = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"];
    const renderDayConfig = () => {
      const selected = [...days.querySelectorAll('input[name="day"]:checked')].map((input) => Number(input.value));
      const weekly = form.querySelector('[name="scope"]:checked').value === "weekly";
      dayConfig.hidden = !weekly;
      dayConfig.innerHTML = weekly ? `<p><b>Que se trabaja cada dia</b><small>El editor filtrara el catalogo automaticamente.</small></p>${selected.map((day, index) => `<label>${labels[day - 1]}<select name="muscle_${day}">${defaultMuscles.map((muscle) => `<option${muscle === defaultMuscles[index] ? " selected" : ""}>${muscle}</option>`).join("")}</select></label>`).join("")}` : "";
    };
    const setMode = () => {
      const guided = form.querySelector('[name="mode"]:checked').value === "guided";
      node.querySelector(".plan-choice-grid").hidden = !guided;
      if (guided) renderDayConfig();
      else { days.classList.remove("show"); dayQuestion.hidden = true; dayConfig.hidden = true; }
    };
    node.querySelector(".admin-form-close").onclick = () =>
      node.classList.remove("open");
    node.onclick = (event) => {
      if (event.target === node) node.classList.remove("open");
    };
    form.querySelectorAll('[name="scope"]').forEach(
      (radio) =>
        (radio.onchange = () => {
          days.classList.toggle("show", radio.value === "weekly" && radio.checked);
          dayQuestion.hidden = !(radio.value === "weekly" && radio.checked);
          renderDayConfig();
        }),
    );
    days.querySelectorAll('input[name="day"]').forEach((input) => (input.onchange = renderDayConfig));
    form.querySelectorAll('[name="mode"]').forEach((input) => (input.onchange = setMode));
    dayQuestion.hidden = true;
    renderDayConfig();
    form.onsubmit = async (event) => {
      event.preventDefault();
      const data = new FormData(form),
        mode = String(data.get("mode")),
        scope = mode === "manual" ? "manual" : String(data.get("scope")),
        selectedDays = data.getAll("day"),
        feedback = form.querySelector(".form-feedback"),
        button = form.querySelector('[type="submit"]');
      if (scope === "weekly" && !selectedDays.length) {
        feedback.textContent = "Selecciona al menos un dia de entrenamiento.";
        return;
      }
      button.disabled = true;
      button.textContent = "Creando planificacion…";
      const { data: auth } = await ftSupabase.auth.getUser(),
        dayMuscles = Object.fromEntries((scope === "weekly" ? selectedDays : ["1"]).map((day) => [day, String(data.get(`muscle_${day}`) || "Full body")])),
        description = [
          scope === "weekly"
            ? `Plan semanal · ${selectedDays.length} sesiones`
            : "Rutina diaria · 1 sesion",
          String(data.get("goal")),
          String(data.get("description") || "").trim(),
        ]
          .filter(Boolean)
          .join(" · "),
        { data: created, error } = await ftSupabase
          .from("routines")
          .insert({
            name: String(data.get("name")).trim(),
            description,
            folder_id: data.get("folder_id") || null,
            client_id: null,
            created_by: auth.user?.id || null,
            source: "trainer",
            status: "draft",
            coach_reasoning: { mode, scope, experience: String(data.get("experience")), training_days: (scope === "weekly" ? selectedDays : ["1"]).map(Number), day_muscles: dayMuscles },
          })
          .select("id")
          .single();
      if (error) {
        feedback.textContent = "No se pudo crear la planificacion.";
        button.disabled = false;
        button.textContent = "Crear y anadir ejercicios →";
        return;
      }
      node.classList.remove("open");
      toast("Planificacion creada. Anade ahora cada sesion.");
      render("routines");
      setTimeout(() => openRoutineEditor(created.id), 120);
    };
  };

  const baseEditor = window.openRoutineEditor;
  window.openRoutineEditor = async (id) => {
    await baseEditor(id);
    const { data: routineConfig } = await ftSupabase
      .from("routines")
      .select("coach_reasoning")
      .eq("id", id)
      .maybeSingle();
    const dayMuscles = routineConfig?.coach_reasoning?.day_muscles || {};
    const host = document.getElementById("routine-editor-overlay"),
      header = host?.querySelector(".routine-editor-header"),
      list = host?.querySelector(".routine-exercise-list"),
      dayInput = host?.querySelector('[name="day_number"]');
    if (!header || !list || !dayInput) return;
    const rows = [...list.querySelectorAll(".routine-exercise-row")],
      usedDays = [...new Set([...rows.map((row) => Number(row.querySelector(".routine-exercise-order")?.textContent.match(/\d+/)?.[0]) || 1), ...(routineConfig?.coach_reasoning?.training_days || [])])].sort((a, b) => a - b),
      maxDay = Math.max(1, ...usedDays),
      controls = document.createElement("div");
    controls.className = "planner-editor-summary";
    controls.innerHTML = `<span>${maxDay} ${maxDay === 1 ? "sesion" : "sesiones"}</span><span>${rows.length} ejercicios</span><span>Organizado por dia y musculo</span>`;
    header.querySelector("div").appendChild(controls);
    const assignButton = document.createElement("button");
    assignButton.type = "button";
    assignButton.className = "primary planner-assign-now";
    assignButton.textContent = "Asignar a cliente →";
    assignButton.onclick = () => {
      host.classList.remove("open");
      openRoutineAssignment(id);
    };
    header.insertBefore(assignButton, header.querySelector(".admin-form-close"));
    const tabs = document.createElement("div");
    let applyDayFilter = () => {};
    tabs.className = "planner-day-tabs";
    const renderTabs = (active) => {
      const days = usedDays.length ? usedDays : [1];
      tabs.innerHTML = days.map((day) => `<button type="button" class="${day === active ? "active" : ""}" data-plan-day="${day}"><b>${["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"][day - 1] || `Sesion ${day}`}</b><small>${rows.filter((row) => Number(row.querySelector(".routine-exercise-order")?.textContent.match(/\d+/)?.[0]) === day).length} ejercicios</small></button>`).join("");
      rows.forEach((row) => {
        const matches = Number(row.querySelector(".routine-exercise-order")?.textContent.match(/\d+/)?.[0]) === active;
        row.hidden = !matches;
        row.style.setProperty("display", matches ? "grid" : "none", "important");
      });
      dayInput.value = active;
      tabs.querySelectorAll("button").forEach((button) =>
        (button.onclick = () => renderTabs(Number(button.dataset.planDay))),
      );
      applyDayFilter(active);
    };
    list.parentElement.insertBefore(tabs, list);
    renderTabs(usedDays[0] || 1);

    const search = host.querySelector("#routine-exercise-search"),
      searchLabel = search?.closest("label");
    if (search && searchLabel) {
      const muscles = ["Pecho", "Espalda", "Pierna", "Hombro", "Biceps", "Triceps", "Core", "Gluteo"],
        filters = document.createElement("div");
      filters.className = "muscle-filter-grid";
      filters.innerHTML = muscles.map((muscle) => `<button type="button">${muscle}</button>`).join("");
      searchLabel.after(filters);
      filters.querySelectorAll("button").forEach((button) => {
        button.onclick = () => {
          filters.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
          button.classList.add("active");
          search.value = button.textContent;
          search.dispatchEvent(new Event("input"));
        };
      });
      applyDayFilter = (day) => {
        const muscle = String(dayMuscles[day] || "");
        if (!muscle || muscle === "Full body") return;
        const searchTerm = muscle === "Hombros" ? "Hombro" : muscle === "Piernas" ? "Pierna" : muscle;
        filters.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item.textContent === searchTerm));
        search.value = searchTerm;
        search.dispatchEvent(new Event("input"));
      };
      applyDayFilter(usedDays[0] || 1);
    }
  };
})();
