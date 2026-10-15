(function(root){
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const num=value=>value==null?'—':new Intl.NumberFormat('es-ES',{maximumFractionDigits:1}).format(Number(value));
  const date=value=>new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value));
  function routineTable(routine,logs,week=''){
    const core=root.ExerciseProgressionCore,items=routine.routine_exercises||[],exercises=core.exercises(logs.filter(log=>log.workout_sessions?.routine_id===routine.id));
    const weeks=[...new Set(exercises.flatMap(ex=>ex.sessions.map(session=>core.monday(session.date))))].sort();
    if(!weeks.length)return {weeks,html:'<p class="training-empty">Esta rutina todavía no tiene entrenamientos completados.</p>'};
    const columns=week?weeks.filter(w=>w===week):weeks;
    const rows=new Map();
    for(const item of items)for(let series=1;series<=item.target_sets;series++)rows.set(`${item.exercise_id}|${item.day_number}|${series}`,{exerciseId:item.exercise_id,day:item.day_number,series,name:item.exercises?.name||'Ejercicio'});
    for(const exercise of exercises)for(const session of exercise.sessions)for(const set of session.sets){const key=`${exercise.id}|${session.day_number}|${set.set_number}`;if(!rows.has(key))rows.set(key,{exerciseId:exercise.id,day:session.day_number,series:set.set_number,name:exercise.name})}
    const html=`<div class="routine-week-scroll" tabindex="0" role="region" aria-label="Comparativa semanal de ${esc(routine.name)}"><table class="routine-week-table"><thead><tr><th>Ejercicio / serie</th>${columns.map(w=>`<th>Semana del ${date(w+'T12:00:00Z')}</th>`).join('')}</tr></thead><tbody>${[...rows.values()].sort((a,b)=>(a.day||0)-(b.day||0)||a.name.localeCompare(b.name,'es')||a.series-b.series).map(row=>{const exercise=exercises.find(ex=>ex.id===row.exerciseId),sessions=exercise?.sessions.filter(session=>session.day_number===row.day)||[];return `<tr><th scope="row">${esc(row.name)}<small>Día ${esc(row.day??'—')} · Serie ${esc(row.series)}</small></th>${columns.map(w=>{const entries=sessions.filter(session=>core.monday(session.date)===w).map(session=>{const set=session.sets.find(set=>set.set_number===row.series);if(!set)return '';const comparison=core.compareSeries(session,set,sessions);const description={lower:'Menos peso que la semana anterior',fewer:'Menos repeticiones que la semana anterior',higher:'Más peso y repeticiones que la semana anterior',equal:'Sin descenso ni mejora conjunta',none:'Sin referencia comparable en la semana anterior'}[comparison];return `<div class="series-values compare-${comparison}" aria-label="${description}" title="${description}"><strong>${set.duration_seconds!=null?num(set.duration_seconds)+' s':num(set.weight_kg)+' kg · '+num(set.reps)+' reps'}</strong><small>${date(session.date)}</small></div>`}).join('');return `<td>${entries||'—'}</td>`}).join('')}</tr>`}).join('')}</tbody></table></div>`;
    return {weeks,html};
  }
  root.RoutineHistoryCore={routineTable};
  if(typeof window==='undefined')return;
  async function allPages(query){const rows=[];for(let offset=0;;){const {data,error}=await query().order('id').range(offset,offset+499);if(error)throw error;if(!data?.length)return rows;rows.push(...data);offset+=data.length}}
  window.ftRoutineHistory={async mount(host,db,clientId){host.innerHTML='<p>Cargando rutinas e histórico…</p>';try{
    const [routines,logs]=await Promise.all([
      allPages(()=>db.from('routines').select('id,name,status').eq('client_id',clientId)),
      allPages(()=>db.from('set_logs').select('id,session_id,exercise_id,set_number,weight_kg,reps,duration_seconds,completed,exercises(name,body_group),workout_sessions!inner(client_id,completed_at,routine_id,day_number)').eq('workout_sessions.client_id',clientId).not('workout_sessions.completed_at','is',null).eq('completed',true))
    ]);
    const items=await allPages(()=>db.from('routine_exercises').select('id,routine_id,exercise_id,day_number,target_sets,exercises(name),routines!inner(client_id)').eq('routines.client_id',clientId));
    if(!host.isConnected)return;
    host.innerHTML='<div class="routine-history-list"></div>';
    const list=host.querySelector('.routine-history-list');
    if(!routines.length){list.innerHTML='<p>No hay rutinas asignadas a este cliente.</p>';return}
    for(const routine of routines){routine.routine_exercises=items.filter(item=>item.routine_id===routine.id);const section=document.createElement('details');section.className='routine-weekly';section.open=routines.length===1;const result=routineTable(routine,logs);section.innerHTML=`<summary><span class="routine-history-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></span><span class="routine-history-title"><b>${esc(routine.name)}</b><small>${result.weeks.length} semanas · ${routine.routine_exercises.length} ejercicios asignados</small></span></summary><div class="routine-history-controls"><p>Cada columna es una semana.<br>Desliza para comparar las anteriores.</p><label>Mostrar<select><option value="">Todas las semanas</option>${result.weeks.slice().reverse().map(w=>`<option value="${w}">Semana del ${date(w+'T12:00:00Z')}</option>`).join('')}</select></label></div><div class="routine-week-result">${result.html}</div>`;section.querySelector('select').onchange=event=>{section.querySelector('.routine-week-result').innerHTML=routineTable(routine,logs,event.target.value).html};list.appendChild(section)}
  }catch{host.innerHTML='<p>No se pudo cargar el histórico.</p><button type="button">Reintentar</button>';host.querySelector('button').onclick=()=>window.ftRoutineHistory.mount(host,db,clientId)}}};
})(globalThis);
