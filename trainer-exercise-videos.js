(() => {
  const form = document.getElementById('custom-exercise-form');
  if (!form || !window.ftSupabase) return;
  const youtube = form.querySelector('[name="media"][value="youtube"]');
  youtube.checked = true;
  youtube.dispatchEvent(new Event('change'));
  const feedback = document.createElement('p');
  feedback.setAttribute('role', 'status');
  form.append(feedback);
  let editingId=null;
  window.openTrainerExerciseEditor=exercise=>{
    editingId=exercise?.id||null;form.reset();feedback.textContent='';
    const inputs=form.querySelectorAll('.admin-fields > label > input'),selects=form.querySelectorAll('.admin-fields > label > select');
    form.querySelector('h2').textContent=editingId?'Editar ejercicio':'Nuevo ejercicio de Fernando';
    inputs[0].value=exercise?.name||'';inputs[1].value=exercise?.primary_muscle||'';inputs[2].value=(exercise?.secondary_muscles||[]).join(', ');
    selects[0].value=exercise?.body_group||'Otros';selects[1].value=exercise?.equipment||'Peso corporal';selects[2].value=exercise?.difficulty||'Iniciacion';
    form.querySelector('#exercise-tracking-type').value=exercise?.tracking_type||'weight_reps';form.querySelector('textarea').value=exercise?.instructions||'';
    form.querySelector('#youtube-field input').value=exercise?.media_url||'';youtube.checked=true;youtube.dispatchEvent(new Event('change'));
    form.closest('.admin-form-overlay').classList.add('open');
  };
  form.onsubmit = async event => {
    event.preventDefault();
    const link = form.querySelector('#youtube-field input');
    const id = window.ftExerciseMedia.youtubeId(link.value.trim());
    const vimeo=window.ftExerciseMedia.vimeoVideo?.(link.value.trim());
    if (!youtube.checked) { feedback.textContent = 'Pega el enlace de YouTube o Vimeo.'; return; }
    if (!id && !vimeo) { feedback.textContent = 'Introduce un enlace válido de YouTube o Vimeo.'; link.focus(); return; }
    const inputs = form.querySelectorAll('.admin-fields > label > input');
    const selects = form.querySelectorAll('.admin-fields > label > select');
    const button = form.querySelector('button.primary');
    button.disabled = true;
    feedback.textContent = 'Guardando ejercicio…';
    try {
      const {data:auth,error:authError} = await ftSupabase.auth.getUser();
      if (authError || !auth?.user) throw new Error('Vuelve a iniciar sesion para guardar.');
      const payload={name:inputs[0].value.trim(),body_group:selects[0].value,
        primary_muscle:inputs[1].value.trim()||null,secondary_muscles:inputs[2].value.split(',').map(s=>s.trim()).filter(Boolean),
        equipment:selects[1].value,difficulty:selects[2].value,instructions:form.querySelector('textarea').value.trim(),
        tracking_type:form.querySelector('#exercise-tracking-type').value||'weight_reps',
        media_type:id?'youtube':'vimeo',media_url:id?`https://www.youtube.com/watch?v=${id}`:vimeo.url,
        thumbnail_url:id?`https://i.ytimg.com/vi/${id}/hqdefault.jpg`:null,is_custom:true,is_active:true
      };
      const result=editingId?await ftSupabase.from('exercises').update(payload).eq('id',editingId).eq('is_custom',true).select('id').single():await ftSupabase.from('exercises').insert({...payload,created_by:auth.user.id});
      const {error}=result;
      if (error) throw error;
      editingId=null;form.reset(); youtube.checked = true; youtube.dispatchEvent(new Event('change'));
      feedback.textContent = '';
      form.closest('.admin-form-overlay').classList.remove('open');
      toast('Ejercicio guardado. Ya puedes buscarlo y anadirlo a una rutina.');
      if(typeof ensureCatalog==='function')await ensureCatalog();
    } catch (error) { feedback.textContent = 'No se pudo guardar el ejercicio. Revisa la conexion y vuelve a intentarlo.'; }
    finally { button.disabled = false; }
  };
})();
