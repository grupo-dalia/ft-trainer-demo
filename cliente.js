(async()=>{
  document.body.style.visibility='hidden';
  const load=src=>new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=reject;document.head.appendChild(script)});
  if(['127.0.0.1','localhost'].includes(location.hostname)&&new URLSearchParams(location.search).has('preview')){await load('cliente-base.js');await load('client-home.js?v=1');await load('client-sections.js?v=1');document.body.style.visibility='visible';return}
  await load('vendor/supabase-js.min.js');
  await load('supabase-config.js?v=2');
  const client=supabase.createClient(FT_SUPABASE.url,FT_SUPABASE.publishableKey);
  const {data:{session}}=await client.auth.getSession();
  if(!session){location.replace('index.html');return;}
  const isFernando=session.user.email?.toLowerCase()==='ftienda4@gmail.com';
  const {data:profile,error:profileError}=await client.from('profiles').select('role').eq('id',session.user.id).maybeSingle();
  if(isFernando||profile?.role==='trainer'){location.replace('admin.html?auth=3');return;}
  if(profileError){
    document.body.innerHTML='<main style="font-family:sans-serif;padding:32px"><h1>No se pudo comprobar el acceso</h1><p>Recarga la página. Si continúa, vuelve a iniciar sesión.</p><a href="index.html">Volver al acceso</a></main>';
    document.body.style.visibility='visible';
    return;
  }
  const {data:member}=await client.from('clients').select('id,access_status').eq('user_id',session.user.id).maybeSingle();
  if(member?.access_status!=='active'){location.replace('pendiente.html');return;}
  window.ftSupabase=client;
  window.ftClientId=member.id;
  await load('cliente-base.js');
  await load('client-home.js?v=1');
  await load('client-sections.js?v=1');
  document.body.style.visibility='visible';
})().catch(()=>location.replace('index.html'));
