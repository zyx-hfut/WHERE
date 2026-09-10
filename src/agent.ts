import { createItem, deleteItem, getItems, getLists, searchItems, updateItem } from './storage'
import type { Item, ItemInput } from './types'
import capabilityDocument from '../knowledge/agent-capabilities.md?raw'
import { rankByCosine } from './vector-match'

export type AgentProvider = 'mock' | 'deepseek'
export type AgentProviderConfig = { presetId: string; provider: AgentProvider; name: string; baseUrl: string; model: string; apiKey?: string }
export type AgentStep = { name: string; detail: string; status: 'done' | 'current' | 'error' }
export type QueryMode = 'item_name' | 'location_contains' | 'semantic_category' | 'all_items'
export type ToolName = 'search_items' | 'get_lists' | 'create_item' | 'update_item' | 'delete_item'
export const TOOL_DEFINITIONS: Array<{ name: ToolName; description: string; readOnly: boolean; arguments: string[] }> = [
  { name: 'search_items', description: '按名称、名称包含、位置包含、备注或语义类别查找物品；scope=all 时返回全部物品', readOnly: true, arguments: ['name', 'name_contains', 'location_contains', 'note_contains', 'semantic_query', 'scope'] },
  { name: 'get_lists', description: '读取当前账号的物品列表', readOnly: true, arguments: [] },
  { name: 'create_item', description: '新增一个物品，必须提供 name 和 location', readOnly: false, arguments: ['name', 'location', 'list_name', 'note'] },
  { name: 'update_item', description: '更新一个已有物品，通常使用 forEach 引用 search_items 的结果和 $item.id', readOnly: false, arguments: ['item_id', 'location', 'name', 'note', 'list_name'] },
  { name: 'delete_item', description: '删除一个已有物品，必须使用已检索到的 item_id', readOnly: false, arguments: ['item_id'] },
]
export type PlanStep = { id: string; tool: ToolName; purpose: string; args?: Record<string, unknown>; forEach?: string }
export type AgentPlan = { goal: string; steps: PlanStep[]; intent?: string; query?: string; queryMode?: QueryMode; category?: string; itemName?: string; name?: string; location?: string; listName?: string; reply?: string }
export type PendingAction = { type: 'create_item' | 'update_item' | 'delete_item' | 'batch'; description: string; input?: ItemInput; item?: Item; actions?: PendingAction[] }
export type AtomicActionPreview = { operation: '新增' | '修改' | '删除'; subject: string; before?: string; after?: string; detail: string }
export type AgentAnswer = { text: string; items: Item[]; query: string; plan: AgentPlan; pendingAction?: PendingAction; provider: AgentProvider; steps: AgentStep[] }
export type AgentProgress = { type: 'step'; step: AgentStep } | { type: 'token'; token: string }

type CompletionRequest = { system: string; user: string; context?: string }
type CompletionProvider = { complete(request: CompletionRequest): Promise<string>; stream?(request: CompletionRequest, onToken: (token: string) => void): Promise<string> }
type ToolObservation = { items?: Item[]; lists?: Awaited<ReturnType<typeof getLists>> }

