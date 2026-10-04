(() => {
  const form = document.getElementById('custom-exercise-form');
  if (!form || !window.ftSupabase) return;
  const youtube = form.querySelector('[name="media"][value="youtube"]');
  youtube.checked = true;
  youtube.dispatchEvent(new Event('change'));
  const feedback = document.createElement('p');
  feedback.setAttribute('role', 'status');
  form.append(feedback);
  form.onsubmit = async event => {
    event.preventDefault();
    const link = form.querySelector('#youtube-field input');
    const id = window.ftExerciseMedia.youtubeId(link.value.trim());
    if (!youtube.checked) { feedback.textContent = 'Para estos ejercicios pega el enlace de YouTube no listado.'; return; }
    if (!id) { feedback.textContent = 'Introduce un enlace valido de YouTube (youtu.be o youtube.com).'; link.focus(); return; }
    const inputs = form.querySelectorAll('.admin-fields > label > input');
    const selects = form.querySelectorAll('.admin-fields > label > select');
    const button = form.querySelector('button.primary');
    button.disabled = true;
    feedback.textContent = 'Guardando ejercicio…';
    try {
      const {data:auth,error:authError} = await ftSupabase.auth.getUser();
      if (authError || !auth?.user) throw new Error('Vuelve a iniciar sesion para guardar.');
      const {error} = await ftSupabase.from('exercises').insert({
        created_by:auth.user.id,name:inputs[0].value.trim(),body_group:selects[0].value,
        primary_muscle:inputs[1].value.trim(),secondary_muscles:inputs[2].value.split(',').map(s=>s.trim()).filter(Boolean),
        equipment:selects[1].value,difficulty:selects[2].value,instructions:form.querySelector('textarea').value.trim(),
        media_type:'youtube',media_url:`https://www.youtube.com/watch?v=${id}`,
        thumbnail_url:`https://i.ytimg.com/vi/${id}/hqdefault.jpg`,is_custom:true,is_active:true
      });
      if (error) throw error;
      form.reset(); youtube.checked = true; youtube.dispatchEvent(new Event('change'));
      feedback.textContent = '';
      form.closest('.admin-form-overlay').classList.remove('open');
      toast('Ejercicio guardado. Ya puedes buscarlo y anadirlo a una rutina.');
      if(typeof ensureCatalog==='function')await ensureCatalog();
    } catch (error) { feedback.textContent = 'No se pudo guardar el ejercicio. Revisa la conexion y vuelve a intentarlo.'; }
    finally { button.disabled = false; }
  };
})();
