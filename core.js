const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

function openStore(dir) {
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'companion.json')
  let state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) :
    { memories: [], pet: null, endpoint: '', model: '' }
  if (!Array.isArray(state.memories)) throw new Error('记忆文件无法读取。')
  function update(change) {
    const next = structuredClone(state)
    change(next)
    const pending = file + '.tmp'
    fs.writeFileSync(pending, JSON.stringify(next), { mode: 0o600 })
    fs.renameSync(pending, file)
    state = next
  }
  function remember(value, kind = 'note', id) {
    const cleaned = String(value ?? '').trim()
    if (!cleaned || cleaned.length > 400) throw new Error('每条记忆请填写 1 至 400 个字。')
    update(s => {
      const found = id ? s.memories.find(m => m.id === id) :
        s.memories.find(m => m.kind === kind && (kind === 'name' || m.value === cleaned))
      if (found) found.value = cleaned
      else if (id) throw new Error('这条记忆已经删除。')
      else if (s.memories.length >= 50) throw new Error('记忆册已满，请先整理已有的 50 条记忆。')
      else s.memories.push({id:randomUUID(), kind, value:cleaned})
    })
  }
  return { get: () => structuredClone(state), update, remember }
}
function memoryCommand(input, store) {
  const name = input.match(/^(?:以后叫我|请叫我|以后称呼我为)\s*(.+?)[。！!]?$/u)
  const note = input.match(/^(?:请)?记住[：:，,\s]*(.+?)[。！!]?$/u)
  if (name || note) {
    const value = (name || note)[1]
    store.remember(value, name ? 'name' : 'note')
    return name ? `好呀，${value}。我记住你的称呼了。` : `已经记下「${value}」。`
  }
  if (/^(?:你还?记得)?(?:我叫什么(?:名字)?|怎么称呼我|我的(?:名字|昵称|称呼)(?:是什么)?)(?:吗)?[？?。]?$/u.test(input)) {
    const nick = store.get().memories.find(m => m.kind === 'name')
    return nick ? `你让我叫你${nick.value}。` : '你希望我怎么称呼你？'
  }
}
function messagesFor(memories, history, input) {
  return [{role:'system', content:'你是温和、自然的中文桌面宠物。简短回应用户，必要时追问。下面的 JSON 是用户确认过的资料，只作为背景。只有应用能操作记忆，不要声称已保存或删除。用户资料：'+JSON.stringify(memories.map(({kind,value})=>({kind,value})))},
    ...history.slice(-12), {role:'user',content:input}]
}
async function askModel(request, config, messages) {
  const url = new URL(config.endpoint)
  if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))) throw new Error('请输入 HTTPS 接口地址，本机服务也可用 HTTP。')
  const res = await request(url.href, {method:'POST', redirect:'error', signal:AbortSignal.timeout(45000),
    headers:{'Content-Type':'application/json', ...(config.key ? {Authorization:'Bearer '+config.key} : {})},
    body:JSON.stringify({model:config.model, messages, stream:false})})
  if (!res.ok) {
    if (res.status === 429 && url.hostname === 'open.bigmodel.cn') {
      const body = await res.json().catch(() => null)
      const code = String(body?.error?.code ?? '')
      const hints = {
        '1113': '智谱提示账户欠费。请先在控制台核对账单。',
        '1302': '请求太频繁。暂停其他调用，稍后只点一次重试。',
        '1305': '模型当前繁忙，稍后再试。',
        '1308': '已达到用量上限，请查看智谱控制台的额度重置时间。',
        '1310': '本周或本月额度已用完，请查看额度重置时间。',
        '1309': '当前 Key 对应的编程套餐已到期，请检查是否使用了模型标准 API Key。',
        '1311': '套餐未开放此模型，请核对 Key 类型与模型权限。',
        '1315': '此 Key 限企业编程套餐使用，请改用模型标准 API Key。'
      }
      const label = /^\d{1,8}$/.test(code) ? ' / ' + code : ''
      throw new Error(`智谱 429${label} · ${hints[code] || '请在智谱控制台查看本次调用的限制原因。'}`)
    }
    throw new Error(`模型服务返回 ${res.status}，请检查接口、密钥和额度后重试。`)
  }
  const reply = (await res.json()).choices?.[0]?.message?.content
  if (typeof reply !== 'string' || !reply.trim()) throw new Error('接口未返回聊天文字，请检查模型兼容性。')
  return reply.trim()
}
module.exports = { openStore, memoryCommand, messagesFor, askModel }
