import { getLists, getItems, searchItems } from './storage'
import type { Item } from './types'
import capabilityDocument from '../knowledge/agent-capabilities.md?raw'

export type AgentStep = { name: string; detail: string; status: 'done' | 'current' }
export type AgentAnswer = { text: string; items: Item[]; steps: AgentStep[]; query: string }

function unique(values: string[]) { return [...new Set(values.filter(Boolean))] }

function retrieveCapability(message: string) {
  const terms = message.toLocaleLowerCase().split(/\s+/).filter((term) => term.length > 1)
  const paragraphs = capabilityDocument.split(/\n\s*\n/).filter(Boolean)
  const ranked = paragraphs.map((paragraph) => ({ paragraph, score: terms.filter((term) => paragraph.toLocaleLowerCase().includes(term)).length })).sort((a, b) => b.score - a.score)
  return ranked[0]?.score ? ranked[0].paragraph.replace(/^#+\s*/gm, '').split('\n')[0] : '物品位置查询'
}

function inferQuery(message: string) {
  let normalized = message.replace(/[“”"'？?。！!，,]/g, '').trim()
  normalized = normalized.replace(/^(帮我|请|我想知道|告诉我|我的)/, '')
  normalized = normalized.replace(/(里存放了哪些东西|里有什么|中存放了哪些东西|中有什么|都放在哪里|放在哪里|停哪了|停在哪里|在哪里|在哪儿|在哪|的位置|有些什么)$/, '')
  normalized = normalized.replace(/^(的|里|中|都|哪些|什么)/, '').trim()
  return normalized || message.trim()
}

function buildAnswer(message: string, items: Item[]): AgentAnswer {
  const query = inferQuery(message)
  const capability = retrieveCapability(message)
  const locationIntent = /哪|位置|放在|停在|在哪里/.test(message)
  const placeIntent = /里|中|存放|哪些|什么/.test(message)
  let text = ''
  if (!items.length) text = `我在本地记录中没有找到与“${query}”相关的物品。你可以尝试换一个名称或位置关键词。`
  else if (locationIntent && items.length === 1) text = `找到了：${items[0].name} ${items[0].listName} ${items[0].location}${items[0].note ? `。备注：${items[0].note}` : ''}`
  else if (placeIntent) text = `在相关位置找到 ${items.length} 件物品：${unique(items.map((item) => `${item.name}（${item.location}）`)).join('、')}。`
  else text = `找到 ${items.length} 条相关记录：${unique(items.map((item) => `${item.name} ${item.listName} ${item.location}`)).join('；')}。`
  return { text, items, query, steps: [{ name: '理解请求', detail: `能力文档命中：${capability}`, status: 'done' }, { name: '检索本地数据', detail: `提取“${query}”，匹配 ${items.length} 条记录`, status: 'done' }, { name: '整理结果', detail: '生成只读回答', status: 'current' }] }
}

export async function runLocalAgent(message: string): Promise<AgentAnswer> {
  const query = inferQuery(message)
  let items = await searchItems(query)
  if (!items.length && /电子设备|电子产品/.test(message)) {
    const lists = await getLists()
    const all = (await Promise.all(lists.map((list) => getItems(list.id)))).flat()
    items = all.filter((item) => /电动车|充电|电脑|手机|相机|耳机|平板|电子/.test(item.name + item.note + item.location))
  }
  return buildAnswer(message, items)
}
