function idleController({show, clear, schedule=setTimeout, cancel=clearTimeout, random=Math.random, now=Date.now}){
  const durations={walk:5600,doze:8500,bored:4700,stretch:3400,look:4500,sneeze:2200}
  const idleDelay=60000
  let due=0
  let timer, current=null, last=null, bag=[], parked=false, music=false, held=false
  function eligible(){return parked && !music && !held}
  function reschedule(){
    cancel(timer)
    if(current){clear(current);current=null}
    if(eligible())timer=schedule(play,Math.max(0,due-now()))
  }
  function interrupt(){
    due=now()+idleDelay
    reschedule()
  }
  function play(){
    if(!eligible())return
    if(!bag.length){
      bag=Object.keys(durations)
      for(let i=bag.length-1;i>0;i--){
        const j=Math.floor(random()*(i+1))
        ;[bag[i],bag[j]]=[bag[j],bag[i]]
      }
      if(bag[bag.length-1]===last)bag.reverse()
    }
    current=bag.pop()
    last=current
    show(current)
    timer=schedule(()=>{
      clear(current);current=null
      if(eligible())timer=schedule(play,9000+Math.floor(random()*6000))
    },durations[current])
  }
  return {
    mode(value){parked=value==='pet';held=false;interrupt()},
    music(value){if(music!==value){music=value;reschedule()}},
    press(){held=true;interrupt()},
    release(){if(held){held=false;interrupt()}},
    activity:interrupt
  }
}
if(typeof module!=='undefined')module.exports={idleController}
