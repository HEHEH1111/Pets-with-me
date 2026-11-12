const test = require('node:test')
const assert = require('node:assert/strict')
const {Rhythm} = require('../music')

for(const [period,expected] of [[960,'sway'],[600,'nod'],[400,'hop']]){
  test('律动随拍点间隔切换：'+expected,()=>{
    const rhythm = new Rhythm()
    let last, beats=0
    for(let time=0;time<period*7;time+=40){
      last=rhythm.sample(time%period<80 ? 0.1 : 0.003,time)
      if(last.beat) beats++
    }
    assert.equal(last.style,expected)
    assert.equal(beats,7)
    for(let time=period*7;time<period*7+1600;time+=40)last=rhythm.sample(0,time)
    assert.equal(last.style,'quiet')
  })
}
test('连续平稳的声音不反复生成强拍',()=>{
  const rhythm = new Rhythm()
  let beats=0
  for(let t=0;t<5000;t+=40)if(rhythm.sample(0.07,t).beat)beats++
  assert.equal(beats,1)
})
