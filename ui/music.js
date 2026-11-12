const musicEnabled = $('musicEnabled'), musicStyle = $('musicStyle'), song = $('song')
const styleNames = {off:'已关闭',quiet:'等待电脑播放声音',sway:'轻摆',nod:'点头',hop:'跳步',
  unavailable:'等待可用的播放设备',error:'音频组件未能运行。请退出旧版，用完整安装包重新安装，检查 Windows 是否拦截了 MusicMeter.exe。'}
const steps = {
  sway:['rotate(-5deg) translateX(-2px)','rotate(5deg) translateX(2px)'],
  nod:['translateY(1px) scale(1.03,.95)','translateY(-2px) scale(.99,1.02)'],
  hop:['translateY(1px) scale(1.04,.94)','translateY(-7px) rotate(4deg)']
}
let sound = {style:'off'}, dance, side = 0
function stopDance(){
  dance?.cancel()
  dance=null
  avatar.querySelectorAll('.musicNote').forEach(note=>note.remove())
}
function noteOnBeat(style, duration){
  const note = document.createElement('span')
  note.className='musicNote '+(side++%2?'right':'left')
  note.setAttribute('aria-hidden','true')
  note.textContent=style==='hop'?'♫':'♪'
  avatar.append(note)
  const direction=note.classList.contains('left')?-1:1
  const animation=note.animate([
    {opacity:0,transform:'translateY(4px) scale(.65)'},
    {opacity:1,offset:.22},
    {opacity:0,transform:'translate('+direction*5+'px,-12px) rotate('+direction*14+'deg)'}
  ],{duration:Math.min(900,Math.max(450,duration)),easing:'ease-out'})
  animation.onfinish=()=>note.remove()
}
function renderMusic(next){
  idle.music(Boolean(steps[next.style]))
  if(steps[next.style])avatar.dataset.rhythm=next.style
  else delete avatar.dataset.rhythm
  const changed = sound.style!==next.style
  sound=next
  musicEnabled.checked=next.style!=='off'
  musicStyle.textContent=(styleNames[next.style] || '')+(next.outputs>0?' · 已检测到 '+next.outputs+' 个输出设备':'')
  const track=[next.title,next.artist].filter(Boolean).join(' · ')
  song.textContent=next.title ? (next.source==='netease'?'网易云窗口曲目 · ':'')+track : ''
  if(next.title)avatar.title=song.textContent
  else avatar.removeAttribute('title')
  if(!steps[next.style] || pointer){stopDance();return}
  if(!changed && !next.beat && dance)return
  dance?.cancel()
  const frames=steps[next.style]
  const period=next.period||900
  // Onsets restart the motion on the beat; sustained sounds keep a gentle sway.
  dance=canvas.animate([{transform:frames[0]},{transform:frames[1]},{transform:frames[0]}],
    {duration:period,iterations:Infinity,easing:'ease-in-out'})
  if(next.beat || changed)noteOnBeat(next.style,period)
}
avatar.addEventListener('pointerdown', stopDance)
avatar.addEventListener('pointerup',()=>{if(steps[sound.style])renderMusic({...sound,beat:false})})
musicEnabled.onchange=action(async()=>{
  musicEnabled.disabled=true
  try{renderMusic(await api.music(musicEnabled.checked))}
  finally{musicEnabled.disabled=false}
})
api.onMusic(renderMusic)
api.music().then(renderMusic).catch(error)
