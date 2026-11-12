import {parentPort,workerData} from 'node:worker_threads'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import path from 'node:path'

const {runtime, model, pixels} = workerData
const ort = await import(pathToFileURL(path.join(runtime,'ort.wasm.bundle.min.mjs')).href)
ort.env.wasm.numThreads=1
ort.env.wasm.wasmBinary=await readFile(path.join(runtime,'ort-wasm-simd-threaded.wasm'))
const size=320*320
const values=new Float32Array(3*size)
const mean=[0.485,0.456,0.406], deviation=[0.229,0.224,0.225]
let maximum=1
for(let i=0;i<size;i++) maximum=Math.max(maximum,pixels[i*4],pixels[i*4+1],pixels[i*4+2])
for(let c=0;c<3;c++)for(let i=0;i<size;i++)
  values[c*size+i]=(pixels[i*4+c]/maximum-mean[c])/deviation[c]
const session=await ort.InferenceSession.create(await readFile(model),{executionProviders:['wasm']})
const output=await session.run({[session.inputNames[0]]:new ort.Tensor('float32',values,[1,3,320,320])},[session.outputNames[0]])
const data=output[session.outputNames[0]].data
let low=Infinity, high=-Infinity
for(const v of data){low=Math.min(low,v); high=Math.max(high,v)}
if(high-low<0.00001)throw new Error('未找到清晰主体。')
const alpha=Uint8Array.from(data,v=>Math.round(255*(v-low)/(high-low)))
await session.release()
parentPort.postMessage(alpha,[alpha.buffer])
