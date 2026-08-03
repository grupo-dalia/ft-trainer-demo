(async () => {
  const db = window.ftSupabase,
    clientId = window.ftClientId,
    esc = (value) =>
      String(value ?? "").replace(
        /[&<>'"]/g,
        (char) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "'": "&#39;",
            '"': "&quot;",
          })[char],
      );
  const icon = (id) => `<svg aria-hidden="true"><use href="#ico-${id}"/></svg>`;
  const toast = (message) => {
    const node = document.getElementById("client-toast");
    node.textContent = message;
    node.classList.add("show");
    setTimeout(() => node.classList.remove("show"), 2400);
  };
  const panel = (id, title, iconName) => {
    let node = document.getElementById(id);
    if (!node) {
      node = document.createElement("section");
      node.id = id;
      node.className = "client-section-panel";
      node.innerHTML = `<header><button type="button" class="client-panel-back" aria-label="Volver">←</button><span>${icon(iconName)}</span><div><small>FT TRAINER</small><h1>${title}</h1></div></header><div class="client-panel-content"></div>`;
      document.body.appendChild(node);
      node.querySelector(".client-panel-back").onclick = () =>
        node.classList.remove("open");
    }
    return node;
  };
  const setActive = (name) =>
    document
      .querySelectorAll("[data-client-nav]")
      .forEach((button) =>
        button.classList.toggle("active", button.dataset.clientNav === name),
      );
  const openPanel = (node, name) => {
    document
      .querySelectorAll(".client-section-panel.open")
      .forEach((item) => item.classList.remove("open"));
    node.classList.add("open");
    setActive(name);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  let routine = null,
    routineItems = [],
    sessionId = null,
    sessionStartedAt = Date.now(),
    selectedItem = null;
  async function loadRoutine() {
    if (!db || !clientId) {
      if (
        location.hostname === "127.0.0.1" ||
        location.hostname === "localhost"
      ) {
        ensureShareButton();
        document.getElementById("share-workout").hidden = false;
      }
      return;
    }
    const { data: routines } = await db
      .from("routines")
      .select("id,name,description,status,week_start")
      .eq("client_id", clientId)
      .in("status", ["active", "draft"])
      .order("created_at", { ascending: false })
      .limit(1);
    routine = routines?.[0] || null;
    if (!routine) {
      renderRoutineEmpty();
      return;
    }
    const { data: items } = await db
      .from("routine_exercises")
      .select(
        "id,exercise_id,day_number,position,target_sets,target_reps_min,target_reps_max,target_weight_kg,target_rir,rest_seconds,notes,exercises(name,body_group,primary_muscle,instructions,media_url,thumbnail_url,media_type)",
      )
      .eq("routine_id", routine.id)
      .order("day_number")
      .order("position");
    routineItems = items || [];
    renderRoutine();
    await restoreTodaySession();
  }
  function renderRoutineEmpty() {
    const cover = document.querySelector(".workout-cover"),
      totalText = document.querySelector(".workout-top b");
    cover.classList.add("is-empty");
    cover.querySelector("h3").innerHTML =
      "Tu próxima rutina<br><mark>está en preparación</mark>";
    document.getElementById("done-count").textContent = "0";
    if (totalText) totalText.lastChild.textContent = " de 0 completados";
    document.getElementById("percent").textContent = "0%";
    document.getElementById("session-progress").style.width = "0%";
    document.getElementById("exercise-list").innerHTML =
      '<div class="client-empty-state">Fernando todavía no ha activado una rutina para ti.</div>';
    document.getElementById("next-session-title").textContent =
      "No tienes una sesión programada";
    document.getElementById("next-session-detail").textContent =
      "Fernando te avisará cuando tu rutina esté lista";
  }
  function renderRoutine() {
    document.querySelector(".workout-cover").classList.remove("is-empty");
    document.querySelector(".workout-cover h3").innerHTML =
      `${esc(routine.name)}<br><mark>${routine.status === "active" ? "Activa" : "Borrador"}</mark>`;
    document.getElementById("next-session-title").textContent = routine.name;
    document.getElementById("next-session-detail").textContent =
      `${routineItems.length} ejercicios · planificación de Fernando`;
    document.getElementById("done-count").textContent = "0";
    document.querySelector(".workout-top b").lastChild.textContent =
      ` de ${routineItems.length} completados`;
    document.getElementById("percent").textContent = "0%";
    document.getElementById("session-progress").style.width = "0%";
    document.getElementById("exercise-list").innerHTML =
      routineItems
        .map((item, index) => {
          const ex = item.exercises || {},
            reps =
              item.target_reps_min === item.target_reps_max
                ? item.target_reps_min
                : `${item.target_reps_min || "—"}–${item.target_reps_max || "—"}`,
            image = ex.thumbnail_url || "assets/brand/ft-symbol-color.png";
          return `<button type="button" class="exercise-row live-exercise" data-live-index="${index}"><span class="exercise-thumb"><img src="${esc(image)}" alt="${esc(ex.name)}" loading="lazy"><i>${icon("play")}</i></span><span><b>${esc(ex.name || "Ejercicio")}</b><small>${item.target_sets} series · ${reps} repeticiones${item.target_weight_kg != null ? ` · ${item.target_weight_kg} kg` : ""}</small><em>Ver técnica y registrar</em></span><strong>›</strong></button>`;
        })
        .join("") ||
      '<div class="client-empty-state">Esta rutina aún no contiene ejercicios.</div>';
    document
      .querySelectorAll(".live-exercise")
      .forEach(
        (button) =>
          (button.onclick = () =>
            openExercise(
              routineItems[Number(button.dataset.liveIndex)],
              button,
            )),
      );
    ensureShareButton();
  }

  function ensureShareButton() {
    const host = document.getElementById("exercise-list");
    if (!host || document.getElementById("share-workout")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.id = "share-workout";
    button.className = "share-workout-button";
    button.hidden = false;
    button.innerHTML = `<span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></svg></span><span><b>Compartir resumen</b><small>Story de tu entrenamiento</small></span><strong>Abrir</strong>`;
    button.onclick = openWorkoutShare;
    host.after(button);
  }

  function updateWorkoutProgress(done) {
    const total = routineItems.length,
      percent = total ? Math.round((done / total) * 100) : 0;
    document.getElementById("done-count").textContent = done;
    document.getElementById("percent").textContent = percent + "%";
    document.getElementById("session-progress").style.width = percent + "%";
    const share = document.getElementById("share-workout");
    if (share) share.hidden = false;
    return { total, percent };
  }

  async function restoreTodaySession() {
    if (!db || !clientId || !routine) return;
    const today = new Date().toISOString().slice(0, 10),
      { data: session } = await db
        .from("workout_sessions")
        .select("id,started_at,completed_at,duration_minutes")
        .eq("client_id", clientId)
        .eq("routine_id", routine.id)
        .eq("planned_for", today)
        .maybeSingle();
    if (!session) return;
    sessionId = session.id;
    sessionStartedAt = session.started_at
      ? new Date(session.started_at).getTime()
      : Date.now();
    const { data: logs } = await db
      .from("set_logs")
      .select("exercise_id")
      .eq("session_id", sessionId);
    const completedIds = new Set((logs || []).map((log) => log.exercise_id));
    document.querySelectorAll(".live-exercise").forEach((row, index) => {
      if (!completedIds.has(routineItems[index]?.exercise_id)) return;
      row.classList.add("done");
      row.querySelector("strong").textContent = "✓";
    });
    updateWorkoutProgress(completedIds.size);
  }
  async function openExercise(item, row) {
    selectedItem = { item, row };
    const ex = item.exercises || {},
      sheet = document.getElementById("set-sheet");
    document.getElementById("sheet-title").textContent = ex.name || "Ejercicio";
    const gif = document.getElementById("sheet-gif");
    if (gif) {
      gif.src =
        ex.media_url || ex.thumbnail_url || "assets/brand/ft-symbol-color.png";
      gif.alt = `Demostración de ${ex.name || "ejercicio"}`;
    }
    const tip = document.querySelector(".technique-tip");
    if (tip)
      tip.textContent =
        ex.instructions ||
        item.notes ||
        "Sigue las indicaciones de Fernando y controla la técnica.";
    const { data: lastSets } = await db
      .from("set_logs")
      .select("reps,weight_kg,created_at")
      .eq("exercise_id", item.exercise_id)
      .order("created_at", { ascending: false })
      .limit(item.target_sets || 3);
    const last = document.querySelector(".last-record");
    if (last) {
      const top = (lastSets || []).reduce(
        (best, set) =>
          Number(set.weight_kg) > Number(best?.weight_kg || 0) ? set : best,
        null,
      );
      last.innerHTML = `<div><span>ÚLTIMA VEZ</span><b>${lastSets?.[0] ? `${lastSets[0].weight_kg || 0} kg × ${lastSets[0].reps || 0}` : "Sin registros"}</b></div><div><span>MEJOR CARGA</span><b>${top ? `${top.weight_kg || 0} kg` : "—"}</b></div>`;
    }
    const sets = sheet.querySelector(".sets");
    sets.innerHTML =
      "<div><b>SERIE</b><b>REPS</b><b>PESO</b></div>" +
      Array.from(
        { length: item.target_sets || 3 },
        (_, index) =>
          `<label><span>${index + 1}</span><input class="live-reps" value="${item.target_reps_min || ""}" inputmode="numeric" aria-label="Repeticiones serie ${index + 1}"><span><input class="live-weight" value="${item.target_weight_kg ?? ""}" inputmode="decimal" aria-label="Peso serie ${index + 1}"> kg</span></label>`,
      ).join("");
    sheet.classList.add("open");
  }
  async function ensureSession() {
    if (sessionId) return sessionId;
    const today = new Date().toISOString().slice(0, 10),
      existing = await db
        .from("workout_sessions")
        .select("id,started_at")
        .eq("client_id", clientId)
        .eq("routine_id", routine.id)
        .eq("planned_for", today)
        .maybeSingle();
    if (existing.data?.id) {
      sessionId = existing.data.id;
      sessionStartedAt = existing.data.started_at
        ? new Date(existing.data.started_at).getTime()
        : Date.now();
      return sessionId;
    }
    const startedAt = new Date().toISOString();
    const created = await db
      .from("workout_sessions")
      .insert({
        client_id: clientId,
        routine_id: routine.id,
        day_number: selectedItem.item.day_number,
        planned_for: today,
        started_at: startedAt,
      })
      .select("id")
      .single();
    if (created.error) throw created.error;
    sessionId = created.data.id;
    sessionStartedAt = new Date(startedAt).getTime();
    return sessionId;
  }
  const oldSave = document.getElementById("save-set"),
    save = oldSave.cloneNode(true);
  oldSave.replaceWith(save);
  save.onclick = async () => {
    if (!selectedItem || !db) return;
    save.disabled = true;
    save.textContent = "Guardando…";
    try {
      const currentSession = await ensureSession(),
        reps = [...document.querySelectorAll(".live-reps")],
        weights = [...document.querySelectorAll(".live-weight")],
        logs = reps.map((input, index) => ({
          session_id: currentSession,
          routine_exercise_id: selectedItem.item.id,
          exercise_id: selectedItem.item.exercise_id,
          set_number: index + 1,
          reps: Number(input.value) || null,
          weight_kg:
            weights[index].value === ""
              ? null
              : Number(String(weights[index].value).replace(",", ".")),
          completed: true,
        }));
      const { error } = await db
        .from("set_logs")
        .upsert(logs, { onConflict: "session_id,exercise_id,set_number" });
      if (error) throw error;
      selectedItem.row.classList.add("done");
      selectedItem.row.querySelector("strong").textContent = "✓";
      const done = document.querySelectorAll(".live-exercise.done").length,
        { total } = updateWorkoutProgress(done),
        duration = Math.max(
          1,
          Math.round((Date.now() - sessionStartedAt) / 60000),
        );
      if (done === total) {
        await db
          .from("workout_sessions")
          .update({
            completed_at: new Date().toISOString(),
            duration_minutes: duration,
          })
          .eq("id", currentSession);
        toast("¡Entrenamiento completado! Ya puedes compartirlo");
      }
      document.getElementById("set-sheet").classList.remove("open");
      toast("Series guardadas correctamente");
    } catch (error) {
      toast("No se pudo guardar. Comprueba la conexión.");
    } finally {
      save.disabled = false;
      save.textContent = "Guardar y completar ✓";
    }
  };

  async function getWorkoutShareData() {
    if (
      !db &&
      (location.hostname === "127.0.0.1" || location.hostname === "localhost")
    ) {
      return {
        routineName: "Fuerza · Torso A",
        duration: 64,
        series: 14,
        volume: 5840,
        exercises: [
          {
            name: "Press de banca",
            sets: [
              { weight_kg: 70, reps: 10 },
              { weight_kg: 72.5, reps: 8 },
              { weight_kg: 72.5, reps: 8 },
            ],
          },
          {
            name: "Remo con barra",
            sets: [
              { weight_kg: 55, reps: 10 },
              { weight_kg: 55, reps: 10 },
              { weight_kg: 55, reps: 9 },
            ],
          },
          {
            name: "Press inclinado",
            sets: [
              { weight_kg: 24, reps: 12 },
              { weight_kg: 24, reps: 11 },
              { weight_kg: 24, reps: 10 },
            ],
          },
          {
            name: "Jalón al pecho",
            sets: [
              { weight_kg: 50, reps: 12 },
              { weight_kg: 50, reps: 12 },
              { weight_kg: 50, reps: 10 },
            ],
          },
          {
            name: "Elevaciones laterales",
            sets: [
              { weight_kg: 8, reps: 15 },
              { weight_kg: 8, reps: 14 },
            ],
          },
        ],
      };
    }
    const duration = Math.max(
      1,
      Math.round((Date.now() - sessionStartedAt) / 60000),
    );
    let logs = [];
    if (db && sessionId) {
      const result = await db
        .from("set_logs")
        .select("exercise_id,set_number,reps,weight_kg")
        .eq("session_id", sessionId)
        .order("set_number");
      logs = result.data || [];
    }
    const grouped = new Map();
    logs.forEach((log) => {
      if (!grouped.has(log.exercise_id)) grouped.set(log.exercise_id, []);
      grouped.get(log.exercise_id).push(log);
    });
    const exercises = routineItems
      .filter((item) => grouped.has(item.exercise_id))
      .map((item) => ({
        name: item.exercises?.name || "Ejercicio",
        sets: grouped.get(item.exercise_id),
      }));
    return {
      routineName: routine?.name || "Mi entrenamiento",
      duration,
      exercises,
      series: logs.length,
      volume: Math.round(
        logs.reduce(
          (sum, log) =>
            sum + Number(log.reps || 0) * Number(log.weight_kg || 0),
          0,
        ),
      ),
    };
  }

  function roundRect(ctx, x, y, width, height, radius, fill) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function fittedShareFont(ctx, text, size, maxWidth, family) {
    let current = size;
    do {
      ctx.font = `${current}px ${family}`;
      current -= 2;
    } while (ctx.measureText(text).width > maxWidth && current > 28);
  }

  const loadCanvasImage = (src) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });

  async function drawShareCard(canvas, data) {
    const ctx = canvas.getContext("2d");
    await Promise.all([
      document.fonts?.load('80px "Clean Sports"'),
      document.fonts?.load('30px "Sporter"'),
    ]).catch(() => {});
    const [hero, logo] = await Promise.all([
      loadCanvasImage("assets/brand/ft-social-preview.png"),
      loadCanvasImage("assets/brand/ft-horizontal-white.png"),
    ]);

    ctx.fillStyle = "#061c18";
    ctx.fillRect(0, 0, 1080, 1920);
    ctx.drawImage(hero, 700, 0, 1220, 1080, 0, 0, 1080, 710);
    const heroShade = ctx.createLinearGradient(0, 0, 0, 760);
    heroShade.addColorStop(0, "rgba(2,18,17,.18)");
    heroShade.addColorStop(0.54, "rgba(4,27,24,.54)");
    heroShade.addColorStop(1, "#061c18");
    ctx.fillStyle = heroShade;
    ctx.fillRect(0, 0, 1080, 780);
    const sideShade = ctx.createLinearGradient(0, 0, 780, 0);
    sideShade.addColorStop(0, "rgba(2,20,20,.82)");
    sideShade.addColorStop(1, "rgba(2,20,20,0)");
    ctx.fillStyle = sideShade;
    ctx.fillRect(0, 0, 850, 710);

    ctx.drawImage(logo, 240, 1350, 3680, 1300, 60, 45, 530, 188);
    ctx.textAlign = "right";
    ctx.fillStyle = "#d3e7dc";
    ctx.font = '22px "Sporter", Arial';
    ctx.fillText("GYM-FT.COM", 1010, 100);
    ctx.fillStyle = "#45bd7b";
    ctx.fillText("@GYM_FT_TRAINING", 1010, 138);
    ctx.textAlign = "left";

    ctx.fillStyle = "#fff";
    fittedShareFont(
      ctx,
      "ENTRENAMIENTO",
      82,
      940,
      '"Clean Sports", "Oswald", sans-serif',
    );
    ctx.fillText("ENTRENAMIENTO", 66, 405);
    ctx.fillStyle = "#2dac6c";
    fittedShareFont(
      ctx,
      "COMPLETADO",
      105,
      940,
      '"Clean Sports", "Oswald", sans-serif',
    );
    ctx.fillText("COMPLETADO", 66, 515);
    ctx.fillStyle = "#d5e7dd";
    ctx.font = '25px "Sporter", "DM Sans", sans-serif';
    ctx.fillText(data.routineName.toUpperCase().slice(0, 39), 70, 572);
    ctx.fillStyle = "#3b99ae";
    ctx.fillRect(70, 605, 145, 7);
    ctx.fillStyle = "#2dac6c";
    ctx.fillRect(215, 605, 230, 7);

    const cards = [
      [String(data.duration), "MINUTOS"],
      [String(data.exercises.length), "EJERCICIOS"],
      [String(data.series), "SERIES"],
    ];
    cards.forEach(([value, label], index) => {
      const x = 66 + index * 326;
      roundRect(ctx, x, 690, 296, 168, 22, "rgba(255,255,255,.085)");
      ctx.strokeStyle = index === 0 ? "#3b99ae" : "#2dac6c";
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 1.5, 690 + 1.5, 293, 165);
      ctx.fillStyle = "#fff";
      ctx.font = '68px "Clean Sports", "Oswald", sans-serif';
      ctx.fillText(value, x + 25, 780);
      ctx.fillStyle = "#91cdb0";
      ctx.font = '18px "Sporter", Arial';
      ctx.fillText(label, x + 27, 824);
    });

    ctx.fillStyle = "#fff";
    ctx.font = '25px "Sporter", Arial';
    ctx.fillText("RESUMEN DE LA SESIÓN", 70, 945);
    ctx.fillStyle = "#2dac6c";
    ctx.fillRect(70, 967, 940, 2);
    const list = data.exercises.slice(0, 6);
    list.forEach((exercise, index) => {
      const y = 1000 + index * 111,
        best = exercise.sets.reduce(
          (max, set) =>
            Number(set.weight_kg || 0) > Number(max.weight_kg || 0) ? set : max,
          exercise.sets[0] || {},
        );
      roundRect(ctx, 70, y, 940, 90, 16, "rgba(255,255,255,.055)");
      ctx.fillStyle = index % 2 ? "#3b99ae" : "#2dac6c";
      ctx.fillRect(70, y, 8, 90);
      ctx.fillStyle = "#7bd79f";
      ctx.font = '24px "Sporter", Arial';
      ctx.fillText(String(index + 1).padStart(2, "0"), 100, y + 56);
      ctx.fillStyle = "#fff";
      ctx.font = '26px "DM Sans", Arial';
      ctx.fillText(exercise.name.slice(0, 35), 170, y + 38);
      ctx.fillStyle = "#9db9ad";
      ctx.font = '19px "DM Sans", Arial';
      ctx.fillText(
        `${exercise.sets.length} series · ${best.weight_kg || 0} kg × ${best.reps || 0}`,
        170,
        y + 69,
      );
    });

    const footerY = 1735;
    ctx.fillStyle = "rgba(255,255,255,.075)";
    ctx.fillRect(0, footerY, 1080, 185);
    if (data.volume > 0) {
      ctx.fillStyle = "#fff";
      ctx.font = '44px "Clean Sports", "Oswald", sans-serif';
      ctx.fillText(`${data.volume.toLocaleString("es-ES")} KG`, 70, 1810);
      ctx.fillStyle = "#75c997";
      ctx.font = '16px "Sporter", Arial';
      ctx.fillText("VOLUMEN TOTAL MOVIDO", 72, 1845);
    }
    ctx.textAlign = "right";
    ctx.fillStyle = "#fff";
    ctx.font = '22px "Sporter", Arial';
    ctx.fillText("ENTRENA · SUPÉRATE · COMPARTE", 1010, 1805);
    ctx.fillStyle = "#42b879";
    ctx.font = '18px "Sporter", Arial';
    ctx.fillText("@GYM_FT_TRAINING  ·  #FTTRAINER", 1010, 1846);
    ctx.fillStyle = "#678579";
    ctx.font = '14px "DM Sans", Arial';
    ctx.fillText("Fernando Tienda Training", 1010, 1880);
    ctx.textAlign = "left";
  }

  async function canvasBlob(canvas) {
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
  }

  async function openWorkoutShare() {
    const data = await getWorkoutShareData();
    if (!data.exercises.length) {
      toast("Registra al menos un ejercicio antes de compartir");
      return;
    }
    let overlay = document.getElementById("workout-share-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "workout-share-overlay";
      overlay.className = "workout-share-overlay";
      overlay.innerHTML = `<section class="workout-share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title"><header><div><small>LISTO PARA PUBLICAR</small><h2 id="share-title">Comparte tu entrenamiento</h2></div><button type="button" class="share-close" aria-label="Cerrar">×</button></header><div class="story-preview"><canvas width="1080" height="1920"></canvas></div><p>Imagen vertical optimizada para Instagram Stories. En móvil se abrirá el menú de compartir.</p><div class="share-actions"><button type="button" class="share-native">Compartir ahora</button><button type="button" class="share-download">Descargar Story</button></div></section>`;
      document.body.appendChild(overlay);
      overlay.querySelector(".share-close").onclick = () =>
        overlay.classList.remove("open");
      overlay.onclick = (event) => {
        if (event.target === overlay) overlay.classList.remove("open");
      };
    }
    const canvas = overlay.querySelector("canvas");
    await drawShareCard(canvas, data);
    overlay.classList.add("open");
    const makeFile = async () => {
      const blob = await canvasBlob(canvas);
      return new File(
        [blob],
        `ft-entrenamiento-${new Date().toISOString().slice(0, 10)}.png`,
        { type: "image/png" },
      );
    };
    overlay.querySelector(".share-native").onclick = async () => {
      const file = await makeFile();
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "Mi entrenamiento FT Trainer",
          text: "Entrenamiento completado con Fernando Tienda Training 💪 @gym_ft_training #FTTrainer",
          files: [file],
        });
      } else {
        overlay.querySelector(".share-download").click();
        toast("Imagen descargada. Ya puedes subirla a Instagram");
      }
    };
    overlay.querySelector(".share-download").onclick = async () => {
      const file = await makeFile(),
        link = document.createElement("a");
      link.href = URL.createObjectURL(file);
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    };
  }

  window.ftWorkoutShare = { open: openWorkoutShare };

  const progressPanel = panel("real-progress-panel", "Mi progreso", "chart");
  async function showProgress() {
    openPanel(progressPanel, "progress");
    const host = progressPanel.querySelector(".client-panel-content");
    host.innerHTML = '<div class="panel-loading">Cargando tu evolución…</div>';
    if (!db) {
      host.innerHTML =
        '<div class="client-empty-state">Inicia sesión para consultar tu progreso.</div>';
      return;
    }
    const [{ data: measurements }, { data: sessions }] = await Promise.all([
      db
        .from("measurements")
        .select("*")
        .eq("client_id", clientId)
        .order("recorded_on", { ascending: false })
        .limit(12),
      db
        .from("workout_sessions")
        .select("id,completed_at,planned_for")
        .eq("client_id", clientId)
        .order("planned_for", { ascending: false })
        .limit(30),
    ]);
    const latest = measurements?.[0],
      completed = (sessions || []).filter((s) => s.completed_at).length;
    host.innerHTML = `<div class="client-metric-grid"><article><small>PESO ACTUAL</small><b>${latest?.weight_kg ?? "—"} <em>kg</em></b></article><article><small>GRASA CORPORAL</small><b>${latest?.body_fat_pct ?? "—"}<em>%</em></b></article><article><small>SESIONES COMPLETADAS</small><b>${completed}</b></article></div><section class="client-panel-card"><div class="panel-title"><div><small>SEGUIMIENTO SEMANAL</small><h2>Registrar medidas</h2></div></div><form id="measurement-form" class="client-form-grid"><label>Peso (kg)<input name="weight_kg" type="number" min="20" max="350" step="0.1" value="${latest?.weight_kg ?? ""}" required></label><label>Altura (cm)<input name="height_cm" type="number" min="100" max="240" step="0.1" value="${latest?.height_cm ?? ""}"></label><label>Grasa corporal (%)<input name="body_fat_pct" type="number" min="2" max="70" step="0.1" value="${latest?.body_fat_pct ?? ""}"></label><label>Cintura (cm)<input name="waist_cm" type="number" min="30" max="250" step="0.1" value="${latest?.waist_cm ?? ""}"></label><button class="client-primary" type="submit">Guardar registro semanal</button><p class="form-feedback"></p></form></section><section class="client-panel-card"><div class="panel-title"><div><small>HISTORIAL</small><h2>Últimos registros</h2></div></div><div class="measurement-history">${(measurements || []).map((item) => `<div><time>${new Date(item.recorded_on + "T12:00:00").toLocaleDateString("es-ES")}</time><b>${item.weight_kg ?? "—"} kg</b><span>${item.body_fat_pct ?? "—"}% grasa</span></div>`).join("") || '<p class="client-empty-state">Todavía no hay mediciones.</p>'}</div></section>`;
    host.querySelector("#measurement-form").onsubmit = async (event) => {
      event.preventDefault();
      const form = event.currentTarget,
        data = new FormData(form),
        payload = {
          client_id: clientId,
          recorded_on: new Date().toISOString().slice(0, 10),
        };
      ["weight_kg", "height_cm", "body_fat_pct", "waist_cm"].forEach(
        (key) =>
          (payload[key] = data.get(key) === "" ? null : Number(data.get(key))),
      );
      const result = await db
        .from("measurements")
        .upsert(payload, { onConflict: "client_id,recorded_on" });
      form.querySelector(".form-feedback").textContent = result.error
        ? "No se pudo guardar el registro."
        : "Registro guardado correctamente.";
      if (!result.error) setTimeout(showProgress, 500);
    };
  }

  const profilePanel = panel("client-profile-panel", "Mi perfil", "user");
  async function showProfile() {
    openPanel(profilePanel, "profile");
    const host = profilePanel.querySelector(".client-panel-content");
    host.innerHTML = '<div class="panel-loading">Cargando tu perfil…</div>';
    if (!db) {
      host.innerHTML =
        '<div class="client-empty-state">Inicia sesión para consultar tu perfil.</div>';
      return;
    }
    const { data: client, error: profileError } = await db
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .maybeSingle();
    if (profileError || !client) {
      host.innerHTML = `<div class="client-empty-state"><b>No hemos podido abrir tu perfil.</b><br>Recarga la página o vuelve a iniciar sesión.</div>`;
      return;
    }
    const initials = (client?.first_name || "FT").slice(0, 2).toUpperCase(),
      avatarContent = client?.avatar_url
        ? `<img src="${esc(client.avatar_url)}" alt="Foto de perfil">`
        : esc(initials);
    host.innerHTML = `<section class="client-profile-hero"><span class="client-profile-avatar">${avatarContent}</span><div><h2>${esc(client?.full_name || `${client?.first_name || ""} ${client?.last_name || ""}`.trim() || "Cliente FT")}</h2><p>${esc(client?.email || "")}</p><b>${client?.access_status === "active" ? "Acceso activo" : "Acceso pendiente"}</b></div></section><section class="client-panel-card avatar-card"><div class="panel-title"><div><small>IMAGEN DE PERFIL</small><h2>Tu foto</h2></div></div><label class="avatar-upload"><span>${icon("user")}</span><div><b>Subir una foto</b><small>JPG, PNG o WebP · máximo 5 MB</small></div><input id="avatar-file" type="file" accept="image/jpeg,image/png,image/webp"><strong>Elegir imagen</strong></label><p class="avatar-feedback"></p></section><section class="client-panel-card"><div class="panel-title"><div><small>DATOS PERSONALES</small><h2>Información de contacto</h2></div></div><form id="profile-form" class="client-form-grid"><label>Nombre<input name="first_name" value="${esc(client?.first_name || "")}" required></label><label>Apellidos<input name="last_name" value="${esc(client?.last_name || "")}"></label><label>Teléfono<input name="phone" value="${esc(client?.phone || "")}"></label><button class="client-primary" type="submit">Guardar cambios</button><p class="form-feedback"></p></form></section><button type="button" class="client-logout">${icon("logout")} Cerrar sesión</button>`;
    host.querySelector("#avatar-file").onchange = async (event) => {
      const file = event.target.files?.[0],
        feedback = host.querySelector(".avatar-feedback"),
        uploadLabel = host.querySelector(".avatar-upload");
      if (!file) return;
      if (!file.type.match(/^image\/(jpeg|png|webp)$/) || file.size > 5242880) {
        feedback.textContent =
          "Selecciona una imagen JPG, PNG o WebP de menos de 5 MB.";
        return;
      }
      uploadLabel.classList.add("uploading");
      feedback.textContent = "Subiendo tu foto…";
      const { data: authData } = await db.auth.getUser(),
        userId = authData.user?.id,
        extension = file.type.split("/")[1].replace("jpeg", "jpg"),
        path = `${userId}/avatar.${extension}`;
      if (!userId) {
        feedback.textContent =
          "Tu sesión ha caducado. Vuelve a iniciar sesión.";
        uploadLabel.classList.remove("uploading");
        return;
      }
      const uploaded = await db.storage
        .from("client-avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploaded.error) {
        feedback.textContent = "No se pudo subir la foto. Inténtalo de nuevo.";
        uploadLabel.classList.remove("uploading");
        return;
      }
      const publicUrl = db.storage.from("client-avatars").getPublicUrl(path)
          .data.publicUrl,
        avatarUrl = `${publicUrl}?v=${Date.now()}`,
        saved = await db
          .from("clients")
          .update({
            avatar_url: avatarUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", clientId);
      uploadLabel.classList.remove("uploading");
      if (saved.error) {
        feedback.textContent =
          "La foto subió, pero no se pudo guardar en tu perfil.";
        return;
      }
      host.querySelector(".client-profile-avatar").innerHTML =
        `<img src="${esc(avatarUrl)}" alt="Foto de perfil">`;
      window.ftApplyClientAvatar?.(avatarUrl);
      feedback.textContent = "Foto de perfil actualizada.";
    };
    host.querySelector("#profile-form").onsubmit = async (event) => {
      event.preventDefault();
      const form = event.currentTarget,
        data = new FormData(form),
        first = String(data.get("first_name")).trim(),
        last = String(data.get("last_name")).trim(),
        result = await db
          .from("clients")
          .update({
            first_name: first,
            last_name: last,
            full_name: `${first} ${last}`.trim(),
            phone: String(data.get("phone")).trim(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", clientId);
      form.querySelector(".form-feedback").textContent = result.error
        ? "No se pudieron guardar los cambios."
        : "Perfil actualizado.";
    };
    host.querySelector(".client-logout").onclick = async () => {
      await db.auth.signOut();
      location.replace("index.html");
    };
  }

  document.querySelectorAll("[data-client-nav]").forEach(
    (button) =>
      (button.onclick = () => {
        const action = button.dataset.clientNav;
        if (action === "home") {
          document
            .querySelectorAll(".client-section-panel.open")
            .forEach((item) => item.classList.remove("open"));
          setActive("home");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
        if (action === "routine") {
          document
            .querySelectorAll(".client-section-panel.open")
            .forEach((item) => item.classList.remove("open"));
          setActive("routine");
          document
            .getElementById("routine-session")
            .scrollIntoView({ behavior: "smooth" });
        }
        if (action === "progress") showProgress();
        if (action === "profile") showProfile();
      }),
  );
  document
    .querySelectorAll('[data-home-action="progress"]')
    .forEach((button) => (button.onclick = showProgress));
  document
    .querySelectorAll('[data-home-action="profile"]')
    .forEach((button) => (button.onclick = showProfile));
  document.querySelector(".card-title a").onclick = (event) => {
    event.preventDefault();
    showProgress();
  };
  await loadRoutine();
  window.ftClientSections = { showProgress, showProfile, loadRoutine };
})();
