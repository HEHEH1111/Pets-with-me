const {contextBridge,ipcRenderer}=require('electron')
const api={}
for(const name of ['photoPick','photoThumb','photos','photoChoose','photoSave','photoDelete','photoCancel','photoMask','music','init','size','exit','settings','drag','keyPage','chat','reset','remember','forget','catalog','choose']) api[name]=(...args)=>ipcRenderer.invoke(name,...args)
api.onTab = listener => ipcRenderer.on('open-tab', (_event, tab) => listener(tab))
api.onMusic = listener => ipcRenderer.on('music-state', (_event, state) => listener(state))
contextBridge.exposeInMainWorld('companion',api)
