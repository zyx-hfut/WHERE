import { invoke } from '@tauri-apps/api/core'
import type { HistoryEntry, Item, ItemInput, ItemList } from './types'

const STORAGE_KEY = 'where.v0.3.demo'

type LocalState = { lists: ItemList[]; items: Item[]; history: HistoryEntry[] }

const defaultState: LocalState = {
  lists: [
    { id: 'placed', name: '放在', count: 2, icon: '⌂' },
    { id: 'stored', name: '存有', count: 1, icon: '▦' },
  ],
  items: [
    { id: 'demo-1', listId: 'placed', listName: '放在', name: '电动车', location: '科教楼 A 座和 C 座之间', note: '锁在靠近路灯的一侧', icon: '🚲', updatedAt: Date.now() },
    { id: 'demo-2', listId: 'placed', listName: '放在', name: '雨伞', location: '书柜的架子上', icon: '☂', updatedAt: Date.now() - 86400000 },
    { id: 'demo-3', listId: 'stored', listName: '存有', name: '备用充电线', location: '床头柜第一个抽屉', note: 'USB-C，白色', icon: '⌁', updatedAt: Date.now() - 172800000 },
  ],
  history: [],
}

function isTauri() {
  return '__TAURI_INTERNALS__' in window
}

function readLocal(): LocalState {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (!saved) return structuredClone(defaultState)
  try { return JSON.parse(saved) as LocalState } catch { return structuredClone(defaultState) }
}

function writeLocal(state: LocalState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export async function getLists(): Promise<ItemList[]> {
  if (isTauri()) return invoke<ItemList[]>('get_lists')
  return readLocal().lists
}

export async function getItems(listId: string): Promise<Item[]> {
  if (isTauri()) return invoke<Item[]>('get_items', { listId })
  return readLocal().items.filter((item) => item.listId === listId).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function resetDemoData() {
  localStorage.removeItem(STORAGE_KEY)
}

export async function createItem(input: ItemInput): Promise<Item> {
  if (isTauri()) return invoke<Item>('create_item', { input })
  const state = readLocal()
  const list = state.lists.find((entry) => entry.id === input.listId)
  if (!list) throw new Error('目标列表不存在')
  const item: Item = { id: crypto.randomUUID(), listId: input.listId, listName: list.name, name: input.name.trim(), location: input.location.trim(), note: input.note?.trim() || undefined, icon: input.icon || '✦', updatedAt: Date.now() }
  state.items.unshift(item)
  list.count += 1
  state.history.unshift({ id: Date.now(), itemId: item.id, action: 'created', afterJson: JSON.stringify(item), createdAt: Date.now() })
  writeLocal(state)
  return item
}

export async function updateItem(id: string, input: ItemInput): Promise<Item> {
  if (isTauri()) return invoke<Item>('update_item', { id, input })
  const state = readLocal()
  const index = state.items.findIndex((item) => item.id === id)
  const list = state.lists.find((entry) => entry.id === input.listId)
  if (index < 0 || !list) throw new Error('物品或目标列表不存在')
  const before = state.items[index]
  const item: Item = { ...before, listId: input.listId, listName: list.name, name: input.name.trim(), location: input.location.trim(), note: input.note?.trim() || undefined, icon: input.icon || before.icon, updatedAt: Date.now() }
  if (before.listId !== item.listId) {
    const previousList = state.lists.find((entry) => entry.id === before.listId)
    if (previousList) previousList.count -= 1
    list.count += 1
  }
  state.items[index] = item
  state.history.unshift({ id: Date.now(), itemId: id, action: 'updated', beforeJson: JSON.stringify(before), afterJson: JSON.stringify(item), createdAt: Date.now() })
  writeLocal(state)
  return item
}

export async function deleteItem(id: string): Promise<void> {
  if (isTauri()) return invoke('delete_item', { id })
  const state = readLocal()
  const item = state.items.find((entry) => entry.id === id)
  if (!item) throw new Error('物品不存在')
  state.items = state.items.filter((entry) => entry.id !== id)
  const list = state.lists.find((entry) => entry.id === item.listId)
  if (list) list.count -= 1
  state.history.unshift({ id: Date.now(), itemId: id, action: 'deleted', beforeJson: JSON.stringify(item), createdAt: Date.now() })
  writeLocal(state)
}

export async function getItemHistory(itemId: string): Promise<HistoryEntry[]> {
  if (isTauri()) return invoke<HistoryEntry[]>('get_item_history', { itemId })
  return readLocal().history.filter((entry) => entry.itemId === itemId)
}

export async function createList(name: string, icon?: string): Promise<ItemList> {
  if (isTauri()) return invoke<ItemList>('create_list', { name, icon })
  const state = readLocal()
  const list: ItemList = { id: crypto.randomUUID(), name: name.trim(), icon: icon || '✦', count: 0 }
  state.lists.push(list)
  writeLocal(state)
  return list
}

export async function deleteList(id: string): Promise<void> {
  if (isTauri()) return invoke('delete_list', { id })
  const state = readLocal()
  const list = state.lists.find((entry) => entry.id === id)
  if (!list) throw new Error('列表不存在')
  if (list.count > 0) throw new Error('列表中仍有物品，请先移动或删除这些物品')
  state.lists = state.lists.filter((entry) => entry.id !== id)
  writeLocal(state)
}
