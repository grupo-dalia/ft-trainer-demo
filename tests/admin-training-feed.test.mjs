import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../admin-training-feed.js',import.meta.url),'utf8'),context);
test('training summary groups completed sets, preserves zero weights and sorts series',()=>{const groups=context.AdminTrainingFeedCore.summary([{exercise_id:'a',set_number:2,reps:8,weight_kg:25,completed:true,exercises:{name:'Press'}},{exercise_id:'b',set_number:1,duration_seconds:30,completed:true,exercises:{name:'Plancha'}},{exercise_id:'a',set_number:1,reps:10,weight_kg:0,completed:true,exercises:{name:'Press'}},{exercise_id:'a',set_number:3,reps:12,weight_kg:30,completed:false}]);assert.equal(groups.length,2);assert.equal(groups[0].name,'Press');assert.equal(groups[0].sets.length,2);assert.equal(groups[0].sets[0].set_number,1);assert.equal(groups[0].sets[0].weight_kg,0);assert.equal(groups[1].sets[0].duration_seconds,30)});
test('training summary does not invent sets or weights',()=>{assert.equal(context.AdminTrainingFeedCore.summary([]).length,0);const group=context.AdminTrainingFeedCore.summary([{exercise_id:'x',set_number:1,reps:null,weight_kg:null,completed:true}])[0];assert.equal(group.name,'Ejercicio sin nombre');assert.equal(group.sets[0].weight_kg,null)});
