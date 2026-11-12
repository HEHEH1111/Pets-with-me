const photoEditor=$('photoEditor'), preview=$('photoPreview')
const renderPreview=preview.getContext('2d',{willReadFrequently:true})
let draft=null, photoRevision=0, pan=null

function surface(width,height){
  const c=document.createElement('canvas')
  c.width=width;c.height=height
  return c
}
function visibleBounds(c){
  const {width:w,height:h}=c
  const data=c.getContext('2d').getImageData(0,0,w,h).data
  let left=w,top=h,right=-1,bottom=-1,transparent=0
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const alpha=data[(y*w+x)*4+3]
    if(alpha<20){transparent++;continue}
    left=Math.min(left,x);right=Math.max(right,x)
    top=Math.min(top,y);bottom=Math.max(bottom,y)
  }
  if(right<left)throw new Error('图片完全透明，请换一张照片。')
  return {left,top,width:right-left+1,height:bottom-top+1,transparent}
}
function framePhoto(){
  if(!draft)return
  draft.layer=$('photoBackground').checked || !draft.cutout ? draft.original : draft.cutout
  const bounds=visibleBounds(draft.layer)
  draft.fit=Math.min(348/bounds.width,382/bounds.height)
  draft.cx=bounds.left+bounds.width/2;draft.cy=bounds.top+bounds.height/2
  draft.dx=0;draft.dy=0;$('photoScale').value=100
  paintPhoto()
}
function paintPhoto(){
  if(!draft?.layer)return
  const scale=draft.fit*Number($('photoScale').value)/100
  renderPreview.clearRect(0,0,preview.width,preview.height)
  renderPreview.drawImage(draft.layer,192+draft.dx-draft.cx*scale,208+draft.dy-draft.cy*scale,
    draft.layer.width*scale,draft.layer.height*scale)
}
async function closePhoto(){
  photoRevision++;draft=null;pan=null;photoEditor.hidden=true
  renderPreview.clearRect(0,0,384,416);await api.photoCancel()
}
async function importPhoto(file){
  const version=++photoRevision
  await api.photoCancel()
  if(version!==photoRevision)return
  draft=null;photoEditor.hidden=false;pan=null
  renderPreview.clearRect(0,0,384,416)
  $('applyPhoto').disabled=true;$('photoBackground').disabled=true;$('photoBackground').checked=false
  $('photoName').value=file.name.replace(/\.[^.]+$/,'').slice(0,24)||'照片伙伴'
  $('photoMessage').textContent='正在本机读取照片…'
  if(file.size>30*1024*1024)throw new Error('请选择 30 MB 以内的照片。')
  const head=new Uint8Array(await file.slice(0,12).arrayBuffer())
  const ascii=(at,n)=>String.fromCharCode(...head.slice(at,at+n))
  if(!(head[0]===255 && head[1]===216 && head[2]===255) && !(head[0]===137 && ascii(1,3)==='PNG') &&
    !(ascii(0,4)==='RIFF' && ascii(8,4)==='WEBP'))throw new Error('请选择 JPG、PNG 或 WebP 文件；手机 HEIC 照片请先导出为 JPG。')
  let bitmap
  try{bitmap=await createImageBitmap(file)}catch{throw new Error('照片无法解码，请重新导出为 JPG 或 PNG 后再试。')}
  if(version!==photoRevision){bitmap.close();return}
  const ratio=Math.min(1,960/Math.max(bitmap.width,bitmap.height))
  const original=surface(Math.max(1,Math.round(bitmap.width*ratio)),Math.max(1,Math.round(bitmap.height*ratio)))
  original.getContext('2d').drawImage(bitmap,0,0,original.width,original.height);bitmap.close()
  const bounds=visibleBounds(original)
  draft={original,cutout:null}
  framePhoto()
  if(bounds.transparent<original.width*original.height*.03){
    $('photoMessage').textContent='正在本机抠出主体，也可以直接使用原图。'
    $('skipMask').hidden=false
    try{
      const small=surface(320,320), c=small.getContext('2d')
      c.drawImage(original,0,0,320,320)
      const frame=c.getImageData(0,0,320,320)
      const alpha=await api.photoMask(new Uint8Array(frame.data.buffer))
      if(version!==photoRevision)return
      for(let i=0;i<alpha.length;i++)frame.data[i*4+3]=alpha[i]
      c.putImageData(frame,0,0)
      const cutout=surface(original.width,original.height), mask=cutout.getContext('2d')
      mask.drawImage(original,0,0);mask.globalCompositeOperation='destination-in'
      mask.drawImage(small,0,0,cutout.width,cutout.height)
      visibleBounds(cutout)
      draft.cutout=cutout;$('photoBackground').disabled=false;framePhoto()
      $('photoMessage').textContent='已提取主体。拖动预览可调整位置。'
    }catch(e){
      if(version!==photoRevision)return
      $('photoBackground').checked=true
      $('photoMessage').textContent='这张照片未能自动抠图。可以裁剪原图，或换一张背景更简单的照片。'
    }
  }else $('photoMessage').textContent='已保留图片的透明区域。拖动预览可调整位置。'
  $('applyPhoto').disabled=false
  $('skipMask').hidden=true
}
$('skipMask').onclick=action(async()=>{
  photoRevision++;await api.photoCancel()
  $('skipMask').hidden=true;$('photoBackground').checked=true
  $('photoMessage').textContent='已保留原图，可以调整裁剪。'
  $('applyPhoto').disabled=false
})
async function loadPhoto(file){
  $('skipMask').hidden=true
  try{await importPhoto(file)}catch(err){$('photoMessage').textContent=err.message || '无法读取这张照片。'}
}
$('pickPhoto').onclick=action(async()=>{
  $('pickPhoto').disabled=true;status('请选择照片，或取消后将照片拖入此页。')
  try{
    const result=await api.photoPick()
    status()
    if(result)await loadPhoto(new File([result.bytes],result.name))
  }finally{$('pickPhoto').disabled=false}
})
const photoPage=$('pets')
photoPage.ondragover=e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy'}}
photoPage.ondrop=e=>{
  e.preventDefault()
  const file=e.dataTransfer.files[0]
  if(file)loadPhoto(file)
}
$('cancelPhoto').onclick=action(closePhoto)
$('photoBackground').onchange=framePhoto
$('photoScale').oninput=paintPhoto
$('centerPhoto').onclick=framePhoto
preview.onpointerdown=e=>{
  if(!draft || e.button!==0)return
  preview.setPointerCapture(e.pointerId)
  pan={id:e.pointerId,x:e.clientX,y:e.clientY,dx:draft.dx,dy:draft.dy}
}
preview.onpointermove=e=>{
  if(pan?.id!==e.pointerId || !draft)return
  const box=preview.getBoundingClientRect()
  draft.dx=pan.dx+(e.clientX-pan.x)*preview.width/box.width
  draft.dy=pan.dy+(e.clientY-pan.y)*preview.height/box.height
  paintPhoto()
}
preview.onpointerup=preview.onpointercancel=preview.onlostpointercapture=()=>{pan=null}
async function listPhotos(){
  const photos=await api.photos(),list=$('photoList')
  list.replaceChildren()
  $('photoCount').textContent=String(photos.length)
  if(!photos.length)list.append(element('p','制作并保存后，可在这里再次选择。'))
  for(const item of photos.slice().reverse()){
    const row=document.createElement('div');row.className='photoRow'
    const select=btn(item.name,async()=>{await showPet(await api.photoChoose(item.slug));await display('pet')})
    const observer=new IntersectionObserver(async ([entry])=>{
      if(!entry.isIntersecting)return
      observer.disconnect()
      const src=await api.photoThumb(item.slug).catch(()=>'')
      if(src){const thumb=new Image();thumb.src=src;thumb.alt='';select.prepend(thumb)}
    })
    observer.observe(select)
    row.append(select,
      btn('删除',async()=>{await showPet(await api.photoDelete(item.slug));await listPhotos();status('照片形象已删除。')}))
    list.append(row)
  }
}
$('applyPhoto').onclick=action(async()=>{
  if(!draft)return
  visibleBounds(preview)
  $('applyPhoto').disabled=true;$('pets').inert=true
  try{
    const next=await api.photoSave($('photoName').value,preview.toDataURL('image/png'))
    await showPet(next);await closePhoto();await listPhotos();await display('pet')
  }finally{$('applyPhoto').disabled=false;$('pets').inert=false}
})
listPhotos().catch(error)
