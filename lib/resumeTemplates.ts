import type { ResumeSettings, ResumeTemplateId } from './types'

export type ResumeTemplateCategory = 'campus' | 'general' | 'ats'
export type ResumeRendererId = 'cn-campus-classic' | 'ats-classic'

export interface ResumeTemplateDefinition {
  id: ResumeTemplateId
  name: string
  description: string
  category: ResumeTemplateCategory
  supportsAvatar: boolean
  defaultShowAvatar: boolean
  pageSize: 'A4' | 'LETTER'
  implemented: boolean
  status: 'available' | 'planned'
  previewRendererId?: ResumeRendererId
  pdfRendererId?: ResumeRendererId
}

export const RESUME_TEMPLATE_IDS: ResumeTemplateId[] = [
  'cn-campus-classic',
  'cn-campus-two-column',
  'cn-general-classic',
  'ats-classic',
]

export const DEFAULT_RESUME_SETTINGS: ResumeSettings = {
  templateId: 'cn-campus-classic',
  showAvatar: true,
  language: 'zh-CN',
  templatePreferences: {
    'cn-campus-classic': { showAvatar: true },
    'ats-classic': { showAvatar: false },
  },
}

export const LEGACY_RESUME_SETTINGS: ResumeSettings = {
  templateId: 'ats-classic',
  showAvatar: false,
  language: 'en',
  templatePreferences: {
    'cn-campus-classic': { showAvatar: true },
    'ats-classic': { showAvatar: false },
  },
}

// New users target the Chinese campus template.
export const CURRENT_RESUME_SETTINGS: ResumeSettings = DEFAULT_RESUME_SETTINGS

export const RESUME_TEMPLATE_REGISTRY: Record<ResumeTemplateId, ResumeTemplateDefinition> = {
  'cn-campus-classic': {
    id: 'cn-campus-classic',
    name: '应届生校招 · 经典单栏',
    description: '教育与项目优先的中文校招单栏模板',
    category: 'campus',
    supportsAvatar: true,
    defaultShowAvatar: true,
    pageSize: 'A4',
    implemented: true,
    status: 'available',
    previewRendererId: 'cn-campus-classic',
    pdfRendererId: 'cn-campus-classic',
  },
  'cn-campus-two-column': {
    id: 'cn-campus-two-column',
    name: '应届生校招 · 双栏',
    description: '适合项目、技能和校园经历较丰富的中文校招模板',
    category: 'campus',
    supportsAvatar: true,
    defaultShowAvatar: true,
    pageSize: 'A4',
    implemented: false,
    status: 'planned',
  },
  'cn-general-classic': {
    id: 'cn-general-classic',
    name: '国内通用 · 经典',
    description: '工作经历优先的中文通用模板',
    category: 'general',
    supportsAvatar: true,
    defaultShowAvatar: true,
    pageSize: 'A4',
    implemented: false,
    status: 'planned',
  },
  'ats-classic': {
    id: 'ats-classic',
    name: 'ATS · 简洁',
    description: '现有单栏 ATS 友好模板',
    category: 'ats',
    supportsAvatar: false,
    defaultShowAvatar: false,
    pageSize: 'LETTER',
    implemented: true,
    status: 'available',
    previewRendererId: 'ats-classic',
    pdfRendererId: 'ats-classic',
  },
}

export function isResumeTemplateId(value: unknown): value is ResumeTemplateId {
  return typeof value === 'string' && RESUME_TEMPLATE_IDS.includes(value as ResumeTemplateId)
}

export function getResumeTemplate(templateId: ResumeTemplateId): ResumeTemplateDefinition {
  return RESUME_TEMPLATE_REGISTRY[templateId]
}

export function resolveRenderableTemplate(templateId: ResumeTemplateId): ResumeTemplateDefinition {
  const requested = getResumeTemplate(templateId)
  return requested.status === 'available'
    ? requested
    : RESUME_TEMPLATE_REGISTRY['ats-classic']
}

export function getTemplateShowAvatar(settings: ResumeSettings, templateId: ResumeTemplateId): boolean {
  const template = getResumeTemplate(templateId)
  if (!template.supportsAvatar) return false
  const saved = settings.templatePreferences?.[templateId]?.showAvatar
  if (typeof saved === 'boolean') return saved
  const activeTemplateId = settings.requestedTemplateId || settings.templateId
  return activeTemplateId === templateId ? settings.showAvatar : template.defaultShowAvatar
}

export function switchResumeTemplate(settings: ResumeSettings, templateId: ResumeTemplateId): ResumeSettings {
  const template = getResumeTemplate(templateId)
  if (template.status !== 'available') return settings
  const currentTemplateId = settings.requestedTemplateId || settings.templateId
  const nextSavedPreference = settings.templatePreferences?.[templateId]
  const showAvatar = template.supportsAvatar
    ? typeof nextSavedPreference?.showAvatar === 'boolean'
      ? nextSavedPreference.showAvatar
      : templateId === currentTemplateId
        ? settings.showAvatar
        : template.defaultShowAvatar
    : false
  return {
    ...settings,
    templateId,
    requestedTemplateId: templateId,
    resolvedTemplateId: templateId,
    showAvatar,
    templatePreferences: {
      ...settings.templatePreferences,
      [currentTemplateId]: {
        ...settings.templatePreferences?.[currentTemplateId],
        showAvatar: getTemplateShowAvatar(settings, currentTemplateId),
      },
      [templateId]: {
        ...nextSavedPreference,
        showAvatar,
      },
    },
  }
}

export function updateTemplateShowAvatarPreference(settings: ResumeSettings, showAvatar: boolean): ResumeSettings {
  const templateId = settings.requestedTemplateId || settings.templateId
  const effectiveValue = getResumeTemplate(templateId).supportsAvatar ? showAvatar : false
  return {
    ...settings,
    showAvatar: effectiveValue,
    templatePreferences: {
      ...settings.templatePreferences,
      [templateId]: {
        ...settings.templatePreferences?.[templateId],
        showAvatar: effectiveValue,
      },
    },
  }
}

export function createRenderedResumeSettings(settings: ResumeSettings): ResumeSettings {
  const requestedTemplateId = settings.requestedTemplateId || settings.templateId
  const renderedTemplate = resolveRenderableTemplate(requestedTemplateId)
  return {
    ...settings,
    templateId: renderedTemplate.id,
    requestedTemplateId,
    resolvedTemplateId: renderedTemplate.id,
    showAvatar: renderedTemplate.supportsAvatar ? getTemplateShowAvatar(settings, requestedTemplateId) : false,
  }
}
