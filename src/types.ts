export type Page = 'items' | 'agent' | 'profile'

export type ItemList = {
  id: string
  name: string
  count: number
  icon: string
}

export type Item = {
  id: string
  name: string
  listName: string
  location: string
  note?: string
  icon: string
  updatedAt: string
}
