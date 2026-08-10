/* Explorador de rutinas: las carpetas organizan y cada rutina abre su editor. */
const routinePageBase = pages.routines;
pages.routines = () =>
  `${routinePageBase()}<section class="card routine-explorer" id="routine-explorer"><div class="section-head"><div><p class="eyebrow">BIBLIOTECA</p><h2>Rutinas guardadas</h2><p class="muted">Prepara los ejercicios y pulsa <b>Asignar a cliente</b> cuando la plantilla este lista.</p></div><button class="primary" id="new-folder">＋ Nueva carpeta</button></div><div class="routine-steps"><span><b>1</b> Crea la rutina</span><span><b>2</b> Anade ejercicios</span><span><b>3</b> Asignala al cliente</span></div><div class="routine-location" id="routine-location"><button type="button" class="back-button" id="routine-back" aria-label="Volver a la carpeta anterior">←</button><nav class="breadcrumbs" id="routine-breadcrumbs">Rutinas</nav></div><div class="folder-grid" id="folder-grid"><p class="muted">Cargando carpetas…</p></div></section>`;
const folderState = { parent: null, folders: [], routines: [] };

const routineLibraryPage = pages.routines;
pages.routines = () => `${routineLibraryPage()}<section class="card routine-quick-start"><div><p class="eyebrow">PROGRAMA RECOMENDADO</p><h2>Basica semanal</h2><p>Plan de inicio de 5 dias: pecho, hombro, pierna, espalda y brazo. Incluye 15 ejercicios listos para asignar.</p></div><div class="routine-quick-actions"><button type="button" class="secondary" id="review-basic-routine">Ver programa</button><button type="button" class="primary" id="assign-basic-routine">Asignar a cliente</button></div></section>`;

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
  grid.querySelectorAll(".routine-file").forEach((file) => {
    const routineId = file.querySelector(".assign-routine")?.dataset.routine;
    if (!routineId || file.querySelector(".delete-routine")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary delete-routine";
    button.textContent = "Eliminar";
    button.onclick = async () => {
      if (!confirm("Eliminar esta rutina? Las asignaciones de esta plantilla no se veran afectadas.")) return;
      const { error } = await ftSupabase.from("routines").delete().eq("id", routineId).is("client_id", null);
      if (error) { toast("No se pudo eliminar la rutina."); return; }
      toast("Rutina eliminada.");
      loadRoutineFolders();
    };
    file.querySelector(".routine-actions")?.appendChild(button);
  });
  grid.querySelectorAll(".folder-card").forEach((card) => {
    if (card.querySelector(".delete-folder")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "delete-folder";
    button.textContent = "Eliminar";
    button.onclick = async (event) => {
      event.stopPropagation();
      const id = card.dataset.folder;
      const [children, routines] = await Promise.all([
        ftSupabase.from("routine_folders").select("id", { count: "exact", head: true }).eq("parent_id", id),
        ftSupabase.from("routines").select("id", { count: "exact", head: true }).eq("folder_id", id),
      ]);
      if ((children.count || 0) + (routines.count || 0)) { toast("Vacia la carpeta antes de eliminarla."); return; }
      if (!confirm("Eliminar esta carpeta vacia?")) return;
      const { error } = await ftSupabase.from("routine_folders").delete().eq("id", id);
      if (error) { toast("No se pudo eliminar la carpeta."); return; }
      toast("Carpeta eliminada.");
      loadRoutineFolders();
    };
    card.querySelector(".card-actions")?.appendChild(button);
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
      .select("id,subscriber_number,full_name,first_name,last_name,phone,objective")
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
  const clientSelect = node.querySelector('[name="client_id"]');
  const clientLabel = clientSelect.closest("label");
  const clientSearch = document.createElement("label");
  clientSearch.className = "assignment-client-search";
  clientSearch.innerHTML = '<span>Buscar cliente</span><input type="search" placeholder="Nombre, abonado o telefono" autocomplete="off">';
  clientLabel.before(clientSearch);
  const clientGroup = document.createElement("label");
  clientGroup.className = "assignment-client-search";
  const groups = [...new Set(clients.map((client) => String(client.objective || "").trim()).filter(Boolean))].sort();
  clientGroup.innerHTML = `<span>Grupo de entrenamiento</span><select><option value="">Todos los clientes</option>${groups.map((group) => `<option>${escapeHtml(group)}</option>`).join("")}</select><label class="assign-group-toggle"><input type="checkbox" name="assign_group"> Asignar a todo el grupo filtrado</label>`;
  clientSearch.after(clientGroup);
  let selectedGroup = "";
  const renderClientOptions = (query = "") => {
    const previous = clientSelect.value;
    const normalized = query.trim().toLowerCase();
    const matches = clients.filter((client) => {
      const text = [client.subscriber_number, client.full_name, client.first_name, client.last_name, client.phone].join(" ").toLowerCase();
      return (!normalized || text.includes(normalized)) && (!selectedGroup || client.objective === selectedGroup);
    });
    clientSelect.innerHTML = `<option value="">${normalized ? `${matches.length} cliente${matches.length === 1 ? "" : "s"} encontrados` : "Selecciona un cliente"}</option>${matches.map((client) => `<option value="${client.id}">N. ${client.subscriber_number || "-"} · ${escapeHtml(client.full_name || `${client.first_name || ""} ${client.last_name || ""}`.trim())}${client.phone ? ` · ${escapeHtml(client.phone)}` : ""}</option>`).join("")}`;
    if (matches.some((client) => client.id === previous)) clientSelect.value = previous;
  };
  clientSearch.querySelector("input").oninput = (event) => renderClientOptions(event.currentTarget.value);
  clientGroup.querySelector("select").onchange = (event) => { selectedGroup = event.currentTarget.value; renderClientOptions(clientSearch.querySelector("input").value); };
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
    const targetClients = data.get("assign_group") === "on" && selectedGroup
      ? clients.filter((client) => client.objective === selectedGroup)
      : clients.filter((client) => client.id === clientId);
    if (!targetClients.length) {
      feedback.textContent = data.get("assign_group") === "on" ? "Selecciona un grupo con clientes activos." : "Selecciona un cliente.";
      return;
    }
    button.disabled = true;
    button.textContent = "Asignando…";
    feedback.textContent = "";
    if (data.get("replace_active") === "on")
      await ftSupabase
        .from("routines")
        .update({ status: "archived" })
        .in("client_id", targetClients.map((client) => client.id))
        .eq("status", "active");
    const {
        data: { user },
      } = await ftSupabase.auth.getUser(),
      { data: assigned, error: assignError } = await ftSupabase
        .from("routines")
        .insert(targetClients.map((client) => ({
          client_id: client.id,
          created_by: user?.id || null,
          name: template.name,
          description: template.description,
          source: template.source || "trainer",
          status: "active",
          week_start: new Date().toISOString().slice(0, 10),
          coach_reasoning: template.coach_reasoning || {},
        })))
        .select("id,client_id");
    if (assignError) {
      feedback.textContent = "No se pudo asignar la rutina.";
      button.disabled = false;
      button.textContent = "Asignar rutina ahora";
      return;
    }
    const copies = (assigned || []).flatMap((routine) => items.map((item) => ({ ...item, routine_id: routine.id }))),
      { error: copyError } = await ftSupabase
        .from("routine_exercises")
        .insert(copies);
    if (copyError) {
      await ftSupabase.from("routines").delete().in("id", (assigned || []).map((routine) => routine.id));
      feedback.textContent =
        "No se pudieron copiar los ejercicios. No se ha realizado la asignacion.";
      button.disabled = false;
      button.textContent = "Asignar rutina ahora";
      return;
    }
    node.classList.remove("open");
    toast(`Rutina asignada a ${targetClients.length} cliente${targetClients.length === 1 ? "" : "s"}.`);
  };
}

const basicWeeklyPlan = [
  { day: 1, label: "Lunes · Pecho", group: "Pecho", picks: ["barbell bench press", "barbell incline bench press", "assisted chest dip (kneeling)", "cable one arm decline chest fly", "push-up", "cable incline fly"] },
  { day: 2, label: "Martes · Hombro", group: "Hombros", picks: ["dumbbell one arm shoulder press", "cable lateral raise", "barbell rear delt raise", "cable upright row", "dumbbell front raise", "cable seated rear lateral raise"] },
  { day: 3, label: "Miercoles · Pierna", group: "Piernas", picks: ["barbell bench front squat", "lever horizontal one leg press", "barbell romanian deadlift", "lever lying leg curl", "lever leg extension", "lever standing calf raise"] },
  { day: 4, label: "Jueves · Espalda", group: "Espalda", picks: ["barbell bent over row", "alternate lateral pulldown", "cable low seated row", "cable lying extension pullover (with rope attachment)", "dumbbell bent over row", "back extension on exercise ball"] },
  { day: 5, label: "Viernes · Brazo", group: "Brazos", picks: ["barbell curl", "dumbbell hammer curl", "cable concentration curl", "cable pushdown", "cable overhead triceps extension (rope attachment)", "barbell lying triceps extension skull crusher"] },
];

const basicPrescription = {
  1: [[3, 6, 8, 120], [3, 8, 10, 90], [3, 8, 12, 90], [3, 12, 15, 60], [2, 12, 15, 60], [2, 15, 20, 45]],
  2: [[3, 8, 10, 90], [3, 12, 15, 60], [3, 12, 15, 60], [2, 12, 15, 60], [2, 12, 15, 60], [2, 15, 20, 45]],
  3: [[3, 6, 8, 120], [3, 10, 12, 90], [3, 8, 10, 120], [3, 10, 12, 75], [2, 12, 15, 60], [3, 12, 15, 60]],
  4: [[3, 8, 10, 120], [3, 8, 12, 90], [3, 10, 12, 90], [2, 12, 15, 60], [3, 10, 12, 75], [2, 12, 15, 60]],
  5: [[3, 8, 10, 75], [3, 10, 12, 60], [2, 12, 15, 60], [3, 10, 12, 60], [2, 12, 15, 60], [2, 10, 12, 75]],
};

async function applyBasicPrescription(routineId) {
  const updates = Object.entries(basicPrescription).flatMap(([day, items]) =>
    items.map(([sets, min, max, rest], index) =>
      ftSupabase
        .from("routine_exercises")
        .update({ target_sets: sets, target_reps_min: min, target_reps_max: max, target_rir: 2, rest_seconds: rest })
        .eq("routine_id", routineId)
        .eq("day_number", Number(day))
        .eq("position", index + 1),
    ),
  );
  await Promise.all(updates);
}

async function rebuildBasicWeeklyRoutine(routineId) {
  const catalog = await fetch("data/ejercicios-es.json?v=2").then((response) => response.json());
  const names = basicWeeklyPlan.flatMap((plan) => plan.picks);
  const { data: stored } = await ftSupabase.from("exercises").select("id,name").in("name", names);
  const exerciseIds = new Map((stored || []).map((item) => [item.name.toLowerCase(), item.id]));
  for (const name of names) {
    if (exerciseIds.has(name)) continue;
    const exercise = catalog.find((item) => item.nombre.toLowerCase() === name);
    if (!exercise) continue;
    const { data: created } = await ftSupabase.from("exercises").insert({
      name: exercise.nombre, body_group: exercise.grupo, primary_muscle: exercise.objetivo || exercise.grupo,
      secondary_muscles: exercise.musculos || [], equipment: exercise.equipo, instructions: (exercise.instrucciones || []).join("\n"),
      media_type: "gif", media_url: new URL(exercise.gif, location.href).href, thumbnail_url: new URL(exercise.imagen, location.href).href,
      is_custom: false, is_active: true,
    }).select("id").single();
    if (created) exerciseIds.set(name, created.id);
  }
  await ftSupabase.from("routine_exercises").delete().eq("routine_id", routineId);
  const rows = basicWeeklyPlan.flatMap((plan) => plan.picks.map((name, index) => ({
    routine_id: routineId, exercise_id: exerciseIds.get(name), day_number: plan.day, position: index + 1,
    target_sets: 3, target_reps_min: 8, target_reps_max: 12, target_rir: 2, rest_seconds: 90,
  })).filter((item) => item.exercise_id));
  if (rows.length) await ftSupabase.from("routine_exercises").insert(rows);
  await applyBasicPrescription(routineId);
}

async function ensureBasicWeeklyRoutine() {
  if (!window.ftSupabase || window.basicWeeklyRoutineChecked) return;
  window.basicWeeklyRoutineChecked = true;
  const { data: existing } = await ftSupabase.from("routines").select("id").is("client_id", null).ilike("name", "Bas% semanal").limit(1).maybeSingle();
  if (existing?.id) {
    await rebuildBasicWeeklyRoutine(existing.id);
    return;
  }
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
        const exercise = catalog.find((item) => item.nombre.toLowerCase() === wanted);
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
    if (rows.length) {
      await ftSupabase.from("routine_exercises").insert(rows);
      await applyBasicPrescription(routine.id);
    }
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

async function openBasicRoutine(mode) {
  window.basicWeeklyRoutineChecked = false;
  await ensureBasicWeeklyRoutine();
  const { data: routine, error } = await ftSupabase
    .from("routines")
    .select("id")
    .is("client_id", null)
    .ilike("name", "Bas% semanal")
    .limit(1)
    .maybeSingle();
  if (error || !routine) {
    toast("No se pudo preparar Basica semanal. Revisa el acceso a la base de datos.");
    return;
  }
  if (mode === "assign") openRoutineAssignment(routine.id);
  else openRoutineEditor(routine.id);
}

document.addEventListener("click", (event) => {
  if (event.target.id === "review-basic-routine") openBasicRoutine("review");
  if (event.target.id === "assign-basic-routine") openBasicRoutine("assign");
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
