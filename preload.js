const {contextBridge,ipcRenderer}=require('electron')
const api={}
for(const name of ['init','size','exit','settings','drag','keyPage','chat','reset','remember','forget','catalog','choose']) api[name]=(...args)=>ipcRenderer.invoke(name,...args)
api.onTab = listener => ipcRenderer.on('open-tab', (_event, tab) => listener(tab))
contextBridge.exposeInMainWorld('companion',api)
