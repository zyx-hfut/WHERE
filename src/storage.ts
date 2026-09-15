import { invoke } from '@tauri-apps/api/core'
import type { Attachment, BackupData, HistoryEntry, HistoryPage, Item, ItemInput, ItemList } from './types'
import { getCurrentAccountId } from './auth'
import { rankByCosine } from './vector-match'

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

export async function searchItems(query: string): Promise<Item[]> {
  if (isTauri()) return invoke<Item[]>('search_items', { query })
  const state = readLocal()
  if (!query.trim()) return []
  const ranked = rankByCosine(query, state.items, (item) => `${item.name} ${item.location} ${item.note || ''}`, 0.16)
  return ranked.map(({ value }) => value)
}

export async function exportLocalData(): Promise<string> {
  if (isTauri()) {
    await invoke<string>('export_backup_file')
    return JSON.stringify(await invoke<BackupData>('export_backup'), null, 2)
  }
  const state = readLocal()
  const attachments = Object.values(state.attachments || {}).map((attachment) => ({
    metadata: { ...attachment, dataUrl: undefined },
    relativePath: `${attachment.id}.data`,
    dataUrl: attachment.dataUrl,
  }))
  return JSON.stringify({ format: 'where-account-backup', version: 1, exportedAt: Date.now(), lists: state.lists, items: state.items, history: state.history, attachments }, null, 2)
}

export async function exportBackupFile(): Promise<string | null> {
  if (isTauri()) return invoke<string>('export_backup_file')
  const content = await exportLocalData()
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `where-backup-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return anchor.download
}

export async function importLocalData(serialized: string): Promise<void> {
  const parsed = JSON.parse(serialized) as Partial<BackupData> & Partial<LocalState>
  if (parsed.format === 'where-account-backup') {
    if (parsed.version !== 1 || !Array.isArray(parsed.lists) || !Array.isArray(parsed.items) || !Array.isArray(parsed.history) || !Array.isArray(parsed.attachments)) throw new Error('备份文件格式不正确')
    if (isTauri()) { await invoke('import_backup', { backup: parsed }); return }
    const attachments: Record<string, Attachment> = {}
    for (const entry of parsed.attachments) if (entry.metadata?.itemId) attachments[entry.metadata.itemId] = { ...entry.metadata, dataUrl: entry.dataUrl }
    writeLocal({ lists: parsed.lists, items: parsed.items, history: parsed.history, attachments })
    return
  }
  if (!Array.isArray(parsed.lists) || !Array.isArray(parsed.items) || !Array.isArray(parsed.history)) throw new Error('备份文件格式不正确')
  if (isTauri()) throw new Error('不支持恢复旧版浏览器备份，请使用新版备份文件')
  writeLocal({ lists: parsed.lists, items: parsed.items, history: parsed.history, attachments: parsed.attachments })
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

export async function getHistoryPage(page = 1, pageSize = 12): Promise<HistoryPage> {
  if (isTauri()) return invoke<HistoryPage>('get_history_page', { page, pageSize })
  const state = readLocal()
  const entries = state.history.map((entry) => {
    const snapshot = entry.afterJson || entry.beforeJson
    let item: Partial<Item> = {}
    try { item = snapshot ? JSON.parse(snapshot) as Partial<Item> : {} } catch { /* legacy malformed snapshot */ }
    const current = state.items.find((candidate) => candidate.id === entry.itemId)
    return { ...entry, itemName: entry.itemName || item.name || current?.name, listName: entry.listName || item.listName || current?.listName, location: entry.location || item.location || current?.location }
  }).sort((a, b) => b.createdAt - a.createdAt)
  const safePageSize = Math.max(1, Math.min(100, pageSize))
  const totalPages = entries.length ? Math.ceil(entries.length / safePageSize) : 0
  const safePage = Math.max(1, Math.min(page, Math.max(1, totalPages)))
  return { entries: entries.slice((safePage - 1) * safePageSize, safePage * safePageSize), page: safePage, pageSize: safePageSize, total: entries.length, totalPages }
}

export async function deleteHistory(id: number): Promise<void> {
  if (isTauri()) return invoke('delete_history', { id })
  const state = readLocal()
  state.history = state.history.filter((entry) => entry.id !== id)
  writeLocal(state)
}

export async function clearHistory(): Promise<void> {
  if (isTauri()) { await invoke('clear_history'); return }
  const state = readLocal()
  state.history = []
  writeLocal(state)
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
