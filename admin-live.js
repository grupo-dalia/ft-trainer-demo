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

const baseRender=render;
render=function(page='dashboard'){baseRender(page);if(page==='dashboard')loadLiveDashboard();};
render('dashboard');
