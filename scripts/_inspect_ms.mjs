// Разовая диагностика структуры заказов МойСклад (только чтение). Удалить после.
const login = process.env.MOYSKLAD_LOGIN
const password = process.env.MOYSKLAD_PASSWORD
const auth = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64')
const BASE = 'https://api.moysklad.ru/api/remap/1.2'

async function get(path) {
  const r = await fetch(BASE + path, { headers: { Authorization: auth, 'Accept-Encoding': 'gzip' } })
  if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 300)}`)
  return r.json()
}

const data = await get('/entity/customerorder?limit=5&order=moment,desc&expand=organization,agent,state')
console.log('total orders:', data.meta?.size)
for (const o of data.rows || []) {
  const attrs = (o.attributes || []).map((a) => ({ name: a.name, value: typeof a.value === 'object' ? (a.value?.name || a.value?.href) : a.value }))
  console.log('----')
  console.log('name:', o.name)
  console.log('organization:', o.organization?.name)
  console.log('agent:', o.agent?.name)
  console.log('state:', o.state?.name)
  console.log('externalCode:', o.externalCode)
  console.log('attributes:', JSON.stringify(attrs, null, 0))
}