export const defaultConfig: AgentProviderConfig = { presetId: 'default', provider: 'mock', name: 'Mock 测试模型', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' }

export function describePendingAction(action: PendingAction): AtomicActionPreview[] {
  if (action.type === 'batch') return (action.actions || []).flatMap(describePendingAction)
  if (action.type === 'create_item' && action.input) return [{ operation: '新增', subject: action.input.name, after: action.input.location, detail: `新增“${action.input.name}”，位置：${action.input.location}` }]
  if (action.type === 'update_item' && action.item && action.input) return [{ operation: '修改', subject: action.item.name, before: action.item.location, after: action.input.location, detail: `将“${action.item.name}”从“${action.item.location}”移动到“${action.input.location}”` }]
  if (action.type === 'delete_item' && action.item) return [{ operation: '删除', subject: action.item.name, before: action.item.location, detail: `删除“${action.item.name}”（当前位置：${action.item.location}）` }]
  return [{ operation: '修改', subject: action.description, detail: action.description }]
}
function unique(values: string[]) { return [...new Set(values.filter(Boolean))] }
function normalized(value: string) { return value.toLocaleLowerCase().replace(/[\s“”"'？?。！!，,、：:；;]/g, '') }

function retrieveCapabilities(message: string) {
  const terms = [...normalized(message)]
  return capabilityDocument.split(/\n\s*\n/).filter(Boolean).map((paragraph) => ({ paragraph, score: terms.filter((term) => normalized(paragraph).includes(term)).length })).sort((a, b) => b.score - a.score).slice(0, 4).map(({ paragraph }) => paragraph.trim()).join('\n\n')
}

export function extractJson(value: string): AgentPlan {
  const cleaned = value.replace(/```json|```/gi, '').trim(); const start = cleaned.indexOf('{'); const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('模型没有返回结构化计划')
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as AgentPlan
  if (!parsed.goal || !Array.isArray(parsed.steps)) throw new Error('模型返回的计划格式不完整')
  const tools: ToolName[] = ['search_items', 'get_lists', 'create_item', 'update_item', 'delete_item']
  if (parsed.steps.some((step) => !step.id || !tools.includes(step.tool))) throw new Error('模型计划包含未注册工具')
  const stepIds = new Set(parsed.steps.map((step) => step.id))
  if (parsed.steps.some((step) => step.forEach && !stepIds.has(step.forEach.split('.')[0]))) throw new Error('模型计划引用了不存在的步骤')
  return parsed
}

export function mockPlan(message: string): AgentPlan {
  const input = normalized(message)
  if (input.includes('第二个抽屉里的东西都放到床头的储物箱中删除钱包里的银行卡便携手电筒放在钱包里')) return { goal: '完成三个物品位置操作', steps: [
    { id: 'find-drawer', tool: 'search_items', purpose: '找到第二个抽屉中的物品', args: { location_contains: '第二个抽屉' } },
    { id: 'move-drawer', tool: 'update_item', purpose: '将找到的物品移动到床头储物箱', forEach: 'find-drawer.items', args: { item_id: '$item.id', location: '床头的储物箱中' } },
    { id: 'find-card', tool: 'search_items', purpose: '定位钱包中的银行卡', args: { name: '银行卡', location_contains: '钱包' } },
    { id: 'delete-card', tool: 'delete_item', purpose: '删除找到的钱包银行卡', forEach: 'find-card.items', args: { item_id: '$item.id' } },
    { id: 'add-flashlight', tool: 'create_item', purpose: '记录便携手电筒放在钱包', args: { name: '便携手电筒', location: '钱包', list_name: '放在' } },
  ] }
  if (input.includes('我目前一共有哪些物品') || input.includes('我有哪些物品') || input.includes('列出所有物品')) return { goal: '查询全部物品', steps: [{ id: 'all', tool: 'search_items', purpose: '读取当前账号全部物品', args: { scope: 'all' } }] }
  if (input.includes('我的电动车停哪了')) return { goal: '查询电动车位置', steps: [{ id: 'find', tool: 'search_items', purpose: '按名称查询电动车', args: { name: '电动车' } }] }
  if (input.includes('床头柜里存放了哪些东西') || input.includes('床头柜里有什么')) return { goal: '查询床头柜中的物品', steps: [{ id: 'find', tool: 'search_items', purpose: '按位置包含关系查询', args: { location_contains: '床头柜' } }] }
  if (input.includes('电子设备都放在哪里')) return { goal: '查询电子设备位置', steps: [{ id: 'find', tool: 'search_items', purpose: '读取全部候选物品', args: { semantic_query: '电子设备' } }] }
  if (input.includes('需要用电的物品')) return { goal: '筛选需要用电的物品', steps: [{ id: 'find', tool: 'search_items', purpose: '读取语义类别候选', args: { semantic_query: '需要用电' } }] }
  if (input.includes('名称中包含钥匙')) return { goal: '删除名称包含钥匙的物品', steps: [{ id: 'find', tool: 'search_items', purpose: '按名称包含关系查找候选', args: { name_contains: '钥匙' } }, { id: 'delete', tool: 'delete_item', purpose: '删除所有候选物品', forEach: 'find.items', args: { item_id: '$item.id' } }] }
  if (input.includes('帮我记录') && input.includes('雨伞') && input.includes('书柜')) return { goal: '记录雨伞位置', steps: [{ id: 'add', tool: 'create_item', purpose: '新增雨伞位置', args: { name: '雨伞', location: '书柜的架子上', list_name: '放在' } }] }
  return { goal: '与用户交流', steps: [], reply: '我可以组合查询、创建、修改和删除工具来完成物品管理。请告诉我想完成什么。' }
}

class MockProvider implements CompletionProvider {
  async complete(request: CompletionRequest) {
    if (request.system.includes('最终回答整理器')) return mockSynthesis(request.user)
    if (request.system.includes('语义筛选器')) return mockSemanticSelection(request.user)
    return JSON.stringify(mockPlan(request.user))
  }
  async stream(request: CompletionRequest, onToken: (token: string) => void) { const value = await this.complete(request); for (const chunk of value.match(/.{1,4}/gu) || []) { onToken(chunk); await new Promise((resolve) => setTimeout(resolve, 12)) }; return value }
}

class DeepSeekProvider implements CompletionProvider {
  constructor(private readonly config: AgentProviderConfig) {}
  async complete(request: CompletionRequest) { if (!this.config.apiKey) throw new Error('DeepSeek API Key 未配置'); const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.apiKey}` }, body: JSON.stringify({ model: this.config.model, temperature: 0.1, messages: [{ role: 'system', content: request.system }, { role: 'user', content: request.user }] }) }); if (!response.ok) throw new Error(`模型请求失败：HTTP ${response.status}`); const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }; const content = payload.choices?.[0]?.message?.content; if (!content) throw new Error('模型没有返回内容'); return content }
  async stream(request: CompletionRequest, onToken: (token: string) => void) { if (!this.config.apiKey) throw new Error('DeepSeek API Key 未配置'); const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.apiKey}` }, body: JSON.stringify({ model: this.config.model, temperature: 0.2, stream: true, messages: [{ role: 'system', content: request.system }, { role: 'user', content: request.user }] }) }); if (!response.ok) throw new Error(`模型请求失败：HTTP ${response.status}`); if (!response.body) return this.complete(request); const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let full = ''; while (true) { const { value, done } = await reader.read(); buffer += decoder.decode(value || new Uint8Array(), { stream: !done }); const lines = buffer.split('\n'); buffer = lines.pop() || ''; for (const line of lines) { if (!line.startsWith('data:')) continue; const payload = line.slice(5).trim(); if (!payload || payload === '[DONE]') continue; const json = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> }; const token = json.choices?.[0]?.delta?.content || ''; if (token) { full += token; onToken(token) } } if (done) break }; return full }
}

