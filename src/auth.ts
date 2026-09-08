import { invoke } from '@tauri-apps/api/core'

export type AuthSession = { accountId: string; username: string }
export type AuthState = { authenticated: boolean; accountId?: string; username?: string }
export type RegisterResult = { session: AuthSession; recoveryKey: string }

const AUTH_KEY = 'where.v0.5.auth'

type LocalAccount = AuthSession & { passwordHash: string; recoveryHash: string }
type LocalAuth = { accounts: LocalAccount[]; currentAccountId?: string }

function isTauri() { return '__TAURI_INTERNALS__' in window }
function readLocal(): LocalAuth { try { return JSON.parse(localStorage.getItem(AUTH_KEY) || '{"accounts":[]}') as LocalAuth } catch { return { accounts: [] } } }
function writeLocal(auth: LocalAuth) { localStorage.setItem(AUTH_KEY, JSON.stringify(auth)) }
function validate(username: string, password: string) { if (username.trim().length < 2) throw new Error('用户名至少需要 2 个字符'); if (password.length < 8) throw new Error('密码至少需要 8 个字符') }
async function hash(value: string) { const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return Array.from(new Uint8Array(bytes)).map((part) => part.toString(16).padStart(2, '0')).join('') }

export async function getAuthState(): Promise<AuthState> {
  if (isTauri()) return invoke<AuthState>('get_auth_state')
  const auth = readLocal(); const current = auth.accounts.find((account) => account.accountId === auth.currentAccountId)
  return current ? { authenticated: true, accountId: current.accountId, username: current.username } : { authenticated: false }
}

export async function registerAccount(username: string, password: string): Promise<RegisterResult> {
  validate(username, password)
  if (isTauri()) return invoke<RegisterResult>('register_account', { username, password })
  const auth = readLocal(); const normalized = username.trim()
  if (auth.accounts.some((account) => account.username === normalized)) throw new Error('用户名已存在')
  const session = { accountId: crypto.randomUUID(), username: normalized }; const recoveryKey = `WHERE-${crypto.randomUUID().replaceAll('-', '').toUpperCase()}`
  auth.accounts.push({ ...session, passwordHash: await hash(password), recoveryHash: await hash(recoveryKey) }); auth.currentAccountId = session.accountId; writeLocal(auth); return { session, recoveryKey }
}

export async function loginAccount(username: string, password: string): Promise<AuthSession> {
  if (isTauri()) return invoke<AuthSession>('login_account', { username, password })
  const auth = readLocal(); const passwordHash = await hash(password); const account = auth.accounts.find((entry) => entry.username === username.trim() && entry.passwordHash === passwordHash)
  if (!account) throw new Error('用户名或密码错误'); auth.currentAccountId = account.accountId; writeLocal(auth); return { accountId: account.accountId, username: account.username }
}

export async function resetAccountPassword(username: string, recoveryKey: string, newPassword: string): Promise<void> {
  validate(username, newPassword)
  if (isTauri()) return invoke('reset_account_password', { username, recoveryKey, newPassword })
  const auth = readLocal(); const recoveryHash = await hash(recoveryKey.trim()); const account = auth.accounts.find((entry) => entry.username === username.trim() && entry.recoveryHash === recoveryHash)
  if (!account) throw new Error('恢复信息错误'); account.passwordHash = await hash(newPassword); writeLocal(auth)
}

export async function logoutAccount(): Promise<void> {
  if (isTauri()) return invoke('logout_account')
  const auth = readLocal(); delete auth.currentAccountId; writeLocal(auth)
}

export function getCurrentAccountId() { return readLocal().currentAccountId }
