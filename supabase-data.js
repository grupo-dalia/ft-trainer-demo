pages.clients=()=>`<div class="page-placeholder"><div class="intro"><div><h2>Clientes y accesos</h2><p class="muted">Datos sincronizados con la base de datos segura de FT Trainer.</p></div><span class="cash-badge">Solo pagos en efectivo</span></div><div class="card table-card"><table class="table"><thead><tr><th>CLIENTE</th><th>ACCESO</th><th>OBJETIVO</th><th>ALTA</th><th>ACCIÓN</th></tr></thead><tbody id="real-client-rows"><tr><td colspan="5">Cargando clientes…</td></tr></tbody></table></div></div>`;

const accessLabels={active:'Activo',pending:'Pendiente',paused:'Pausado'};
const escapeHtml=value=>String(value??'').replace(/[&<>"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
const shortDate=value=>value?new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'short'}).format(new Date(value)):'—';

window.loadSupabaseClients=async()=>{
  const target=document.getElementById('real-client-rows');
  if(!target)return;
  const {data,error}=await ftSupabase.from('clients').select('id,first_name,last_name,email,objective,access_status,created_at').order('created_at',{ascending:false});
  if(error){target.innerHTML='<tr><td colspan="5">No se pudieron cargar los clientes.</td></tr>';return;}
  if(!data.length){target.innerHTML='<tr><td colspan="5"><b>Aún no hay clientes.</b><br>Importa el Excel de Google Forms para empezar.</td></tr>';return;}
  target.innerHTML=data.map((client,index)=>{const name=`${client.first_name} ${client.last_name||''}`.trim();const initials=(client.first_name.charAt(0)+(client.last_name||'').charAt(0)).toUpperCase();const active=client.access_status==='active';return `<tr><td><div class="client-cell"><span class="client-avatar a${index%3+1}">${escapeHtml(initials)}</span><div><b>${escapeHtml(name)}</b><small>${escapeHtml(client.email)}</small></div></div></td><td><span class="status-dot"></span>${accessLabels[client.access_status]||client.access_status}</td><td>${escapeHtml(client.objective||'Sin definir')}</td><td>${shortDate(client.created_at)}</td><td><button class="activation-btn ${active?'off':''}" onclick="toggleActivation(this,'${client.id}','${client.access_status}')">${active?'Desactivar':'Activar acceso'}</button></td></tr>`}).join('');
};

window.toggleActivation=async(button,id,current)=>{
  button.disabled=true;
  const next=current==='active'?'paused':'active';
  const {error}=await ftSupabase.from('clients').update({access_status:next,activated_at:next==='active'?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq('id',id);
  if(error){button.disabled=false;toast('No se pudo cambiar el acceso');return;}
  toast(next==='active'?'Cliente activado: acceso completo':'Acceso pausado');
  loadSupabaseClients();
};

document.querySelector('[data-page="clients"]').addEventListener('click',()=>setTimeout(loadSupabaseClients));

const clientsBasePage=pages.clients;
pages.clients=()=>`<section class="access-request-card card"><div class="section-head"><div><p class="eyebrow">ALTAS DE SOCIOS</p><h2>Solicitudes pendientes</h2></div><span class="cash-badge" id="request-count">Cargando…</span></div><div id="access-request-list"><p class="muted">Consultando solicitudes…</p></div></section>${clientsBasePage()}`;

window.loadAccessRequests=async()=>{
  const target=document.getElementById('access-request-list');if(!target)return;
  const {data,error}=await ftSupabase.from('access_requests').select('id,first_name,last_name,email,phone,source,status,matched_client_id,conflict_reason,created_at').in('status',['pending','needs_review']).order('created_at',{ascending:false});
  if(error){target.innerHTML='<p class="muted">No se pudieron cargar las solicitudes.</p>';return;}
  document.getElementById('request-count').textContent=`${data.length} pendiente${data.length===1?'':'s'}`;
  if(!data.length){target.innerHTML='<div class="request-empty">No hay solicitudes esperando revisión.</div>';return;}
  target.innerHTML=data.map(request=>`<article class="request-row"><div><b>${escapeHtml(`${request.first_name} ${request.last_name}`.trim())}</b><small>${escapeHtml(request.email)}${request.phone?' · '+escapeHtml(request.phone):''}</small><em>${request.matched_client_id?'Coincide con un cliente existente':'Persona nueva'} · ${request.source==='google'?'Google':'Correo'}</em>${request.conflict_reason?`<strong>${escapeHtml(request.conflict_reason)}</strong>`:''}</div><button class="activation-btn" onclick="approveRequest(this,'${request.id}')">Revisar y activar</button></article>`).join('');
};

window.approveRequest=async(button,id)=>{button.disabled=true;button.textContent='Activando…';const {error}=await ftSupabase.rpc('approve_access_request',{p_request_id:id,p_client_id:null});if(error){button.disabled=false;button.textContent='Revisar y activar';toast(error.message.includes('identity_conflict')?'Conflicto de cuenta: comprueba el correo':'No se pudo aprobar la solicitud');return;}toast('Cuenta unida y acceso activado');await Promise.all([loadAccessRequests(),loadSupabaseClients()]);};
document.querySelector('[data-page="clients"]').addEventListener('click',()=>setTimeout(loadAccessRequests));
