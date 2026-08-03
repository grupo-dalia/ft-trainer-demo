/* Editor de contenido de rutinas para el panel del entrenador. */
(function(){
  const esc=value=>escapeHtml(String(value??''));
  const number=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;

  async function fetchRoutine(id){
    const [{data:routine,error:routineError},{data:items,error:itemsError},{data:exercises,error:exerciseError}]=await Promise.all([
      ftSupabase.from('routines').select('id,name,description,status').eq('id',id).single(),
      ftSupabase.from('routine_exercises').select('id,exercise_id,day_number,position,target_sets,target_reps_min,target_reps_max,target_weight_kg,target_rir,rest_seconds,notes,exercises(name,body_group,primary_muscle)').eq('routine_id',id).order('day_number').order('position'),
      ftSupabase.from('exercises').select('id,name,body_group,primary_muscle,equipment').eq('is_active',true).order('body_group').order('name').limit(1500)
    ]);
    if(routineError||itemsError||exerciseError)throw routineError||itemsError||exerciseError;
    return{routine,items:items||[],exercises:exercises||[]};
  }

  function exerciseOptions(exercises){
    let group='';
    return exercises.map(ex=>{
      const current=ex.body_group||'Otros';
      const prefix=current!==group?(group=current,`<option disabled>── ${esc(current)} ──</option>`):'';
      return`${prefix}<option value="${ex.id}">${esc(ex.name)} · ${esc(ex.primary_muscle||current)}</option>`;
    }).join('');
  }

  function itemMarkup(item){
    const ex=item.exercises||{};
    const reps=item.target_reps_min===item.target_reps_max?item.target_reps_min:`${item.target_reps_min??'—'}–${item.target_reps_max??'—'}`;
    return`<article class="routine-exercise-row" data-item="${item.id}">
      <div class="routine-exercise-order">Día ${item.day_number}</div>
      <div class="routine-exercise-name"><b>${esc(ex.name||'Ejercicio')}</b><small>${esc(ex.primary_muscle||ex.body_group||'')}</small></div>
      <div class="routine-exercise-target"><b>${item.target_sets} × ${esc(reps)}</b><small>${item.rest_seconds||0} s descanso${item.target_weight_kg!=null?` · ${item.target_weight_kg} kg`:''}</small></div>
      <button type="button" class="secondary remove-routine-exercise" data-item="${item.id}">Quitar</button>
    </article>`;
  }

  async function renderEditor(id){
    const host=document.getElementById('routine-editor-overlay');
    try{
      const {routine,items,exercises}=await fetchRoutine(id);
      host.innerHTML=`<section class="routine-editor-panel" role="dialog" aria-modal="true" aria-labelledby="routine-editor-title">
        <header class="routine-editor-header"><div><p class="eyebrow">EDITOR DE RUTINA</p><h2 id="routine-editor-title">${esc(routine.name)}</h2><p class="muted">Añade y configura los ejercicios en el orden de entrenamiento.</p></div><button type="button" class="admin-form-close" aria-label="Cerrar">×</button></header>
        <div class="routine-editor-layout">
          <form id="add-routine-exercise" class="routine-add-form">
            <h3>Añadir ejercicio</h3>
            <label>Ejercicio<select name="exercise_id" required><option value="">Selecciona un ejercicio</option>${exerciseOptions(exercises)}</select></label>
            <div class="routine-fields"><label>Día<input type="number" name="day_number" min="1" max="14" value="1" required></label><label>Series<input type="number" name="target_sets" min="1" max="20" value="3" required></label><label>Repeticiones mín.<input type="number" name="target_reps_min" min="1" max="100" value="8" required></label><label>Repeticiones máx.<input type="number" name="target_reps_max" min="1" max="100" value="12" required></label><label>Descanso (seg.)<input type="number" name="rest_seconds" min="0" max="900" value="90" required></label><label>Peso objetivo (kg)<input type="number" name="target_weight_kg" min="0" max="999" step="0.5" placeholder="Opcional"></label><label>RIR<input type="number" name="target_rir" min="0" max="10" value="2"></label></div>
            <label>Notas<textarea name="notes" placeholder="Técnica, tempo o indicaciones para el cliente"></textarea></label>
            <p class="form-feedback" aria-live="polite"></p><button class="primary full" type="submit">＋ Añadir a la rutina</button>
          </form>
          <section class="routine-current"><div class="routine-current-head"><div><h3>Ejercicios incluidos</h3><p class="muted">${items.length} ${items.length===1?'ejercicio':'ejercicios'}</p></div></div><div class="routine-exercise-list">${items.map(itemMarkup).join('')||'<div class="routine-empty"><b>La rutina todavía está vacía</b><p>Selecciona un ejercicio en el formulario para empezar.</p></div>'}</div></section>
        </div>
      </section>`;
      host.querySelector('.admin-form-close').onclick=()=>host.classList.remove('open');
      host.querySelectorAll('.remove-routine-exercise').forEach(button=>button.onclick=async()=>{
        button.disabled=true;
        const {error}=await ftSupabase.from('routine_exercises').delete().eq('id',button.dataset.item);
        if(error){toast('No se pudo quitar el ejercicio');button.disabled=false;return}
        toast('Ejercicio eliminado');await renderEditor(id);
      });
      host.querySelector('#add-routine-exercise').onsubmit=async event=>{
        event.preventDefault();
        const form=event.currentTarget,data=new FormData(form),feedback=form.querySelector('.form-feedback'),button=form.querySelector('[type="submit"]');
        const day=number(data.get('day_number'),1),sameDay=items.filter(item=>item.day_number===day),position=sameDay.reduce((max,item)=>Math.max(max,item.position||0),0)+1;
        const min=number(data.get('target_reps_min'),8),max=number(data.get('target_reps_max'),min);
        if(max<min){feedback.textContent='Las repeticiones máximas no pueden ser menores que las mínimas.';return}
        button.disabled=true;feedback.textContent='';
        const payload={routine_id:id,exercise_id:data.get('exercise_id'),day_number:day,position,target_sets:number(data.get('target_sets'),3),target_reps_min:min,target_reps_max:max,rest_seconds:number(data.get('rest_seconds'),90),target_rir:data.get('target_rir')===''?null:number(data.get('target_rir'),2),target_weight_kg:data.get('target_weight_kg')===''?null:number(data.get('target_weight_kg'),0),notes:String(data.get('notes')||'').trim()||null};
        const {error}=await ftSupabase.from('routine_exercises').insert(payload);
        if(error){feedback.textContent='No se pudo añadir el ejercicio. Revisa los datos e inténtalo de nuevo.';button.disabled=false;return}
        toast('Ejercicio añadido');await renderEditor(id);
      };
    }catch(error){host.innerHTML='<section class="routine-editor-panel"><button type="button" class="admin-form-close" aria-label="Cerrar">×</button><h2>No se pudo abrir la rutina</h2><p>Actualiza la página e inténtalo de nuevo.</p></section>';host.querySelector('button').onclick=()=>host.classList.remove('open')}
  }

  window.openRoutineEditor=async id=>{
    let host=document.getElementById('routine-editor-overlay');
    if(!host){host=document.createElement('div');host.id='routine-editor-overlay';host.className='admin-form-overlay routine-editor-overlay';host.onclick=event=>{if(event.target===host)host.classList.remove('open')};document.body.appendChild(host)}
    host.classList.add('open');host.innerHTML='<section class="routine-editor-panel routine-loading"><p>Cargando rutina…</p></section>';
    await renderEditor(id);
  };
})();
