import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('../client-sections.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function extract(start, end) { return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))); }
function database(results) {
  const calls = [];
  return { calls, from(table) {
    const call = { table, operations: [] }; calls.push(call);
    const response = results.shift();
    const query = new Proxy({}, { get(_, key) {
      if (key === 'then') return (resolve, reject) => Promise.resolve(response).then(resolve, reject);
      return (...args) => { call.operations.push([key, ...args]); return query; };
    }});
    return query;
  }};
}
const checked = extract('  async function checkedQuery', '  function formatWorkoutTime');
test('history renders sessions and volume, and offers retry on rejected queries', async () => {
  const now=new Date(), previous=new Date(now.getFullYear(),now.getMonth(),now.getDate()-1),
    date=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`,
    previousDate=`${previous.getFullYear()}-${String(previous.getMonth()+1).padStart(2,'0')}-${String(previous.getDate()).padStart(2,'0')}`;
  const dayButton={dataset:{historyDate:date}}, showAll={};
  const host={innerHTML:'',querySelectorAll:selector=>selector==='[data-history-date]'?[dayButton]:[],querySelector:()=>showAll};
  let popup, removed=false;
  const closeButton={focus(){}};
  const document={activeElement:{focus(){}},createElement:()=>({innerHTML:'',querySelector:()=>closeButton,querySelectorAll:()=>[],remove(){removed=true;}}),
    body:{appendChild:node=>popup=node},addEventListener(){},removeEventListener(){}};
  const db = database([{ data: [{ id:'s1', planned_for:date, completed_at:date, routines:{name:'Torso'} },{id:'s2',planned_for:previousDate,completed_at:previousDate,routines:{name:'Pierna'}}] }, { data:[{session_id:'s1',exercise_id:'e1',set_number:2,exercises:{name:'Press banca'},completed:true,weight_kg:20,reps:10}] }]);
  const context = vm.createContext({db,clientId:'client1',host,document,setTimeout,clearTimeout,esc:String});
  vm.runInContext(checked + extract('  function renderHistorySets', '  let clientExerciseLibrary'), context);
  await vm.runInContext('renderWorkoutHistory(host)', context);
  assert.match(host.innerHTML, /Ver historial completo/);
  assert.doesNotMatch(host.innerHTML, /client-session-history/);
  dayButton.onclick();
  assert.match(popup.innerHTML, /Torso/);
  assert.match(popup.innerHTML, /Press banca/);
  assert.match(popup.innerHTML, /Serie 2/);
  assert.match(popup.innerHTML, /20 kg × 10/);
  assert.match(popup.innerHTML, /1 series · 200 kg/);
  assert.doesNotMatch(popup.innerHTML,/Pierna/);
  closeButton.onclick();
  assert.equal(removed,true);
  showAll.onclick();
  assert.match(popup.innerHTML,/Pierna/);
  context.db = { from() { throw new Error('offline'); } };
  await vm.runInContext('renderWorkoutHistory(host)', context);
  assert.match(host.innerHTML, /Reintentar/);
  assert.doesNotMatch(host.innerHTML, /Cargando historial/);
});

test('a new session only reuses unfinished sessions', async () => {
  const db = database([{data:null},{data:{id:'new-session'}}]);
  const context = vm.createContext({db,clientId:'client1',sessionId:null,sessionCompleted:false,routine:{id:'r1'},selectedItem:{item:{day_number:1}},sessionStartedAt:0,selectedRoutineDay:1,saveFreeDraft(){}});
  vm.runInContext(extract('  function localDate', '  function elapsedWorkoutTime') + extract('  async function ensureSession', '  let exerciseSaveInFlight'), context);
  assert.equal(await vm.runInContext('ensureSession()', context), 'new-session');
  assert.ok(db.calls[0].operations.some(op => op[0] === 'is' && op[1] === 'completed_at' && op[2] === null));
  assert.ok(db.calls[0].operations.some(op => op[0] === 'eq' && op[1] === 'day_number' && op[2] === 1));
  assert.equal(db.calls[1].operations[0][0], 'insert');
});

function saveHarness({checked=[true,false,false], weights=['40','',''], reps=['10','',''], rpes=['','',''], error=null, finishError=null}={}) {
  const inputs={
    '.live-reps': reps.map(value=>({value})),
    '.live-weight': weights.map(value=>({value})),
    '.live-rir': rpes.map(value=>({value})),
    '.live-set-type': reps.map(()=>({value:'normal'})),
    '.live-complete': checked.map(checked=>({checked}))
  };
  const rows=reps.map((_,i)=>({querySelector:key=>inputs[key][i]}));
  const state={done:false,messages:[],writes:[],rest:[]};
  const row={classList:{toggle(_,value){state.done=value;}},querySelector:()=>({})};
  const db=database([{data:[],error},{data:[],error:finishError}]);
  const scope={dataset:{recordsFailed:'false'},querySelectorAll:selector=>selector==='.hevy-set-row'?rows:inputs[selector]};
  const context=vm.createContext({db,sessionId:'session-active',sessionCompleted:false,workoutTimerId:null,
    workoutPausedAt:null,selectedItem:{item:{id:'item1',exercise_id:'ex1',target_sets:3,rest_seconds:0},row},
    dirtyExercises:new Set(),completedExerciseIds:new Set(),ensureSession:async()=>'session-active',elapsedWorkoutTime:()=>60000,
    updateWorkoutProgress:done=>({total:1,percent:done*100}),startRestTimer:seconds=>state.rest.push(seconds),toast:message=>state.messages.push(message),clearInterval(){},
    document:{body:{classList:{contains:()=>true,remove(){}}},getElementById:()=>null,querySelectorAll:selector=>selector==='.live-exercise.done'?(state.done?[row]:[]):[]}
  });
  vm.runInContext(extract('  let exerciseSaveInFlight', '  async function getWorkoutShareData'),context);
  return {scope,state,db,context,save:()=>vm.runInContext('persistExercise(selectedItem, scope)',Object.assign(context,{scope}))};
}

test('saving one of three sets keeps the exercise incomplete', async()=>{
  const h=saveHarness();await h.save();
  assert.equal(h.state.done,false);
  assert.equal(h.context.sessionCompleted,false);
  assert.equal(h.db.calls.length,1);
});

test('saving an inline exercise reads only its own form, never other visible exercises', async()=>{
  const h=saveHarness({weights:['47','',''],reps:['11','','']});
  h.context.document.querySelectorAll=selector=>selector==='.live-exercise.done'?[]:(()=>{throw new Error('Attempted to read another exercise: '+selector);})();
  await h.save();
  const values=h.db.calls[0].operations.find(op=>op[0]==='upsert')[1];
  assert.equal(values.length,3);
  assert.equal(values[0].weight_kg,47);
  assert.equal(values[0].reps,11);
  assert.equal(values[0].exercise_id,'ex1');
});

test('unchecking stored sets persists completed=false without retaining their volume', async()=>{
  const h=saveHarness({checked:[false,false,false]});await h.save();
  const logs=h.db.calls[0].operations.find(op=>op[0]==='upsert')[1];
  assert.equal(logs.length,3);
  assert.ok(logs.every(log=>!log.completed && log.weight_kg===null && log.reps===null));
});

test('negative or nonnumeric weights cannot reach the database',async()=>{
  for(const weight of ['-5','abc']){
    const h=saveHarness({weights:[weight,'','']});await h.save();
    assert.equal(h.db.calls.length,0);
    assert.match(h.state.messages.at(-1),/Revisa/);
  }
});

test('RPE is converted to RIR when saving a completed set',async()=>{
  const h=saveHarness({rpes:['8','','']});
  await h.save();
  const logs=h.db.calls[0].operations.find(op=>op[0]==='upsert')[1];
  assert.equal(logs[0].rir,2);
});

test('a fractional RPE is rejected because stored RIR is an integer',async()=>{
  const h=saveHarness({rpes:['7.5','','']});
  await h.save();
  assert.equal(h.db.calls.length,0);
});

test('all completed sets stay open until the user finishes the workout',async()=>{
  const h=saveHarness({checked:[true,true,true],reps:['10','10','10'],weights:['40','40','40']});
  await h.save();assert.equal(h.context.sessionCompleted,false);assert.equal(h.db.calls.length,1);
});

test('paused elapsed time remains frozen',()=>{
  const context=vm.createContext({workoutPausedAt:5000,sessionStartedAt:1000});
  vm.runInContext(extract('  function elapsedWorkoutTime','  function updateWorkoutClock'),context);
  assert.equal(vm.runInContext('elapsedWorkoutTime()',context),4000);
});

test('the displayed timer stays frozen after a workout finishes',()=>{
  let now=10000;
  const clock={textContent:''},pause={},finish={};
  const context=vm.createContext({Date:{now:()=>now},sessionStartedAt:1000,workoutPausedAt:null,workoutTimerId:1,restTimerId:2,
    clearInterval(){},document:{querySelector:()=>null,body:{classList:{remove(){},add(){},contains:()=>true}},getElementById:id=>id==='live-workout-time'?clock:id==='pause-live-workout'?pause:finish}});
  vm.runInContext(extract('  function finishWorkoutClock','  function resetSession')+extract('  function formatWorkoutTime','  function startRestTimer'),context);
  vm.runInContext('finishWorkoutClock()',context);
  assert.equal(clock.textContent,'00:00:09');
  assert.equal(finish.disabled,true);
  now=20000;
  vm.runInContext('updateWorkoutClock()',context);
  assert.equal(clock.textContent,'00:00:09');
});

test('restoring a partial session does not mark the entire exercise complete',async()=>{
  let progress=-1;
  const db=database([{data:{id:'s1',started_at:'2026-09-30T10:00:00Z'}},{data:[{exercise_id:'e1'}]}]);
  const context=vm.createContext({db,clientId:'c1',routine:{id:'r1'},selectedRoutineDay:1,sessionId:null,sessionStartedAt:0,
    allRoutineItems:[{exercise_id:'e1',target_sets:3}],routineItems:[{exercise_id:'e1',target_sets:3}],completedExerciseIds:new Set(),
    startWorkoutClock(){},updateWorkoutProgress:value=>progress=value,document:{querySelectorAll:()=>[]}});
  vm.runInContext(extract('  function localDate','  function elapsedWorkoutTime')+extract('  async function restoreTodaySession','  async function openExercise'),context);
  await vm.runInContext('restoreTodaySession()',context);
  assert.equal(progress,0);
  assert.equal(context.sessionId,'s1');
  assert.ok(db.calls[1].operations.some(op=>op[0]==='eq'&&op[1]==='completed'&&op[2]===true));
});

test('new sets are blank and unchecked, with previous performance visible', async () => {
  const sets = {innerHTML:'',classList:{add(){}},querySelector:()=>({}),querySelectorAll:()=>[]};
  const record = {innerHTML:''};
  const sheet = {querySelector:()=>sets,classList:{add(){}}};
  const db=database([{data:[{session_id:'old',set_number:1,reps:10,weight_kg:40}]},{data:[{weight_kg:60,reps:6}]}]);
  const context=vm.createContext({db,clientId:'c1',sessionId:null,sessionCompleted:false,selectedItem:null,save:{},setTimeout,clearTimeout,toast(){},icon:()=>'',updateWorkoutStats(){},
    document:{body:{classList:{contains:()=>true}},getElementById:id=>id==='set-sheet'?sheet:id==='sheet-title'?{}:null,querySelector:selector=>selector==='.last-record'?record:null}});
  vm.runInContext(checked+extract('  async function openExercise', '  async function ensureSession'),context);
  await vm.runInContext('openExercise({exercise_id:"e1",target_sets:3,target_reps_min:8,target_reps_max:12,exercises:{}}, {})',context);
  assert.match(record.innerHTML,/40 kg × 10/);
  assert.match(record.innerHTML,/60 kg × 6/);
  assert.ok(db.calls[1].operations.some(op=>op[0]==='select' && op[1].includes('reps')));
  assert.match(sets.innerHTML,/OBJETIVO · 8–12 REPS/);
  assert.match(sets.innerHTML,/<option value="normal">1<\/option><option value="warmup">C<\/option>/);
  assert.doesNotMatch(sets.innerHTML,/<option value="(?:drop|failure)">/);
  assert.match(sets.innerHTML,/type="number" min="1" max="1000" step="1" placeholder="8–12" value=""/);
  assert.doesNotMatch(sets.innerHTML,/type="checkbox" checked/);
  for(const n of [1,2,3])assert.ok(sets.innerHTML.includes(`<option value="normal">${n}</option>`));
  assert.ok(db.calls[0].operations.some(op=>op[0]==='eq' && op[1]==='workout_sessions.client_id' && op[2]==='c1'));
});

test('the workout clock starts on the first set edit, not when the exercise opens', async () => {
  let starts = 0;
  const sets = {innerHTML:'',classList:{add(){}},querySelector:()=>({}),querySelectorAll:()=>[]};
  const sheet = {querySelector:()=>sets,classList:{add(){}}};
  const db=database([{data:[]},{data:[]}]);
  const context=vm.createContext({db,clientId:'c1',sessionId:null,sessionCompleted:false,selectedItem:null,save:{},setTimeout,clearTimeout,
    dirtyExercises:new Set(),toast(){},icon:()=>'',updateWorkoutStats(){},startWorkoutClock(){starts++;},
    document:{body:{classList:{contains:()=>false}},getElementById:id=>id==='set-sheet'?sheet:id==='sheet-title'?{}:null,querySelector:()=>null}});
  vm.runInContext(checked+extract('  async function openExercise', '  async function ensureSession'),context);
  await vm.runInContext('openExercise({exercise_id:"e1",target_sets:3,exercises:{}}, {})',context);
  assert.equal(starts,0);
  sheet.oninput();
  assert.equal(starts,1);
  assert.equal(context.dirtyExercises.has('e1'),true);
});

test('the routine hub offers a way back to the separate active workout screen', () => {
  const classes=new Set();
  const label={textContent:''},hint={textContent:''};
  const button={hidden:false,disabled:false,querySelector:selector=>selector==='b'?label:hint};
  const title={textContent:''},detail={textContent:''},eyebrow={textContent:''};
  const intro={querySelector:selector=>({'h2':title,'p':detail,'small':eyebrow,'#begin-live-workout':button})[selector]};
  let routineClicks=0,scrolls=0;
  const panel={classList:{toggle:(name,on)=>on?classes.add(name):classes.delete(name),contains:name=>classes.has(name)},querySelector:selector=>
    selector==='[data-workout-view="routines"]'?{click(){routineClicks++;}}:{scrollIntoView(){scrolls++;}}};
  const context=vm.createContext({routine:{name:'Pectorales'},routineItems:[{exercise_id:'e1'}],completedExerciseIds:new Set(),sessionId:'s1',sessionCompleted:false,
    window:{ftMembershipActive:true},document:{querySelector:()=>intro,getElementById:()=>panel,body:{classList:{contains:()=>true}}},
    ensureWorkoutToolbar(){},updateWorkoutClock(){},updateWorkoutStats(){}});
  vm.runInContext(extract('  function updateWorkoutEntry', '  function startWorkoutClock'),context);
  vm.runInContext('setWorkoutFocus(false)',context);
  assert.equal(classes.has('workout-hub'),true);
  assert.equal(label.textContent,'Volver al entrenamiento');
  assert.equal(title.textContent,'Pectorales');
  vm.runInContext('setWorkoutFocus(true)',context);
  assert.equal(classes.has('workout-focus'),true);
  assert.equal(classes.has('workout-hub'),false);
  assert.equal(routineClicks,1);
  assert.equal(scrolls,1);
});

test('home routine button opens the routine panel', () => {
  let listener;
  const openings=[];
  const context=vm.createContext({window:{ftClientSections:{showRoutines:options=>openings.push(options)}},document:{addEventListener:(_,fn)=>listener=fn,querySelectorAll:()=>[]}});
  vm.runInContext(fs.readFileSync(new URL('../client-navigation-fix.js',import.meta.url),'utf8'),context);
  for (const workoutEntry of ['hub',undefined]) {
    listener({target:{closest:()=>({dataset:{homeAction:'routine',workoutEntry}})},preventDefault(){},stopImmediatePropagation(){}});
  }
  assert.deepEqual(openings.map(options=>options.focus),[false,true]);
});

test('the two highlighted home actions open the routine hub', () => {
  const openings=[];
  const start={},next={},quick={dataset:{homeAction:'routine',workoutEntry:'hub'}};
  const context=vm.createContext({window:{ftClientSections:{showRoutines:options=>openings.push(options)}},document:{
    getElementById:id=>id==='start-training'?start:next,querySelectorAll:()=>[quick]}});
  const home=fs.readFileSync(new URL('../client-home.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  vm.runInContext(home.slice(home.indexOf('  const scrollRoutine'),home.indexOf('  const notifications')),context);
  start.onclick();quick.onclick();next.onclick();
  assert.deepEqual(openings.map(options=>options?.focus),[false,false,undefined]);
});

test('routine history scopes the latest sessions to the client, routine and day', async()=>{
  const host={innerHTML:'',hidden:false};
  const db=database([
    {data:[{id:'last',planned_for:'2026-09-28',completed_at:'2026-09-28T12:00:00Z',duration_minutes:45}]},
    {data:[{session_id:'last',exercise_id:'e1',set_number:1,reps:11,weight_kg:42.5,exercises:{name:'Press <test>'}},{session_id:'last',exercise_id:'e1',set_number:2,reps:9,weight_kg:45,exercises:{name:'Press <test>'}}]}
  ]);
  const context=vm.createContext({db,host,routine:{id:'r1'},clientId:'c1',selectedRoutineDay:2,routineHistoryRequest:0,allRoutineItems:[],setTimeout,clearTimeout,icon:()=>'',esc:v=>String(v).replaceAll('<','&lt;').replaceAll('>','&gt;')});
  vm.runInContext(checked+extract('  async function renderRoutineHistory','  function ensureShareButton'),context);
  await vm.runInContext('renderRoutineHistory(host)',context);
  assert.match(host.innerHTML,/Tu ultima sesion/);
  assert.match(host.innerHTML,/<details class="routine-history-toggle"><summary>Ver historial del día 2/);
  assert.doesNotMatch(host.innerHTML,/<details[^>]*\sopen(?:\s|>)/);
  assert.match(host.innerHTML,/42.5 kg/);
  assert.match(host.innerHTML,/× 11/);
  assert.match(host.innerHTML,/× 9/);
  assert.match(host.innerHTML,/Press &lt;test&gt;/);
  for(const [key,value] of [['client_id','c1'],['routine_id','r1'],['day_number',2]]) assert.ok(db.calls[0].operations.some(op=>op[0]==='eq'&&op[1]===key&&op[2]===value));
  assert.ok(db.calls[1].operations.some(op=>op[0]==='eq'&&op[1]==='completed'&&op[2]===true));
});

test('routine history handles a first session and offers retry after a query error', async()=>{
  const host={innerHTML:'',hidden:false};
  const context=vm.createContext({db:database([{data:[]}]),host,routine:{id:'r1'},clientId:'c1',selectedRoutineDay:1,routineHistoryRequest:0,setTimeout,clearTimeout,
    showLoadError:host=>{host.innerHTML='Reintentar';}});
  vm.runInContext(checked+extract('  async function renderRoutineHistory','  function ensureShareButton'),context);
  await vm.runInContext('renderRoutineHistory(host)',context);
  assert.match(host.innerHTML,/primera marca/);
  context.db=database([{error:{message:'offline'}}]);
  await vm.runInContext('renderRoutineHistory(host)',context);
  assert.equal(host.innerHTML,'Reintentar');
});

test('exercise configuration persists the chosen routine, day, position and zero rest', async () => {
  const feedback={},button={},destination={value:'r1'},savedItems=[];let payload;
  const form={};const overlay={innerHTML:'',querySelector:s=>s==='form'?form:s==='[name="destination"]'?destination:button,remove(){}};
  const context=vm.createContext({window:{},document:{createElement:()=>overlay,body:{appendChild(){}},querySelector:()=>({click(){}})},esc:String,selectedRoutineDay:1,routine:{id:'r1'},availableRoutines:[{id:'r1',source:'client',name:'Torso'}],personalFolders:[],routineItems:[],allRoutineItems:[],isFreeWorkout:()=>false,renderRoutine(){},resetSession(){},loadRoutineItems:async()=>{context.allRoutineItems=[...savedItems];},restoreTodaySession:async()=>{},toast(){},checkedQuery:async q=>q,db:{rpc:(name,args)=>{payload=args;savedItems.push({exercise_id:args.p_exercise,day_number:args.p_day});return 'id';}},FormData:class{constructor(form){this.form=form;}get(key){return this.form.values[key];}}});
  vm.runInContext(extract('  function openLibraryExercise', '  function weekKey'),context);
  vm.runInContext('openLibraryExercise({database:{id:"e1",name:"Press"},instrucciones:[]})',context);
  const submitted={values:{day:'2',position:'1',sets:'4',min:'8',max:'12',rest:'0'},querySelector:s=>s==='.form-feedback'?feedback:button};
  await form.onsubmit({preventDefault(){},currentTarget:submitted});
  assert.equal(payload.p_routine,'r1');assert.equal(payload.p_day,2);assert.equal(payload.p_position,1);assert.equal(payload.p_sets,4);assert.equal(payload.p_min,8);assert.equal(payload.p_max,12);assert.equal(payload.p_rest,0);
  vm.runInContext('openLibraryExercise({database:{id:"e2",name:"Remo"},instrucciones:[]})',context);
  submitted.values.position='2';await form.onsubmit({preventDefault(){},currentTarget:submitted});
  assert.equal(savedItems.length,2);assert.deepEqual(savedItems.map(item=>item.exercise_id),['e1','e2']);
  assert.equal(context.routineItems.length,2);
});

test('routine history is placed after the exercise list',()=>{assert.match(fs.readFileSync(new URL('../client-sections.js',import.meta.url),'utf8'),/getElementById\("exercise-list"\)\.after\(historyHost\)/);});
test('a free workout keeps several exercises and persists its draft', () => {
  const stored = new Map();
  const context = vm.createContext({clientId:'c1',routine:{id:null,name:'Entrenamiento libre'},allRoutineItems:[],routineItems:[],sessionId:null,sessionStartedAt:100,selectedRoutineDay:1,
    localStorage:{setItem:(key,value)=>stored.set(key,value),removeItem:key=>stored.delete(key)},document:{querySelector:()=>null,body:{classList:{remove(){}}}},clearInterval(){},setInterval(){}});
  vm.runInContext(extract('  const freeDraftKey', '  async function checkedQuery') + extract('  async function startFreeWorkout', '  function renderRoutinePicker'), context);
  assert.equal(vm.runInContext('addFreeExercise({id:"e1",name:"Press"})',context),true);
  assert.equal(vm.runInContext('addFreeExercise({id:"e2",name:"Remo"})',context),true);
  assert.equal(vm.runInContext('addFreeExercise({id:"e1",name:"Press"})',context),false);
  assert.deepEqual(JSON.parse(stored.get('ft-free-workout-c1')).items.map(item=>item.exercise_id),['e1','e2']);
  assert.equal(context.routineItems.length,2);
});

test('batch save adds selected exercises to the chosen routine and skips duplicates', async () => {
  const calls=[];
  const db={from:()=>({select:()=>({eq:()=>({eq:()=>Promise.resolve({data:[{exercise_id:'e1',position:2}]})})})}),
    rpc:(name,args)=>{calls.push({name,args});return Promise.resolve({data:'id'});}};
  const context=vm.createContext({db,setTimeout,clearTimeout});
  vm.runInContext(checked+extract('  async function addExercisesToSavedRoutine','  function openBulkExerciseDestination'),context);
  const added=await vm.runInContext('addExercisesToSavedRoutine([{id:"e1"},{id:"e2"},{id:"e3"}],"routine-1",2)',context);
  assert.equal(added,2);
  assert.deepEqual(calls.map(call=>call.args.p_exercise),['e2','e3']);
  assert.deepEqual(calls.map(call=>call.args.p_position),[3,4]);
  assert.ok(calls.every(call=>call.name==='ft_add_personal_exercise'&&call.args.p_routine==='routine-1'&&call.args.p_day===2));
});

test('finalizing a routine completes the session and stops the clock only after the write succeeds', async () => {
  for (const failure of [false,true]) {
    const db=database([{error:failure?{message:'offline'}:null}]);
    const messages=[];
    let stopped=false;
    const context=vm.createContext({db,sessionId:'s1',sessionCompleted:false,routine:{id:'r1'},exerciseSaveInFlight:false,dirtyExercises:new Set(),elapsedWorkoutTime:()=>90000,confirm:()=>true,
      finishWorkoutClock(){stopped=true;},updateWorkoutEntry(){},isFreeWorkout:()=>false,clearFreeDraft(){},toast:message=>messages.push(message),document:{getElementById:()=>null,querySelectorAll:()=>[]}});
    vm.runInContext(extract('  async function finishWorkout', '  function showRoutines'),context);
    await vm.runInContext('finishWorkout()',context);
    assert.equal(context.sessionCompleted,!failure);
    assert.equal(stopped,!failure);
    assert.equal(db.calls[0].operations.find(op=>op[0]==='update')[1].duration_minutes,2);
  }
});

test('finishing with incomplete sets warns and saves edited sets before closing', async () => {
  const h=saveHarness();
  h.context.dirtyExercises.add('ex1');
  h.context.routineItems=[h.context.selectedItem.item];
  h.context.document.querySelectorAll=selector=>selector==='#exercise-list .hevy-set-row'?
    [{querySelector:()=>({checked:true})},{querySelector:()=>({checked:false})}]:
    selector==='.live-exercise'?[Object.assign(h.context.selectedItem.row,{dataset:{liveIndex:'0'},querySelector:key=>key==='.inline-registration'?h.scope:{}})]:
    selector==='.live-exercise.done'?[]:[];
  let warning='';
  h.context.confirm=text=>{warning=text;return true;};
  h.context.finishWorkoutClock=()=>{};
  h.context.updateWorkoutEntry=()=>{};
  h.context.isFreeWorkout=()=>false;
  vm.runInContext(extract('  async function finishWorkout', '  function openWorkoutSettings'),h.context);
  await vm.runInContext('finishWorkout()',h.context);
  assert.match(warning,/1 series sin completar/);
  assert.equal(h.db.calls[0].table,'set_logs');
  assert.equal(h.db.calls[1].table,'workout_sessions');
  assert.equal(h.context.sessionCompleted,true);
});

test('rest timer floats, counts down and can be skipped', () => {
  let now=1000, tick, box, removed=false;
  const time={textContent:''},label={textContent:''},skip={};
  const context=vm.createContext({restTimerId:null,sessionCompleted:false,Date:{now:()=>now},navigator:{},
    clearInterval(){},setInterval:fn=>{tick=fn;return 1;},
    document:{querySelector:()=>box,createElement:()=>({className:'',setAttribute(){},remove(){removed=true;},querySelector:key=>key==='button'?skip:key==='.live-rest-time'?time:label,classList:{add(){}}}),body:{appendChild:node=>box=node}}});
  vm.runInContext(extract('  function startRestTimer', '  function ensureWorkoutToolbar'),context);
  vm.runInContext('startRestTimer(90)',context);
  assert.equal(box.className,'live-rest-timer');
  assert.equal(time.textContent,'1:30');
  now=32000;tick();assert.equal(time.textContent,'0:59');
  skip.onclick();assert.equal(removed,true);
});

test('supersets save several free workout exercises in the draft', async () => {
  const items=[{exercise_id:'a'},{exercise_id:'b'},{exercise_id:'c'}];
  let saved=0,rendered=0;
  const context=vm.createContext({routine:{id:null},routineItems:items,isFreeWorkout:()=>true,saveFreeDraft:()=>saved++,renderRoutine:()=>rendered++});
  vm.runInContext(extract('  function supersetStorageKey', '  function finishWorkoutClock'),context);
  await vm.runInContext('applySupersetGroups([{exercise_id:"a",superset_group:1},{exercise_id:"b",superset_group:1},{exercise_id:"c"}])',context);
  assert.deepEqual(items.map(item=>item.superset_group),[1,1,null]);
  assert.equal(saved,1);assert.equal(rendered,1);
});

test('personal routine supersets are sent to the authorized database function', async () => {
  let rpc;
  const items=[{id:'r1',exercise_id:'a'},{id:'r2',exercise_id:'b'}];
  const context=vm.createContext({routine:{id:'routine',source:'client'},selectedRoutineDay:2,routineItems:items,
    db:{rpc:(name,args)=>{rpc={name,args};return Promise.resolve({data:null});}},
    checkedQuery:async query=>(await query).data,renderRoutine(){},isFreeWorkout:()=>false});
  vm.runInContext(extract('  function supersetStorageKey', '  function finishWorkoutClock'),context);
  await vm.runInContext('applySupersetGroups([{id:"r1",superset_group:1},{id:"r2",superset_group:1}])',context);
  assert.equal(rpc.name,'ft_set_personal_supersets');
  assert.equal(rpc.args.p_day,2);
  assert.equal(rpc.args.p_groups.length,2);
});
