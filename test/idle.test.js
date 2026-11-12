const test=require('node:test')
const assert=require('node:assert/strict')
const {idleController}=require('../ui/idle')

function fixture(){
  let pending,active=null
  const seen=[]
  const idle=idleController({
    show(effect){active=effect;seen.push(effect)},
    clear(effect){assert.equal(effect,active);active=null},
    random:()=>0.4,
    schedule(fn,ms){pending={fn,ms};return pending},
    cancel(){pending=null}
  })
  return {idle,seen,next(){const {fn}=pending;pending=null;fn()},wait:()=>pending?.ms,active:()=>active}
}
test('每轮六个不同动作；两轮交界也不连续重复',()=>{
  const f=fixture()
  f.idle.mode('pet')
  assert.equal(f.wait(),120000)
  for(let i=0;i<12;i++){f.next();f.next()}
  assert.equal(new Set(f.seen.slice(0,6)).size,6)
  assert.equal(new Set(f.seen.slice(6)).size,6)
  assert.notEqual(f.seen[5],f.seen[6])
})
test('音乐、拖动和面板中止待机，恢复时重新等待两分钟',()=>{
  const f=fixture()
  f.idle.mode('pet');f.next();f.idle.music(true)
  assert.equal(f.active(),null);assert.equal(f.wait(),undefined)
  f.idle.activity();assert.equal(f.wait(),undefined)
  f.idle.music(false);assert.equal(f.wait(),120000)
  f.next();f.idle.press();assert.equal(f.wait(),undefined)
  f.idle.release();assert.equal(f.wait(),120000)
  for(const mode of ['talk','settings']){f.idle.mode(mode);f.idle.activity();assert.equal(f.wait(),undefined)}
  f.idle.mode('pet');assert.equal(f.wait(),120000)
})