function providerFor(config: AgentProviderConfig): CompletionProvider { return config.provider === 'deepseek' ? new DeepSeekProvider(config) : new MockProvider() }
function mockSemanticSelection(input: string) { const data = JSON.parse(input) as { category?: string; items: Item[] }; const names = data.category === '需要用电' ? data.items.filter((item) => /吹风机|充电宝|电脑|手机|相机|耳机|平板|电动车|电器|电子/.test(item.name + item.note)).map((item) => item.name) : data.items.map((item) => item.name); return JSON.stringify({ itemNames: [...new Set(names)] }) }
export function mockSynthesis(input: string) { const data = JSON.parse(input) as { plan: AgentPlan; items: Item[] }; const query = data.plan.query || data.plan.category || ''; const filtered = data.plan.category === '需要用电' ? data.items.filter((item) => /吹风机|充电宝|电脑|手机|相机|耳机|平板|电动车|电器|电子/.test(item.name + item.note)) : data.items; const items = [...new Map(filtered.filter((item) => item.name !== query).map((item) => [item.name, item])).values()]; if (!items.length) return `没有找到与“${query}”相关的物品。`; if (data.plan.queryMode === 'location_contains') return `${query}里有：${items.map((item) => item.name).join('、')}。`; return items.map((item) => `${item.name}在${item.location}`).join('；') + '。' }
function synthesisSystem() { return `你是 WHERE 的最终回答整理器。根据用户问题、计划和工具结果回答。语义类别必须逐个判断候选，不得只依赖固定关键词；位置包含查询要去重容器自身记录；只使用工具结果事实，使用自然中文回答。` }

