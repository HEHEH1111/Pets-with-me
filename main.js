const { app, BrowserWindow, ipcMain, screen, net, Menu, dialog, nativeImage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const {pathToFileURL} = require('node:url')
const {createHash} = require('node:crypto')
const {openStore, memoryCommand, messagesFor, askModel} = require('./core')
const page = path.join(__dirname,'ui','index.html')
let win, store, history = [], key = '', busy = false, catalog = []
let revision = 0
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => { if (win) {win.show();win.focus()} })
  app.whenReady().then(async () => {
    try { store = openStore(app.getPath('userData')) }
    catch { dialog.showErrorBox('无法读取本地记忆', '请检查数据文件：'+path.join(app.getPath('userData'),'companion.json')); app.quit(); return }
    win = new BrowserWindow({width:390,height:580,show:false,frame:false,transparent:true,resizable:false,
      alwaysOnTop:true,webPreferences:{preload:path.join(__dirname,'preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false}})
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}))
    win.webContents.on('will-navigate', e=>e.preventDefault())
    win.webContents.on('context-menu',()=>Menu.buildFromTemplate([{label:'退出桌宠',click:()=>app.quit()}]).popup({window:win}))
    size(true)
    await win.loadFile(page)
    win.show()
  })
}
app.on('window-all-closed',()=>app.quit())
function size(open) {
  const area = screen.getDisplayMatching(win.getBounds()).workArea
  const old = win.isVisible() ? win.getBounds() : {x:area.x+area.width-18,y:area.y+area.height-18,width:0,height:0}
  const width = Math.min(open?390:112,area.width), height = Math.min(open?580:120,area.height)
  win.setBounds({width,height,x:Math.max(area.x,Math.min(area.x+area.width-width,old.x+old.width-width)),
    y:Math.max(area.y,Math.min(area.y+area.height-height,old.y+old.height-height))})
}
function handle(name, fn) {
  ipcMain.handle(name, (e,...args)=>{
    if (e.sender !== win.webContents || e.senderFrame.url !== pathToFileURL(page).href) throw new Error('未知窗口')
    return fn(...args)
  })
}
function spriteFile(slug) { return path.join(app.getPath('userData'),createHash('sha256').update(slug).digest('hex')+'.sprite') }
function selected() {
  const pet=store.get().pet
  if (!pet || !fs.existsSync(spriteFile(pet.slug))) return null
  return {...pet, image:'data:image/'+pet.type+';base64,'+fs.readFileSync(spriteFile(pet.slug)).toString('base64')}
}
handle('init',()=>{const s=store.get(); return {memories:s.memories,pet:selected(),endpoint:s.endpoint,model:s.model}})
handle('size',size)
handle('exit',()=>app.quit())
handle('settings',(settings)=>{
  const endpoint = String(settings.endpoint).trim(), model=String(settings.model).trim()
  const u = new URL(endpoint)
  if (!model || u.username || u.password || u.search || u.hash || !(u.protocol==='https:' || (u.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(u.hostname)))) throw new Error('请填写模型名和有效的 HTTPS 地址，或本机 HTTP 地址。')
  store.update(s=>{s.endpoint=endpoint;s.model=model})
  key = settings.key.trim()
})
handle('chat',async raw=>{
  const input=String(raw).trim()
  if (!input || input.length>2000 || busy) throw new Error('请稍后发送 1 至 2000 个字。')
  const epoch=revision
  busy=true
  try {
    let reply=memoryCommand(input,store)
    if (!reply) {
      const s=store.get()
      if (!s.endpoint || !s.model) throw new Error('请先在「连接」中填写模型，或试试输入「以后叫我阿禾」。')
      reply=await askModel(net.fetch.bind(net),{endpoint:s.endpoint,model:s.model,key},messagesFor(s.memories,history,input))
    }
    if(epoch===revision) history=[...history,{role:'user',content:input},{role:'assistant',content:reply}].slice(-12)
    return {reply, memories:store.get().memories}
  } finally {busy=false}
})
handle('reset',()=>{history=[];revision++})
handle('remember',(value,id)=>{store.remember(value,'note',id);return store.get().memories})
handle('forget',id=>{store.update(s=>{s.memories=s.memories.filter(m=>m.id!==id)});return store.get().memories})
handle('catalog',async()=>{
  if (!catalog.length) {
    const r=await net.fetch('https://petdex.dev/api/manifest',{signal:AbortSignal.timeout(20000)})
    if (!r.ok) throw new Error('Petdex 目录暂时不可用。')
    const data=await r.json()
    catalog=data.pets.filter(p=>typeof p.slug==='string' && typeof p.displayName==='string' && /^https:\/\/assets\.petdex\.dev\//.test(p.spritesheetUrl))
  }
  return catalog.map(({slug,displayName,submittedBy,spritesheetUrl})=>({slug,displayName,submittedBy,spritesheetUrl}))
})
handle('choose',async slug=>{
  if(slug===null){store.update(s=>{s.pet=null});return null}
  const p=catalog.find(item=>item.slug===slug)
  if(!p) throw new Error('请重新加载宠物目录。')
  const r=await net.fetch(p.spritesheetUrl,{signal:AbortSignal.timeout(30000),redirect:'error'})
  if(!r.ok) throw new Error('形象下载失败，请重试。')
  const bytes=Buffer.from(await r.arrayBuffer())
  const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  const webp=bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP'
  if(bytes.length>12*1024*1024 || !(png || webp)) throw new Error('此形象格式暂不支持。')
  const file=spriteFile(slug)
  fs.writeFileSync(file+'.tmp',bytes); fs.renameSync(file+'.tmp',file)
  store.update(s=>{s.pet={slug,name:p.displayName,author:p.submittedBy,type:png?'png':'webp'}})
  return selected()
})
