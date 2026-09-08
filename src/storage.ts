import { invoke } from '@tauri-apps/api/core'
import type { Attachment, HistoryEntry, Item, ItemInput, ItemList } from './types'
import { getCurrentAccountId } from './auth'

const LEGACY_STORAGE_KEY = 'where.v0.3.demo'

type LocalState = { lists: ItemList[]; items: Item[]; history: HistoryEntry[]; attachments?: Record<string, Attachment> }

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
  const storageKey = getStorageKey()
  let saved = localStorage.getItem(storageKey)
  if (!saved && storageKey !== LEGACY_STORAGE_KEY && localStorage.getItem('where.v0.5.legacy-migrated') !== '1' && localStorage.getItem(LEGACY_STORAGE_KEY)) { saved = localStorage.getItem(LEGACY_STORAGE_KEY); if (saved) { localStorage.setItem(storageKey, saved); localStorage.setItem('where.v0.5.legacy-migrated', '1') } }
  if (!saved) return structuredClone(defaultState)
  try { return JSON.parse(saved) as LocalState } catch { return structuredClone(defaultState) }
}

function writeLocal(state: LocalState) {
  localStorage.setItem(getStorageKey(), JSON.stringify(state))
}

function getStorageKey() { return getCurrentAccountId() ? `where.v0.5.data.${getCurrentAccountId()}` : LEGACY_STORAGE_KEY }

export async function getLists(): Promise<ItemList[]> {
  if (isTauri()) return invoke<ItemList[]>('get_lists')
  return readLocal().lists
}

export async function getItems(listId: string): Promise<Item[]> {
  if (isTauri()) return invoke<Item[]>('get_items', { listId })
  return readLocal().items.filter((item) => item.listId === listId).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function resetDemoData() {
  localStorage.removeItem(getStorageKey())
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

export async function getItemAttachment(itemId: string): Promise<Attachment | null> {
  if (isTauri()) return invoke<Attachment | null>('get_item_attachment', { itemId })
  const state = readLocal()
  return state.attachments?.[itemId] || null
}

export async function readItemAttachment(itemId: string): Promise<Uint8Array | null> {
  if (isTauri()) {
    const bytes = await invoke<number[] | null>('read_item_attachment', { itemId })
    return bytes ? Uint8Array.from(bytes) : null
  }
  const attachment = await getItemAttachment(itemId)
  if (!attachment) return null
  if (!attachment.dataUrl) return null
  const response = await fetch(attachment.dataUrl)
  return new Uint8Array(await response.arrayBuffer())
}

export async function saveItemAttachment(itemId: string, file: File): Promise<Attachment> {
  if (!file.type.startsWith('image/')) throw new Error('只支持图片文件')
  if (file.size > 10 * 1024 * 1024) throw new Error('图片不能超过 10MB')
  if (isTauri()) return invoke<Attachment>('save_item_attachment', { itemId, fileName: file.name, mimeType: file.type, bytes: Array.from(new Uint8Array(await file.arrayBuffer())) })
  const state = readLocal()
  const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error || new Error('读取图片失败')); reader.readAsDataURL(file) })
  const attachment: Attachment = { id: crypto.randomUUID(), itemId, fileName: file.name, mimeType: file.type, size: file.size, createdAt: Date.now(), updatedAt: Date.now(), dataUrl }
  state.attachments = { ...(state.attachments || {}), [itemId]: attachment }
  writeLocal(state)
  return attachment
}

export async function deleteItemAttachment(itemId: string): Promise<void> {
  if (isTauri()) return invoke('delete_item_attachment', { itemId })
  const state = readLocal()
  const attachment = state.attachments?.[itemId]
  if (state.attachments) delete state.attachments[itemId]
  writeLocal(state)
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
