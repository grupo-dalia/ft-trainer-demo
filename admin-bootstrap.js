document.body.style.visibility='hidden';
const load=src=>new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=reject;document.head.appendChild(script)});
await load('vendor/supabase-js.min.js');
await load('supabase-config.js?v=2');
const client=supabase.createClient(FT_SUPABASE.url,FT_SUPABASE.publishableKey);
const {data:{session}}=await client.auth.getSession();
if(!session){location.replace('index.html');}
else{
  const {data:profile}=await client.from('profiles').select('role').eq('id',session.user.id).maybeSingle();
  if(profile?.role!=='trainer'){location.replace('cliente.html');}
  else{
    window.ftSupabase=client;
    await load('app.js');
    await load('catalogo.js?v=2');
    await load('admin-features.js?v=4');
    await load('supabase-data.js?v=1');
    await load('admin-live.js?v=1');
    await load('client-import.js?v=1');
    document.body.style.visibility='visible';
  }
}
