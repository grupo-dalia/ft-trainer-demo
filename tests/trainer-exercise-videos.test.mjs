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
