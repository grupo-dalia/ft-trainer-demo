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
      await renderOwnExercises();
    } catch (error) { feedback.textContent = 'No se pudo guardar el ejercicio. Revisa la conexion y vuelve a intentarlo.'; }
    finally { button.disabled = false; }
  };
  async function renderOwnExercises() {
    const catalog = document.getElementById('catalog-results');
    if (!catalog) return;
    let host = document.getElementById('trainer-own-exercises');
    if (!host) { host=document.createElement('section'); host.id='trainer-own-exercises'; catalog.before(host); }
    host.replaceChildren();
    const title=document.createElement('h3');title.textContent='Ejercicios propios de Fernando';host.append(title);
    const {data,error}=await ftSupabase.from('exercises').select('id,name,media_url,media_type,thumbnail_url').eq('is_custom',true).eq('is_active',true).order('name');
    if(error){const message=document.createElement('p');message.textContent='No se pudieron cargar los ejercicios propios.';host.append(message);return;}
    for(const exercise of data || []) {
      const row=document.createElement('details');row.style.margin='12px 0';
      const summary=document.createElement('summary');summary.textContent=exercise.name;row.append(summary);
      const content=document.createElement('div');row.append(content);
      row.ontoggle=()=>{content.innerHTML=row.open?window.ftExerciseMedia.html(exercise):'';};
      host.append(row);
    }
    if(!data?.length){const p=document.createElement('p');p.textContent='Anade tu primer ejercicio con el boton Ejercicio propio.';host.append(p);}
  }
  document.querySelector('[data-page="exercises"]').addEventListener('click',()=>setTimeout(renderOwnExercises));
})();
