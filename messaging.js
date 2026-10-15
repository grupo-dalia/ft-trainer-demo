(function(root){
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  function messageHtml(message,userId){
    const mine=message.sender_id===userId;
    const timestamp=new Intl.DateTimeFormat('es-ES',{dateStyle:'short',timeStyle:'short'}).format(new Date(message.created_at));
    const receipt=mine?`<span class="chat-receipt ${message.read_at?'is-read':''}" aria-label="${message.read_at?'Leído por el destinatario':'Enviado'}" title="${message.read_at?'Leído por el destinatario':'Enviado'}">${message.read_at?'✓✓':'✓'}</span>`:'';
    return `<article class="${mine?'mine':'theirs'}" data-message-id="${esc(message.id)}"><p>${esc(message.body)}</p><footer><time>${esc(timestamp)}</time>${receipt}</footer></article>`;
  }
  root.ChatCore={messageHtml};
  if(typeof document==='undefined')return;
  const admin=document.documentElement.dataset.themeScope==='admin',dialog=document.createElement('dialog');
  dialog.className='ft-chat-dialog';
  dialog.innerHTML=`<header class="chat-header"><div class="chat-avatar" aria-hidden="true">FT</div><div><h2>${admin?'Mensajes':'Fernando'}</h2><p>${admin?'Conversaciones privadas con tus clientes':'Tu conversación privada con el entrenador'}</p></div><button type="button" aria-label="Cerrar chat">×</button></header><div class="chat-client-picker"></div><div class="chat-feedback"><p class="chat-status" role="status"></p><button type="button" class="chat-retry" hidden>Reintentar</button></div><button type="button" class="chat-older" hidden>Ver mensajes anteriores</button><div class="chat-messages" role="log" aria-label="Mensajes"></div><form class="chat-composer"><label><span class="chat-input-label">Mensaje</span><textarea required maxlength="4000" rows="2" placeholder="Escribe un mensaje…" aria-label="Mensaje"></textarea></label><button type="submit" aria-label="Enviar mensaje"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m3 3 19 9-19 9 4-9-4-9Zm4 9h15"/></svg><span>Enviar</span></button></form>`;
  document.body.appendChild(dialog);
  const status=dialog.querySelector('.chat-status'),messages=dialog.querySelector('.chat-messages'),form=dialog.querySelector('form'),text=form.querySelector('textarea'),send=form.querySelector('button'),retry=dialog.querySelector('.chat-retry');
  let clientId=null,userId=null,version=0,limit=50,fetching=false,observer=null,currentMessages=[],sending=false,readPending=new Set(),readBusy=false,rendered='',drafts=new Map();
  function feedback(message='',error=false){status.textContent=message;retry.hidden=!error}
  function active(){return dialog.open&&!document.hidden&&(!document.hasFocus||document.hasFocus())}
  function updateComposer(){send.disabled=!clientId||!userId||sending;text.disabled=!clientId||!userId;text.placeholder=clientId?'Escribe un mensaje…':'Selecciona una conversación para escribir'}
  async function markVisibleRead(){
    if(!active()||readBusy||!readPending.size)return;
    const ids=[...readPending];readPending.clear();readBusy=true;
    try{const {error}=await ftSupabase.rpc('mark_chat_messages_read',{p_message_ids:ids});if(error)throw error}catch{ids.forEach(id=>readPending.add(id))}finally{readBusy=false}
  }
  function observeMessages(){
    observer?.disconnect();
    if(typeof IntersectionObserver==='undefined')return;
    observer=new IntersectionObserver(entries=>{if(!active())return;for(const entry of entries){if(!entry.isIntersecting||entry.intersectionRatio<.6)continue;const message=currentMessages.find(m=>m.id===entry.target.dataset.messageId);if(message&&message.sender_id!==userId&&!message.read_at)readPending.add(message.id)}markVisibleRead()},{root:messages,threshold:[.6]});
    messages.querySelectorAll('[data-message-id]').forEach(node=>observer.observe(node));
  }
  async function refresh(){
    if(!clientId||fetching)return;
    fetching=true;const target=clientId,request=version;
    try{
      const {data,error}=await ftSupabase.from('chat_messages').select('id,sender_id,body,created_at,read_at').eq('client_id',target).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(limit);
      if(error)throw error;if(request!==version||target!==clientId||!dialog.open)return;
      const nearBottom=messages.scrollHeight-messages.scrollTop-messages.clientHeight<80,previousHeight=messages.scrollHeight;
      currentMessages=[...(data||[])].reverse();const html=currentMessages.map(message=>messageHtml(message,userId)).join('')||'<div class="chat-empty"><span aria-hidden="true">✉</span><b>Empieza la conversación</b><p>Escribe tu mensaje en la parte inferior.</p></div>';
      if(html!==rendered){messages.innerHTML=html;rendered=html;if(nearBottom)messages.scrollTop=messages.scrollHeight;else if(loadingOlder)messages.scrollTop+=messages.scrollHeight-previousHeight;observeMessages()}
      dialog.querySelector('.chat-older').hidden=(data||[]).length<limit;feedback();
    }catch{if(request===version)feedback('No se pudieron cargar los mensajes. Puedes reintentarlo.',true)}finally{fetching=false;loadingOlder=false}
  }
  let loadingOlder=false;
  dialog.querySelector('.chat-older').onclick=()=>{limit+=50;loadingOlder=true;refresh()};retry.onclick=refresh;
  dialog.querySelector('header button').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{version++;observer?.disconnect();readPending.clear()});
  function switchClient(id){drafts.set(clientId,text.value);clientId=id||null;text.value=drafts.get(clientId)||'';version++;limit=50;rendered='';currentMessages=[];readPending.clear();observer?.disconnect();messages.innerHTML='';updateComposer();if(clientId){feedback('Cargando mensajes…');refresh()}else feedback('Selecciona un cliente para conversar.')}
  async function open(){
    if(dialog.open)return;dialog.showModal();feedback('Cargando…');updateComposer();
    try{
      const auth=await ftSupabase.auth.getUser();if(auth.error||!auth.data?.user)throw Error('auth');userId=auth.data.user.id;
      if(admin){
        const clients=[];for(let offset=0;;){const {data,error}=await ftSupabase.from('clients').select('id,full_name,first_name,last_name,user_id').not('user_id','is',null).order('id').range(offset,offset+499);if(error)throw error;if(!data?.length)break;clients.push(...data);offset+=data.length}
        const picker=dialog.querySelector('.chat-client-picker');picker.innerHTML='<label>Buscar cliente<input type="search" placeholder="Buscar por nombre"></label><label>Conversación<select><option value="">Selecciona un cliente</option></select></label>';
        const search=picker.querySelector('input'),select=picker.querySelector('select'),name=c=>c.full_name||[c.first_name,c.last_name].filter(Boolean).join(' '),normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
        const populate=()=>{select.innerHTML='<option value="">Selecciona un cliente</option>'+clients.filter(c=>normalize(name(c)).includes(normalize(search.value))).map(c=>`<option value="${esc(c.id)}">${esc(name(c))}</option>`).join('');select.value=clientId||''};search.oninput=populate;populate();select.onchange=()=>switchClient(select.value);
        feedback(clientId?'':'Selecciona un cliente para conversar.');
      }else{clientId=window.ftClientId;if(!clientId)throw Error('client')}
      updateComposer();await refresh();
    }catch{feedback('No se pudo abrir el chat. Comprueba tu sesión.',true)}
  }
  form.onsubmit=async event=>{
    event.preventDefault();const body=text.value.trim();if(sending)return;
    if(!clientId||!userId||!body||body.length>4000){feedback('Selecciona una conversación y escribe un mensaje.');return}
    sending=true;updateComposer();const destination=clientId,draft=text.value;
    try{const {error}=await ftSupabase.from('chat_messages').insert({client_id:destination,sender_id:userId,body});if(error)throw error;drafts.delete(destination);if(clientId===destination&&text.value===draft)text.value='';await refresh()}
    catch{feedback('No se pudo enviar. Tu mensaje se conserva para reintentarlo.',true)}
    finally{sending=false;updateComposer()}
  };
  document.addEventListener('click',event=>{if(!event.target.closest('[data-chat-open]'))return;event.preventDefault();event.stopImmediatePropagation();open()},true);
  setInterval(()=>{if(dialog.open&&!document.hidden){refresh();markVisibleRead()}},4000);
  document.addEventListener('visibilitychange',()=>{if(active()){observeMessages();refresh()}});
  if(typeof window.addEventListener==='function')window.addEventListener('focus',()=>{if(active()){observeMessages();refresh()}});
})(globalThis);
