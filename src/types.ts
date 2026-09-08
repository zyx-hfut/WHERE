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
  action: 'created' | 'updated' | 'deleted' | 'attachment_updated' | 'attachment_deleted'
  beforeJson?: string
  afterJson?: string
  createdAt: number
}

export type Attachment = {
  id: string
  itemId: string
  fileName: string
  mimeType: string
  size: number
  createdAt: number
  updatedAt: number
  dataUrl?: string
}
