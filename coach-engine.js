/* FT Coach v1 — motor determinista de programación. No utiliza aleatoriedad. */
const ftAthlete={
  level:'intermedio',goal:'hipertrofia',days:4,sessionMinutes:60,adherence:0.82,
  bodyWeight:78.4,weightTrend:-0.15,weeksInBlock:4,
  readiness:{sleep:7.2,soreness:3,stress:2,pain:0,restHours:48},
  history:[
    {name:'Press de banca',group:'Pecho',load:70,reps:[10,10,8],target:[8,10],rir:2,trend:1,increment:2.5},
    {name:'Remo con barra',group:'Espalda',load:55,reps:[10,10,10,9],target:[8,10],rir:2,trend:1,increment:2.5},
    {name:'Sentadilla',group:'Piernas',load:90,reps:[8,8,7],target:[6,8],rir:1,trend:0,increment:5},
    {name:'Peso muerto rumano',group:'Piernas',load:75,reps:[10,10,9],target:[8,10],rir:2,trend:1,increment:2.5},
    {name:'Press inclinado',group:'Pecho',load:24,reps:[11,10,10],target:[10,12],rir:2,trend:0,increment:2},
    {name:'Jalón al pecho',group:'Espalda',load:50,reps:[12,12,11],target:[10,12],rir:2,trend:1,increment:2.5},
    {name:'Elevaciones laterales',group:'Hombros',load:8,reps:[15,15,14],target:[12,15],rir:2,trend:0,increment:1},
    {name:'Curl de bíceps',group:'Brazos',load:12,reps:[12,11,10],target:[10,12],rir:1,trend:0,increment:1}
  ]
};

function readinessScore(a){
  const sleep=Math.min(100,a.sleep/8*100),soreness=100-a.soreness*12,stress=100-a.stress*12,rest=Math.min(100,a.restHours/48*100),pain=a.pain?25:100;
  return Math.round(sleep*.3+soreness*.2+stress*.2+rest*.15+pain*.15);
}
function progression(ex,athlete,score){
  const min=ex.target[0],max=ex.target[1],allTop=ex.reps.every(r=>r>=max),below=ex.reps.filter(r=>r<min).length>=2;
  if(athlete.readiness.pain>0)return {load:ex.load,action:'Revisión',reason:'Hay dolor declarado: Fernando debe revisar el ejercicio.'};
  if(score<55||below||ex.rir===0)return {load:Math.round(ex.load*.95*2)/2,action:'Reducir',reason:'Recuperación o rendimiento insuficiente; se reduce 5%.'};
  if(allTop&&ex.rir>=2&&score>=75)return {load:ex.load+ex.increment,action:'Progresar',reason:'Completaste el rango alto con ≥2 repeticiones en reserva.'};
  if(ex.trend<0)return {load:ex.load,action:'Mantener',reason:'Rendimiento descendente: no se añade carga esta semana.'};
  return {load:ex.load,action:'Mantener',reason:'Consolida el rango antes de aumentar la carga.'};
}
function buildWeek(athlete){
  const score=readinessScore(athlete.readiness),deload=score<55||athlete.adherence<.6||athlete.weeksInBlock>=6;
  const volumeFactor=deload?.55:athlete.adherence<.75?.8:score>82&&athlete.adherence>.85?1.08:1;
  const splits={2:['Full body A','Full body B'],3:['Torso','Pierna','Full body'],4:['Torso A','Pierna A','Torso B','Pierna B'],5:['Empuje','Tirón','Pierna','Torso','Pierna + Core']};
  const days=splits[athlete.days]||splits[4],progressions=athlete.history.map(ex=>({...ex,...progression(ex,athlete,score)}));
  const byGroup=g=>progressions.filter(e=>e.group===g);
  const pools={Torso:[...byGroup('Pecho'),...byGroup('Espalda'),...byGroup('Hombros'),...byGroup('Brazos')],Pierna:byGroup('Piernas'),'Full body':progressions,Empuje:[...byGroup('Pecho'),...byGroup('Hombros')],Tirón:[...byGroup('Espalda'),...byGroup('Brazos')]};
  const sessions=days.map((name,i)=>{const key=Object.keys(pools).find(k=>name.includes(k))||'Full body';const pool=pools[key];return {name,exercises:pool.slice(0,key==='Full body'?6:5).map((e,j)=>({...e,sets:Math.max(2,Math.round((j<2?4:3)*volumeFactor))}))}});
  return {score,deload,volumeFactor,sessions,progressions};
}

