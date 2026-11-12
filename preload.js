const {contextBridge,ipcRenderer}=require('electron')
const api={}
for(const name of ['init','size','exit','settings','chat','reset','remember','forget','catalog','choose']) api[name]=(...args)=>ipcRenderer.invoke(name,...args)
contextBridge.exposeInMainWorld('companion',api)
