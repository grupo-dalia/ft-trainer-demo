/* Explorador de rutinas: las carpetas organizan y cada rutina abre su editor. */
const routinePageBase = pages.routines;
pages.routines = () =>
  `${routinePageBase()}<section class="card routine-explorer" id="routine-explorer"><div class="section-head"><div><p class="eyebrow">BIBLIOTECA</p><h2>Rutinas guardadas</h2><p class="muted">Prepara los ejercicios y pulsa <b>Asignar a cliente</b> cuando la plantilla este lista.</p></div><button class="primary" id="new-folder">＋ Nueva carpeta</button></div><div class="routine-steps"><span><b>1</b> Crea la rutina</span><span><b>2</b> Anade ejercicios</span><span><b>3</b> Asignala al cliente</span></div><div class="routine-location" id="routine-location"><button type="button" class="back-button" id="routine-back" aria-label="Volver a la carpeta anterior">←</button><nav class="breadcrumbs" id="routine-breadcrumbs">Rutinas</nav></div><div class="folder-grid" id="folder-grid"><p class="muted">Cargando carpetas…</p></div></section>`;
const folderState = { parent: null, folders: [], routines: [] };

async function loadRoutineFolders() {
  const grid = document.getElementById("folder-grid");
  if (!grid || !window.ftSupabase) return;
  await ensureBasicWeeklyRoutine();
  const routineQuery = ftSupabase
    .from("routines")
    .select("id,name,folder_id,description")
    .is("client_id", null);
  const [folders, routines] = await Promise.all([
    ftSupabase
      .from("routine_folders")
      .select("id,name,parent_id")
      .order("name"),
    folderState.parent
      ? routineQuery.eq("folder_id", folderState.parent)
      : routineQuery.is("folder_id", null),
  ]);
  if (folders.error || routines.error) {
    grid.innerHTML = '<p class="muted">No se pudieron cargar las rutinas.</p>';
    return;
  }
  folderState.folders = folders.data || [];
  folderState.routines = routines.data || [];
  const current = folderState.folders.filter(
    (folder) => folder.parent_id === folderState.parent,
  );
  const options = folderState.folders
    .map(
      (folder) =>
        `<option value="${folder.id}">${escapeHtml(folder.name)}</option>`,
    )
    .join("");
  grid.innerHTML =
    [
      ...current.map(
        (folder) =>
          `<article class="folder-card" data-folder="${folder.id}" tabindex="0" role="button"><div class="file-icon folder-icon">▰</div><b>${escapeHtml(folder.name)}</b><small>Abrir carpeta</small><div class="card-actions"><button type="button" class="rename-folder" title="Renombrar carpeta">Renombrar</button></div></article>`,
      ),
      ...folderState.routines.map(
        (routine) =>
          `<article class="routine-file"><div class="file-icon routine-icon">▤</div><div class="routine-copy"><b>${escapeHtml(routine.name)}</b><small>${escapeHtml(routine.description || "Sin descripcion")}</small></div><div class="routine-actions"><button type="button" class="secondary edit-routine" data-routine="${routine.id}">Editar ejercicios</button><button type="button" class="primary assign-routine" data-routine="${routine.id}">Asignar a cliente</button></div><label class="move-control">Carpeta<select class="folder-move" data-routine="${routine.id}" aria-label="Mover rutina"><option value="">Rutinas (raiz)</option>${options}</select></label></article>`,
      ),
    ].join("") ||
    '<div class="routine-empty"><b>Esta carpeta esta vacia</b><p>Crea una rutina o mueve una existente hasta aqui.</p></div>';

  grid
    .querySelectorAll(".edit-routine")
    .forEach(
      (button) =>
        (button.onclick = () => openRoutineEditor(button.dataset.routine)),
    );
  grid
    .querySelectorAll(".assign-routine")
    .forEach(
      (button) =>
        (button.onclick = () => openRoutineAssignment(button.dataset.routine)),
    );
  grid.querySelectorAll(".folder-card").forEach((card) => {
    const open = () => {
      folderState.parent = card.dataset.folder;
      loadRoutineFolders();
    };
    card.onclick = (event) => {
      if (!event.target.closest("button")) open();
    };
    card.onkeydown = (event) => {
      if (
        (event.key === "Enter" || event.key === " ") &&
        !event.target.closest("button")
      ) {
        event.preventDefault();
        open();
      }
    };
  });
  grid.querySelectorAll(".rename-folder").forEach(
    (button) =>
      (button.onclick = async (event) => {
        event.stopPropagation();
        const card = button.closest("[data-folder]"),
          name = prompt("Nuevo nombre de carpeta");
        if (name?.trim())
          await ftSupabase
            .from("routine_folders")
            .update({ name: name.trim(), updated_at: new Date().toISOString() })
            .eq("id", card.dataset.folder);
        loadRoutineFolders();
      }),
  );
  grid.querySelectorAll(".folder-move").forEach((select) => {
    select.value = folderState.parent || "";
    select.onchange = async () => {
      await ftSupabase
        .from("routines")
        .update({ folder_id: select.value || null })
        .eq("id", select.dataset.routine);
      loadRoutineFolders();
    };
  });
  const currentName = folderState.parent
    ? folderState.folders.find((folder) => folder.id === folderState.parent)
        ?.name
    : "";
  document.getElementById("routine-breadcrumbs").textContent =
    folderState.parent ? `Rutinas / ${currentName}` : "Rutinas";
  document.getElementById("routine-back").hidden = !folderState.parent;
  decorateRoutineWorkspace();
}

