(async()=>{
  document.body.style.visibility='hidden';
  const load=src=>new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=reject;document.head.appendChild(script)});
  await load('vendor/supabase-js.min.js');
  await load('supabase-config.js?v=2');
  const client=supabase.createClient(FT_SUPABASE.url,FT_SUPABASE.publishableKey);
  const {data:{session}}=await client.auth.getSession();
  if(!session){location.replace('index.html');return;}
  const {data:profile}=await client.from('profiles').select('role').eq('id',session.user.id).maybeSingle();
  if(profile?.role==='trainer'){location.replace('admin.html');return;}
  const {data:member}=await client.from('clients').select('id,access_status').eq('user_id',session.user.id).maybeSingle();
  if(member?.access_status!=='active'){location.replace('pendiente.html');return;}
  window.ftSupabase=client;
  window.ftClientId=member.id;
  await load('cliente-base.js');
  document.body.style.visibility='visible';
})().catch(()=>location.replace('index.html'));
