import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({window:{},URL});
vm.runInContext(fs.readFileSync(new URL('../exercise-media.js',import.meta.url),'utf8'),context);
const media=context.window.ftExerciseMedia;
test('YouTube links normalize only trusted hosts and valid identifiers',()=>{
  for(const url of ['https://youtu.be/abcdefghijk?si=token','https://www.youtube.com/watch?v=abcdefghijk','https://youtube.com/shorts/abcdefghijk']) assert.equal(media.youtubeId(url),'abcdefghijk');
  for(const url of ['https://youtube.com.evil.test/watch?v=abcdefghijk','javascript:alert(1)','https://youtube.com/watch?v=bad']) assert.equal(media.youtubeId(url),null);
});
test('YouTube uses a player with a fallback link, while GIF and video keep their formats',()=>{
  const html=media.html({media_url:'https://youtu.be/abcdefghijk',name:'Press <test>'});
  assert.match(html,/youtube-nocookie.com\/embed\/abcdefghijk/);
  assert.match(html,/Abrir video en YouTube/);
  assert.match(html,/Press &lt;test&gt;/);
  assert.match(media.html({media_url:'https://example.com/demo.gif'}),/<img/);
  assert.match(media.html({media_url:'https://example.com/demo.mp4',media_type:'video'}),/<video.*controls playsinline/);
  assert.doesNotMatch(media.html({media_url:'javascript:alert(1)'}),/src=/);
});
