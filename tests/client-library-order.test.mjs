import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('user library fetches all pages and puts newest custom exercises before the catalog',async()=>{
 const source=fs.readFileSync(new URL('../client-sections.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('  async function loadClientLibraryExercises()'),source.indexOf('  async function renderClientLibrary(host)'));
 const records=Array.from({length:1001},(_,i)=>({id:String(i),name:'Catalog '+i,is_custom:false}));
 records.push({id:'old',name:'Own old',is_custom:true,created_at:'2026-10-15'},{id:'new',name:'Own new',is_custom:true,created_at:'2026-10-16'},{id:'edited',name:'Edited catalog',is_custom:true,source_catalog_id:'dataset:1',created_at:'2026-10-17'});
 const ranges=[];
 const db={from(){return {select(){return this},eq(){return this},order(){return this},range(a,b){ranges.push([a,b]);return Promise.resolve({data:records.slice(a,b+1)})}}}};
 const context=vm.createContext({db,checkedQuery:async q=>(await q).data});
 vm.runInContext(fn,context);const result=await vm.runInContext('loadClientLibraryExercises()',context);
 assert.equal(result.length,1004);assert.equal(result[0].id,'new');assert.equal(result[1].id,'old');assert.equal(ranges.length,3);
});
