/* Explorador de rutinas: las carpetas organizan y cada rutina abre su editor. */
const routinePageBase=pages.routines;
pages.routines=()=>`${routinePageBase()}<section class="card routine-explorer" id="routine-explorer"><div class="section-head"><div><p class="eyebrow">BIBLIOTECA</p><h2>Rutinas guardadas</h2><p class="muted">Las carpetas solo sirven para organizar. Abre una rutina para añadir o quitar ejercicios.</p></div><button class="primary" id="new-folder">＋ Nueva carpeta</button></div><div class="routine-location" id="routine-location"><button type="button" class="back-button" id="routine-back" aria-label="Volver a la carpeta anterior">←</button><nav class="breadcrumbs" id="routine-breadcrumbs">Rutinas</nav></div><div class="folder-grid" id="folder-grid"><p class="muted">Cargando carpetas…</p></div></section>`;
const folderState={parent:null,folders:[],routines:[]};

async function loadRoutineFolders(){
  const grid=document.getElementById('folder-grid');
  if(!grid||!window.ftSupabase)return;
  const routineQuery=ftSupabase.from('routines').select('id,name,folder_id,description');
  const [folders,routines]=await Promise.all([
    ftSupabase.from('routine_folders').select('id,name,parent_id').order('name'),
    folderState.parent?routineQuery.eq('folder_id',folderState.parent):routineQuery.is('folder_id',null)
  ]);
  if(folders.error||routines.error){grid.innerHTML='<p class="muted">No se pudieron cargar las rutinas.</p>';return}
  folderState.folders=folders.data||[];
  folderState.routines=routines.data||[];
  const current=folderState.folders.filter(folder=>folder.parent_id===folderState.parent);
  const options=folderState.folders.map(folder=>`<option value="${folder.id}">${escapeHtml(folder.name)}</option>`).join('');
  grid.innerHTML=[
    ...current.map(folder=>`<article class="folder-card" data-folder="${folder.id}" tabindex="0" role="button"><div class="file-icon folder-icon">▰</div><b>${escapeHtml(folder.name)}</b><small>Abrir carpeta</small><div class="card-actions"><button type="button" class="rename-folder" title="Renombrar carpeta">Renombrar</button></div></article>`),
    ...folderState.routines.map(routine=>`<article class="routine-file"><div class="file-icon routine-icon">▤</div><div class="routine-copy"><b>${escapeHtml(routine.name)}</b><small>${escapeHtml(routine.description||'Sin descripción')}</small></div><button type="button" class="primary edit-routine" data-routine="${routine.id}">Editar ejercicios</button><label class="move-control">Carpeta<select class="folder-move" data-routine="${routine.id}" aria-label="Mover rutina"><option value="">Rutinas (raíz)</option>${options}</select></label></article>`)
  ].join('')||'<div class="routine-empty"><b>Esta carpeta está vacía</b><p>Crea una rutina o mueve una existente hasta aquí.</p></div>';

  grid.querySelectorAll('.edit-routine').forEach(button=>button.onclick=()=>openRoutineEditor(button.dataset.routine));
  grid.querySelectorAll('.folder-card').forEach(card=>{
    const open=()=>{folderState.parent=card.dataset.folder;loadRoutineFolders()};
    card.onclick=event=>{if(!event.target.closest('button'))open()};
    card.onkeydown=event=>{if((event.key==='Enter'||event.key===' ')&&!event.target.closest('button')){event.preventDefault();open()}};
  });
  grid.querySelectorAll('.rename-folder').forEach(button=>button.onclick=async event=>{
    event.stopPropagation();
    const card=button.closest('[data-folder]'),name=prompt('Nuevo nombre de carpeta');
    if(name?.trim())await ftSupabase.from('routine_folders').update({name:name.trim(),updated_at:new Date().toISOString()}).eq('id',card.dataset.folder);
    loadRoutineFolders();
  });
  grid.querySelectorAll('.folder-move').forEach(select=>{
    select.value=folderState.parent||'';
    select.onchange=async()=>{await ftSupabase.from('routines').update({folder_id:select.value||null}).eq('id',select.dataset.routine);loadRoutineFolders()};
  });
  const currentName=folderState.parent?folderState.folders.find(folder=>folder.id===folderState.parent)?.name:'';
  document.getElementById('routine-breadcrumbs').textContent=folderState.parent?`Rutinas / ${currentName}`:'Rutinas';
  document.getElementById('routine-back').hidden=!folderState.parent;
}

document.addEventListener('click',event=>{
  if(event.target.id==='new-folder'){
    const name=prompt('Nombre de la carpeta');
    if(name?.trim())ftSupabase.from('routine_folders').insert({name:name.trim(),parent_id:folderState.parent}).then(loadRoutineFolders);
  }
  if(event.target.id==='routine-back'&&folderState.parent){
    const current=folderState.folders.find(folder=>folder.id===folderState.parent);
    folderState.parent=current?.parent_id||null;loadRoutineFolders();
  }
});
const renderWithFolders=render;
render=page=>{if(page!=='routines')folderState.parent=null;renderWithFolders(page);if(page==='routines')setTimeout(loadRoutineFolders,0)};
