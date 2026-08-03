(async () => {
  const first = document.getElementById("client-first-name"),
    avatar = document.getElementById("client-avatar"),
    notificationButton = document.querySelector(".ft-notification");
  let hasRoutine = false;

  if (window.ftSupabase && window.ftClientId) {
    const [{ data: client }, { data: routines }, { data: sessions }] =
      await Promise.all([
        ftSupabase
          .from("clients")
          .select("first_name,last_name,full_name")
          .eq("id", ftClientId)
          .maybeSingle(),
        ftSupabase
          .from("routines")
          .select("id,name,status")
          .eq("client_id", ftClientId)
          .in("status", ["active", "draft"])
          .order("created_at", { ascending: false })
          .limit(1),
        ftSupabase
          .from("workout_sessions")
          .select("id,completed_at,planned_for")
          .eq("client_id", ftClientId)
          .gte(
            "planned_for",
            new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10),
          ),
      ]);
    const name =
      client?.first_name || client?.full_name?.split(" ")[0] || "deportista";
    first.textContent = name;
    avatar.textContent = name.slice(0, 2).toUpperCase();
    hasRoutine = Boolean(routines?.[0]);
    if (hasRoutine) {
      document.getElementById("next-session-title").textContent =
        routines[0].name;
      document.getElementById("next-session-detail").textContent =
        "Rutina asignada · lista para entrenar";
    }
    const done = (sessions || []).filter((item) => item.completed_at).length,
      target = Math.max((sessions || []).length, hasRoutine ? 1 : 0),
      percent = target ? Math.min(100, Math.round((done / target) * 100)) : 0;
    document.getElementById("week-completed").textContent = done;
    document.getElementById("week-target").textContent = target;
    document.getElementById("week-percent").textContent = percent + "%";
    document.getElementById("home-week-bar").style.width = percent + "%";
    document
      .querySelector(".ft-goal-ring")
      .style.setProperty("--progress", percent);
    if (percent)
      document.getElementById("week-message").textContent =
        percent >= 80
          ? "¡Vas por buen camino!"
          : "Cada sesión cuenta. Sigue avanzando.";
  }

  const session = document.getElementById("routine-session"),
    scrollRoutine = () =>
      session.scrollIntoView({ behavior: "smooth", block: "start" }),
    openProgress = () => document.querySelector(".card-title a")?.click(),
    openCoach = () =>
      document.querySelector(".coach-program-invite button")?.click();

  document.getElementById("start-training").onclick = scrollRoutine;
  document.getElementById("next-session-card").onclick = scrollRoutine;
  document.querySelectorAll("[data-home-action]").forEach((button) => {
    button.onclick = () => {
      const action = button.dataset.homeAction;
      if (action === "routine") scrollRoutine();
      if (action === "progress") openProgress();
      if (action === "coach") openCoach();
    };
  });

  const notifications = document.createElement("section");
  notifications.className = "ft-notification-panel";
  notifications.setAttribute("aria-label", "Centro de notificaciones");
  notifications.innerHTML = `<header><span><svg><use href="#ico-bell" /></svg></span><div><small>FT TRAINER</small><b>Notificaciones</b></div></header><article><i></i><div><b>${hasRoutine ? "Tu rutina está disponible" : "Fernando está preparando tu rutina"}</b><p>${hasRoutine ? "Puedes abrirla y comenzar a registrar tus series." : "Te avisaremos aquí cuando esté lista para entrenar."}</p></div></article>`;
  notificationButton.after(notifications);
  notificationButton.onclick = (event) => {
    event.stopPropagation();
    const open = notifications.classList.toggle("open");
    notificationButton.setAttribute("aria-expanded", String(open));
  };
  notifications.onclick = (event) => event.stopPropagation();
  document.addEventListener("click", () => {
    notifications.classList.remove("open");
    notificationButton.setAttribute("aria-expanded", "false");
  });
})();
