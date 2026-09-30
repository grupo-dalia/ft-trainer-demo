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
    await load("cliente-base.js?v=3");
    await load("client-home.js?v=8");
    await load("exercise-media.js?v=1");
    await load("client-sections.js?v=22");
    await load("client-materials.js?v=2");
    await load("client-hall-of-fame.js?v=2");
    await load("client-navigation-fix.js?v=2");
    document.body.style.visibility = "visible";
    return;
  }
  await load("vendor/supabase-js.min.js");
  await load("supabase-config.js?v=2");
  const client = supabase.createClient(
    FT_SUPABASE.url,
    FT_SUPABASE.publishableKey,
    {
      global: { fetch: async (input, options = {}) => {
        const controller = new AbortController();
        const abort = () => controller.abort();
        if (options.signal?.aborted) abort();
        else options.signal?.addEventListener("abort", abort, { once: true });
        const timer = setTimeout(abort, 20000);
        try { return await fetch(input, { ...options, signal: controller.signal }); }
        finally { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); }
      } },
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
  await load("cliente-base.js?v=3");
  await load("client-home.js?v=8");
  await load("exercise-media.js?v=1");
    await load("client-sections.js?v=22");
  await load("client-materials.js?v=2");
  await load("client-hall-of-fame.js?v=2");
  await load("client-navigation-fix.js?v=2");
  document.body.style.visibility = "visible";
})().catch(() => {
  document.body.style.visibility = "visible";
  document.body.innerHTML = '<main style="font-family:sans-serif;padding:32px"><h1>No se pudo cargar la app</h1><p>Comprueba la conexion y vuelve a intentarlo.</p><button type="button" id="retry-client">Reintentar</button> <a href="index.html">Volver al acceso</a></main>';
  document.getElementById("retry-client").onclick = () => location.reload();
});