const coachOverlay=document.createElement('div');coachOverlay.className='coach-program-overlay';coachOverlay.innerHTML=`<div class="coach-program"><button class="coach-program-close">×</button><section class="coach-intro"><span class="coach-spark">✦</span><p class="overline">PROGRAMACIÓN FT COACH</p><h2>Tu plan cambia contigo.</h2><p>FT Coach revisa tu historial cada semana y aplica reglas de progresión y recuperación. No elige ejercicios al azar.</p><div class="coach-factors"><span>Historial de cargas</span><span>Adherencia</span><span>Sueño y estrés</span><span>Descansos</span></div><button class="coach-start">Quiero empezar mi programación →</button><small>Fernando puede revisar, modificar o detener cualquier propuesta.</small></section><section class="coach-setup" hidden><p class="overline">REVISIÓN SEMANAL</p><h2>Antes de generar tu semana</h2><div class="readiness-form"><label>Días disponibles<select id="coach-days"><option>2</option><option>3</option><option selected>4</option><option>5</option></select></label><label>Horas de sueño<input id="coach-sleep" type="number" value="7.2" min="3" max="10" step=".1"></label><label>Agujetas / fatiga<select id="coach-soreness"><option value="1">Muy poca</option><option value="2">Normal</option><option value="3" selected>Moderada</option><option value="5">Alta</option></select></label><label>Estrés<select id="coach-stress"><option value="1">Bajo</option><option value="2" selected>Normal</option><option value="4">Alto</option><option value="6">Muy alto</option></select></label><label class="pain-check"><input id="coach-pain" type="checkbox"> Tengo dolor articular o una molestia nueva</label></div><button class="coach-generate">Generar semana con mis datos</button></section><section class="coach-plan" hidden></section></div>`;document.body.appendChild(coachOverlay);
const invite=document.createElement('article');invite.className='client-card coach-program-invite';invite.innerHTML='<span>✦</span><div><p>PROGRAMACIÓN FT COACH</p><b>¿Quieres empezar un plan que se adapte cada semana a tus resultados?</b><button>Descubrir mi programación →</button></div>';document.querySelector('aside').prepend(invite);
function openCoach(){coachOverlay.classList.add('open')}invite.querySelector('button').onclick=openCoach;document.querySelectorAll('.mobile-nav button')[1].onclick=openCoach;coachOverlay.querySelector('.coach-program-close').onclick=()=>coachOverlay.classList.remove('open');
coachOverlay.querySelector('.coach-start').onclick=()=>{coachOverlay.querySelector('.coach-intro').hidden=true;coachOverlay.querySelector('.coach-setup').hidden=false};
coachOverlay.querySelector('.coach-generate').onclick=()=>{ftAthlete.days=Number(document.getElementById('coach-days').value);ftAthlete.readiness.sleep=Number(document.getElementById('coach-sleep').value);ftAthlete.readiness.soreness=Number(document.getElementById('coach-soreness').value);ftAthlete.readiness.stress=Number(document.getElementById('coach-stress').value);ftAthlete.readiness.pain=document.getElementById('coach-pain').checked?1:0;const week=buildWeek(ftAthlete),plan=coachOverlay.querySelector('.coach-plan');coachOverlay.querySelector('.coach-setup').hidden=true;plan.hidden=false;plan.innerHTML=`<div class="plan-head"><div><p class="overline">SEMANA ${ftAthlete.weeksInBlock+1}</p><h2>${week.deload?'Semana de descarga':'Bloque de hipertrofia'}</h2><p>Disposición física: <b>${week.score}/100</b> · Adherencia: <b>${Math.round(ftAthlete.adherence*100)}%</b></p></div><span class="readiness-score">${week.score}<small>PREPARACIÓN</small></span></div>${ftAthlete.readiness.pain?'<div class="coach-alert">Has indicado dolor. Las cargas quedan congeladas y Fernando recibirá una alerta antes de activar el plan.</div>':''}<div class="week-sessions">${week.sessions.map((s,i)=>`<article><header><span>DÍA ${i+1}</span><b>${s.name}</b></header>${s.exercises.map(e=>`<div class="planned-exercise"><span><b>${e.name}</b><small>${e.sets} × ${e.target[0]}–${e.target[1]} · RIR 2</small></span><strong>${e.load} kg<small class="action-${e.action.toLowerCase()}">${e.action}</small></strong><i title="${e.reason}">i</i></div>`).join('')}</article>`).join('')}</div><div class="coach-reasons"><b>Decisiones de esta semana</b>${week.progressions.slice(0,4).map(e=>`<p><span>${e.name}</span>${e.reason}</p>`).join('')}</div><button class="coach-accept">Solicitar revisión de Fernando</button>`};
window.ftCoach={buildWeek,readinessScore,progression};
