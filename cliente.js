window.addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
(async () => {
  document.body.style.visibility = "hidden";
  const load = (src) =>
    new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  if (
    ["127.0.0.1", "localhost"].includes(location.hostname) &&
    new URLSearchParams(location.search).has("preview")
  ) {
    await load("cliente-base.js?v=2");
    await load("client-home.js?v=7");
    await load("client-sections.js?v=17");
    await load("client-materials.js?v=1");
    await load("client-hall-of-fame.js?v=1");
    await load("client-navigation-fix.js?v=1");
    document.body.style.visibility = "visible";
    return;
  }
  await load("vendor/supabase-js.min.js");
  await load("supabase-config.js?v=2");
  const client = supabase.createClient(
    FT_SUPABASE.url,
    FT_SUPABASE.publishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) {
    location.replace("index.html");
    return;
  }
  const isFernando = session.user.email?.toLowerCase() === "ftienda4@gmail.com";
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .maybeSingle();
  if (isFernando || profile?.role === "trainer") {
    location.replace("admin.html?auth=3");
    return;
  }
  if (profileError) {
    document.body.innerHTML =
      '<main style="font-family:sans-serif;padding:32px"><h1>No se pudo comprobar el acceso</h1><p>Recarga la pagina. Si continua, vuelve a iniciar sesion.</p><a href="index.html">Volver al acceso</a></main>';
    document.body.style.visibility = "visible";
    return;
  }
  let { data: member } = await client
    .from("clients")
    .select("id,access_status")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (!member) {
    const { data: linked } = await client.rpc("link_client_identity");
    if (linked) member = linked;
  }
  let membershipIsCurrent = false;
  if (member?.id && member.access_status === "active") {
    const today = new Date(),
      todayIso = today.toISOString().slice(0, 10),
      { data: currentPayment } = await client
        .from("payments")
        .select("id,period_end")
        .eq("client_id", member.id)
        .lte("period_start", todayIso)
        .gte("period_end", todayIso)
        .limit(1)
        .maybeSingle();
    membershipIsCurrent = Boolean(currentPayment);
    if (!membershipIsCurrent && today.getDate() <= 10) {
      const previousMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0),
        previousEndIso = previousMonthEnd.toISOString().slice(0, 10),
        { data: previousPayment } = await client
          .from("payments")
          .select("id")
          .eq("client_id", member.id)
          .gte("period_end", previousEndIso)
          .limit(1)
          .maybeSingle();
      membershipIsCurrent = Boolean(previousPayment);
    }
  }
  if (!member?.id) {
    location.replace("pendiente.html");
    return;
  }
  window.ftSupabase = client;
  window.ftClientId = member.id;
  window.ftMembershipActive =
    member.access_status === "active" && membershipIsCurrent;
  await load("cliente-base.js?v=2");
  await load("client-home.js?v=7");
  await load("client-sections.js?v=17");
  await load("client-materials.js?v=1");
  await load("client-hall-of-fame.js?v=1");
  await load("client-navigation-fix.js?v=1");
  document.body.style.visibility = "visible";
})().catch(() => location.replace("index.html"));
