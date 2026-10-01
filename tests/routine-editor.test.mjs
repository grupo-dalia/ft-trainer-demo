import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../routine-editor.js',import.meta.url),'utf8');
function harness(){
 const nodes=new Map(),insertions=[],updates=[];
 const node=()=>({innerHTML:'',value:'',classList:{add(){},remove(){}},querySelectorAll(){return[];}});
 for(const key of ['.admin-form-close','#routine-exercise-search','.exercise-picker','.exercise-selection-count','#add-routine-exercise'])nodes.set(key,node());
 const editButton={dataset:{item:'item1'},closest:()=>row};
 const row={querySelector:()=>null,append(editor){this.editor=editor;}};
 const host={...node(),querySelector:key=>nodes.get(key),querySelectorAll:key=>key==='.edit-routine-exercise'?[editButton]:[]};
 const exercises=[{id:'a',source:'db',sourceId:'a',name:'Press',body_group:'Pecho',thumbnail_url:'press.jpg'},{id:'b',source:'db',sourceId:'b',name:'Remo',body_group:'Espalda',thumbnail_url:'remo.jpg'}];
 const context=vm.createContext({window:{openRoutineEditor:async()=>{}},escapeHtml:String,matchesQuery:(text,q)=>text.toLowerCase().includes(q.toLowerCase()),document:{getElementById:()=>host,createElement:()=>{const editor=node(),feedback={},button={};editor.querySelector=k=>k==='p'?feedback:button;return editor;}},toast(){},FormData:class{constructor(form){this.values=form.values;}get(k){return this.values[k]??'';}[Symbol.iterator](){return Object.entries(this.values)[Symbol.iterator]();}},ftSupabase:{from:()=>({insert:async data=>{insertions.push(data);return{};},update:data=>({eq:()=>({eq:async()=>{updates.push(data);return{};}})})})}});
 let code=source.slice(source.indexOf('  function itemMarkup'),source.indexOf('  window.openRoutineEditor='));
 code='const esc=String;const number=(v,f)=>Number.isFinite(Number(v))?Number(v):f;'+code;
 context.fetchRoutine=async()=>({routine:{name:'Torso'},exercises,items:[{id:'item1',exercise_id:'old',day_number:1,position:1,target_sets:3,target_reps_min:8,target_reps_max:12,rest_seconds:90}]});
 vm.runInContext(code,context);
 return{context,nodes,insertions,updates,editButton,row};
}
test('filtered exercise images match names and multi-select appends both after existing exercises',async()=>{
 const h=harness();await vm.runInContext('renderEditor("r1")',h.context);
 const picker=h.nodes.get('.exercise-picker'),search=h.nodes.get('#routine-exercise-search');
 const inputs=[{value:'db:a',checked:true},{value:'db:b',checked:true}];picker.querySelectorAll=()=>inputs;
 search.value='Pecho';search.oninput();assert.match(picker.innerHTML,/press.jpg/);assert.doesNotMatch(picker.innerHTML,/remo.jpg/);inputs[0].onchange();
 search.value='Espalda';search.oninput();assert.match(picker.innerHTML,/remo.jpg/);assert.doesNotMatch(picker.innerHTML,/press.jpg/);inputs[1].onchange();
 const feedback={},button={},form={values:{day_number:'1',target_sets:'4',target_reps_min:'6',target_reps_max:'10',rest_seconds:'0'},querySelector:k=>k==='.form-feedback'?feedback:button};
 await h.nodes.get('#add-routine-exercise').onsubmit({preventDefault(){},currentTarget:form});
 assert.equal(h.insertions.length,1);assert.deepEqual(JSON.parse(JSON.stringify(h.insertions[0].map(x=>[x.exercise_id,x.position,x.target_sets,x.rest_seconds]))),[['a',2,4,0],['b',3,4,0]]);
});
test('editing sets updates the existing item and rejects reversed repetition ranges',async()=>{
 const h=harness();await vm.runInContext('renderEditor("r1")',h.context);h.editButton.onclick();const editor=h.row.editor;
 editor.values={target_sets:'5',target_reps_min:'12',target_reps_max:'8',rest_seconds:'60'};
 await editor.onsubmit({preventDefault(){}});assert.equal(h.updates.length,0);
 editor.values.target_reps_max='15';await editor.onsubmit({preventDefault(){}});assert.equal(h.updates.length,1);assert.equal(h.updates[0].target_sets,5);assert.equal(h.insertions.length,0);
});
const fees=fs.readFileSync(new URL('../payments-manager.js',import.meta.url),'utf8');
test('renewal grace includes day 5, expires day 6, and excludes future payments',()=>{
 for(const [date,payment,expected] of [['2026-10-05T12:00:00Z',{period_start:'2026-09-01',period_end:'2026-09-30'},'grace'],['2026-10-06T12:00:00Z',{period_start:'2026-09-01',period_end:'2026-09-30'},'due'],['2026-10-03T12:00:00Z',{period_start:'2026-11-01',period_end:'2026-11-30'},'due']]){
 const RealDate=Date;class FakeDate extends RealDate{constructor(...args){super(...(args.length?args:[date]));}}
 const ctx=vm.createContext({Date:FakeDate,iso:d=>d.toISOString().slice(0,10),feeState:{grace:true,payments:[{client_id:'c',...payment}]}});
 vm.runInContext(fees.slice(fees.indexOf('  function feeStatus'),fees.indexOf('  pages.payments')),ctx);
 assert.equal(vm.runInContext('feeStatus({id:"c"}).key',ctx),expected);
 }
});