async function openRoutineAssignment(templateId) {
  const [
    { data: template, error: templateError },
    { data: items, error: itemsError },
    { data: clients, error: clientsError },
  ] = await Promise.all([
    ftSupabase
      .from("routines")
      .select("id,name,description,source,coach_reasoning")
      .eq("id", templateId)
      .single(),
    ftSupabase
      .from("routine_exercises")
      .select(
        "exercise_id,day_number,position,target_sets,target_reps_min,target_reps_max,target_weight_kg,target_rir,rest_seconds,notes",
      )
      .eq("routine_id", templateId)
      .order("day_number")
      .order("position"),
    ftSupabase
      .from("clients")
      .select("id,subscriber_number,full_name,first_name,last_name,phone")
      .eq("access_status", "active")
      .order("full_name"),
  ]);
  if (templateError || itemsError || clientsError) {
    toast("No se pudo preparar la asignacion");
    return;
  }
  if (!items?.length) {
    toast("Anade ejercicios antes de asignar esta rutina");
    return;
  }
  if (!clients?.length) {
    toast("No hay clientes activos a los que asignar la rutina");
    return;
  }
  let node = document.getElementById("assign-routine-overlay");
  if (!node) {
    node = document.createElement("div");
    node.id = "assign-routine-overlay";
    node.className = "admin-form-overlay";
    document.body.appendChild(node);
  }
  node.innerHTML = `<form class="admin-form assign-routine-form"><button type="button" class="admin-form-close" aria-label="Cerrar">×</button><p class="eyebrow">ASIGNAR PROGRAMACION</p><h2>${escapeHtml(template.name)}</h2><p class="muted">El cliente vera inmediatamente esta rutina y todos sus ejercicios en su aplicacion.</p><div class="assignment-summary"><span>▤</span><div><b>${items.length} ejercicios preparados</b><small>La plantilla original se conserva para reutilizarla.</small></div></div><label>Cliente activo<select name="client_id" required><option value="">Selecciona un cliente</option>${clients.map((client) => `<option value="${client.id}">N.º ${client.subscriber_number || "—"} · ${escapeHtml(client.full_name || `${client.first_name || ""} ${client.last_name || ""}`.trim())}${client.phone ? ` · ${escapeHtml(client.phone)}` : ""}</option>`).join("")}</select></label><label class="replace-routine"><input type="checkbox" name="replace_active" checked> Sustituir la rutina activa anterior de este cliente</label><p class="form-feedback" aria-live="polite"></p><button class="primary full" type="submit">Asignar rutina ahora</button></form>`;
  node.classList.add("open");
  node.querySelector(".admin-form-close").onclick = () =>
    node.classList.remove("open");
  node.onclick = (event) => {
    if (event.target === node) node.classList.remove("open");
  };
  node.querySelector("form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form),
      clientId = String(data.get("client_id") || ""),
      button = form.querySelector('[type="submit"]'),
      feedback = form.querySelector(".form-feedback");
    if (!clientId) {
      feedback.textContent = "Selecciona un cliente.";
      return;
    }
    button.disabled = true;
    button.textContent = "Asignando…";
    feedback.textContent = "";
    if (data.get("replace_active") === "on")
      await ftSupabase
        .from("routines")
        .update({ status: "archived" })
        .eq("client_id", clientId)
        .eq("status", "active");
    const {
        data: { user },
      } = await ftSupabase.auth.getUser(),
      { data: assigned, error: assignError } = await ftSupabase
        .from("routines")
        .insert({
          client_id: clientId,
          created_by: user?.id || null,
          name: template.name,
          description: template.description,
          source: template.source || "trainer",
          status: "active",
          week_start: new Date().toISOString().slice(0, 10),
          coach_reasoning: template.coach_reasoning || {},
        })
        .select("id")
        .single();
    if (assignError) {
      feedback.textContent = "No se pudo asignar la rutina.";
      button.disabled = false;
      button.textContent = "Asignar rutina ahora";
      return;
    }
    const copies = items.map((item) => ({ ...item, routine_id: assigned.id })),
      { error: copyError } = await ftSupabase
        .from("routine_exercises")
        .insert(copies);
    if (copyError) {
      await ftSupabase.from("routines").delete().eq("id", assigned.id);
      feedback.textContent =
        "No se pudieron copiar los ejercicios. No se ha realizado la asignacion.";
      button.disabled = false;
      button.textContent = "Asignar rutina ahora";
      return;
    }
    const client = clients.find((item) => item.id === clientId),
      clientName =
        client?.full_name ||
        `${client?.first_name || ""} ${client?.last_name || ""}`.trim();
    node.classList.remove("open");
    toast(`Rutina asignada a ${clientName}`);
  };
}

