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
