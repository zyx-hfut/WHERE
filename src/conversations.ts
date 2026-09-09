import { getCurrentAccountId } from './auth'
import type { AgentPlan, AgentStep, PendingAction } from './agent'

export type ConversationMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  status: 'sending' | 'streaming' | 'done' | 'error'
  steps?: AgentStep[]
  pendingAction?: PendingAction
  plan?: AgentPlan
}

export type Conversation = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ConversationMessage[]
}

function storageKey() { return `where.agent.conversations.${getCurrentAccountId() || 'anonymous'}` }

export function loadConversations(): Conversation[] {
  try { return JSON.parse(localStorage.getItem(storageKey()) || '[]') as Conversation[] } catch { return [] }
}

export function saveConversations(conversations: Conversation[]) { localStorage.setItem(storageKey(), JSON.stringify(conversations)) }

export function createConversation(): Conversation {
  const now = Date.now()
  return { id: crypto.randomUUID(), title: '新对话', createdAt: now, updatedAt: now, messages: [] }
}

export function titleFromMessage(message: string) {
  const compact = message.trim().replace(/\s+/g, ' ')
  return compact.length > 24 ? `${compact.slice(0, 24)}…` : compact || '新对话'
}
