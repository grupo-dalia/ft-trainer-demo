/* Planificador FT: creación guiada y navegación por sesiones/músculos. */
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
      <p class="eyebrow">NUEVA PLANIFICACIÓN</p>
      <h2>¿Qué quieres preparar?</h2>
      <p class="muted">Crea una sesión para un día concreto o una programación completa para toda la semana.</p>
      <div class="plan-choice-grid">
        <label class="plan-choice"><input type="radio" name="scope" value="daily" checked><span>${icons.day}<b>Rutina diaria</b><small>Una única sesión organizada por músculos.</small></span></label>
        <label class="plan-choice"><input type="radio" name="scope" value="weekly"><span>${icons.week}<b>Plan semanal</b><small>Varias sesiones separadas por días y grupos musculares.</small></span></label>
      </div>
      <div class="admin-fields">
        <label class="wide">Nombre<input name="name" required placeholder="Ej. Fuerza · Semana 1"></label>
        <label>Objetivo<select name="goal"><option>Fuerza</option><option>Hipertrofia</option><option>Pérdida de grasa</option><option>Movilidad</option><option>Readaptación</option></select></label>
        <label>Carpeta<select name="folder_id"><option value="">Sin carpeta</option>${(folders || []).map((folder) => `<option value="${folder.id}">${esc(folder.name)}</option>`).join("")}</select></label>
      </div>
      <div class="planner-days" aria-label="Días de entrenamiento">${["L", "M", "X", "J", "V", "S", "D"].map((day, index) => `<label><input type="checkbox" name="day" value="${index + 1}" ${index < 3 ? "checked" : ""}><span>${day}</span></label>`).join("")}</div>
      <label>Indicaciones generales<textarea name="description" placeholder="Objetivo, nivel, restricciones o notas para el cliente"></textarea></label>
      <p class="form-feedback" aria-live="polite"></p>
      <button class="primary full" type="submit">Crear y añadir ejercicios →</button>
    </form>`;
    node.classList.add("open");
    const form = node.querySelector("form"),
      days = node.querySelector(".planner-days");
    node.querySelector(".admin-form-close").onclick = () =>
      node.classList.remove("open");
    node.onclick = (event) => {
      if (event.target === node) node.classList.remove("open");
    };
    form.querySelectorAll('[name="scope"]').forEach(
      (radio) =>
        (radio.onchange = () =>
          days.classList.toggle("show", radio.value === "weekly" && radio.checked)),
    );
    form.onsubmit = async (event) => {
      event.preventDefault();
      const data = new FormData(form),
        scope = String(data.get("scope")),
        selectedDays = data.getAll("day"),
        feedback = form.querySelector(".form-feedback"),
        button = form.querySelector('[type="submit"]');
      if (scope === "weekly" && !selectedDays.length) {
        feedback.textContent = "Selecciona al menos un día de entrenamiento.";
        return;
      }
      button.disabled = true;
      button.textContent = "Creando planificación…";
      const { data: auth } = await ftSupabase.auth.getUser(),
        description = [
          scope === "weekly"
            ? `Plan semanal · ${selectedDays.length} sesiones`
            : "Rutina diaria · 1 sesión",
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
          })
          .select("id")
          .single();
      if (error) {
        feedback.textContent = "No se pudo crear la planificación.";
        button.disabled = false;
        button.textContent = "Crear y añadir ejercicios →";
        return;
      }
      node.classList.remove("open");
      toast("Planificación creada. Añade ahora cada sesión.");
      render("routines");
      setTimeout(() => openRoutineEditor(created.id), 120);
    };
  };

  const baseEditor = window.openRoutineEditor;
  window.openRoutineEditor = async (id) => {
    await baseEditor(id);
    const host = document.getElementById("routine-editor-overlay"),
      header = host?.querySelector(".routine-editor-header"),
      list = host?.querySelector(".routine-exercise-list"),
      dayInput = host?.querySelector('[name="day_number"]');
    if (!header || !list || !dayInput) return;
    const rows = [...list.querySelectorAll(".routine-exercise-row")],
      usedDays = [...new Set(rows.map((row) => Number(row.querySelector(".routine-exercise-order")?.textContent.match(/\d+/)?.[0]) || 1))].sort((a, b) => a - b),
      maxDay = Math.max(1, ...usedDays),
      controls = document.createElement("div");
    controls.className = "planner-editor-summary";
    controls.innerHTML = `<span>${maxDay} ${maxDay === 1 ? "sesión" : "sesiones"}</span><span>${rows.length} ejercicios</span><span>Organizado por día y músculo</span>`;
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
    tabs.className = "planner-day-tabs";
    const renderTabs = (active) => {
      const days = [...new Set([...usedDays, active, maxDay + 1])].sort((a, b) => a - b);
      tabs.innerHTML = days.map((day) => `<button type="button" class="${day === active ? "active" : ""}" data-plan-day="${day}"><b>Sesión ${day}</b><small>${rows.filter((row) => Number(row.querySelector(".routine-exercise-order")?.textContent.match(/\d+/)?.[0]) === day).length} ejercicios</small></button>`).join("");
      rows.forEach((row) => {
        row.hidden = Number(row.querySelector(".routine-exercise-order")?.textContent.match(/\d+/)?.[0]) !== active;
      });
      dayInput.value = active;
      tabs.querySelectorAll("button").forEach((button) =>
        (button.onclick = () => renderTabs(Number(button.dataset.planDay))),
      );
    };
    list.parentElement.insertBefore(tabs, list);
    renderTabs(usedDays[0] || 1);

    const search = host.querySelector("#routine-exercise-search"),
      searchLabel = search?.closest("label");
    if (search && searchLabel) {
      const muscles = ["Pecho", "Espalda", "Pierna", "Hombro", "Bíceps", "Tríceps", "Core", "Glúteo"],
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
    }
  };
})();
