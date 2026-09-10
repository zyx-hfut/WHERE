import { createItem, deleteItem, getItems, getLists, searchItems, updateItem } from './storage'
import type { Item, ItemInput } from './types'
import capabilityDocument from '../knowledge/agent-capabilities.md?raw'

export type AgentProvider = 'mock' | 'deepseek'
export type AgentProviderConfig = {
  presetId: string
  provider: AgentProvider
  name: string
  baseUrl: string
  model: string
  apiKey?: string
}
export type AgentStep = { name: string; detail: string; status: 'done' | 'current' | 'error' }
export type AgentTaskIntent = 'create_item' | 'create_items' | 'update_item' | 'move_items_by_location' | 'delete_item' | 'delete_items' | 'update_note'
export type AgentIntent = 'query_items' | AgentTaskIntent | 'multi_step' | 'chat'
export type QueryMode = 'item_name' | 'location_contains' | 'semantic_category' | 'all_items'
export type AgentPlan = {
  intent: AgentIntent
  query?: string
  queryMode?: QueryMode
  locationContains?: string
  category?: string
  name?: string
  itemName?: string
  itemNameContains?: string
  itemNames?: string[]
  oldLocation?: string
  newLocation?: string
  location?: string
  listName?: string
  note?: string
  items?: Array<{ name: string; location: string; listName?: string; note?: string }>
  tasks?: AgentTask[]
  reply?: string
}
export type AgentTask = { intent: AgentTaskIntent; taskId?: string; name?: string; itemName?: string; itemNameContains?: string; itemNames?: string[]; oldLocation?: string; newLocation?: string; location?: string; locationContains?: string; listName?: string; note?: string; items?: Array<{ name: string; location: string; listName?: string; note?: string }> }
export type PendingAction = {
  type: AgentTaskIntent | 'batch'
  description: string
  input?: ItemInput
  inputs?: ItemInput[]
  item?: Item
  items?: Item[]
  actions?: PendingAction[]
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

type CompletionRequest = { system: string; user: string; context?: string }
export type AgentProgress = { type: 'step'; step: AgentStep } | { type: 'token'; token: string }
type CompletionProvider = { complete(request: CompletionRequest): Promise<string>; stream?(request: CompletionRequest, onToken: (token: string) => void): Promise<string> }

export const defaultConfig: AgentProviderConfig = {
  presetId: 'default',
  provider: 'mock',
  name: 'Mock 测试模型',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
}

function unique(values: string[]) { return [...new Set(values.filter(Boolean))] }
function normalized(value: string) { return value.toLocaleLowerCase().replace(/[\s“”"'？?。！!，,、：:；;]/g, '') }

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
  const intents: AgentIntent[] = ['query_items', 'create_item', 'create_items', 'update_item', 'move_items_by_location', 'delete_item', 'delete_items', 'update_note', 'multi_step', 'chat']
  if (!intents.includes(parsed.intent)) throw new Error('模型返回了不支持的意图')
  if (parsed.intent === 'multi_step' && (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0)) throw new Error('模型返回的任务计划为空')
  return parsed
}

export function mockPlan(message: string, context = ''): AgentPlan {
  const input = normalized(message)
  const fixtures: Array<{ triggers: string[]; plan: AgentPlan }> = [
    { triggers: ['我的作业本学生证充电宝都在书包里', '作业本学生证充电宝都在书包里'], plan: { intent: 'create_items', items: [{ name: '作业本', location: '书包' }, { name: '学生证', location: '书包' }, { name: '充电宝', location: '书包' }] } },
    { triggers: ['帮我记录雨伞放在书柜的架子上', '记录雨伞放在书柜架子上'], plan: { intent: 'create_item', name: '雨伞', location: '书柜的架子上', listName: '放在' } },
    { triggers: ['放在科教楼a座和c座之间的电动车现在放在宿舍楼下', '电动车现在放在宿舍楼下'], plan: { intent: 'update_item', itemName: '电动车', oldLocation: '科教楼A座和C座之间', newLocation: '宿舍楼下' } },
    { triggers: ['我的电动车停哪了', '电动车停哪了'], plan: { intent: 'query_items', query: '电动车', queryMode: 'item_name' } },
    { triggers: ['我的床头柜里存放了哪些东西', '床头柜里有什么'], plan: { intent: 'query_items', query: '床头柜', queryMode: 'location_contains', locationContains: '床头柜' } },
    { triggers: ['我的钱包里有什么', '钱包里有什么'], plan: { intent: 'query_items', query: '钱包', queryMode: 'location_contains', locationContains: '钱包' } },
    { triggers: ['我的电子设备都放在哪些地方了', '我的电子设备都放在哪里'], plan: { intent: 'query_items', query: '电子设备', queryMode: 'semantic_category', category: 'electronic_device' } },
    { triggers: ['我目前一共有哪些物品', '我有哪些物品', '列出所有物品', '目前记录了什么', '所有物品有哪些'], plan: { intent: 'query_items', query: '全部物品', queryMode: 'all_items' } },
    { triggers: ['帮我删掉需要用电的物品项', '删除需要用电的物品'], plan: { intent: 'delete_items', query: '需要用电', queryMode: 'semantic_category', category: 'needs_electricity' } },
    { triggers: ['给雨伞添加备注黑色长柄', '给雨伞备注黑色长柄'], plan: { intent: 'update_note', itemName: '雨伞', note: '黑色长柄' } },
    { triggers: ['帮我删掉名称中包含钥匙的物品项', '删除名称中包含钥匙的物品'], plan: { intent: 'delete_items', itemNameContains: '钥匙' } },
    { triggers: ['把第二个抽屉里的东西都放到床头的储物箱中删除钱包里的银行卡便携手电筒放在钱包里'], plan: { intent: 'multi_step', tasks: [{ taskId: 'move-drawer', intent: 'move_items_by_location', locationContains: '第二个抽屉', newLocation: '床头的储物箱中' }, { taskId: 'delete-card', intent: 'delete_item', itemName: '银行卡', locationContains: '钱包' }, { taskId: 'add-flashlight', intent: 'create_item', name: '便携手电筒', location: '钱包', listName: '放在' }] } },
  ]
  const fixture = fixtures.find((candidate) => candidate.triggers.some((trigger) => input.includes(normalized(trigger))))
  if (fixture) return fixture.plan
  if ((input.includes('这几个都删掉') || input.includes('都删除')) && context.includes('钥匙')) return { intent: 'delete_items', itemNameContains: '钥匙' }
  if (input === '都添加' && context) { const previous = mockPlan(context); if (previous.intent === 'create_items') return previous }
  return { intent: 'chat', reply: 'Mock Provider 当前只覆盖项目示例场景；切换 DeepSeek Provider 后可处理更开放的自然语言。' }
}

class MockProvider implements CompletionProvider {
  async complete(request: CompletionRequest) { if (request.system.includes('候选筛选器')) return mockSemanticSelection(request.user); return request.system.includes('最终回答整理器') ? mockSynthesis(request.user) : JSON.stringify(mockPlan(request.user, request.context)) }
  async stream(request: CompletionRequest, onToken: (token: string) => void) { const value = await this.complete(request); for (const chunk of value.match(/.{1,4}/gu) || []) { onToken(chunk); await new Promise((resolve) => setTimeout(resolve, 12)) }; return value }
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

  async stream(request: CompletionRequest, onToken: (token: string) => void) {
    if (!this.config.apiKey) throw new Error('DeepSeek API Key 未配置')
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.apiKey}` }, body: JSON.stringify({ model: this.config.model, temperature: 0.2, stream: true, messages: [{ role: 'system', content: request.system }, { role: 'user', content: request.user }] }) })
    if (!response.ok) throw new Error(`模型请求失败：HTTP ${response.status}`)
    if (!response.body) return this.complete(request)
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let full = ''
    while (true) {
      const { value, done } = await reader.read(); buffer += decoder.decode(value || new Uint8Array(), { stream: !done }); const lines = buffer.split('\n'); buffer = lines.pop() || ''
      for (const line of lines) { if (!line.startsWith('data:')) continue; const payload = line.slice(5).trim(); if (!payload || payload === '[DONE]') continue; const json = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> }; const token = json.choices?.[0]?.delta?.content || ''; if (token) { full += token; onToken(token) } }
      if (done) break
    }
    return full
  }
}

function providerFor(config: AgentProviderConfig): CompletionProvider { return config.provider === 'deepseek' ? new DeepSeekProvider(config) : new MockProvider() }

function mockSemanticSelection(input: string) {
  const data = JSON.parse(input) as { category?: string; items: Item[] }
  const names = data.category === 'needs_electricity' ? data.items.filter((item) => /吹风机|充电宝|电脑|手机|相机|耳机|平板|电动车|电器|电子/.test(item.name + item.note)).map((item) => item.name) : data.items.map((item) => item.name)
  return JSON.stringify({ itemNames: [...new Set(names)] })
}

export function mockSynthesis(input: string) {
  const data = JSON.parse(input) as { question: string; plan: AgentPlan; items: Item[] }
  const query = data.plan.locationContains || data.plan.query || data.plan.itemName || ''
  let candidates = data.items
  if (data.plan.category === 'needs_electricity') candidates = candidates.filter((item) => /吹风机|充电宝|电脑|手机|相机|耳机|平板|电动车|电器|电子/.test(item.name + item.note + item.location))
  const uniqueItems = [...new Map(candidates.filter((item) => item.name !== query).map((item) => [item.name, item])).values()]
  if (!uniqueItems.length) return `没有找到与“${query}”相关的内容。`
  if (data.plan.queryMode === 'location_contains') return `${query}里有：${uniqueItems.map((item) => item.name).join('、')}。`
  if (data.plan.queryMode === 'semantic_category') return `符合“${query}”的物品有：${uniqueItems.map((item) => `${item.name}，在${item.location}`).join('；')}。`
  if (uniqueItems.length === 1) return `找到了：${uniqueItems[0].name}，${uniqueItems[0].listName}${uniqueItems[0].location}。`
  return uniqueItems.map((item) => `${item.name}在${item.location}`).join('；') + '。'
}

function agentSystem(capabilities: string, context = '') {
  return `你是 WHERE 物品位置助手。你只能根据能力文档规划物品查询或物品管理操作。先识别用户意图，严格只返回一个 JSON 对象，不要 Markdown，不要解释。

能力文档：
${capabilities}

允许的 intent：query_items、create_item、create_items、update_item、delete_item、delete_items、update_note、chat。
JSON 字段规则：query_items 使用 query、queryMode；如果用户询问“有哪些物品”“列出全部记录”等全量问题，必须使用 queryMode: all_items，不要填写空查询词；当 queryMode 为 location_contains 时填写 locationContains；当 queryMode 为 semantic_category 时填写 category（类别可以是模型根据用户语义命名的自然语言）；复杂请求必须使用 intent: multi_step 和 tasks 数组，严格按用户表达拆分成多个独立任务，不要把多个操作压缩成一个任务。任务可使用 create_item（name、location、listName）、create_items（items）、update_item（itemName、oldLocation、newLocation）、move_items_by_location（locationContains、newLocation）、delete_item（itemName、locationContains 可选）、delete_items（itemNameContains、itemNames 或 queryMode/category）、update_note（itemName、note）。不要生成 SQL，不要假设数据库中不存在的 itemId。每个任务都必须保留用户原意，任务之间按用户语序排列。

对话上下文（只用于理解当前消息，不要复述）：
${context || '无'}`
}

function synthesisSystem() {
  return `你是 WHERE 的最终回答整理器。你会收到用户原问题、结构化计划和本地工具返回的物品记录。请用自然、简洁的中文回答，不要逐条机械复述 JSON。\n\n规则：\n- 根据用户问题判断真正需要的信息。\n- 对 semantic_category 必须逐个判断候选物品是否符合用户描述的类别，不能只依赖固定关键词。例如“需要用电”通常包括吹风机、充电宝、电脑、手机等需要电池或电源才能工作的物品。\n- 如果问题是“某个位置里有什么”，不要把代表这个容器本身的记录当作里面的物品；例如“钱包 存有 银行卡”不能和“银行卡 放在 钱包”重复计算。\n- 同一物品只回答一次，合并重复记录。\n- “位置包含关系”要包含更具体的位置，例如“床头柜第一个抽屉”属于“床头柜”。\n- 如果没有结果，明确说明没有找到。\n- 只使用工具结果中的事实，不要编造。只返回最终给用户看的文字。`
}

function queryText(plan: AgentPlan, original: string) { return plan.query?.trim() || plan.locationContains?.trim() || plan.itemName?.trim() || original.trim() }

async function resolveItem(plan: AgentPlan) {
  const query = plan.itemName || plan.name || plan.query || ''
  let candidates = await searchItems(query)
  if (plan.oldLocation) candidates = candidates.filter((item) => normalized(item.location).includes(normalized(plan.oldLocation!)))
  if (plan.locationContains) candidates = candidates.filter((item) => normalized(item.location).includes(normalized(plan.locationContains!)))
  return { item: candidates.length === 1 ? candidates[0] : undefined, candidates }
}

function summarizeItems(items: Item[], query: string) {
  if (!items.length) return `我在本地记录中没有找到与“${query}”相关的物品。`
  if (items.length === 1) { const item = items[0]; return `找到了：${item.name} ${item.listName} ${item.location}${item.note ? `。备注：${item.note}` : ''}` }
  return `找到 ${items.length} 条相关记录：${unique(items.map((item) => `${item.name} ${item.listName} ${item.location}`)).join('；')}。`
}

async function resolveQuery(plan: AgentPlan) {
  if (plan.queryMode === 'all_items') {
    const lists = await getLists()
    return (await Promise.all(lists.map((list) => getItems(list.id)))).flat().sort((a, b) => b.updatedAt - a.updatedAt)
  }
  if (plan.queryMode === 'semantic_category') {
    const lists = await getLists()
    const all = (await Promise.all(lists.map((list) => getItems(list.id)))).flat()
    return all
  }
  return searchItems(plan.locationContains || plan.query || '')
}

async function selectSemanticItems(plan: AgentPlan, candidates: Item[], provider: CompletionProvider) {
  const raw = await provider.complete({ system: '你是 WHERE 候选筛选器。根据用户语义类别，从给出的物品候选中选择符合条件的物品。只返回 JSON：{"itemNames":["物品名"]}。不要编造候选之外的名称。', user: JSON.stringify({ category: plan.category || plan.query, items: candidates }) })
  const selected = JSON.parse(raw) as { itemNames?: string[] }
  return candidates.filter((item) => selected.itemNames?.includes(item.name))
}

async function buildPendingAction(plan: AgentPlan, provider: CompletionProvider) {
  if (plan.intent === 'create_items') {
    if (!plan.items?.length) return { text: '我理解你想批量记录物品，但没有识别到具体物品。', items: [] as Item[] }
    const lists = await getLists()
    const inputs: ItemInput[] = plan.items.flatMap((entry) => { const list = lists.find((itemList) => itemList.name === entry.listName) || lists[0]; return list ? [{ listId: list.id, name: entry.name, location: entry.location, note: entry.note }] : [] })
    return { text: `准备新增 ${inputs.length} 件物品：${inputs.map((input) => `${input.name}（${input.location}）`).join('、')}。`, items: [], action: { type: 'create_items' as const, description: `批量新增 ${inputs.length} 件物品`, inputs } }
  }
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
  if (plan.intent === 'delete_items') {
    const query = plan.itemNameContains || plan.query || ''
    let candidates = query ? (await searchItems(query)).filter((item) => item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())) : []
    if (!candidates.length && plan.queryMode === 'semantic_category') candidates = await selectSemanticItems(plan, await resolveQuery(plan), provider)
    if (!candidates.length && plan.itemNames?.length) {
      const resolved = await Promise.all(plan.itemNames.map((name) => searchItems(name)))
      candidates = resolved.flat().filter((item, index, all) => plan.itemNames!.some((name) => item.name === name) && all.findIndex((entry) => entry.id === item.id) === index)
    }
    if (!candidates.length) return { text: query ? `没有找到名称包含“${query}”的物品。` : '没有找到可以批量删除的物品。', items: [] as Item[] }
    const description = query ? `批量删除 ${candidates.length} 个名称包含“${query}”的物品` : `批量删除 ${candidates.length} 个选定物品`
    return { text: `${query ? `找到 ${candidates.length} 个名称包含“${query}”的物品` : `找到 ${candidates.length} 个选定物品`}：${candidates.map((item) => `${item.name}（${item.location}）`).join('、')}。准备批量删除，请确认。`, items: candidates, action: { type: 'delete_items' as const, description, items: candidates } }
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

async function buildMultiStepAction(plan: AgentPlan, provider: CompletionProvider) {
  const tasks = plan.tasks || []
  const actions: PendingAction[] = []
  const affectedItems: Item[] = []
  const summaries: string[] = []
  for (const [index, task] of tasks.entries()) {
    if (task.intent === 'move_items_by_location') {
      const location = task.locationContains || task.location || ''
      const candidates = (await searchItems(location)).filter((item) => normalized(item.location).includes(normalized(location)))
      if (!candidates.length) { summaries.push(`步骤 ${index + 1}：没有找到位置包含“${location}”的物品`); continue }
      affectedItems.push(...candidates)
      for (const item of candidates) actions.push({ type: 'update_item', description: `将“${item.name}”移动到“${task.newLocation || ''}”`, item, input: { listId: item.listId, name: item.name, location: task.newLocation || item.location, note: item.note, icon: item.icon } })
      summaries.push(`步骤 ${index + 1}：找到 ${candidates.length} 件物品，将移动到“${task.newLocation || ''}”`)
      continue
    }
    const result = await buildPendingAction({ ...task, intent: task.intent } as AgentPlan, provider)
    summaries.push(`步骤 ${index + 1}：${result.text}`)
    affectedItems.push(...result.items)
    if (result.action) actions.push(result.action)
  }
  if (!actions.length) return { text: summaries.join('\n'), items: affectedItems }
  return { text: `已分解为 ${tasks.length} 个子任务：\n${summaries.join('\n')}\n\n以上操作尚未执行，请确认。`, items: affectedItems, action: { type: 'batch' as const, description: `按计划执行 ${actions.length} 个本地操作`, actions } }
}

export async function runAgent(message: string, config: AgentProviderConfig = defaultConfig, onProgress?: (progress: AgentProgress) => void, conversationContext = ''): Promise<AgentAnswer> {
  const capabilities = retrieveCapabilities(message)
  const steps: AgentStep[] = [
    { name: '检索能力文档', detail: capabilities ? '命中 WHERE 物品管理能力' : '未命中能力文档', status: 'done' },
    { name: '理解请求', detail: `使用${config.provider === 'deepseek' ? ' DeepSeek' : ' Mock'} Provider 生成结构化意图`, status: 'current' },
  ]
  onProgress?.({ type: 'step', step: steps[0] })
  const provider = providerFor(config)
  const plan = extractJson(await provider.complete({ system: agentSystem(capabilities, conversationContext), user: message, context: conversationContext }))
  steps[1] = { name: '理解请求', detail: `识别为 ${plan.intent}`, status: 'done' }
  onProgress?.({ type: 'step', step: steps[1] })
  if (plan.intent === 'chat') return { text: plan.reply || '我可以帮助你管理物品位置。', items: [], query: '', plan, provider: config.provider, steps: [...steps, { name: '整理结果', detail: '生成对话回复', status: 'current' }] }
  if (plan.intent === 'multi_step') {
    const planningStep = { name: '任务分解与规划', detail: `识别出 ${plan.tasks?.length || 0} 个有序子任务`, status: 'done' as const }
    onProgress?.({ type: 'step', step: planningStep })
    const pending = await buildMultiStepAction(plan, provider)
    const checkStep = { name: '逐步检索与校验', detail: `已生成 ${pending.action?.actions?.length || 0} 个待执行操作`, status: 'done' as const }
    onProgress?.({ type: 'step', step: checkStep })
    return { text: pending.text, items: pending.items, query: '', plan, pendingAction: pending.action, provider: config.provider, steps: [...steps, planningStep, checkStep, { name: pending.action ? '等待确认' : '整理结果', detail: pending.action ? '所有子任务将在确认后执行' : '部分任务需要补充信息', status: 'current' }] }
  }
  if (plan.intent === 'query_items') {
    const query = queryText(plan, message)
    const items = await resolveQuery(plan)
    onProgress?.({ type: 'step', step: { name: '检索本地数据', detail: `匹配 ${items.length} 条记录`, status: 'done' } })
    let text = ''
    const request = { system: synthesisSystem(), user: JSON.stringify({ question: message, plan, items }) }
    if (provider.stream) text = await provider.stream(request, (token) => onProgress?.({ type: 'token', token }))
    else text = await provider.complete(request)
    onProgress?.({ type: 'step', step: { name: '整理结果', detail: '模型已根据工具结果去重并生成自然语言回答', status: 'current' } })
    return { text, items, query, plan, provider: config.provider, steps: [...steps, { name: '检索本地数据', detail: `匹配 ${items.length} 条记录`, status: 'done' }, { name: '整理结果', detail: '模型已根据工具结果去重并生成自然语言回答', status: 'current' }] }
  }
  const pending = await buildPendingAction(plan, provider)
  return { text: pending.text, items: pending.items, query: queryText(plan, message), plan, pendingAction: pending.action, provider: config.provider, steps: [...steps, { name: '检索本地数据', detail: `找到 ${pending.items.length} 个候选目标`, status: 'done' }, { name: '等待确认', detail: pending.action ? '变更尚未执行' : '需要补充信息', status: 'current' }] }
}

export async function confirmAgentAction(action: PendingAction) {
  if (action.type === 'batch' && action.actions) for (const child of action.actions) await confirmAgentAction(child)
  else if (action.type === 'create_items' && action.inputs) for (const input of action.inputs) await createItem(input)
  else if (action.type === 'create_item' && action.input) await createItem(action.input)
  else if ((action.type === 'update_item' || action.type === 'update_note') && action.item && action.input) await updateItem(action.item.id, action.input)
  else if (action.type === 'delete_items' && action.items) for (const item of action.items) await deleteItem(item.id)
  else if (action.type === 'delete_item' && action.item) await deleteItem(action.item.id)
  else throw new Error('无效的智能体操作')
  window.dispatchEvent(new CustomEvent('where:data-changed'))
  return action.description + '已完成，历史记录已保存。'
}

export async function runLocalAgent(message: string): Promise<AgentAnswer> { return runAgent(message, defaultConfig) }