const basicWeeklyPlan = [
  { day: 1, label: "Lunes · Pecho", group: "Pecho", picks: ["barbell bench press", "barbell incline bench press", "cable one arm decline chest fly"] },
  { day: 2, label: "Martes · Hombro", group: "Hombros", picks: ["dumbbell one arm shoulder press", "cable lateral raise", "barbell rear delt raise"] },
  { day: 3, label: "Miercoles · Pierna", group: "Piernas", picks: ["barbell bench front squat", "lever horizontal one leg press", "lever lying leg curl"] },
  { day: 4, label: "Jueves · Espalda", group: "Espalda", picks: ["barbell bent over row", "alternate lateral pulldown", "dumbbell bent over row"] },
  { day: 5, label: "Viernes · Brazo", group: "Brazos", picks: ["barbell curl", "dumbbell hammer curl", "cable pushdown"] },
];

async function ensureBasicWeeklyRoutine() {
  if (!window.ftSupabase || window.basicWeeklyRoutineChecked) return;
  window.basicWeeklyRoutineChecked = true;
  const { data: existing } = await ftSupabase.from("routines").select("id").is("client_id", null).ilike("name", "Bas% semanal").limit(1).maybeSingle();
  if (existing?.id) return;
  const { data: auth } = await ftSupabase.auth.getUser();
  const { data: routine, error } = await ftSupabase.from("routines").insert({
    client_id: null,
    created_by: auth.user?.id || null,
    name: "Basica semanal",
    description: "Programa inicial de 5 dias · Pecho, hombro, pierna, espalda y brazo · 3 ejercicios por sesion.",
    source: "trainer",
    status: "draft",
  }).select("id").single();
  if (error || !routine) { window.basicWeeklyRoutineChecked = false; return; }
  try {
    const catalog = await fetch("data/ejercicios-es.json?v=2").then((response) => response.json());
    const rows = [];
    for (const plan of basicWeeklyPlan) {
      for (let position = 0; position < plan.picks.length; position += 1) {
        const wanted = plan.picks[position];
        const exercise = catalog.find((item) => item.grupo === plan.group && item.nombre.toLowerCase() === wanted);
        if (!exercise) continue;
        const { data: saved, error: saveError } = await ftSupabase.from("exercises").insert({
          name: exercise.nombre, body_group: exercise.grupo, primary_muscle: exercise.objetivo || plan.group,
          secondary_muscles: exercise.musculos || [], equipment: exercise.equipo,
          instructions: (exercise.instrucciones || []).join("\n"), media_type: "gif",
          media_url: new URL(exercise.gif, location.href).href, thumbnail_url: new URL(exercise.imagen, location.href).href,
          is_custom: false, is_active: true,
        }).select("id").single();
        if (!saveError && saved) rows.push({ routine_id: routine.id, exercise_id: saved.id, day_number: plan.day, position: position + 1, target_sets: 3, target_reps_min: 8, target_reps_max: 12, target_rir: 2, rest_seconds: 90 });
      }
    }
    if (rows.length) await ftSupabase.from("routine_exercises").insert(rows);
  } catch (_) { /* The routine remains editable even if a catalog asset is unavailable. */ }
}

function decorateRoutineWorkspace() {
  const explorer = document.getElementById("routine-explorer");
  if (!explorer || explorer.querySelector(".routine-method-card")) return;
  const card = document.createElement("section");
  card.className = "routine-method-card";
  card.innerHTML = '<div><p class="eyebrow">METODOLOGIA FT</p><h3>Programa → asignacion → seguimiento</h3><p>Trabaja con plantillas reutilizables. Ajusta solo lo necesario para cada cliente y conserva el historial de cada semana.</p></div><div class="routine-method-days"><span>Lun<br><b>Pecho</b></span><span>Mar<br><b>Hombro</b></span><span>Mie<br><b>Pierna</b></span><span>Jue<br><b>Espalda</b></span><span>Vie<br><b>Brazo</b></span></div>';
  explorer.querySelector(".routine-location")?.before(card);
}

document.addEventListener("click", (event) => {
  if (event.target.id === "new-folder") {
    const name = prompt("Nombre de la carpeta");
    if (name?.trim())
      ftSupabase
        .from("routine_folders")
        .insert({ name: name.trim(), parent_id: folderState.parent })
        .then(loadRoutineFolders);
  }
  if (event.target.id === "routine-back" && folderState.parent) {
    const current = folderState.folders.find(
      (folder) => folder.id === folderState.parent,
    );
    folderState.parent = current?.parent_id || null;
    loadRoutineFolders();
  }
});
const renderWithFolders = render;
render = (page) => {
  if (page !== "routines") folderState.parent = null;
  renderWithFolders(page);
  if (page === "routines") setTimeout(loadRoutineFolders, 0);
};
