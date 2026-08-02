document.body.style.visibility='hidden';
const load=src=>new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=reject;document.head.appendChild(script)});
await load('vendor/supabase-js.min.js');
await load('supabase-config.js?v=2');
const client=supabase.createClient(FT_SUPABASE.url,FT_SUPABASE.publishableKey);
const {data:{session}}=await client.auth.getSession();
if(!session){location.replace('index.html');}
else{
  const isFernando=session.user.email?.toLowerCase()==='ftienda4@gmail.com';
  const {data:profile,error:profileError}=await client.from('profiles').select('role').eq('id',session.user.id).maybeSingle();
  const isTrainer=isFernando||profile?.role==='trainer';
  if(profileError&&!isFernando){
    document.body.innerHTML='<main style="font-family:sans-serif;padding:32px"><h1>No se pudo comprobar el acceso</h1><p>Recarga la página. Si continúa, vuelve a iniciar sesión.</p><a href="index.html">Volver al acceso</a></main>';
    document.body.style.visibility='visible';
  }
  else if(!isTrainer){location.replace('cliente.html?auth=3');}
  else{
    window.ftSupabase=client;
    await load('app.js');
    await load('catalogo.js?v=2');
    await load('admin-features.js?v=4');
    await load('supabase-data.js?v=3');
    await load('admin-live.js?v=4');
    await load('terms-viewer.js?v=1');
    await load('routine-folders.js?v=1');
    await load('client-import.js?v=2');
    document.body.style.visibility='visible';
  }
}
