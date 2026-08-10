/* Etiquetas de programacion para segmentar clientes y asignar rutinas en bloque. */
(function () {
  const groups = ["Gym libre", "Fuerza", "Hipertrofia", "Futbol", "Readaptacion", "Movilidad", "Competicion"];
  const selectMarkup = (value = "") => `<label class="wide client-group-field">Grupo de entrenamiento<select name="training_group"><option value="">Sin grupo</option>${groups.map((group) => `<option value="${group}"${group === value ? " selected" : ""}>${group}</option>`).join("")}</select><small>Se usa para filtrar y asignar rutinas a varios clientes.</small></label>`;

  const addNewClientGroup = () => {
    const form = document.getElementById("new-client-form");
    if (!form || form.querySelector("[name='training_group']")) return;
    form.querySelector(".admin-fields")?.insertAdjacentHTML("beforeend", selectMarkup());
    form.addEventListener("submit", () => {
      const name = String(form.querySelector('[name="full_name"]')?.value || "").trim();
      const group = String(form.querySelector('[name="training_group"]')?.value || "");
      if (!name || !group) return;
      setTimeout(async () => {
        const { data: client } = await ftSupabase.from("clients").select("id").eq("full_name", name).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (client) await ftSupabase.from("clients").update({ objective: group, updated_at: new Date().toISOString() }).eq("id", client.id);
      }, 900);
    }, true);
  };

  const baseEditClient = window.editClient;
  if (baseEditClient) window.editClient = async (id) => {
    await baseEditClient(id);
    const node = document.getElementById("edit-client-overlay"), form = node?.querySelector("form");
    if (!form || form.querySelector("[name='training_group']")) return;
    const { data: client } = await ftSupabase.from("clients").select("objective").eq("id", id).maybeSingle();
    form.querySelector(".admin-fields")?.insertAdjacentHTML("beforeend", selectMarkup(client?.objective || ""));
    const submitClient = form.onsubmit;
    form.onsubmit = async (event) => {
      event.preventDefault();
      const group = String(new FormData(form).get("training_group") || "");
      const { error } = await ftSupabase.from("clients").update({ objective: group || null, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) { form.querySelector(".form-feedback").textContent = "No se pudo guardar el grupo."; return; }
      return submitClient.call(form, event);
    };
  };
  setTimeout(addNewClientGroup, 0);
})();
