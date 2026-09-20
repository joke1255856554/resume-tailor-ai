import type { ResumeCustomizationSession, ResumeSettings } from './types'
import { normalizeResume, normalizeResumeSettings } from './normalize'
import { applySectionReorder, resolveSectionReorderIntent } from './resumeSections'

export const CUSTOMIZATION_SESSIONS_KEY = 'resume_builder_customization_sessions'
export const ACTIVE_CUSTOMIZATION_SESSION_KEY = 'resume_builder_active_session_id'

export function automaticSessionDisplayName(company: string, role: string): string {
  const normalizedCompany = company.trim()
  const normalizedRole = role.trim()
  if (normalizedCompany && normalizedRole) return `${normalizedCompany} · ${normalizedRole}`
  if (normalizedRole) return normalizedRole
  if (normalizedCompany) return `${normalizedCompany} · 目标岗位`
  return '新目标岗位'
}

export function sessionDisplayName(session: Pick<ResumeCustomizationSession, 'displayName' | 'company' | 'role'>): string {
  return session.displayName?.trim() || automaticSessionDisplayName(session.company, session.role)
}

export function createCustomizationSession(resumeSettings: ResumeSettings): ResumeCustomizationSession {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    displayName: '新目标岗位',
    displayNameSource: 'auto',
    codexThreadId: null,
    company: '',
    role: '',
    jobDescription: '',
    jobUrl: '',
    jdAnalysis: null,
    messages: [],
    factCandidates: [],
    candidateStates: {},
    candidateText: {},
    confirmedConversationFacts: [],
    denials: [],
    askedQuestionKeys: [],
    openQuestions: [],
    currentResume: null,
    selectedFacts: [],
    excludedFacts: [],
    resumeSettings,
    polishStyle: 'standard',
    assistantPhase: 'idle',
    assistantStatus: 'idle',
    assistantError: '',
    clarificationRounds: 0,
    generationStatus: 'idle',
    generationError: '',
    agentStage: null,
    agentSummary: null,
    resumeStrategy: null,
    agentActivities: [],
    generationDiagnostic: null,
    lastGenerationId: null,
    createdAt: now,
    updatedAt: now,
  }
}

function normalizeSession(value: ResumeCustomizationSession, fallbackSettings: ResumeSettings): ResumeCustomizationSession {
  const base = createCustomizationSession(fallbackSettings)
  const messages = Array.isArray(value.messages) ? value.messages : []
  let currentResume = normalizeResume(value.currentResume)
  // Repair legacy sessions created before sectionOrder existed. Replaying only
  // deterministic layout commands preserves the user's explicit request without
  // asking the model to regenerate any resume content.
  if (currentResume) {
    messages.filter(message => message.role === 'user').forEach(message => {
      const intent = resolveSectionReorderIntent(message.content)
      if (intent) currentResume = applySectionReorder(currentResume!, intent)
    })
  }
  return {
    ...base,
    ...value,
    codexThreadId: typeof value.codexThreadId === 'string' ? value.codexThreadId : null,
    displayName: value.displayName?.trim() || automaticSessionDisplayName(value.company || '', value.role || ''),
    displayNameSource: value.displayNameSource === 'manual' ? 'manual' : 'auto',
    messages,
    currentResume,
    factCandidates: Array.isArray(value.factCandidates) ? value.factCandidates : [],
    candidateStates: value.candidateStates || {},
    candidateText: value.candidateText || {},
    confirmedConversationFacts: Array.isArray(value.confirmedConversationFacts) ? value.confirmedConversationFacts : [],
    denials: Array.isArray(value.denials) ? value.denials : [],
    askedQuestionKeys: Array.isArray(value.askedQuestionKeys) ? value.askedQuestionKeys : [],
    openQuestions: Array.isArray(value.openQuestions) ? value.openQuestions : [],
    selectedFacts: Array.isArray(value.selectedFacts) ? value.selectedFacts : [],
    excludedFacts: Array.isArray(value.excludedFacts) ? value.excludedFacts : [],
    resumeSettings: normalizeResumeSettings(value.resumeSettings, fallbackSettings),
    assistantStatus: 'idle',
    agentStage: null,
    agentSummary: value.agentSummary || null,
    resumeStrategy: value.resumeStrategy || null,
    agentActivities: Array.isArray(value.agentActivities)
      ? value.agentActivities.filter(activity => activity && (activity.state === 'done' || activity.state === 'failed'))
      : [],
    generationDiagnostic: null,
    generationStatus: value.generationStatus === 'generating' ? 'interrupted' : value.generationStatus,
    generationError: value.generationStatus === 'generating'
      ? '上一次生成被页面刷新中断，你的聊天和已确认信息均已保存。'
      : value.generationError || '',
  }
}

export function loadCustomizationSessions(fallbackSettings: ResumeSettings): {
  sessions: ResumeCustomizationSession[]
  activeSessionId: string | null
} {
  if (typeof window === 'undefined') return { sessions: [], activeSessionId: null }
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOMIZATION_SESSIONS_KEY) || '[]') as ResumeCustomizationSession[]
    const sessions = Array.isArray(parsed) ? parsed.map(item => normalizeSession(item, fallbackSettings)) : []
    const requestedId = localStorage.getItem(ACTIVE_CUSTOMIZATION_SESSION_KEY)
    const activeSessionId = sessions.some(item => item.id === requestedId) ? requestedId : sessions.at(-1)?.id || null
    return { sessions, activeSessionId }
  } catch {
    return { sessions: [], activeSessionId: null }
  }
}

export function saveCustomizationSessions(sessions: ResumeCustomizationSession[], activeSessionId: string | null): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(CUSTOMIZATION_SESSIONS_KEY, JSON.stringify(sessions.map(({ generationDiagnostic: _diagnostic, ...session }) => session)))
  if (activeSessionId) localStorage.setItem(ACTIVE_CUSTOMIZATION_SESSION_KEY, activeSessionId)
  else localStorage.removeItem(ACTIVE_CUSTOMIZATION_SESSION_KEY)
}
