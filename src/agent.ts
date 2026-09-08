import { createItem, deleteItem, getItems, getLists, searchItems, updateItem } from './storage'
import type { Item, ItemInput } from './types'
import capabilityDocument from '../knowledge/agent-capabilities.md?raw'

export type AgentProvider = 'mock' | 'deepseek'
export type AgentProviderConfig = {
  provider: AgentProvider
  name: string
  baseUrl: string
  model: string
  apiKey?: string
}
export type AgentStep = { name: string; detail: string; status: 'done' | 'current' | 'error' }
export type AgentIntent = 'query_items' | 'create_item' | 'update_item' | 'delete_item' | 'update_note' | 'chat'
export type AgentPlan = {
  intent: AgentIntent
  query?: string
  name?: string
  itemName?: string
  oldLocation?: string
  newLocation?: string
  location?: string
  listName?: string
  note?: string
  reply?: string
}
export type PendingAction = {
  type: Exclude<AgentIntent, 'query_items' | 'chat'>
  description: string
  input?: ItemInput
  item?: Item
}
export type AgentAnswer = {
  text: string
  items: Item[]
  query: string
  plan: AgentPlan
  pendingAction?: PendingAction
  provider: AgentProvider
  steps: AgentStep[]
}

type CompletionRequest = { system: string; user: string }
type CompletionProvider = { complete(request: CompletionRequest): Promise<string> }

export const defaultConfig: AgentProviderConfig = {
  provider: 'mock',
  name: 'Mock 测试模型',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
}

