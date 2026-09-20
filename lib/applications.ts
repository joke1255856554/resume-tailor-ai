import { Application } from './types'
import { normalizeApplication } from './normalize'
import { LEGACY_RESUME_SETTINGS } from './resumeTemplates'

export type { Application } from './types'

const KEY = 'resume_builder_applications'

export function loadApplications(): Application[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((item, index) => normalizeApplication(item, LEGACY_RESUME_SETTINGS, index))
  } catch {
    return []
  }
}

export function saveApplication(app: Omit<Application, 'id' | 'date'>): void {
  const apps = loadApplications()
  apps.unshift(normalizeApplication({
    ...app,
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    date: new Date().toISOString(),
  }, LEGACY_RESUME_SETTINGS))
  localStorage.setItem(KEY, JSON.stringify(apps))
}

export function deleteApplication(id: string): void {
  const apps = loadApplications().filter(a => a.id !== id)
  localStorage.setItem(KEY, JSON.stringify(apps))
}

export function exportApplications(apps: Application[]): void {
  const blob = new Blob([JSON.stringify(apps, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `投递记录-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function importApplications(file: File): Promise<Application[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string)
        if (!Array.isArray(parsed)) throw new Error('备份文件格式不正确')
        resolve(parsed.map((item, index) => normalizeApplication(item, LEGACY_RESUME_SETTINGS, index)))
      } catch {
        reject(new Error('无法识别该备份文件'))
      }
    }
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsText(file)
  })
}
