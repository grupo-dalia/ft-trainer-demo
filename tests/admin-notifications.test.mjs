import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../admin-notifications.js',import.meta.url),'utf8'),ctx);const build=ctx.AdminNotificationCore.build;
test('notifications avoid duplicate linked pending clients and distinguish review requests',()=>{const items=build([{id:'r1',matched_client_id:'c1',status:'needs_review',first_name:'Persona',created_at:'2026-01-01',updated_at:'2026-01-02'}],[{id:'c1',created_at:'2026-01-01'},{id:'c2',full_name:'Otra persona',created_at:'2026-01-03'}]);assert.equal(items.length,2);assert.equal(items[0].name,'Otra persona');assert.equal(items[1].title,'Solicitud para revisar')});
test('reading every notification yields zero, same refresh stays read, changed request becomes unread',()=>{const request={id:'r1',status:'pending',created_at:'2026-01-01',updated_at:'2026-01-01'};const read=new Set(build([request],[]).map(i=>i.key));assert.equal(build([request],[]).filter(i=>!read.has(i.key)).length,0);assert.equal(build([{...request,updated_at:'2026-01-02',status:'needs_review'}],[]).filter(i=>!read.has(i.key)).length,1)});
