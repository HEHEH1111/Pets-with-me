const test=require('node:test')
const assert=require('node:assert/strict')
const {idleController}=require('../ui/idle')

function fixture(now=()=>0){
  let pending,active=null
  const seen=[]
  const idle=idleController({
    show(effect){active=effect;seen.push(effect)},
    clear(effect){assert.equal(effect,active);active=null},
    random:()=>0.4, now,
    schedule(fn,ms){pending={fn,ms};return pending},
    cancel(){pending=null}
  })
  return {idle,seen,next(){const {fn}=pending;pending=null;fn()},wait:()=>pending?.ms,active:()=>active}
}
test('每轮六个不同动作；两轮交界也不连续重复',()=>{
  const f=fixture()
  f.idle.mode('pet')
  assert.equal(f.wait(),60000)
  for(let i=0;i<12;i++){f.next();f.next()}
  assert.equal(new Set(f.seen.slice(0,6)).size,6)
  assert.equal(new Set(f.seen.slice(6)).size,6)
  assert.notEqual(f.seen[5],f.seen[6])
})
test('切走焦点和短暂系统声音不推迟一分钟期限',()=>{
  let time=0
  const f=fixture(()=>time)
  f.idle.mode('pet')
  time=22000;f.idle.release()
  time=49000;f.idle.music(true)
  time=50500;f.idle.music(false);assert.equal(f.wait(),9500)
  time=60000;f.next();const effect=f.active()
  f.idle.release();assert.equal(f.active(),effect)
  f.idle.music(true);time=70000;f.idle.music(false);assert.equal(f.wait(),0)
})
test('音乐、拖动和面板中止待机，从最后一次互动计时',()=>{
  const f=fixture()
  f.idle.mode('pet');f.next();f.idle.music(true)
  assert.equal(f.active(),null);assert.equal(f.wait(),undefined)
  f.idle.activity();assert.equal(f.wait(),undefined)
  f.idle.music(false);assert.equal(f.wait(),60000)
  f.next();f.idle.press();assert.equal(f.wait(),undefined)
  f.idle.release();assert.equal(f.wait(),60000)
  for(const mode of ['talk','settings']){f.idle.mode(mode);f.idle.activity();assert.equal(f.wait(),undefined)}
  f.idle.mode('pet');assert.equal(f.wait(),60000)
})
