const api=window.companion, $=id=>document.getElementById(id)
const canvas=document.querySelector('#pet canvas'), ctx=canvas.getContext('2d')
let pet=null, sheet=null, idleFrames=[0], memories=[], catalog=[], limit=8, mode="settings", sending=false, tick=0
function status(message=''){ $('status').textContent=message }
function error(e){status(String(e.message).split('Error: ').pop())}
function action(fn){return async e=>{try{await fn(e)}catch(err){error(err)}}}
function element(tag,text){const el=document.createElement(tag);el.textContent=text;return el}
function btn(label,fn){const b=element('button',label);b.type='button';b.onclick=action(fn);return b}
const fox=[
'   kk        kk   ','   kok      kok   ','   koooooooook    ','  koooooooooook   ',' koooooooooooook  ',' kooowoooowooook  ',' koookoooookoook  ','  kowwwkkwwwook   ','   kwwwwwwwwk  ww ','    koowwwok  woow','   kooowwwook ooow','   kooowwwookooook','   kkkoookkkkoook ','     kkkkkkkkkk   ']
function draw(){
  ctx.clearRect(0,0,192,208)
  if(sheet){let w=sheet.width/8,h=w*208/192;ctx.drawImage(sheet,idleFrames[tick%idleFrames.length]*w,0,w,h,0,0,192,208);return}
  const colors={k:'#543e30',o:'#d68044',w:'#ffe6bc'}
  const y0=tick%8<4?53:51
  fox.forEach((row,y)=>[...row].forEach((c,x)=>{if(colors[c]){ctx.fillStyle=colors[c];ctx.fillRect(5+x*9,y0+y*9,9,9)}}))
}
async function showPet(next){
  const img=next?await image(next.image):null
  let frames=[0]
  if(img){
    const w=img.width/8,h=w*208/192
    const probe=document.createElement('canvas');probe.width=24;probe.height=26
    const c=probe.getContext('2d',{willReadFrequently:true})
    frames=Array.from({length:8},(_,i)=>i).filter(i=>{c.clearRect(0,0,24,26);c.drawImage(img,i*w,0,w,h,0,0,24,26);return c.getImageData(0,0,24,26).data.some((v,j)=>j%4===3 && v>32)})
    if(!frames.length) frames=[0]
  }
  pet=next;sheet=img;idleFrames=frames;$('petName').textContent=pet?.name || '栗栗';draw()
}
function image(url){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('形象图片无法读取。'));img.src=url})}
setInterval(()=>{tick++;draw()},180)
function tab(id){for(const s of document.querySelectorAll('section'))s.hidden=s.id!==id
  for(const b of document.querySelectorAll('nav button'))b.classList.toggle('active',b.dataset.tab===id)
  status()
}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>tab(b.dataset.tab))
async function display(next, target){
  mode=next
  document.body.className=next
  if(target)tab(target)
  await api.size(next)
  if(next==='talk'){
    $('thread').scrollTop=$('thread').scrollHeight
    $('input').focus()
  }
}
$('fold').onclick=action(()=>display('pet'))
$('closeChat').onclick=action(()=>display('pet'))
api.onTab(id=>display('settings',id).catch(error))
document.addEventListener('keydown',e=>{
  if(e.key==='Escape' && !e.isComposing && mode!=='pet') display('pet').catch(error)
})
const longPressMs=400, dragThreshold=4
let pointer=null, tapReady=false
const avatar=$('pet')
avatar.onpointerdown=e=>{
  if(e.button!==0 || !e.isPrimary)return
  tapReady=false
  pointer={id:e.pointerId,x:e.screenX,y:e.screenY,started:e.timeStamp,moved:false,movable:mode!=='settings'}
  avatar.setPointerCapture(e.pointerId)
  if(pointer.movable)api.drag('start').catch(error)
}
function movedAway(e){return Math.hypot(e.screenX-pointer.x,e.screenY-pointer.y)>dragThreshold}
avatar.onpointermove=e=>{
  if(e.pointerId!==pointer?.id)return
  if(movedAway(e))pointer.moved=true
  if(pointer.moved && pointer.movable)api.drag('move').catch(error)
}
function finishPress(e){
  if(e.pointerId!==pointer?.id)return
  tapReady=e.type==='pointerup' && e.button===0 && !pointer.moved && !movedAway(e) &&
    e.timeStamp-pointer.started<longPressMs
  if(pointer.movable)api.drag('end').catch(error)
  pointer=null
}
avatar.onpointerup=avatar.onpointercancel=avatar.onlostpointercapture=finishPress
avatar.onclick=action(async e=>{
  if(e.detail!==0 && !tapReady)return
  tapReady=false
  await display(mode==='talk'?'pet':'talk','chat')
})
$('exit').onclick=()=>api.exit()
function bubble(value,mine=false){
  const el=element('div',value);el.className='bubble'+(mine?' mine':'')
  if(mine && value.length<=400){const save=btn('记住这条',async()=>{memories=await api.remember(value);renderMem();status('已加入本机记忆册。')});save.className='saveLine';el.append(save)}
  $('thread').append(el);el.scrollIntoView({block:'nearest'})
}
function greet(){bubble('我在。你可以说“以后叫我阿禾”，也可以先选一只喜欢的伙伴。')}
$('reset').onclick=action(async()=>{await api.reset();$('thread').replaceChildren();greet();status('已开始新对话。')})
$('sendForm').onsubmit=action(async e=>{
  e.preventDefault();const input=$('input'),v=input.value.trim()
  if(!v || sending)return
  sending=true;input.readOnly=true;$('send').disabled=true;$('reset').disabled=true;status('正在回应…')
  try{const r=await api.chat(v);bubble(v,true);bubble(r.reply);memories=r.memories;renderMem();input.value='';status()}
  finally{sending=false;input.readOnly=false;$('send').disabled=false;$('reset').disabled=false;input.focus()}
})
function renderMem(){const list=$('memories');list.replaceChildren()
  if(!memories.length)list.append(element('p','记忆册还是空的。'))
  for(const m of memories){const row=element('div','');row.className='entry';const field=element('input','');field.value=m.value;field.maxLength=400
    const label=m.kind==='name'?'称呼':'记事';field.setAttribute('aria-label',label)
    row.append(element('small',label),field,btn('保存',async()=>{memories=await api.remember(field.value,m.id);renderMem();status('记忆已更新。')}),btn('删除',async()=>{memories=await api.forget(m.id);renderMem();status('已删除。新对话将使用更新后的记忆。')}));list.append(row)}
}
$('noteForm').onsubmit=action(async e=>{e.preventDefault();memories=await api.remember($('note').value);$('note').value='';renderMem();status('已记住。')})
$('keyPage').onclick=action(()=>api.keyPage())
const glmEndpoint='https://open.bigmodel.cn/api/paas/v4/chat/completions'
$('glm').onclick=()=>{if($('endpoint').value!==glmEndpoint)$('token').value='';$('endpoint').value=glmEndpoint;$('model').value='glm-4.7-flash';$('token').focus()}
$('config').onsubmit=action(async e=>{
  e.preventDefault()
  const controls=Array.from($('config').elements).concat($('glm'))
  controls.forEach(el=>el.disabled=true);status('正在测试连接…')
  try{
    await api.settings({endpoint:$('endpoint').value,model:$('model').value,key:$('token').value,persist:$('persist').checked})
    $('token').value='';$('token').placeholder='沿用当前接口的密钥'
    status();await display('pet')
  }finally{controls.forEach(el=>el.disabled=false)}
})
async function choose(slug){if($('gallery').inert)return;$('gallery').inert=true;$('original').disabled=true;status('正在更换伙伴…')
  try{await showPet(await api.choose(slug));status('已选择 '+(pet?.name||'栗栗'))}finally{$('gallery').inert=false;$('original').disabled=false}}
