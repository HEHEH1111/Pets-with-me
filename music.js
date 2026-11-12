const {spawn} = require('node:child_process')
const {createInterface} = require('node:readline')
const {performance} = require('node:perf_hooks')

class Rhythm {
  constructor() {
    this.average = 0
    this.previous = 0
    this.lastSound = -Infinity
    this.lastBeat = -Infinity
    this.intervals = []
  }
  sample(level, now) {
    if (level > 0.00025) this.lastSound = now
    const beat = level > 0.0005 && level > this.average * 1.25 &&
      level > this.previous * 1.06 && now - this.lastBeat >= 235
    if (beat) {
      const interval = now - this.lastBeat
      if (interval <= 1550) this.intervals.push(interval)
      else this.intervals = []
      this.intervals = this.intervals.slice(-5)
      this.lastBeat = now
    }
    this.previous = level
    this.average = this.average * 0.86 + level * 0.14
    if (now - this.lastSound > 1150) {
      this.intervals = []
      return {style:'quiet', beat:false}
    }
    const sorted = [...this.intervals].sort((a,b)=>a-b)
    const period = sorted.length >= 2 ? sorted[Math.floor(sorted.length/2)] : 900
    const style = period < 475 ? 'hop' : period < 745 ? 'nod' : 'sway'
    return {style, beat, period}
  }
}

function watchMusic(executable, notify) {
  const child = spawn(executable, [], {windowsHide:true, stdio:['pipe','pipe','ignore']})
  let rhythm = new Rhythm()
  let state = {style:'quiet',title:'',artist:''}
  let stopped = false
  function send(update, beat=false) {
    if (stopped) return
    const next = {...state,...update}
    const changed = Object.keys(next).some(key=>next[key]!==state[key])
    state = next
    if (changed || beat) notify({...state,beat})
  }
  const lines = createInterface({input:child.stdout})
  lines.on('line', line=>{
    const [tag,a,b,source] = line.split('\t')
    if (tag==='level') {
      const level = Number(a)
      if (!Number.isFinite(level) || level<0 || level>1) return
      const {style,beat,period} = rhythm.sample(level,performance.now())
      send({style,period},beat)
    } else if (tag==='track') {
      send({title:Buffer.from(a||'','base64').toString('utf8'),artist:Buffer.from(b||'','base64').toString('utf8'),source})
    } else if (tag==='device' || tag==='unavailable') {
      rhythm = new Rhythm()
      send({style:tag==='device'?'quiet':'unavailable',outputs:tag==='device'?Number(a):0})
    }
  })
  child.once('error',()=>send({style:'error'}))
  child.once('exit',()=>send({style:'error'}))
  return ()=>{
    stopped = true
    lines.close()
    child.kill()
  }
}
module.exports = {Rhythm,watchMusic}