function unique(values: string[]) { return [...new Set(values.filter(Boolean))] }
function normalized(value: string) { return value.toLocaleLowerCase().replace(/[\s“”"'？?。！!，,：:；;]/g, '') }

function retrieveCapabilities(message: string) {
  const terms = [...normalized(message)]
  return capabilityDocument
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((paragraph) => ({ paragraph, score: terms.filter((term) => normalized(paragraph).includes(term)).length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ paragraph }) => paragraph.trim())
    .join('\n\n')
}

export function extractJson(value: string): AgentPlan {
  const cleaned = value.replace(/```json|```/gi, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('模型没有返回结构化 JSON')
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as AgentPlan
  const intents: AgentIntent[] = ['query_items', 'create_item', 'update_item', 'delete_item', 'update_note', 'chat']
  if (!intents.includes(parsed.intent)) throw new Error('模型返回了不支持的意图')
  return parsed
}

export function mockPlan(message: string): AgentPlan {
  const clean = message.trim().replace(/[“”"'？?。！!]/g, '')
  const createMatch = clean.match(/(?:帮我)?(?:记录|添加|新增)[：:]?(.+?)(?:放在|存有)(.+)$/)
  if (createMatch) return { intent: 'create_item', name: createMatch[1].trim(), location: createMatch[2].trim(), listName: clean.includes('存有') ? '存有' : '放在' }
  const updateMatch = clean.match(/(.+?)(?:现在|目前)放在(.+?)(?:改|换|搬|放)到(.+)$/)
  if (updateMatch) return { intent: 'update_item', itemName: updateMatch[1].replace(/我的/g, '').trim(), oldLocation: updateMatch[2].trim(), newLocation: updateMatch[3].trim() }
  const moveMatch = clean.match(/(.+?)(?:现在|目前)放在(.+)$/)
  if (moveMatch) return { intent: 'update_item', itemName: moveMatch[1].replace(/我的/g, '').trim(), newLocation: moveMatch[2].trim() }
  const deleteMatch = clean.match(/(?:删除|移除)(?:物品)?(.+)$/)
  if (deleteMatch) return { intent: 'delete_item', itemName: deleteMatch[1].trim() }
  const noteMatch = clean.match(/给(.+?)(?:添加|备注|记下)(?:备注)?[：:]?(.+)$/)
  if (noteMatch) return { intent: 'update_note', itemName: noteMatch[1].trim(), note: noteMatch[2].trim() }
  if (/哪|位置|在哪里|在哪|停哪|放在哪|有什么|哪些/.test(clean)) return { intent: 'query_items', query: clean.replace(/^(我的|请问|告诉我)/, '').replace(/(停哪了|在哪里|在哪儿|在哪|有什么|哪些东西|放在哪)$/g, '').trim() }
  return { intent: 'chat', reply: '我可以帮你查询、记录、修改、删除物品位置，也可以管理备注。当前写操作会先展示预览，确认后才执行。' }
}

class MockProvider implements CompletionProvider {
  async complete(request: CompletionRequest) { return JSON.stringify(mockPlan(request.user)) }
}

class DeepSeekProvider implements CompletionProvider {
  constructor(private readonly config: AgentProviderConfig) {}

  async complete(request: CompletionRequest) {
    if (!this.config.apiKey) throw new Error('DeepSeek API Key 未配置')
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.apiKey}` },
      body: JSON.stringify({ model: this.config.model, temperature: 0.1, messages: [{ role: 'system', content: request.system }, { role: 'user', content: request.user }] }),
    })
    if (!response.ok) throw new Error(`模型请求失败：HTTP ${response.status}`)
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    const content = payload.choices?.[0]?.message?.content
    if (!content) throw new Error('模型没有返回内容')
    return content
  }
}

function providerFor(config: AgentProviderConfig): CompletionProvider { return config.provider === 'deepseek' ? new DeepSeekProvider(config) : new MockProvider() }

function agentSystem(capabilities: string) {
  return `你是 WHERE 物品位置助手。你只能根据能力文档规划物品查询或物品管理操作。先识别用户意图，严格只返回一个 JSON 对象，不要 Markdown，不要解释。

能力文档：
${capabilities}

允许的 intent：query_items、create_item、update_item、delete_item、update_note、chat。
JSON 字段规则：query_items 使用 query；create_item 使用 name、location、listName；update_item 使用 itemName、oldLocation（可选）、newLocation；delete_item 使用 itemName；update_note 使用 itemName、note；chat 使用 reply。不要生成 SQL，不要假设数据库中不存在的 itemId。`
}

function queryText(plan: AgentPlan, original: string) { return plan.query?.trim() || plan.itemName?.trim() || original.trim() }

async function resolveItem(plan: AgentPlan) {
  const query = plan.itemName || plan.name || plan.query || ''
  let candidates = await searchItems(query)
  if (plan.oldLocation) candidates = candidates.filter((item) => normalized(item.location).includes(normalized(plan.oldLocation!)))
  return { item: candidates.length === 1 ? candidates[0] : undefined, candidates }
}

function summarizeItems(items: Item[], query: string) {
  if (!items.length) return `我在本地记录中没有找到与“${query}”相关的物品。`
  if (items.length === 1) { const item = items[0]; return `找到了：${item.name} ${item.listName} ${item.location}${item.note ? `。备注：${item.note}` : ''}` }
  return `找到 ${items.length} 条相关记录：${unique(items.map((item) => `${item.name} ${item.listName} ${item.location}`)).join('；')}。`
}

async function buildPendingAction(plan: AgentPlan) {
  if (plan.intent === 'create_item') {
    if (!plan.name || !plan.location) return { text: '我理解你想记录一个物品，但还缺少物品名称或位置。', items: [] as Item[] }
    const lists = await getLists()
    const list = lists.find((entry) => entry.name === plan.listName) || lists[0]
    if (!list) return { text: '当前没有可用的物品列表。', items: [] as Item[] }
    return {
      text: `准备新增：${plan.name} ${list.name} ${plan.location}`,
      items: [] as Item[],
      action: {
        type: 'create_item' as const,
        description: `新增“${plan.name} ${list.name} ${plan.location}”`,
        input: { listId: list.id, name: plan.name, location: plan.location, note: undefined },
      },
    }
  }
  const resolved = await resolveItem(plan)
  if (!resolved.item) {
    if (resolved.candidates.length > 1) return { text: `找到多个可能的物品：${resolved.candidates.map((item) => `${item.name}（${item.location}）`).join('、')}。请补充更明确的位置。`, items: resolved.candidates }
    return { text: `没有找到可以执行“${plan.intent}”的目标物品。`, items: [] as Item[] }
  }
  const item = resolved.item
  if (plan.intent === 'update_item') {
    if (!plan.newLocation) return { text: '我理解你想修改位置，但还缺少新位置。', items: [item] }
    return {
      text: `准备将“${item.name}”的位置从“${item.location}”修改为“${plan.newLocation}”。`,
      items: [item],
      action: {
        type: 'update_item' as const,
        description: `修改“${item.name}”的位置`,
        item,
        input: { listId: item.listId, name: item.name, location: plan.newLocation, note: item.note, icon: item.icon },
      },
    }
  }
  if (plan.intent === 'update_note') return {
    text: `准备给“${item.name}”添加备注：“${plan.note || ''}”。`,
    items: [item],
    action: {
      type: 'update_note' as const,
      description: `更新“${item.name}”的备注`,
      item,
      input: { listId: item.listId, name: item.name, location: item.location, note: plan.note, icon: item.icon },
    },
  }
  return {
    text: `准备删除“${item.name} ${item.listName} ${item.location}”。`,
    items: [item],
    action: { type: 'delete_item' as const, description: `删除“${item.name}”`, item },
  }
}

export async function runAgent(message: string, config: AgentProviderConfig = defaultConfig): Promise<AgentAnswer> {
  const capabilities = retrieveCapabilities(message)
  const steps: AgentStep[] = [
    { name: '检索能力文档', detail: capabilities ? '命中 WHERE 物品管理能力' : '未命中能力文档', status: 'done' },
    { name: '理解请求', detail: `使用${config.provider === 'deepseek' ? ' DeepSeek' : ' Mock'} Provider 生成结构化意图`, status: 'current' },
  ]
  const plan = extractJson(await providerFor(config).complete({ system: agentSystem(capabilities), user: message }))
  steps[1] = { name: '理解请求', detail: `识别为 ${plan.intent}`, status: 'done' }
  if (plan.intent === 'chat') return { text: plan.reply || '我可以帮助你管理物品位置。', items: [], query: '', plan, provider: config.provider, steps: [...steps, { name: '整理结果', detail: '生成对话回复', status: 'current' }] }
  if (plan.intent === 'query_items') {
    const query = queryText(plan, message)
    let items = await searchItems(query)
    if (!items.length && /电子设备|电子产品/.test(message)) { const lists = await getLists(); items = (await Promise.all(lists.map((list) => getItems(list.id)))).flat().filter((item) => /电动车|充电|电脑|手机|相机|耳机|平板|电子/.test(item.name + item.note + item.location)) }
    return { text: summarizeItems(items, query), items, query, plan, provider: config.provider, steps: [...steps, { name: '检索本地数据', detail: `匹配 ${items.length} 条记录`, status: 'done' }, { name: '整理结果', detail: '生成只读回答', status: 'current' }] }
  }
  const pending = await buildPendingAction(plan)
  return { text: pending.text, items: pending.items, query: queryText(plan, message), plan, pendingAction: pending.action, provider: config.provider, steps: [...steps, { name: '检索本地数据', detail: `找到 ${pending.items.length} 个候选目标`, status: 'done' }, { name: '等待确认', detail: pending.action ? '变更尚未执行' : '需要补充信息', status: 'current' }] }
}

export async function confirmAgentAction(action: PendingAction) {
  if (action.type === 'create_item' && action.input) await createItem(action.input)
  else if ((action.type === 'update_item' || action.type === 'update_note') && action.item && action.input) await updateItem(action.item.id, action.input)
  else if (action.type === 'delete_item' && action.item) await deleteItem(action.item.id)
  else throw new Error('无效的智能体操作')
  window.dispatchEvent(new CustomEvent('where:data-changed'))
  return action.description + '已完成，历史记录已保存。'
}

export async function runLocalAgent(message: string): Promise<AgentAnswer> { return runAgent(message, defaultConfig) }
