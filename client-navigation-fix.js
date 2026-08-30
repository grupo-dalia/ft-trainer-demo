(() => {
  function closePanels() {
    document.querySelectorAll(".client-section-panel.open").forEach(panel => panel.classList.remove("open"));
  }
  function activate(name) {
    document.querySelectorAll("[data-client-nav]").forEach(button => button.classList.toggle("active", button.dataset.clientNav === name));
  }
  function run(action) {
    if (action === "routine") {
      closePanels(); activate("routine");
      document.getElementById("routine-session")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (action === "progress") window.ftClientSections?.showProgress?.();
    else if (action === "profile") window.ftClientSections?.showProfile?.();
    else if (action === "materials") window.ftClientMaterials?.show?.();
    else if (action === "hall-of-fame") window.ftHallOfFame?.open?.();
    else if (action === "coach") document.querySelector(".coach-program-invite button")?.click();
  }
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-home-action]");
    if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation(); run(button.dataset.homeAction);
  }, true);
  document.querySelectorAll("[data-home-action]").forEach(button => button.setAttribute("aria-label", button.textContent.trim()));
})();