$('original').onclick=action(()=>choose(null))
function renderCatalog(){
  const q=$('filter').value.toLowerCase().trim()
  const found=catalog.filter(p=>[p.displayName,p.slug,p.submittedBy].join(' ').toLowerCase().includes(q))
  const list=$('gallery');list.replaceChildren()
  for(const p of found.slice(0,limit)){const b=btn(p.displayName,()=>choose(p.slug));const thumb=element('canvas','');thumb.width=48;thumb.height=52;b.prepend(thumb);b.append(element('small','@'+(p.submittedBy||'Petdex')));list.append(b)
    const observer=new IntersectionObserver(entries=>{if(!entries[0].isIntersecting)return;observer.disconnect()
      image(p.spritesheetUrl).then(im=>{const w=im.width/8;thumb.getContext('2d').drawImage(im,0,0,w,w*208/192,0,0,48,52)}).catch(()=>{})});observer.observe(thumb)}
  if(catalog.length&&!found.length)list.append(element('p','没有找到匹配的宠物。'))
  $('more').hidden=limit>=found.length
}
$('load').onclick=action(async()=>{status('正在读取 Petdex 目录…');try{catalog=await api.catalog();renderCatalog();status('已加载 '+catalog.length+' 只伙伴。')}catch(e){throw new Error('Petdex 暂时无法访问，请重试。')}})
$('filter').oninput=()=>{limit=8;renderCatalog()}
$('more').onclick=()=>{limit+=8;renderCatalog()}
api.init().then(async s=>{memories=s.memories;renderMem();$('endpoint').value=s.endpoint;$('model').value=s.model;$('persist').checked=s.savedKey
  if(s.savedKey)$('token').placeholder='已由 Windows 加密保存'
  if(!s.endpoint&&!s.model){$('endpoint').value=glmEndpoint;$('model').value='glm-4.7-flash'}
  greet();await display(s.mode,s.mode==='settings'?'connect':'chat');await showPet(s.pet)}).catch(error)
