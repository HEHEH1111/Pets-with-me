const fs=require('node:fs')
const path=require('node:path')
const {Worker}=require('node:worker_threads')
const {createHash}=require('node:crypto')
const {dialog,nativeImage}=require('electron')

function connectPhotos({app,win,store,handle,spriteFile,selected}){
  const root=app.isPackaged ? path.join(process.resourcesPath,'photo') : __dirname
  let active
  function cancel(){if(active){active.terminate();active=null}}
  app.on('before-quit',cancel)
  handle('photoCancel',cancel)
  handle('photoPick',async()=>{
    const picked=await dialog.showOpenDialog(win,{title:'选择制作桌宠的照片',properties:['openFile'],
      filters:[{name:'照片',extensions:['jpg','jpeg','jfif','png','webp']}]})
    if(picked.canceled || !picked.filePaths.length)return null
    const filename=picked.filePaths[0]
    if((await fs.promises.stat(filename)).size>30*1024*1024)throw new Error('请选择 30 MB 以内的照片。')
    return {name:path.basename(filename),bytes:await fs.promises.readFile(filename)}
  })
  handle('photoMask',pixels=>{
    if(!(pixels instanceof Uint8Array) || pixels.length!==320*320*4)throw new Error('预览尺寸无效。')
    cancel()
    const worker=new Worker(path.join(root,'photo-worker.mjs'),{workerData:{
      runtime:app.isPackaged?root:path.join(root,'node_modules/onnxruntime-web/dist'),
      model:app.isPackaged?path.join(root,'u2netp.onnx'):path.join(root,'models/u2netp.onnx'),pixels}})
    active=worker
    return new Promise((resolve,reject)=>{
      worker.once('message',resolve)
      worker.once('error',reject)
      worker.once('exit',()=>reject(new Error('照片处理已结束。')))
    }).finally(()=>{if(active===worker)active=null;worker.terminate()})
  })
  handle('photos',()=>store.get().photos || [])
  handle('photoThumb',slug=>{
    if(!(store.get().photos||[]).some(p=>p.slug===slug))return ''
    const image=nativeImage.createFromPath(spriteFile(slug))
    return image.isEmpty()?'':image.resize({height:56}).toDataURL()
  })
  handle('photoSave',(name,data)=>{
    name=String(name||'照片伙伴').trim().slice(0,24)||'照片伙伴'
    if(typeof data!=='string' || data.length>900000 || !data.startsWith('data:image/png;base64,'))throw new Error('无法保存形象。')
    const bytes=Buffer.from(data.slice(22),'base64')
    if(bytes.length<24 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
       bytes.readUInt32BE(16)!==384 || bytes.readUInt32BE(20)!==416)throw new Error('形象图片无效。')
    const slug='photo:'+createHash('sha256').update(bytes).digest('hex')
    const entry={slug,name,kind:'photo',type:'png'}
    const file=spriteFile(slug)
    if(!fs.existsSync(file)){fs.writeFileSync(file+'.tmp',bytes);fs.renameSync(file+'.tmp',file)}
    store.update(s=>{s.photos=[...(s.photos||[]).filter(p=>p.slug!==slug),entry];s.pet=entry})
    return selected()
  })
  handle('photoChoose',slug=>{
    const photo=(store.get().photos||[]).find(p=>p.slug===slug)
    if(!photo || !fs.existsSync(spriteFile(slug)))throw new Error('形象文件缺失，请重新导入照片。')
    store.update(s=>{s.pet=photo});return selected()
  })
  handle('photoDelete',slug=>{
    if(!(store.get().photos||[]).some(p=>p.slug===slug))throw new Error('未找到这张照片形象。')
    store.update(s=>{s.photos=s.photos.filter(p=>p.slug!==slug);if(s.pet?.slug===slug)s.pet=null})
    fs.rmSync(spriteFile(slug),{force:true});return selected()
  })
}
module.exports={connectPhotos}
