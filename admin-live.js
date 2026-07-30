/* Panel sin datos ficticios: todas las cifras proceden de Supabase. */
const liveEmpty=(title,copy)=>`<div class="card" style="padding:34px;text-align:center"><span class="stat-icon" style="margin:auto">${icons.chart}</span><h2>${title}</h2><p class="muted">${copy}</p></div>`;

pages.dashboard=()=>`<div class="stats" id="live-stats"><div class="card stat-card"><span class="stat-icon">${icons.users}</span><div><p>CLIENTES ACTIVOS</p><h3>—</h3></div></div><div class="card stat-card"><span class="stat-icon orange">${icons.dumbbell}</span><div><p>RUTINAS ACTIVAS</p><h3>—</h3></div></div><div class="card stat-card"><span class="stat-icon blue">${icons.chart}</span><div><p>SESIONES COMPLETADAS</p><h3>—</h3></div></div><div class="card stat-card"><span class="stat-icon purple">${icons.card}</span><div><p>PAGOS REGISTRADOS</p><h3>—</h3></div></div></div><div id="live-dashboard-state">${liveEmpty('Panel preparado','Las cifras aparecerán cuando añadas clientes y actividad real.')}</div>`;
pages.routines=()=>`<div class="page-placeholder"><div class="intro"><div><h2>Biblioteca de rutinas</h2><p class="muted">Planes creados por Fernando y propuestas pendientes de revisión.</p></div><button class="primary" onclick="openModal()">✦ Crear rutina</button></div>${liveEmpty('Aún no hay rutinas','Crea la primera rutina cuando exista un cliente activo.')}</div>`;
pages.progress=()=>`<div class="page-placeholder"><div class="intro"><div><h2>Seguimiento de progreso</h2><p class="muted">Peso, medidas, grasa corporal y evolución de fuerza.</p></div></div>${liveEmpty('Sin mediciones todavía','Los registros reales de tus clientes aparecerán aquí.')}</div>`;
pages.payments=()=>`<div class="page-placeholder"><div class="intro"><div><h2>Pagos en efectivo</h2><p class="muted">Control manual de cuotas y renovaciones.</p></div></div>${liveEmpty('Sin pagos registrados','Registra aquí las cuotas confirmadas en el gimnasio.')}</div>`;

async function loadLiveDashboard(){
  const stats=document.getElementById('live-stats');
  if(!stats||!window.ftSupabase)return;
  const [clientsResult,routinesResult,sessionsResult,paymentsResult]=await Promise.all([
    ftSupabase.from('clients').select('id',{count:'exact',head:true}).eq('access_status','active'),
    ftSupabase.from('routines').select('id',{count:'exact',head:true}).eq('status','active'),
    ftSupabase.from('workout_sessions').select('id',{count:'exact',head:true}).not('completed_at','is',null),
    ftSupabase.from('payments').select('id',{count:'exact',head:true})
  ]);
  const values=[clientsResult.count,routinesResult.count,sessionsResult.count,paymentsResult.count];
  stats.querySelectorAll('h3').forEach((el,index)=>el.textContent=values[index]??0);
}

const clientOverlay=document.createElement('div');
clientOverlay.className='admin-form-overlay';
clientOverlay.id='new-client-overlay';
clientOverlay.innerHTML=`<form class="admin-form" id="new-client-form">
  <button type="button" class="admin-form-close" aria-label="Cerrar">×</button>
  <p class="eyebrow">NUEVO CLIENTE</p>
  <h2>Crear perfil de cliente</h2>
  <p>El perfil quedará pendiente hasta que Fernando confirme el acceso.</p>
  <div class="admin-fields">
    <label>Nombre<input name="first_name" autocomplete="given-name" required></label>
    <label>Apellidos<input name="last_name" autocomplete="family-name"></label>
    <label>Correo electrónico<input name="email" type="email" autocomplete="email" required></label>
    <label>Teléfono<input name="phone" type="tel" autocomplete="tel"></label>
    <label class="wide">Objetivo<select name="objective"><option value="">Sin definir</option><option>Ganancia muscular</option><option>Pérdida de grasa</option><option>Fuerza</option><option>Movilidad</option><option>Recomposición corporal</option></select></label>
  </div>
  <p class="form-feedback" id="new-client-feedback" aria-live="polite"></p>
  <button class="primary full" type="submit">Guardar cliente</button>
</form>`;
document.body.appendChild(clientOverlay);

const newClientForm=clientOverlay.querySelector('#new-client-form');
const closeClientForm=()=>{clientOverlay.classList.remove('open');newClientForm.reset();clientOverlay.querySelector('#new-client-feedback').textContent='';};
window.openNewClient=()=>clientOverlay.classList.add('open');
clientOverlay.querySelector('.admin-form-close').onclick=closeClientForm;
clientOverlay.onclick=event=>{if(event.target===clientOverlay)closeClientForm();};
newClientForm.onsubmit=async event=>{
  event.preventDefault();
  const button=newClientForm.querySelector('[type="submit"]');
  const feedback=clientOverlay.querySelector('#new-client-feedback');
  const formData=new FormData(newClientForm);
  const {data:{user}}=await ftSupabase.auth.getUser();
  const record={first_name:String(formData.get('first_name')||'').trim(),last_name:String(formData.get('last_name')||'').trim(),email:String(formData.get('email')||'').trim().toLowerCase(),phone:String(formData.get('phone')||'').trim()||null,objective:String(formData.get('objective')||'').trim()||null,access_status:'pending',created_by:user?.id||null};
  button.disabled=true;button.textContent='Guardando…';feedback.textContent='';
  const {error}=await ftSupabase.from('clients').insert(record);
  button.disabled=false;button.textContent='Guardar cliente';
  if(error){feedback.textContent=error.code==='23505'?'Ya existe un cliente con ese correo.':'No se pudo guardar el cliente. Revisa los datos.';return;}
  closeClientForm();render('clients');toast('Cliente creado correctamente');
};

const baseRender=render;
render=function(page='dashboard'){
  baseRender(page);
  if(page==='dashboard')loadLiveDashboard();
  if(page==='clients')setTimeout(()=>window.loadSupabaseClients?.(),0);
};
document.getElementById('new-client').onclick=openNewClient;
render('dashboard');
