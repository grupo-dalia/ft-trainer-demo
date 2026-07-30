(async()=>{
  const load=src=>new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=reject;document.head.appendChild(script)});
  const modal=document.getElementById('access-modal');
  document.getElementById('request-access').onclick=()=>modal.classList.add('open');
  document.querySelector('.request-close').onclick=()=>modal.classList.remove('open');
  modal.onclick=event=>{if(event.target===modal)modal.classList.remove('open');};
  document.getElementById('request-form').onsubmit=event=>{event.preventDefault();location.href='pendiente.html';};
  document.getElementById('recover').onclick=event=>{event.preventDefault();modal.classList.add('open');};
  await load('vendor/supabase-js.min.js');
  await load('supabase-config.js');
  const client=supabase.createClient(FT_SUPABASE.url,FT_SUPABASE.publishableKey);
  window.ftSupabase=client;

  const form=document.getElementById('login-form');
  const button=form.querySelector('.login-submit');
  const error=document.createElement('p');
  error.className='login-error';
  error.hidden=true;
  button.before(error);

  form.onsubmit=async event=>{
    event.preventDefault();
    error.hidden=true;
    button.disabled=true;
    button.textContent='Comprobando acceso…';
    const email=form.querySelector('input[type="email"]').value.trim();
    const password=form.querySelector('input[type="password"]').value;
    const {data,error:authError}=await client.auth.signInWithPassword({email,password});
    if(authError){
      error.textContent='Correo o contraseña incorrectos.';
      error.hidden=false;
      button.disabled=false;
      button.textContent='Entrar en mi cuenta →';
      return;
    }
    const {data:profile}=await client.from('profiles').select('role').eq('id',data.user.id).maybeSingle();
    if(profile?.role==='trainer'){
      location.href='admin.html';
      return;
    }
    const {data:member}=await client.from('clients').select('access_status').eq('user_id',data.user.id).maybeSingle();
    if(member?.access_status==='active'){
      location.href='cliente.html';
      return;
    }
    await client.auth.signOut();
    location.href='pendiente.html';
  };
})().catch(()=>{
  const button=document.querySelector('#login-form .login-submit');
  if(button){button.disabled=true;button.textContent='Servicio temporalmente no disponible';}
});
