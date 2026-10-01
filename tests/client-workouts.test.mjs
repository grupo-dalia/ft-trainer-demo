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
  const host = { innerHTML: '', querySelectorAll: () => [], querySelector: () => ({}) };
  const db = database([{ data: [{ id:'s1', planned_for:'2026-09-30', completed_at:'2026-09-30', routines:{name:'Torso'} }] }, { data:[{session_id:'s1',exercise_id:'e1',set_number:2,exercises:{name:'Press banca'},completed:true,weight_kg:20,reps:10}] }]);
  const context = vm.createContext({db,clientId:'client1',host,setTimeout,clearTimeout,esc:String});
  vm.runInContext(checked + extract('  function renderHistorySets', '  let clientExerciseLibrary'), context);
  await vm.runInContext('renderWorkoutHistory(host)', context);
  assert.match(host.innerHTML, /Torso/);
  assert.match(host.innerHTML, /Press banca/);
  assert.match(host.innerHTML, /Serie 2/);
  assert.match(host.innerHTML, /20 kg × 10/);
  assert.match(host.innerHTML, /Ver ejercicios y series/);
  assert.match(host.innerHTML, /1 series · 200 kg/);
  context.db = { from() { throw new Error('offline'); } };
  await vm.runInContext('renderWorkoutHistory(host)', context);
  assert.match(host.innerHTML, /Reintentar/);
  assert.doesNotMatch(host.innerHTML, /Cargando historial/);
});

test('a new session only reuses unfinished sessions', async () => {
  const db = database([{data:null},{data:{id:'new-session'}}]);
  const context = vm.createContext({db,clientId:'client1',sessionId:null,sessionCompleted:false,routine:{id:'r1'},selectedItem:{item:{day_number:1}},sessionStartedAt:0,selectedRoutineDay:1});
  vm.runInContext(extract('  function localDate', '  function elapsedWorkoutTime') + extract('  async function ensureSession', '  const oldSave'), context);
  assert.equal(await vm.runInContext('ensureSession()', context), 'new-session');
  assert.ok(db.calls[0].operations.some(op => op[0] === 'is' && op[1] === 'completed_at' && op[2] === null));
  assert.ok(db.calls[0].operations.some(op => op[0] === 'eq' && op[1] === 'day_number' && op[2] === 1));
  assert.equal(db.calls[1].operations[0][0], 'insert');
});

function saveHarness({checked=[true,false,false], weights=['40','',''], reps=['10','',''], error=null, finishError=null}={}) {
  const inputs={
    '.live-reps': reps.map(value=>({value})),
    '.live-weight': weights.map(value=>({value})),
    '.live-rir': reps.map(()=>({value:''})),
    '.live-set-type': reps.map(()=>({value:'normal'})),
    '.live-complete': checked.map(checked=>({checked}))
  };
  const rows=reps.map((_,i)=>({querySelector:key=>inputs[key][i]}));
  const button={cloneNode(){return button;},replaceWith(){}};
  const state={done:false,messages:[],writes:[],rest:[]};
  const row={classList:{toggle(_,value){state.done=value;}},querySelector:()=>({})};
  const db=database([{data:[],error},{data:[],error:finishError}]);
  const context=vm.createContext({db,sessionId:'session-active',sessionCompleted:false,workoutTimerId:null,
    workoutPausedAt:null,selectedItem:{item:{id:'item1',exercise_id:'ex1',target_sets:3,rest_seconds:0},row},
    dirtyExercises:new Set(),completedExerciseIds:new Set(),ensureSession:async()=>'session-active',elapsedWorkoutTime:()=>60000,
    updateWorkoutProgress:done=>({total:1,percent:done*100}),startRestTimer:seconds=>state.rest.push(seconds),toast:message=>state.messages.push(message),clearInterval(){},
    document:{body:{classList:{contains:()=>true,remove(){}}},getElementById:id=>id==='routine-recent-history'?null:id==='save-set'?button:{classList:{remove(){}},querySelectorAll:selector=>selector==='.hevy-set-row'?rows:inputs[selector]},querySelectorAll:selector=>selector==='.hevy-set-row'?rows:selector==='.live-exercise.done'?(state.done?[row]:[]):selector==='.save-inline-exercise'?[]:inputs[selector]}
  });
  vm.runInContext(extract('  const oldSave', '  async function getWorkoutShareData'),context);
  return {button,state,db,context};
}

test('saving one of three sets keeps the exercise incomplete', async()=>{
  const h=saveHarness();await h.button.onclick();
  assert.equal(h.state.done,false);
  assert.equal(h.context.sessionCompleted,false);
  assert.equal(h.db.calls.length,1);
});

