import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { getVersion } from '@tauri-apps/api/app'

export type UpdateState =
  | { kind: 'unsupported' }
  | { kind: 'none'; currentVersion: string }
  | { kind: 'available'; update: Update }

function isTauri() {
  return '__TAURI_INTERNALS__' in window
}

export async function checkForAppUpdate(): Promise<UpdateState> {
  if (!isTauri()) return { kind: 'unsupported' }
  const update = await check({ timeout: 10_000 })
  if (!update) return { kind: 'none', currentVersion: await getVersion() }
  return { kind: 'available', update }
}

export async function installAppUpdate(update: Update, onProgress?: (percent: number) => void) {
  let downloaded = 0
  let total = 0
  await update.downloadAndInstall((event) => {
    if (event.event === 'Started') total = event.data.contentLength || 0
    if (event.event === 'Progress') downloaded += event.data.chunkLength
    if (total > 0) onProgress?.(Math.min(100, Math.round(downloaded / total * 100)))
  }, { restartAfterInstall: true })
  await relaunch()
}
