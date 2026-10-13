(() => {
 const form=document.getElementById('custom-exercise-form');if(!form)return;
 const fields=[];
 function add(control,options,multiple=false){
  const label=control.parentElement;label.classList.add('wide','exercise-choice-field');
  const group=document.createElement('div');group.className='exercise-chip-group';group.setAttribute('role','group');group.setAttribute('aria-label',label.firstChild.textContent.trim());
  label.appendChild(group);
  if(control.tagName==='SELECT'){control.hidden=true;control.required=false;}
  else {control.classList.add('exercise-custom-muscle');control.placeholder=multiple?'Otros músculos, separados por comas':'Otro músculo (opcional)';}
  const buttons=options.map(({value,text})=>{const button=document.createElement('button');button.type='button';button.className='exercise-option-chip';button.textContent=text;button.dataset.value=value;group.appendChild(button);button.onclick=e=>{e.preventDefault();if(multiple){const current=control.value.split(',').map(v=>v.trim()).filter(Boolean);const index=current.findIndex(v=>v.toLowerCase()===value.toLowerCase());if(index<0)current.push(value);else current.splice(index,1);control.value=current.join(', ')}else control.value=control.value===value&&control.tagName!=='SELECT'?'':value;control.dispatchEvent(new Event('change',{bubbles:true}));sync()};return button});
  function sync(){const selected=multiple?control.value.split(',').map(v=>v.trim().toLowerCase()):[control.value.toLowerCase()];buttons.forEach(b=>b.setAttribute('aria-pressed',String(selected.includes(b.dataset.value.toLowerCase()))))}
  control.addEventListener('input',sync);control.addEventListener('change',sync);fields.push(sync);sync();
 }
 const selects=[...form.querySelectorAll('.admin-fields > label > select')];selects.forEach(select=>add(select,[...select.options].filter(o=>o.value).map(o=>({value:o.value,text:o.textContent}))));
 const syncAll=()=>fields.forEach(sync=>sync());form.addEventListener('reset',()=>setTimeout(syncAll,0));
 const original=window.openTrainerExerciseEditor;if(original)window.openTrainerExerciseEditor=function(...args){const result=original.apply(this,args);syncAll();return result};
})();
