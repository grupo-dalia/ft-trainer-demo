import fs from 'node:fs';import vm from 'node:vm';import test from 'node:test';import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../catalogo.js',import.meta.url),'utf8');
test('catalog paginates every filtered result and searches custom database exercises',async()=>{
 const result={innerHTML:'',scrollIntoView(){}},q={value:'',tagName:'INPUT'},g={value:'',tagName:'SELECT'},e={value:'',tagName:'SELECT'};
 const ctx=vm.createContext({pages:{},icons:{},window:{ftSupabase:true},ftSupabase:{from:()=>({select(){return this},eq(){return this},order:async()=>({data:[{id:'own',name:'Press Fernando',body_group:'Pecho',primary_muscle:'Pectoral',instructions:'Paso'}]})})},fetch:async()=>({json:async()=>Array.from({length:163},(_,i)=>({id:String(i),nombre:'Press '+i,grupo:'Pecho',imagen:'test.jpg'}))}),escapeHtml:String,toast(){},document:{getElementById:id=>({'catalog-results':result,'catalog-search':q,'group-filter':g,'equipment-filter':e}[id]),querySelector:()=>({addEventListener(){}}),querySelectorAll:()=>[]}});
 vm.runInContext(source,ctx);await vm.runInContext('ensureCatalog()',ctx);
 assert.match(result.innerHTML,/de <b>164/);assert.equal((result.innerHTML.match(/data-catalog-step="1"/g)||[]).length,2);
 vm.runInContext('catalogOffset=120;renderCatalog()',ctx);assert.match(result.innerHTML,/Press 162/);assert.match(result.innerHTML,/Press Fernando/);
 q.value='Fernando';q.oninput();assert.match(result.innerHTML,/de <b>1/);assert.match(result.innerHTML,/Press Fernando/);assert.doesNotMatch(result.innerHTML,/Press 162/);
});
