import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('trainer saves a YouTube exercise and keeps the form open on a database failure',async()=>{
  let saved,closed=false,fail=false;
  const feedback={setAttribute(){}};
  const youtube={checked:false,dispatchEvent(){}};
  const button={disabled:false};
  const form={append(){},reset(){},closest:()=>({classList:{remove(){closed=true;}}}),
    querySelector:selector=>selector.includes('[name=')?youtube:selector==='#youtube-field input'?{value:'https://youtu.be/abcdefghijk'}:selector==='textarea'?{value:'Controla el movimiento'}:button,
    querySelectorAll:selector=>selector.includes('input')?[{value:'Press propio'},{value:'Pectoral'},{value:'Triceps'}]:[{value:'Pecho'},{value:'Mancuernas'},{value:'Intermedio'}]};
  const db={auth:{getUser:async()=>({data:{user:{id:'trainer'}}})},from:()=>({insert:async row=>{saved=row;return {error:fail?new Error('offline'):null};}})};
  const context=vm.createContext({window:{ftSupabase:db,ftExerciseMedia:{youtubeId:()=> 'abcdefghijk'}},ftSupabase:db,Event:class{},toast(){},setTimeout,
    document:{getElementById:id=>id==='custom-exercise-form'?form:null,createElement:()=>feedback,querySelector:()=>({addEventListener(){}})}});
  vm.runInContext(fs.readFileSync(new URL('../trainer-exercise-videos.js',import.meta.url),'utf8'),context);
  await form.onsubmit({preventDefault(){}});
  assert.equal(saved.media_type,'youtube');assert.equal(saved.media_url,'https://www.youtube.com/watch?v=abcdefghijk');
  assert.equal(saved.name,'Press propio');assert.equal(saved.created_by,'trainer');assert.equal(saved.is_custom,true);assert.equal(closed,true);
  closed=false;fail=true;await form.onsubmit({preventDefault(){}});
  assert.equal(closed,false);assert.equal(button.disabled,false);assert.match(feedback.textContent,/No se pudo guardar/);
});
test('editing an existing exercise replaces its video and tracking mode without inserting another exercise',async()=>{
 let updated,inserted=false;const fields={name:{value:''},muscle:{value:''},secondary:{value:''},group:{value:''},equipment:{value:''},level:{value:''},tracking:{value:'time'},link:{value:''},instructions:{value:''},heading:{},button:{},youtube:{checked:true,dispatchEvent(){}}};
 const feedback={setAttribute(){}};
 const form={append(){},reset(){},closest:()=>({classList:{add(){},remove(){}}}),querySelector:s=>s.includes('[name=')?fields.youtube:s==='#youtube-field input'?fields.link:s==='#exercise-tracking-type'?fields.tracking:s==='textarea'?fields.instructions:s==='h2'?fields.heading:fields.button,querySelectorAll:s=>s.includes('input')?[fields.name,fields.muscle,fields.secondary]:[fields.group,fields.equipment,fields.level]};
 const db={auth:{getUser:async()=>({data:{user:{id:'trainer'}}})},from:()=>({insert(){inserted=true},update:payload=>({eq:()=>({eq:()=>({select:()=>({single:async()=>{updated=payload;return{data:{id:'existing'}};}})})})})})};
 const context=vm.createContext({window:{ftSupabase:db,ftExerciseMedia:{youtubeId:()=>null,vimeoVideo:()=>({url:'https://vimeo.com/123456789/secret'})}},ftSupabase:db,Event:class{},toast(){},document:{getElementById:()=>form,createElement:()=>feedback}});
 vm.runInContext(fs.readFileSync(new URL('../trainer-exercise-videos.js',import.meta.url),'utf8'),context);
 context.window.openTrainerExerciseEditor({id:'existing',name:'Plancha',tracking_type:'time',media_url:'https://youtu.be/abcdefghijk'});fields.link.value='https://vimeo.com/123456789/secret';await form.onsubmit({preventDefault(){}});
 assert.equal(inserted,false);assert.equal(updated.media_type,'vimeo');assert.equal(updated.tracking_type,'time');assert.equal(updated.primary_muscle,null);assert.equal(updated.media_url,'https://vimeo.com/123456789/secret');assert.equal(updated.created_by,undefined);
});
