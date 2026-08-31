(function () {
  if ("serviceWorker" in navigator && location.protocol === "https:") window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(registration => registration.update()).catch(() => {}));
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (standalone) document.documentElement.classList.add("is-pwa");
  let installPrompt = null;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent), button = document.createElement("button");
  button.type = "button"; button.className = "pwa-install-button"; button.hidden = true;
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 18v3h14v-3"/></svg><span>Instalar app</span>';
  button.setAttribute("aria-label", "Instalar FT Trainer en este dispositivo");
  const mount = () => { if (standalone || button.isConnected) return; const header = document.querySelector(".ft-home-user"); if (header) header.prepend(button); else document.body.appendChild(button); };
  window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); installPrompt = event; mount(); button.hidden = false; });
  if (isIos && !standalone) { mount(); button.hidden = false; }
  button.addEventListener("click", async () => { if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; button.hidden = true; return; } if (isIos) alert("Para instalar FT Trainer: pulsa Compartir y despues Anadir a pantalla de inicio."); });
  window.addEventListener("appinstalled", () => { button.hidden = true; document.documentElement.classList.add("is-pwa"); });
})();