test('saving an inline exercise reads only its own form, never other visible exercises', async()=>{
  const h=saveHarness({weights:['47','',''],reps:['11','','']});
  h.context.document.querySelectorAll=selector=>{
    if(selector==='.live-exercise.done')return [];
    if(selector==='.save-inline-exercise')return [];
    throw new Error('Attempted to read another exercise: '+selector);
  };
  await h.button.onclick();
  const values=h.db.calls[0].operations.find(op=>op[0]==='upsert')[1];
  assert.equal(values.length,3);
  assert.equal(values[0].weight_kg,47);
  assert.equal(values[0].reps,11);
  assert.equal(values[0].exercise_id,'ex1');
});

test('unchecking stored sets persists completed=false without retaining their volume', async()=>{
  const h=saveHarness({checked:[false,false,false]});await h.button.onclick();
  const logs=h.db.calls[0].operations.find(op=>op[0]==='upsert')[1];
  assert.equal(logs.length,3);
  assert.ok(logs.every(log=>!log.completed && log.weight_kg===null && log.reps===null));
});

test('negative or nonnumeric weights cannot reach the database',async()=>{
  for(const weight of ['-5','abc']){
    const h=saveHarness({weights:[weight,'','']});await h.button.onclick();
    assert.equal(h.db.calls.length,0);
    assert.equal(h.button.disabled,false);
  }
});

test('all completed sets finish a workout but update errors never report completion',async()=>{
  const h=saveHarness({checked:[true,true,true],reps:['10','10','10'],weights:['40','40','40']});
  await h.button.onclick();assert.equal(h.context.sessionCompleted,true);assert.equal(h.db.calls.length,2);
  const failed=saveHarness({checked:[true,true,true],reps:['10','10','10'],finishError:{message:'offline'}});
  await failed.button.onclick();assert.equal(failed.context.sessionCompleted,false);assert.match(failed.state.messages.at(-1),/No se pudo guardar/);
});

test('paused elapsed time remains frozen',()=>{
  const context=vm.createContext({workoutPausedAt:5000,sessionStartedAt:1000});
  vm.runInContext(extract('  function elapsedWorkoutTime','  function updateWorkoutClock'),context);
  assert.equal(vm.runInContext('elapsedWorkoutTime()',context),4000);
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
  const context=vm.createContext({db,clientId:'c1',sessionId:null,sessionCompleted:false,selectedItem:null,save:{},setTimeout,clearTimeout,toast(){},icon:()=>'',
    document:{body:{classList:{contains:()=>true}},getElementById:id=>id==='set-sheet'?sheet:id==='sheet-title'?{}:null,querySelector:selector=>selector==='.last-record'?record:null}});
  vm.runInContext(checked+extract('  async function openExercise', '  async function ensureSession'),context);
  await vm.runInContext('openExercise({exercise_id:"e1",target_sets:3,target_reps_min:8,target_reps_max:12,exercises:{}}, {})',context);
  assert.match(record.innerHTML,/40 kg × 10/);
  assert.match(record.innerHTML,/60 kg × 6/);
  assert.ok(db.calls[1].operations.some(op=>op[0]==='select' && op[1].includes('reps')));
  assert.match(sets.innerHTML,/OBJETIVO · 8–12 REPS/);
  assert.match(sets.innerHTML,/type="number" min="1" max="1000" step="1" placeholder="8–12" value=""/);
  assert.doesNotMatch(sets.innerHTML,/type="checkbox" checked/);
  assert.ok(db.calls[0].operations.some(op=>op[0]==='eq' && op[1]==='workout_sessions.client_id' && op[2]==='c1'));
});

test('home routine button opens the routine panel', () => {
  let listener, opened=0;
  const context=vm.createContext({window:{ftClientSections:{showRoutines(){opened++;}}},document:{addEventListener:(_,fn)=>listener=fn,querySelectorAll:()=>[]}});
  vm.runInContext(fs.readFileSync(new URL('../client-navigation-fix.js',import.meta.url),'utf8'),context);
  listener({target:{closest:()=>({dataset:{homeAction:'routine'}})},preventDefault(){},stopImmediatePropagation(){}});
  assert.equal(opened,1);
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
  const context=vm.createContext({window:{},document:{createElement:()=>overlay,body:{appendChild(){}},querySelector:()=>({click(){}})},esc:String,selectedRoutineDay:1,routine:{id:'r1'},availableRoutines:[{id:'r1',source:'client',name:'Torso'}],personalFolders:[],routineItems:[],allRoutineItems:[],renderRoutine(){},resetSession(){},loadRoutineItems:async()=>{context.allRoutineItems=[...savedItems];},restoreTodaySession:async()=>{},toast(){},checkedQuery:async q=>q,db:{rpc:(name,args)=>{payload=args;savedItems.push({exercise_id:args.p_exercise,day_number:args.p_day});return 'id';}},FormData:class{constructor(form){this.form=form;}get(key){return this.form.values[key];}}});
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