async function runTool(step: PlanStep, observations: Map<string, ToolObservation>, provider: CompletionProvider): Promise<ToolObservation> {
  const args = step.args || {}
  if (step.tool === 'get_lists') return { lists: await getLists() }
  if (step.tool === 'search_items') {
    const lists = await getLists(); const all = (await Promise.all(lists.map((list) => getItems(list.id)))).flat()
    const name = String(args.name || args.name_exact || '')
    const nameContains = String(args.name_contains || args.nameContains || '')
    const locationContains = String(args.location_contains || args.locationContains || '')
    const noteContains = String(args.note_contains || args.noteContains || '')
    let items = args.scope === 'all' ? all : all
    if (name) items = rankByCosine(name, items, (item) => item.name, 0.62).map(({ value }) => value)
    if (nameContains) items = rankByCosine(nameContains, items, (item) => item.name, 0.24).map(({ value }) => value)
    if (locationContains) items = rankByCosine(locationContains, items, (item) => item.location, 0.28).map(({ value }) => value)
    if (noteContains) items = rankByCosine(noteContains, items, (item) => item.note || '', 0.24).map(({ value }) => value)
    if (args.semantic_query) { const raw = await provider.complete({ system: '你是语义筛选器。根据用户类别从候选中选择符合项，只返回 JSON：{"itemNames":["..."]}。不得编造。', user: JSON.stringify({ category: args.semantic_query, items: all }) }); const selected = JSON.parse(raw) as { itemNames?: string[] }; items = all.filter((item) => selected.itemNames?.includes(item.name)) }
    return { items }
  }
  return { items: [] }
}

function itemFromReference(value: unknown, item: Item): unknown { return value === '$item.id' ? item.id : value }
async function stageStep(step: PlanStep, observations: Map<string, ToolObservation>, provider: CompletionProvider): Promise<{ actions: PendingAction[]; items: Item[]; detail: string }> {
  if (step.tool === 'search_items' || step.tool === 'get_lists') { const result = await runTool(step, observations, provider); observations.set(step.id, result); return { actions: [], items: result.items || [], detail: `返回 ${result.items?.length || result.lists?.length || 0} 条结果` } }
  let targets: Item[] = []
  if (step.forEach) targets = observations.get(step.forEach.split('.')[0])?.items || []
  if (!targets.length && step.tool !== 'create_item') return { actions: [], items: [], detail: '没有可执行的候选项' }
  if (step.tool === 'create_item') { const args = step.args || {}; const lists = await getLists(); const list = lists.find((entry) => entry.name === args.list_name) || lists[0]; if (!list || !args.name || !args.location) return { actions: [], items: [], detail: '创建参数不完整' }; return { actions: [{ type: 'create_item', description: `新增“${args.name} ${list.name} ${args.location}”`, input: { listId: list.id, name: String(args.name), location: String(args.location), note: args.note ? String(args.note) : undefined } }], items: [], detail: '生成新增预览' } }
  const actions = targets.map((item) => {
    if (step.tool === 'delete_item') return { type: 'delete_item' as const, description: `删除“${item.name}”`, item }
    const args = step.args || {}
    return { type: 'update_item' as const, description: `修改“${item.name}”`, item, input: { listId: item.listId, name: String(args.name || item.name), location: String(args.location || item.location), note: args.note === undefined ? item.note : String(args.note), icon: item.icon } }
  })
  return { actions, items: targets, detail: `为 ${targets.length} 个候选生成操作预览` }
}

