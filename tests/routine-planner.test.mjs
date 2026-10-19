import fs from 'node:fs';import vm from 'node:vm';import test from 'node:test';import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../routine-planner-v2.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
for(const mode of ['manual','guided'])test(`${mode} weekly plan saves every selected day`,async()=>{
 const values={mode,scope:'weekly',name:'Tres dias',goal:'Hipertrofia',experience:'intermedio',day:['1','3','5'],muscle_1:'Pecho',muscle_3:'Espalda',muscle_5:'Piernas'};
 const form={querySelector:()=>({})},saved=[];
 const ctx=vm.createContext({form,node:{classList:{remove(){}}},toast(){},render(){},setTimeout(){},openRoutineEditor(){},FormData:class{get(key){return values[key]??''}getAll(key){return values[key]??[]}},ftSupabase:{auth:{getUser:async()=>({data:{user:{id:'admin'}}})},from:()=>({insert(payload){saved.push(payload);return {select:()=>({single:async()=>({data:{id:'routine'}})})}}})}});
 const start=source.indexOf('    form.onsubmit = async (event) => {');const end=source.indexOf('\n  };\n\n  const baseEditor',start);
 vm.runInContext(source.slice(start,end),ctx);await form.onsubmit({preventDefault(){}});
 assert.equal(saved[0].coach_reasoning.scope,'weekly');assert.equal(saved[0].coach_reasoning.mode,mode);assert.deepEqual(Array.from(saved[0].coach_reasoning.training_days),[1,3,5]);assert.match(saved[0].description,/3 sesiones/);
});
test('manual mode keeps weekly scope and day selection visible',()=>{
 const code=source.slice(source.indexOf('    const setMode ='),source.indexOf('    node.querySelector(".admin-form-close")'));
 const grid={hidden:true},days={classList:{toggle:(name,value)=>{days.visible=value}}},dayQuestion={hidden:true};let rendered=false;
 const ctx=vm.createContext({node:{querySelector:()=>grid},form:{querySelector:()=>({value:'weekly'})},days,dayQuestion,renderDayConfig:()=>{rendered=true}});vm.runInContext(code+'setMode();',ctx);
 assert.equal(grid.hidden,false);assert.equal(dayQuestion.hidden,false);assert.equal(days.visible,true);assert.equal(rendered,true);
});

