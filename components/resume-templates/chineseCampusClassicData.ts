import type { Certificate, GeneratedResume, SkillGroup } from '@/lib/types'

export interface ChineseSkillRow {
  label: string
  items: string[]
}

const PRESENT_VALUES = new Set(['present', 'current', 'now', '至今', '目前', '在读'])

const SKILL_LABELS: Record<string, string> = {
  'language proficiency': '语言能力',
  languages: '语言能力',
  language: '语言能力',
  'design & modeling software': '设计与建模',
  'design and modeling software': '设计与建模',
  'design & modeling': '设计与建模',
  design: '设计与建模',
  software: '设计与建模',
  'office & productivity tools': '办公软件',
  'office and productivity tools': '办公软件',
  office: '办公软件',
  'ai & data tools': 'AI 与数据',
  'ai and data tools': 'AI 与数据',
  'ai & data': 'AI 与数据',
  ai: 'AI 与数据',
  'other skills': '其他技能',
  skills: '其他技能',
  certificates: '证书',
  certificate: '证书',
}

export function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function formatDisplayDate(value?: string): string {
  const input = value?.trim()
  if (!input) return ''
  if (PRESENT_VALUES.has(input.toLowerCase())) return '至今'

  const match = input.match(/^(\d{4})[年./-]?(\d{1,2})?(?:[月./-]\d{1,2}日?)?$/)
  if (!match) return input
  const [, year, month] = match
  return month ? `${year}.${month.padStart(2, '0')}` : year
}

export function formatDateRange(startDate?: string, endDate?: string): string {
  const start = formatDisplayDate(startDate)
  const end = formatDisplayDate(endDate)
  if (start && end && start === end) return start
  if (start && end) return `${start}–${end}`
  return start || end
}

export function normalizeSkillLabel(label: string): string {
  const trimmed = label.trim().replace(/[：:]$/, '')
  return SKILL_LABELS[trimmed.toLowerCase()] || trimmed || '其他技能'
}

function splitSkillItems(value: string): string[] {
  return value
    .split(/[、,，;；|]/)
    .map(item => item.trim())
    .filter(Boolean)
}

function parseLegacySkill(line: string): { label: string; items: string[] } {
  const colonIndex = line.search(/[：:]/)
  if (colonIndex < 0) return { label: '其他技能', items: splitSkillItems(line) }
  return {
    label: normalizeSkillLabel(line.slice(0, colonIndex)),
    items: splitSkillItems(line.slice(colonIndex + 1)),
  }
}

function certificateText(certificate: Certificate): { label: string; item: string } | null {
  if (!hasText(certificate.name)) return null
  const isLanguage = /CET|TOEFL|IELTS|GRE|托福|雅思|英语|普通话/i.test(
    [certificate.name, certificate.issuer, certificate.description].filter(Boolean).join(' ')
  )
  const details = [certificate.score, certificate.date ? formatDisplayDate(certificate.date) : '']
    .filter(hasText)
    .join(' ')
  return {
    label: isLanguage ? '语言能力' : '证书',
    item: [certificate.name.trim(), details].filter(Boolean).join(' '),
  }
}

export function buildChineseSkillRows(resume: GeneratedResume): ChineseSkillRow[] {
  const rows = new Map<string, string[]>()
  const seen = new Set<string>()

  const add = (label: string, items: string[]) => {
    const normalizedLabel = normalizeSkillLabel(label)
    const target = rows.get(normalizedLabel) || []
    items.forEach(item => {
      const clean = item.trim()
      const key = clean.toLowerCase().replace(/\s+/g, '')
      if (!clean || seen.has(key)) return
      seen.add(key)
      target.push(clean)
    })
    if (target.length) rows.set(normalizedLabel, target)
  }

  ;(resume.skillGroups || []).forEach((group: SkillGroup) => add(group.label, group.items || []))

  ;(resume.certificates || []).forEach(certificate => {
    const value = certificateText(certificate)
    if (value) add(value.label, [value.item])
  })

  ;(resume.skills || []).forEach(line => {
    if (!hasText(line)) return
    const parsed = parseLegacySkill(line)
    add(parsed.label, parsed.items)
  })

  const preferredOrder = ['AI 与数据', '设计与建模', '办公软件', '语言能力', '证书', '其他技能']
  return [...rows.entries()]
    .map(([label, items]) => ({ label, items }))
    .sort((a, b) => {
      const ai = preferredOrder.indexOf(a.label)
      const bi = preferredOrder.indexOf(b.label)
      return (ai < 0 ? preferredOrder.length : ai) - (bi < 0 ? preferredOrder.length : bi)
    })
}

export function toSafeURL(value: string): string {
  const trimmed = value.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}