export async function runAgent(message: string, config: AgentProviderConfig = defaultConfig, onProgress?: (progress: AgentProgress) => void, conversationContext = ''): Promise<AgentAnswer> {
  const capabilities = retrieveCapabilities(message); const steps: AgentStep[] = [{ name: '检索能力文档', detail: capabilities ? '命中 WHERE 能力说明' : '未命中能力说明', status: 'done' }, { name: '生成工具计划', detail: '等待模型规划工具组合', status: 'current' }]; onProgress?.({ type: 'step', step: steps[0] }); const provider = providerFor(config); const plan = extractJson(await provider.complete({ system: agentSystem(capabilities, conversationContext), user: message, context: conversationContext })); const planningStep = { name: '任务分解与规划', detail: `生成 ${plan.steps.length} 个有序工具步骤`, status: 'done' as const }; onProgress?.({ type: 'step', step: planningStep }); const observations = new Map<string, ToolObservation>(); const actions: PendingAction[] = []; const affected: Item[] = []; const details: string[] = []; for (const step of plan.steps) { const result = await stageStep(step, observations, provider); actions.push(...result.actions); affected.push(...result.items); details.push(`${step.id}：${result.detail}`); onProgress?.({ type: 'step', step: { name: `执行工具：${step.tool}`, detail: `${step.purpose} · ${result.detail}`, status: 'done' } }) }
  if (!plan.steps.length) return { text: plan.reply || '我可以帮你规划物品管理操作。', items: [], query: '', plan, provider: config.provider, steps: [...steps, planningStep, { name: '整理结果', detail: '生成对话回复', status: 'current' }] }
  const searchResults = [...observations.values()].flatMap((observation) => observation.items || []); const queryStep = plan.steps.find((step) => step.tool === 'search_items'); const query = String(queryStep?.args?.semantic_query || queryStep?.args?.location_contains || queryStep?.args?.name || '')
  if (actions.length) return { text: `已生成任务计划：\n${details.join('\n')}\n\n${actions.length} 个写操作已生成预览，请确认后执行。`, items: affected, query, plan, pendingAction: { type: 'batch', description: `按计划执行 ${actions.length} 个操作`, actions }, provider: config.provider, steps: [...steps, planningStep, { name: '逐步检索与校验', detail: details.join('；'), status: 'done' }, { name: '等待确认', detail: '所有写操作尚未执行', status: 'current' }] }
  const synthesisRequest = { system: `${synthesisSystem()}\n原问题：${message}`, user: JSON.stringify({ question: message, plan, items: searchResults }) }
  const text = await (provider.stream ? provider.stream(synthesisRequest, (token) => onProgress?.({ type: 'token', token })) : provider.complete(synthesisRequest)); return { text, items: searchResults, query, plan, provider: config.provider, steps: [...steps, planningStep, { name: '检索本地数据', detail: `返回 ${searchResults.length} 条候选`, status: 'done' }, { name: '整理结果', detail: '模型已分析工具结果并生成回答', status: 'current' }] }
}

export async function confirmAgentAction(action: PendingAction) { if (action.type === 'batch' && action.actions) for (const child of action.actions) await confirmAgentAction(child); else if (action.type === 'create_item' && action.input) await createItem(action.input); else if (action.type === 'update_item' && action.item && action.input) await updateItem(action.item.id, action.input); else if (action.type === 'delete_item' && action.item) await deleteItem(action.item.id); else if (action.type !== 'batch') throw new Error('无效的智能体操作'); window.dispatchEvent(new CustomEvent('where:data-changed')); return action.description + '已完成，历史记录已保存。' }
export async function runLocalAgent(message: string): Promise<AgentAnswer> { return runAgent(message, defaultConfig) }

function agentSystem(capabilities: string, context = '') { return `你是 WHERE 物品管理智能体。先阅读能力说明，再生成可执行的工具计划。只返回 JSON，不要 Markdown，不要 SQL。不要为每一种说法发明新工具，使用工具注册表中的通用工具组合完成需求。复杂请求使用多个有序 steps；后续步骤可使用 forEach: "步骤ID.items" 和 "$item.id" 引用前一步结果。语义类别由你根据用户语义命名，并通过 semantic_query 搜索候选；最终判断必须基于候选事实。写操作只生成计划，等待用户确认。\n\n工具计划格式：{"goal":"...","steps":[{"id":"...","tool":"工具名","purpose":"...","args":{},"forEach":"步骤ID.items"}]}\n\n工具注册表：\n${JSON.stringify(TOOL_DEFINITIONS)}\n\n能力说明：\n${capabilities}\n\n对话上下文：\n${context || '无'}` }
