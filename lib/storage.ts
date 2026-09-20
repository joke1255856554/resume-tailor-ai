import { FactBank, ResumeSettings } from './types'
import { normalizeFactBank, normalizeResumeSettings } from './normalize'
import { CURRENT_RESUME_SETTINGS } from './resumeTemplates'

const STORAGE_KEY = 'resume_builder_factbank'
const SETTINGS_STORAGE_KEY = 'resume_builder_settings'

const EMPTY_FACTBANK: FactBank = normalizeFactBank({})

let debounceTimer: ReturnType<typeof setTimeout> | null = null

export function loadFactBank(): FactBank {
  if (typeof window === 'undefined') return EMPTY_FACTBANK
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_FACTBANK
    return normalizeFactBank(JSON.parse(raw))
  } catch {
    return EMPTY_FACTBANK
  }
}

export function saveFactBank(fb: FactBank): void {
  if (typeof window === 'undefined') return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeFactBank(fb)))
  }, 1000)
}

export function exportFactBank(fb: FactBank): void {
  const blob = new Blob([JSON.stringify(fb, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '经历库备份.json'
  a.click()
  URL.revokeObjectURL(url)
}

export function importFactBank(file: File): Promise<FactBank> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        resolve(normalizeFactBank(JSON.parse(e.target?.result as string)))
      } catch {
        reject(new Error('无法识别该经历库备份'))
      }
    }
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsText(file)
  })
}

export function loadResumeSettings(): ResumeSettings {
  if (typeof window === 'undefined') return CURRENT_RESUME_SETTINGS
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    return normalizeResumeSettings(raw ? JSON.parse(raw) : null, CURRENT_RESUME_SETTINGS)
  } catch {
    return CURRENT_RESUME_SETTINGS
  }
}

export function saveResumeSettings(settings: ResumeSettings): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(
    SETTINGS_STORAGE_KEY,
    JSON.stringify(normalizeResumeSettings(settings, CURRENT_RESUME_SETTINGS))
  )
}
