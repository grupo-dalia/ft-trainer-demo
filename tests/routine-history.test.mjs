import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const ctx=vm.createContext({Intl,Date});for(const file of ['exercise-progression.js','routine-history.js'])vm.runInContext(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),ctx);
const routine={id:'r',name:'Fuerza',routine_exercises:[{exercise_id:'press',day_number:1,target_sets:2,exercises:{name:'Press'}},{exercise_id:'row',day_number:2,target_sets:1,exercises:{name:'Remo'}}]};
const log=(session,date,kg,reps,routineId='r')=>({exercise_id:'press',session_id:session,set_number:1,weight_kg:kg,reps,completed:true,exercises:{name:'Press'},workout_sessions:{completed_at:date,routine_id:routineId,day_number:1}});
test('admin history separates routines and compares numbered series in weekly columns',()=>{const logs=[log('first','2026-10-06T10:00:00Z',30,10),log('second','2026-10-13T10:00:00Z',25,12),log('foreign','2026-10-13T10:00:00Z',999,999,'other')];const {html,weeks}=ctx.RoutineHistoryCore.routineTable(routine,logs);assert.equal(weeks.length,2);assert.match(html,/Sesión 1/);assert.match(html,/Sesión 2/);assert.doesNotMatch(html,/06\/10\/2026|13\/10\/2026/);assert.match(html,/compare-lower/);assert.match(html,/Remo/);assert.equal((html.match(/>Press<\/th>/g)||[]).length,1);assert.doesNotMatch(html,/999/);assert.doesNotMatch(html,/comparison-legend/);assert.match(html,/<td class="routine-weight-cell"><div class="routine-series-stack"><div class="series-values compare-lower"/);assert.match(html,/<h3>Día 1<\/h3>/);assert.match(html,/<h3>Día 2<\/h3>/);assert.match(html,/<th scope="col">KG<\/th><th scope="col">REPS<\/th>/);assert.equal(ctx.RoutineHistoryCore.routineTable(routine,logs,'2026-10-12').weeks.length,2)});
test('assigned routine without completed sessions remains visible with an explicit empty state',()=>{assert.match(ctx.RoutineHistoryCore.routineTable(routine,[]).html,/todavía no tiene entrenamientos/)});
test('user history keeps session rows and series columns with colored numbers only',()=>{const sessions=ctx.ExerciseProgressionCore.exercises([log('a','2026-10-06T10:00:00Z',30,10),log('b','2026-10-13T10:00:00Z',30,8)])[0].sessions;const {html}=ctx.ExerciseProgressionCore.comparisonTable(sessions,'2026-10-05');assert.match(html,/<td><div class="series-values compare-fewer">/);assert.doesNotMatch(html,/mobile-series-comparison|comparison-legend|<td class="compare-/);assert.match(html,/comparison-scroll-control/)});

test('admin weekly colors are independent: less weight red, fewer reps yellow independently of weight, gains green',()=>{
 const previous={date:'2026-10-06T10:00:00Z',routine_id:'r',day_number:1,sets:[{set_number:1,weight_kg:30,reps:10}]};
 const current={date:'2026-10-13T10:00:00Z',routine_id:'r',day_number:1};
 const check=(kg,reps)=>JSON.parse(JSON.stringify(ctx.RoutineHistoryCore.compareMetrics(current,{set_number:1,weight_kg:kg,reps},[previous])));
 assert.deepEqual(check(25,8),{weight:'lower',reps:'fewer'});
 assert.deepEqual(check(30,8),{weight:'none',reps:'fewer'});
 assert.deepEqual(check(35,12),{weight:'higher',reps:'higher'});
 assert.deepEqual(check(35,8),{weight:'higher',reps:'fewer'});
 assert.deepEqual(check(30,12),{weight:'none',reps:'higher'});
 assert.deepEqual(check(null,8),{weight:'none',reps:'fewer'});
 assert.deepEqual(JSON.parse(JSON.stringify(ctx.RoutineHistoryCore.compareMetrics({...current,day_number:2},{set_number:1,weight_kg:25,reps:8},[previous]))),{weight:'none',reps:'none'});
});
test('day grouping keeps routine exercise order and each weeks weight and reps in separate cells',()=>{
 const data=[log('first','2026-10-06T10:00:00Z',30,10),log('second','2026-10-13T10:00:00Z',30,8)];
 const html=ctx.RoutineHistoryCore.routineTable(routine,data).html;
 const dayOne=html.slice(html.indexOf('<h3>Día 1'),html.indexOf('<h3>Día 2'));
 assert.match(dayOne,/Press/);assert.doesNotMatch(dayOne,/Remo/);
 assert.match(html.slice(html.indexOf('<h3>Día 2')),/Remo/);
 assert.match(dayOne,/<td class="routine-reps-cell"><div class="routine-series-stack"><div class="series-values compare-fewer"[^>]*>/);
 assert.doesNotMatch(dayOne,/<td class="routine-weight-cell"><div class="series-values compare-fewer">/);
});

test('successive sessions in the same week get separate numbered columns and compare with the immediate predecessor',()=>{
 const logs=[log('one','2026-10-06T10:00:00Z',30,10),log('two','2026-10-07T10:00:00Z',35,12),log('three','2026-10-08T10:00:00Z',35,8)];
 const html=ctx.RoutineHistoryCore.routineTable(routine,logs).html;
 assert.match(html,/Sesión 3/);assert.match(html,/compare-higher/);assert.match(html,/compare-fewer/);assert.doesNotMatch(html,/Semana del|08\/10\/2026/);
});

test('session 3 example: 12 kg x 15 reps to 15 kg x 8 reps shows green kg and yellow reps',()=>{
 const html=ctx.RoutineHistoryCore.routineTable(routine,[log('one','2026-10-01T10:00:00Z',10,10),log('two','2026-10-06T10:00:00Z',12,15),log('three','2026-10-13T10:00:00Z',15,8)]).html;
 assert.match(html,/<td class="routine-weight-cell"><div class="routine-series-stack"><div class="series-values compare-higher"[^>]*><strong title="Más kilos que la sesión anterior">15<\/strong>/);
 assert.match(html,/<td class="routine-reps-cell"><div class="routine-series-stack"><div class="series-values compare-fewer"[^>]*><strong title="Menos repeticiones que la sesión anterior">8<\/strong>/);
});
test('previous-session dashes count as zero without inventing recorded values or a first-session baseline',()=>{
 const current={id:'now',date:'2026-10-13T10:00:00Z',routine_id:'r',day_number:1},set={set_number:1,weight_kg:10,reps:6};
 const previous={id:'before',date:'2026-10-06T10:00:00Z',routine_id:'r',day_number:1,sets:[]};
 const compare=sets=>JSON.parse(JSON.stringify(ctx.RoutineHistoryCore.compareMetrics(current,set,sets)));
 assert.deepEqual(compare([previous]),{weight:'higher',reps:'higher'});
 assert.deepEqual(compare([{...previous,sets:[{set_number:1,weight_kg:null,reps:8}]}]),{weight:'higher',reps:'fewer'});
 assert.deepEqual(compare([]),{weight:'none',reps:'none'});
 const earlier={...log('before',previous.date,20,10),exercise_id:'other',exercises:{name:'Otro'}};
 const html=ctx.RoutineHistoryCore.routineTable(routine,[earlier,log('now',current.date,10,6)]).html;
 assert.match(html,/<div class="series-values compare-higher"[^>]*><strong title="Más kilos que la sesión anterior">10<\/strong>/);
 assert.match(html,/<div class="series-values compare-higher"[^>]*><strong title="Más repeticiones que la sesión anterior">6<\/strong>/);
 assert.match(html,/<div class="series-values compare-none"><strong>—<\/strong>/);
});
