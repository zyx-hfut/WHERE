import { invoke } from '@tauri-apps/api/core'

function isTauri() { return '__TAURI_INTERNALS__' in window }

export async function saveProviderApiKey(presetId: string, apiKey: string) {
  if (!isTauri()) {
    sessionStorage.setItem(`where.agent.key.${presetId}`, apiKey)
    return
  }
  await invoke('save_provider_api_key', { presetId, apiKey })
}

export async function getProviderApiKey(presetId: string): Promise<string> {
  if (!isTauri()) return sessionStorage.getItem(`where.agent.key.${presetId}`) || ''
  return (await invoke<string | null>('get_provider_api_key', { presetId })) || ''
}

export async function deleteProviderApiKey(presetId: string) {
  if (!isTauri()) { sessionStorage.removeItem(`where.agent.key.${presetId}`); return }
  await invoke('delete_provider_api_key', { presetId })
}
