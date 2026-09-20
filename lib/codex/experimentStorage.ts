'use client'

import type {
  ConversationFactCandidate,
  GeneratedResume,
  ResumeAssistantMessage,
  ResumeCandidateState,
  ResumeCustomizationSession,
  ResumeSettings,
} from '../types'

export const CODEX_EXPERIMENT_STORAGE_KEY = 'resume_builder_codex_experiment_sessions'
export const CODEX_EXPERIMENT_ACTIVE_KEY = 'resume_builder_active_codex_experiment_id'

export interface CodexResumeExperimentSession {
  id: string
  sourceSessionId: string | null
  codexThreadId: string | null
  company: string
  role: string
  jobDescription: string
  messages: ResumeAssistantMessage[]
  factCandidates: ConversationFactCandidate[]
  candidateStates: Record<string, ResumeCandidateState>
  currentResume: GeneratedResume | null
  currentPipelineResume: GeneratedResume | null
  resumeSettings: ResumeSettings
  status: 'idle' | 'running' | 'completed' | 'failed'
  stageMessage: string
  error: string
  lastLayoutAdjustment: 'none' | 'overBudget' | 'underFilled'
  createdAt: string
  updatedAt: string
}

export function createCodexExperimentSession(source: ResumeCustomizationSession | null, settings: ResumeSettings): CodexResumeExperimentSession {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    sourceSessionId: source?.id || null,
    codexThreadId: null,
    company: source?.company || '',
    role: source?.role || '',
    jobDescription: source?.jobDescription || '',
    messages: [],
    factCandidates: [],
    candidateStates: {},
    currentResume: null,
    currentPipelineResume: source?.currentResume || null,
    resumeSettings: { ...settings, templateId: 'cn-campus-classic', requestedTemplateId: 'cn-campus-classic', resolvedTemplateId: 'cn-campus-classic' },
    status: 'idle',
    stageMessage: '',
    error: '',
    lastLayoutAdjustment: 'none',
    createdAt: now,
    updatedAt: now,
  }
}

export function loadCodexExperimentSessions(): { sessions: CodexResumeExperimentSession[]; activeId: string | null } {
  if (typeof window === 'undefined') return { sessions: [], activeId: null }
  try {
    const parsed = JSON.parse(localStorage.getItem(CODEX_EXPERIMENT_STORAGE_KEY) || '[]') as CodexResumeExperimentSession[]
    const sessions = Array.isArray(parsed) ? parsed.map(session => ({ ...session, status: session.status === 'running' ? 'failed' as const : session.status, error: session.status === 'running' ? '上一次 Codex 请求被页面刷新中断，可继续使用同一 Thread 重试。' : session.error })) : []
    const requested = localStorage.getItem(CODEX_EXPERIMENT_ACTIVE_KEY)
    return { sessions, activeId: sessions.some(item => item.id === requested) ? requested : sessions.at(-1)?.id || null }
  } catch {
    return { sessions: [], activeId: null }
  }
}

export function saveCodexExperimentSessions(sessions: CodexResumeExperimentSession[], activeId: string | null): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(CODEX_EXPERIMENT_STORAGE_KEY, JSON.stringify(sessions))
  if (activeId) localStorage.setItem(CODEX_EXPERIMENT_ACTIVE_KEY, activeId)
}
