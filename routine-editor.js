/* Editor de contenido de rutinas para el panel del entrenador. */
(function(){
  const esc=value=>escapeHtml(String(value??''));
  const number=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;

  async function fetchRoutine(id){
    const [{data:routine,error:routineError},{data:items,error:itemsError},{data:exercises,error:exerciseError},catalogResponse]=await Promise.all([
      ftSupabase.from('routines').select('id,name,description,status').eq('id',id).single(),
      ftSupabase.from('routine_exercises').select('id,exercise_id,day_number,position,target_sets,target_reps_min,target_reps_max,target_weight_kg,target_rir,rest_seconds,notes,exercises(name,body_group,primary_muscle)').eq('routine_id',id).order('day_number').order('position'),
      ftSupabase.from('exercises').select('id,name,body_group,primary_muscle,equipment,thumbnail_url').eq('is_active',true).order('body_group').order('name').limit(1500),
      fetch('data/ejercicios-es.json?v=2')
    ]);
    if(routineError||itemsError||exerciseError)throw routineError||itemsError||exerciseError;
    const catalog=await catalogResponse.json();
    const stored=(exercises||[]).map(ex=>{const reference=catalog.find(raw=>localizedName(raw)===ex.name);return {...ex,thumbnail_url:ex.thumbnail_url||reference?.imagen,source:'db',sourceId:ex.id};});
    const local=catalog.map(ex=>({id:ex.id,name:localizedName(ex),body_group:ex.grupo,primary_muscle:catalogTranslations.target[ex.objetivo]||ex.objetivo,equipment:ex.equipo,source:'catalog',sourceId:ex.id,catalog:ex}));
    const uniqueLocal=local.filter(ex=>!stored.some(saved=>saved.name===ex.name&&saved.body_group===ex.body_group));
    return{routine,items:items||[],exercises:[...stored,...uniqueLocal].sort((a,b)=>(a.body_group||'').localeCompare(b.body_group||'','es')||a.name.localeCompare(b.name,'es'))};
  }

  function itemMarkup(item){
    const ex=item.exercises||{};
    const reps=item.target_reps_min===item.target_reps_max?item.target_reps_min:`${item.target_reps_min??'—'}–${item.target_reps_max??'—'}`;
    return`<article class="routine-exercise-row" data-item="${item.id}">
      <div class="routine-exercise-order">Dia ${item.day_number}</div>
      <div class="routine-exercise-name"><b>${esc(ex.name||'Ejercicio')}</b><small>${esc(ex.primary_muscle||ex.body_group||'')}</small></div>
      <div class="routine-exercise-target"><b>${item.target_sets} × ${esc(reps)}</b><small>${item.rest_seconds||0} s descanso${item.target_weight_kg!=null?` · ${item.target_weight_kg} kg`:''}</small></div>
      <button type="button" class="secondary edit-routine-exercise" data-item="${item.id}">Editar</button><button type="button" class="secondary remove-routine-exercise" data-item="${item.id}">Quitar</button>
    </article>`;
  }

  async function renderEditor(id){
    const host=document.getElementById('routine-editor-overlay');
    try{
      const {routine,items,exercises}=await fetchRoutine(id);
      host.innerHTML=`<section class="routine-editor-panel" role="dialog" aria-modal="true" aria-labelledby="routine-editor-title">
        <header class="routine-editor-header"><div><p class="eyebrow">EDITOR DE RUTINA</p><h2 id="routine-editor-title">${esc(routine.name)}</h2><p class="muted">Anade y configura los ejercicios en el orden de entrenamiento.</p></div><button type="button" class="admin-form-close" aria-label="Cerrar">×</button></header>
        <div class="routine-editor-layout">
          <form id="add-routine-exercise" class="routine-add-form">
            <h3>Anadir ejercicio</h3>
            <label>Buscar ejercicio<input id="routine-exercise-search" type="search" placeholder="Ej. press, espalda, mancuerna…" autocomplete="off"></label>
            <div class="exercise-picker" aria-label="Ejercicios disponibles"></div><p class="exercise-selection-count" aria-live="polite"></p>
            <div class="routine-fields"><label>Dia<input type="number" name="day_number" min="1" max="14" value="1" required></label><label>Series<input type="number" name="target_sets" min="1" max="20" value="3" required></label><label>Repeticiones min.<input type="number" name="target_reps_min" min="1" max="100" value="8" required></label><label>Repeticiones max.<input type="number" name="target_reps_max" min="1" max="100" value="12" required></label><label>Descanso (seg.)<input type="number" name="rest_seconds" min="0" max="900" value="90" required></label><label>Peso objetivo (kg)<input type="number" name="target_weight_kg" min="0" max="999" step="0.5" placeholder="Opcional"></label><label>RIR<input type="number" name="target_rir" min="0" max="10" value="2"></label></div>
            <label>Notas<textarea name="notes" placeholder="Tecnica, tempo o indicaciones para el cliente"></textarea></label>
            <p class="form-feedback" aria-live="polite"></p><button class="primary full" type="submit">＋ Anadir a la rutina</button>
          </form>
          <section class="routine-current"><div class="routine-current-head"><div><h3>Ejercicios incluidos</h3><p class="muted">${items.length} ${items.length===1?'ejercicio':'ejercicios'}</p></div></div><div class="routine-exercise-list">${items.map(itemMarkup).join('')||'<div class="routine-empty"><b>La rutina todavia esta vacia</b><p>Selecciona un ejercicio en el formulario para empezar.</p></div>'}</div></section>
        </div>
      </section>`;
      host.querySelector('.admin-form-close').onclick=()=>host.classList.remove('open');
      const search=host.querySelector('#routine-exercise-search'),exerciseSelect=host.querySelector('.exercise-picker'),selectedExercises=new Set();
      const renderChoices=()=>{
        const query=search.value.trim(),matches=exercises.filter(ex=>matchesQuery(`${ex.name} ${ex.body_group} ${ex.primary_muscle} ${ex.equipment||''} ${(ex.catalog?.musculos||[]).join(' ')} ${ex.catalog?.nombre||''}`,query));
        exerciseSelect.innerHTML=matches.map(ex=>{const key=`${ex.source}:${ex.sourceId}`,image=ex.thumbnail_url||ex.catalog?.imagen;return `<label class="exercise-pick"><input type="checkbox" value="${esc(key)}" ${selectedExercises.has(key)?'checked':''}>${image?`<img src="${esc(image)}" loading="lazy" alt="">`:'<span aria-hidden="true">＋</span>'}<span><b>${esc(ex.name)}</b><small>${esc(ex.primary_muscle||ex.body_group)}</small></span></label>`}).join('')||'<p>No hay ejercicios con ese filtro.</p>';
        exerciseSelect.querySelectorAll('input').forEach(input=>input.onchange=()=>{if(input.checked)selectedExercises.add(input.value);else selectedExercises.delete(input.value);host.querySelector('.exercise-selection-count').textContent=`${selectedExercises.size} seleccionados`;});
      };
      search.oninput=renderChoices;renderChoices();
      host.querySelectorAll('.remove-routine-exercise').forEach(button=>button.onclick=async()=>{
        button.disabled=true;
        const {error}=await ftSupabase.from('routine_exercises').delete().eq('id',button.dataset.item);
        if(error){toast('No se pudo quitar el ejercicio');button.disabled=false;return}
        toast('Ejercicio eliminado');await window.openRoutineEditor(id);
      });
      host.querySelectorAll('.edit-routine-exercise').forEach(button=>button.onclick=()=>{
        const item=items.find(entry=>entry.id===button.dataset.item),row=button.closest('article');
        let editor=row.querySelector('form');if(editor){editor.remove();return;}
        editor=document.createElement('form');editor.className='routine-inline-edit';
        editor.innerHTML=`<div class="routine-fields">${[['target_sets','Series',1,20],['target_reps_min','Reps mín.',1,100],['target_reps_max','Reps máx.',1,100],['rest_seconds','Descanso (s)',0,900]].map(([name,label,min,max])=>`<label>${label}<input name="${name}" type="number" min="${min}" max="${max}" value="${item[name]??min}" required></label>`).join('')}</div><p aria-live="polite"></p><button type="submit" class="primary">Guardar cambios</button>`;
        row.append(editor);editor.onsubmit=async event=>{event.preventDefault();const values=Object.fromEntries([...new FormData(editor)].map(([key,value])=>[key,Number(value)])),feedback=editor.querySelector('p'),save=editor.querySelector('button');if(values.target_reps_max<values.target_reps_min){feedback.textContent='Revisa el rango de repeticiones.';return;}save.disabled=true;try{const {error}=await ftSupabase.from('routine_exercises').update(values).eq('id',item.id).eq('routine_id',id);if(error)throw error;toast('Ejercicio actualizado');await window.openRoutineEditor(id);}catch(error){feedback.textContent='No se pudo guardar. Inténtalo de nuevo.';save.disabled=false;}};
      });
      host.querySelector('#add-routine-exercise').onsubmit=async event=>{
        event.preventDefault();
        const form=event.currentTarget,data=new FormData(form),feedback=form.querySelector('.form-feedback'),button=form.querySelector('[type="submit"]');
        const day=number(data.get('day_number'),1),sameDay=items.filter(item=>item.day_number===day),firstPosition=sameDay.reduce((max,item)=>Math.max(max,item.position||0),0)+1;
        const min=number(data.get('target_reps_min'),8),max=number(data.get('target_reps_max'),min);
        if(max<min){feedback.textContent='Las repeticiones maximas no pueden ser menores que las minimas.';return}
        button.disabled=true;feedback.textContent='';
        const chosen=exercises.filter(ex=>selectedExercises.has(`${ex.source}:${ex.sourceId}`));
        if(!chosen.length){feedback.textContent='Selecciona uno o varios ejercicios.';button.disabled=false;return}
        const payloads=[];
        try {
        for(const exercise of chosen){
        let exerciseId=exercise.id;
        if(exercise.source==='catalog'){
          const existing=await ftSupabase.from('exercises').select('id').eq('name',exercise.name).eq('body_group',exercise.body_group).limit(1).maybeSingle();
          if(existing.data?.id)exerciseId=existing.data.id;
          else{
            const raw=exercise.catalog,{data:created,error:createError}=await ftSupabase.from('exercises').insert({name:exercise.name,body_group:exercise.body_group,primary_muscle:exercise.primary_muscle,secondary_muscles:raw.musculos||[],equipment:exercise.equipment,instructions:(raw.instrucciones||[]).join('\n'),media_type:'gif',media_url:new URL(raw.gif,location.href).href,thumbnail_url:new URL(raw.imagen,location.href).href,is_custom:false,is_active:true}).select('id').single();
            if(createError){feedback.textContent='No se pudo preparar el ejercicio en la base de datos.';button.disabled=false;return}
            exerciseId=created.id;
          }
        }
        const payload={routine_id:id,exercise_id:exerciseId,day_number:day,position:firstPosition+payloads.length,target_sets:number(data.get('target_sets'),3),target_reps_min:min,target_reps_max:max,rest_seconds:number(data.get('rest_seconds'),90),target_rir:data.get('target_rir')===''?null:number(data.get('target_rir'),2),target_weight_kg:data.get('target_weight_kg')===''?null:number(data.get('target_weight_kg'),0),notes:String(data.get('notes')||'').trim()||null};
        if(!sameDay.some(item=>item.exercise_id===exerciseId)&&!payloads.some(item=>item.exercise_id===exerciseId))payloads.push(payload);
        }
        if(!payloads.length){feedback.textContent='Los ejercicios seleccionados ya están en este día.';button.disabled=false;return;}
        const {error}=await ftSupabase.from('routine_exercises').insert(payloads);
        if(error){feedback.textContent='No se pudo anadir el ejercicio. Revisa los datos e intentalo de nuevo.';button.disabled=false;return}
        toast(`${payloads.length} ejercicios añadidos`);await window.openRoutineEditor(id);
        }catch(error){feedback.textContent='No se pudieron añadir los ejercicios. Inténtalo de nuevo.';button.disabled=false;}
      };
    }catch(error){host.innerHTML='<section class="routine-editor-panel"><button type="button" class="admin-form-close" aria-label="Cerrar">×</button><h2>No se pudo abrir la rutina</h2><p>Actualiza la pagina e intentalo de nuevo.</p></section>';host.querySelector('button').onclick=()=>host.classList.remove('open')}
  }

  window.openRoutineEditor=async id=>{
    let host=document.getElementById('routine-editor-overlay');
    if(!host){host=document.createElement('div');host.id='routine-editor-overlay';host.className='admin-form-overlay routine-editor-overlay';host.onclick=event=>{if(event.target===host)host.classList.remove('open')};document.body.appendChild(host)}
    host.classList.add('open');host.innerHTML='<section class="routine-editor-panel routine-loading"><p>Cargando rutina…</p></section>';
    await renderEditor(id);
  };
})();
