export type Page = 'items' | 'agent' | 'profile'

export type ItemList = {
  id: string
  name: string
  count: number
  icon: string
}

export type Item = {
  id: string
  listId: string
  listName: string
  name: string
  location: string
  note?: string
  icon: string
  updatedAt: number
}

export type ItemInput = {
  listId: string
  name: string
  location: string
  note?: string
  icon?: string
}

export type HistoryEntry = {
  id: number
  itemId: string
  action: 'created' | 'updated' | 'deleted'
  beforeJson?: string
  afterJson?: string
  createdAt: number
}
