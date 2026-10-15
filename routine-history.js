(function(root){
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const num=value=>value==null?'—':new Intl.NumberFormat('es-ES',{maximumFractionDigits:1}).format(Number(value));
  const date=value=>new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value));
  function compareMetrics(session,set,sessions){
    const candidate=sessions.filter(s=>(!session.id||s.id!==session.id)&&s.date<session.date&&s.routine_id===session.routine_id&&s.day_number===session.day_number).sort((a,b)=>b.date.localeCompare(a.date))[0];
    const prior=candidate?.sets.find(s=>s.set_number===set.set_number)||{};
    const neutral={weight:'none',reps:'none'};
    if(!candidate||set.duration_seconds!=null||prior.duration_seconds!=null)return neutral;
    // Missing values in an existing previous session count as zero only for comparison.
    const previousWeight=prior.weight_kg??0,previousReps=prior.reps??0;
    const valid=(current,previous)=>current!=null&&previous!=null&&Number.isFinite(Number(current))&&Number.isFinite(Number(previous));
    const weight=valid(set.weight_kg,previousWeight)?(Number(set.weight_kg)<Number(previousWeight)?'lower':Number(set.weight_kg)>Number(previousWeight)?'higher':'none'):'none';
    const reps=valid(set.reps,previousReps)?(Number(set.reps)<Number(previousReps)?'fewer':Number(set.reps)>Number(previousReps)?'higher':'none'):'none';
    return {weight,reps};
  }
  function routineTable(routine,logs,week=''){
    const core=root.ExerciseProgressionCore,items=routine.routine_exercises||[],exercises=core.exercises(logs.filter(log=>log.workout_sessions?.routine_id===routine.id));
    const weeks=[...new Set(exercises.flatMap(ex=>ex.sessions.map(session=>core.monday(session.date))))].sort();
    if(!weeks.length)return {weeks,html:'<p class="training-empty">Esta rutina todavía no tiene entrenamientos completados.</p>'};
    const rows=new Map();
    for(const item of items)for(let series=1;series<=item.target_sets;series++)rows.set(`${item.exercise_id}|${item.day_number}|${series}`,{exerciseId:item.exercise_id,day:item.day_number,series,name:item.exercises?.name||'Ejercicio',position:item.position??999});
    for(const exercise of exercises)for(const session of exercise.sessions)for(const set of session.sets){const key=`${exercise.id}|${session.day_number}|${set.set_number}`;if(!rows.has(key))rows.set(key,{exerciseId:exercise.id,day:session.day_number,series:set.set_number,name:exercise.name,position:999})}
    const days=[...new Set([...rows.values()].map(row=>row.day))].sort((a,b)=>(a??999)-(b??999));
    const html=days.map(day=>{
      const dayRows=[...rows.values()].filter(row=>row.day===day).sort((a,b)=>a.position-b.position||a.name.localeCompare(b.name,'es')||String(a.exerciseId).localeCompare(String(b.exerciseId))||a.series-b.series);
      const count=new Set(dayRows.map(row=>row.exerciseId)).size;
      const sessionMap=new Map();for(const exercise of exercises)for(const session of exercise.sessions)if(session.day_number===day)sessionMap.set(session.id,session);
      const daySessions=[...sessionMap.values()];
      const columns=[...daySessions].sort((a,b)=>a.date.localeCompare(b.date)||String(a.id).localeCompare(String(b.id))).map((session,index)=>({...session,number:index+1})).filter(session=>!week||core.monday(session.date)===week);
      return `<section class="routine-day-group"><header class="routine-day-heading"><h3>Día ${esc(day??'sin asignar')}</h3><span>${count} ejercicios</span></header><div class="routine-week-scroll" tabindex="0" role="region" aria-label="Comparativa por sesiones de ${esc(routine.name)}, día ${esc(day??'sin asignar')}"><table class="routine-week-table routine-split-metrics"><thead><tr><th rowspan="2" scope="col" class="routine-exercise-heading">Ejercicio</th>${columns.map(session=>`<th colspan="2" scope="colgroup">Sesión ${session.number}</th>`).join('')}</tr><tr>${columns.map(()=>'<th scope="col">KG</th><th scope="col">REPS</th>').join('')}</tr></thead><tbody>${dayRows.filter((row,index)=>index===0||dayRows[index-1].exerciseId!==row.exerciseId).map(row=>{
        const seriesRows=dayRows.filter(item=>item.exerciseId===row.exerciseId);
        const exercise=exercises.find(ex=>ex.id===row.exerciseId),sessions=exercise?.sessions.filter(session=>session.day_number===row.day)||[];
        return `<tr class="routine-exercise-start"><th class="routine-exercise-name" scope="row">${esc(row.name)}</th>${columns.map(column=>{
          const session=sessions.find(session=>session.id===column.id);
          const metricCell=metric=>`<td class="routine-${metric}-cell"><div class="routine-series-stack">${seriesRows.map(seriesRow=>{
            const set=session?.sets.find(set=>set.set_number===seriesRow.series);
            if(!set)return '<div class="series-values compare-none"><strong>—</strong></div>';
            const colors=compareMetrics(session,set,daySessions.map(daySession=>({...daySession,sets:sessions.find(s=>s.id===daySession.id)?.sets||[]}))),color=colors[metric];
            const value=metric==='weight'?(set.duration_seconds!=null?'—':num(set.weight_kg)):(set.duration_seconds!=null?num(set.duration_seconds)+' s':num(set.reps));
            const hint=color==='lower'?'Menos kilos que la sesión anterior':color==='fewer'?'Menos repeticiones que la sesión anterior':color==='higher'?(metric==='weight'?'Más kilos que la sesión anterior':'Más repeticiones que la sesión anterior'):'Mismo valor o sin referencia comparable';
            return `<div class="series-values compare-${color}" aria-label="Serie ${esc(seriesRow.series)}"><strong title="${hint}">${value}</strong></div>`;
          }).join('')}</div></td>`;
          return metricCell('weight')+metricCell('reps');
        }).join('')}</tr>`;
      }).join('')}</tbody></table></div></section>`;
    }).join('');
    return {weeks,html};
  }
  root.RoutineHistoryCore={routineTable,compareMetrics};
  if(typeof window==='undefined')return;
  async function allPages(query){const rows=[];for(let offset=0;;){const {data,error}=await query().order('id').range(offset,offset+499);if(error)throw error;if(!data?.length)return rows;rows.push(...data);offset+=data.length}}
  window.ftRoutineHistory={async mount(host,db,clientId){host.innerHTML='<p>Cargando rutinas e histórico…</p>';try{
    const [routines,logs]=await Promise.all([
      allPages(()=>db.from('routines').select('id,name,status').eq('client_id',clientId)),
      allPages(()=>db.from('set_logs').select('id,session_id,exercise_id,set_number,weight_kg,reps,duration_seconds,completed,exercises(name,body_group),workout_sessions!inner(client_id,completed_at,routine_id,day_number)').eq('workout_sessions.client_id',clientId).not('workout_sessions.completed_at','is',null).eq('completed',true))
    ]);
    const items=await allPages(()=>db.from('routine_exercises').select('id,routine_id,exercise_id,day_number,position,target_sets,exercises(name),routines!inner(client_id)').eq('routines.client_id',clientId));
    if(!host.isConnected)return;
    host.innerHTML='<div class="routine-history-list"></div>';
    const list=host.querySelector('.routine-history-list');
    if(!routines.length){list.innerHTML='<p>No hay rutinas asignadas a este cliente.</p>';return}
    for(const routine of routines){routine.routine_exercises=items.filter(item=>item.routine_id===routine.id);const section=document.createElement('details');section.className='routine-weekly';section.open=routines.length===1;const result=routineTable(routine,logs);section.innerHTML=`<summary><span class="routine-history-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></span><span class="routine-history-title"><b>${esc(routine.name)}</b><small>Sesiones por día · ${routine.routine_exercises.length} ejercicios asignados</small></span></summary><div class="routine-history-controls"><p>Cada día, sus ejercicios y series.<br>Cada sesión se compara con la anterior.</p><label>Mostrar<select><option value="">Todas las semanas</option>${result.weeks.slice().reverse().map(w=>`<option value="${w}">Semana del ${date(w+'T12:00:00Z')}</option>`).join('')}</select></label></div><div class="routine-week-result">${result.html}</div>`;section.querySelector('select').onchange=event=>{section.querySelector('.routine-week-result').innerHTML=routineTable(routine,logs,event.target.value).html};list.appendChild(section)}
  }catch{host.innerHTML='<p>No se pudo cargar el histórico.</p><button type="button">Reintentar</button>';host.querySelector('button').onclick=()=>window.ftRoutineHistory.mount(host,db,clientId)}}};
})(globalThis);
