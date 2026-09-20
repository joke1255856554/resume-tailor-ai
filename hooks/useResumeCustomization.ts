'use client'

import { useEffect, useRef, useState } from 'react'
import type {
  ConversationFactCandidate,
  FactBank,
  FactConstraint,
  GeneratedResume,
  ResumeAssistantMessage,
  ResumeAgentActivity,
  ResumeCandidateState,
  ResumeCustomizationSession,
  ResumePolishStyle,
  ResumeSettings,
} from '@/lib/types'
import { loadFactBank, loadResumeSettings, saveFactBank, saveResumeSettings } from '@/lib/storage'
import { automaticSessionDisplayName, createCustomizationSession, loadCustomizationSessions, saveCustomizationSessions } from '@/lib/customizationSessions'
import { DEFAULT_MAX_CLARIFICATION_ROUNDS, HARD_MAX_CLARIFICATION_ROUNDS, isStopClarificationIntent } from '@/lib/resumeSufficiency'
import { inferJobIdentity } from '@/lib/jobIdentity'

function mergeUnique<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const map = new Map(current.map(item => [item.id, item]))
  incoming.forEach(item => map.set(item.id, item))
  return [...map.values()]
}

function candidateFingerprint(statement: string): string {
  const compact = statement.toLowerCase().replace(/\s+/g, '').replace(/[，。；、：:（）()\[\]【】/|_\-]/g, '')
  if (compact.includes('即梦') && compact.includes('视频')) return 'aigc:jimeng:video'
  if ((compact.includes('ai') || compact.includes('人工智能')) && (compact.includes('图片') || compact.includes('图像'))) return 'aigc:image'
  return compact.replace(/使用|通过|工具|制作|生成过|进行/g, '')
}

function categoryFromEvidence(text: string): ConversationFactCandidate['category'] {
  if (/codex|claude\s*code|qwen\s*agent|cursor|aigc|人工智能|\bai\b/i.test(text)) return 'aigc'
  if (/视频|即梦|剪辑|分镜/.test(text)) return 'video'
  if (/prd|产品需求|用户调研|竞品分析/i.test(text)) return 'data'
  if (/文案|内容|脚本/.test(text)) return 'content_creation'
  return 'general'
}

function immediateEvidence(message: string, sessionId: string, messageId: string): NonNullable<FactBank['conversationFacts']> {
  const explicit = /(我|本人).{0,8}(用|使用|做过|负责|参与|开发|完成|开展|制作|撰写|调研|分析)/i.test(message)
    || /(用过|做过|开发过|制作过|完成过)/i.test(message)
  if (!explicit || /(没有|没做过|不会|不要写|删掉|移除)/i.test(message)) return []
  const statement = message.trim().slice(0, 240)
  return [{
    id: `session-${messageId}`,
    statement,
    category: categoryFromEvidence(statement),
    source: { sourceType: 'conversation', conversationId: sessionId, messageId, createdAt: new Date().toISOString() },
  }]
}

const DENIAL_ALIASES: Record<string, string[]> = {
  调色: ['调色', '色彩调整', '色彩校正', 'color grading'],
  剪辑: ['剪辑', '视频编辑', '视频后期'],
  分镜: ['分镜', '故事板'],
  'Word / PPT': ['word', 'ppt', 'powerpoint', '演示文稿'],
}

function constraintsFromMessage(message: string, sessionId: string, messageId: string): FactConstraint[] {
  if (!/(没有|没做过|不会|不要写|删掉|移除)/i.test(message)) return []
  return Object.entries(DENIAL_ALIASES).flatMap(([label, aliases]) => aliases.some(alias => message.toLowerCase().includes(alias.toLowerCase())) ? [{
    id: crypto.randomUUID(),
    kind: 'denial' as const,
    statement: message,
    blockedKeywords: label === 'Word / PPT' ? aliases : aliases,
    source: { sourceType: 'conversation' as const, conversationId: sessionId, messageId, createdAt: new Date().toISOString() },
  }] : [])
}

function correctionConstraint(statement: string, sessionId: string, messageId: string): FactConstraint | null {
  if (!statement.startsWith('事实修正：')) return null
  const blockedKeywords = /协助|不是负责|非负责/.test(statement) ? ['独立负责', '全面负责', '主导', '独立完成'] : []
  if (!blockedKeywords.length) return null
  return {
    id: crypto.randomUUID(),
    kind: 'correction',
    statement,
    blockedKeywords,
    source: { sourceType: 'conversation', conversationId: sessionId, messageId, createdAt: new Date().toISOString() },
  }
}

export function useResumeCustomization() {
  const [factBank, setFactBank] = useState<FactBank | null>(null)
  const [sessions, setSessions] = useState<ResumeCustomizationSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [restored, setRestored] = useState(false)
  const [resumeKey, setResumeKey] = useState(0)
  const sessionsRef = useRef<ResumeCustomizationSession[]>([])
  const factBankRef = useRef<FactBank | null>(null)
  const inFlight = useRef(new Set<string>())

  useEffect(() => {
    const loadedFactBank = loadFactBank()
    const settings = loadResumeSettings()
    const loaded = loadCustomizationSessions(settings)
    const nextSessions = loaded.sessions.length ? loaded.sessions : [createCustomizationSession(settings)]
    const nextActiveId = loaded.activeSessionId || nextSessions.at(-1)!.id
    const active = nextSessions.find(item => item.id === nextActiveId)
    setFactBank(loadedFactBank)
    setSessions(nextSessions)
    setActiveSessionId(nextActiveId)
    setRestored(Boolean(active && (active.jobDescription || active.messages.length || active.currentResume)))
    setInitialized(true)
  }, [])

  useEffect(() => { sessionsRef.current = sessions }, [sessions])
  useEffect(() => { factBankRef.current = factBank }, [factBank])
  useEffect(() => { if (initialized) saveCustomizationSessions(sessions, activeSessionId) }, [sessions, activeSessionId, initialized])

  const activeSession = sessions.find(item => item.id === activeSessionId) || null

  function updateSession(sessionId: string, updater: (session: ResumeCustomizationSession) => ResumeCustomizationSession) {
    setSessions(previous => previous.map(session => session.id === sessionId ? { ...updater(session), updatedAt: new Date().toISOString() } : session))
  }

  function updateActiveSession(updater: (session: ResumeCustomizationSession) => ResumeCustomizationSession) {
    if (activeSessionId) updateSession(activeSessionId, updater)
  }

  function handleFactBankChange(nextFactBank: FactBank) {
    setFactBank(nextFactBank)
    factBankRef.current = nextFactBank
    saveFactBank(nextFactBank)
  }

  function handleResumeSettingsChange(settings: ResumeSettings) {
    updateActiveSession(session => ({ ...session, resumeSettings: settings }))
    saveResumeSettings(settings)
  }

  function createNewSession() {
    const created = createCustomizationSession(activeSession?.resumeSettings || loadResumeSettings())
    setSessions(previous => [...previous, created])
    setActiveSessionId(created.id)
    setRestored(false)
    return created.id
  }

  function removeSession(sessionId: string) {
    const remaining = sessionsRef.current.filter(session => session.id !== sessionId)
    const next = remaining.at(-1) || createCustomizationSession(activeSession?.resumeSettings || loadResumeSettings())
    setSessions(remaining.length ? remaining : [next])
    if (sessionId === activeSessionId) setActiveSessionId(next.id)
    setRestored(false)
  }

  function removeActiveSession() {
    if (activeSessionId) removeSession(activeSessionId)
  }

  async function runAgent(
    sessionId: string,
    userMessage: string,
    mode: 'chat' | 'generate' | 'revise',
    jobDescriptionOverride?: string,
    existingUserMessage?: ResumeAssistantMessage
  ) {
    const session = sessionsRef.current.find(item => item.id === sessionId)
    let currentFactBank = factBankRef.current
    const jobDescription = (jobDescriptionOverride ?? session?.jobDescription ?? '').trim()
    if (!session || !currentFactBank || !jobDescription || inFlight.current.has(sessionId)) return
    const runId = `resume_run_${crypto.randomUUID()}`
    const user: ResumeAssistantMessage = existingUserMessage || { id: crypto.randomUUID(), role: 'user', content: userMessage, createdAt: new Date().toISOString() }
    const messages = existingUserMessage ? session.messages : [...session.messages, user]
    const identity = inferJobIdentity(jobDescription, session.company, session.role)
    const pendingEvidence = session.factCandidates
      .filter(candidate => (candidate.candidateType || 'evidence') === 'evidence' && session.candidateStates[candidate.id] !== 'ignored')
      .map(candidate => ({
        id: candidate.id,
        statement: session.candidateText[candidate.id] || candidate.statement,
        category: candidate.category,
        source: candidate.source,
      }))
    const sessionEvidence = mergeUnique(pendingEvidence, immediateEvidence(userMessage, sessionId, user.id))
    // A retry reuses the already persisted user turn. Its evidence and constraints
    // therefore keep the same message id and must not be appended a second time.
    const constraints = existingUserMessage ? [] : constraintsFromMessage(userMessage, sessionId, user.id)
    if (constraints.length) {
      currentFactBank = { ...currentFactBank, factConstraints: mergeUnique(currentFactBank.factConstraints || [], constraints) }
      handleFactBankChange(currentFactBank)
    }
    inFlight.current.add(sessionId)
    updateSession(sessionId, current => ({
      ...current,
      company: identity.company,
      role: identity.role,
      displayName: current.displayNameSource === 'manual' ? current.displayName : automaticSessionDisplayName(identity.company, identity.role),
      displayNameSource: current.displayNameSource === 'manual' ? 'manual' : 'auto',
      jobDescription,
      messages: existingUserMessage ? current.messages : [...current.messages, user],
      assistantStatus: 'sending',
      assistantError: '',
      generationStatus: mode === 'generate' || mode === 'revise' ? 'generating' : current.generationStatus,
      generationError: '',
      agentStage: { stage: 'reading_jd', message: '正在读取岗位 JD' },
      agentSummary: null,
      resumeStrategy: null,
      agentActivities: [],
      generationDiagnostic: null,
      lastGenerationId: runId,
      assistantPhase: mode === 'generate' ? 'stopped' : current.assistantPhase === 'idle' ? 'clarifying' : current.assistantPhase,
    }))
    try {
      const response = await fetch('/api/resume-agent/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId, sessionId, threadId: session.codexThreadId, factBank: currentFactBank,
          jobDescription, company: identity.company, role: identity.role,
          currentResume: session.currentResume, userMessage, mode,
          polishStyle: session.polishStyle, messages, sessionEvidence,
          clarificationRound: session.clarificationRounds, askedQuestionKeys: session.askedQuestionKeys,
          clarificationBudgetExhausted: mode === 'chat' && session.clarificationRounds >= HARD_MAX_CLARIFICATION_ROUNDS,
        }),
      })
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'AI 简历助手请求失败。')
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line) as Record<string, unknown>
          if (event.type === 'thread') updateSession(sessionId, current => ({ ...current, codexThreadId: String(event.threadId) }))
          if (event.type === 'status' && typeof event.stage === 'string' && typeof event.message === 'string') {
            const stage = event.stage as 'reading_jd' | 'scanning_facts' | 'matching_role' | 'selecting_evidence' | 'structuring_resume' | 'validating_facts' | 'optimizing_page'
            const message = event.message
            updateSession(sessionId, current => ({
              ...current,
              agentStage: {
                stage,
                message,
              },
            }))
          }
          if (event.type === 'summary' && Array.isArray(event.adopted) && Array.isArray(event.excluded)) {
            const adopted = event.adopted.filter((item): item is string => typeof item === 'string').slice(0, 4)
            const excluded = event.excluded.filter((item): item is { label: string; reason: string } => Boolean(item) && typeof item === 'object' && typeof (item as { label?: unknown }).label === 'string' && typeof (item as { reason?: unknown }).reason === 'string').slice(0, 3)
            updateSession(sessionId, current => ({ ...current, agentSummary: { adopted, excluded } }))
          }
          if (event.type === 'strategy' && event.strategy && typeof event.strategy === 'object') {
            updateSession(sessionId, current => ({ ...current, resumeStrategy: event.strategy as ResumeCustomizationSession['resumeStrategy'] }))
          }
          if (event.type === 'activity' && event.activity && typeof event.activity === 'object') {
            const activity = event.activity as ResumeAgentActivity
            updateSession(sessionId, current => ({
              ...current,
              agentActivities: [...(current.agentActivities || []).filter(item => item.stage !== activity.stage), activity],
            }))
          }
          if (event.type === 'error') {
            const payload = event.error && typeof event.error === 'object'
              ? event.error as { category?: string; retryable?: boolean; userMessage?: string; diagnostic?: ResumeCustomizationSession['generationDiagnostic'] }
              : { userMessage: String(event.error || 'AI 简历助手运行失败。') }
            const failure = new Error(payload.userMessage || 'AI 简历助手运行失败。') as Error & { generationDiagnostic?: ResumeCustomizationSession['generationDiagnostic']; category?: string }
            failure.generationDiagnostic = payload.diagnostic
            failure.category = payload.category
            throw failure
          }
          if (event.type !== 'result') continue
          const result = event.result as {
            threadId: string; action: 'ask' | 'confirm_facts' | 'resume_generated' | 'resume_updated'; assistantMessage: string
            factCandidates: Array<{ id: string; statement: string; category: ConversationFactCandidate['category']; candidateType: 'evidence' | 'gap'; rationale: string }>
            resume: GeneratedResume | null; changeSummary: string[]; layoutAdjustment: 'none' | 'overBudget' | 'underFilled'
          }
          const assistant: ResumeAssistantMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: result.resume && result.changeSummary.length
              ? `${result.action === 'resume_generated' ? '第一版已生成。' : '简历已更新。'}\n\n这次主要调整：\n${result.changeSummary.slice(0, 3).map(item => `• ${item}`).join('\n')}\n\n你可以直接告诉我下一步想改哪里。`
              : result.assistantMessage,
            createdAt: new Date().toISOString(),
          }
          updateSession(sessionId, current => {
            const seen = new Set(current.factCandidates.map(candidate => candidateFingerprint(candidate.statement)))
            const candidates = result.factCandidates.filter(candidate => {
              const key = candidateFingerprint(candidate.statement)
              if (seen.has(key)) return false
              seen.add(key)
              return true
            }).map(candidate => ({ ...candidate, candidateType: candidate.candidateType || 'evidence', confidence: 'unconfirmed' as const, source: { sourceType: 'conversation' as const, conversationId: sessionId, messageId: user.id, createdAt: new Date().toISOString() } }))
            const nextResume = result.resume || current.currentResume
            const company = nextResume?.jdReport?.company || current.company
            const role = nextResume?.jdReport?.role || current.role
            return {
              ...current,
              codexThreadId: result.threadId,
              messages: [...current.messages, assistant],
              factCandidates: mergeUnique(current.factCandidates, candidates),
              candidateText: { ...current.candidateText, ...Object.fromEntries(candidates.map(candidate => [candidate.id, candidate.statement])) },
              candidateStates: { ...current.candidateStates, ...Object.fromEntries(candidates.map(candidate => [candidate.id, 'pending' as const])) },
              currentResume: nextResume,
              jdAnalysis: nextResume?.jdReport || current.jdAnalysis,
              company,
              role,
              displayName: current.displayNameSource === 'manual' ? current.displayName : automaticSessionDisplayName(company, role),
              displayNameSource: current.displayNameSource === 'manual' ? 'manual' : 'auto',
              selectedFacts: nextResume?.composition?.selectedFactIds || current.selectedFacts,
              excludedFacts: nextResume?.composition?.excludedFacts || current.excludedFacts,
              assistantPhase: result.resume ? 'ready' : result.action === 'ask' || result.action === 'confirm_facts' ? 'clarifying' : 'ready',
              assistantStatus: 'idle',
              assistantError: '',
              clarificationRounds: mode === 'chat' ? Math.min(HARD_MAX_CLARIFICATION_ROUNDS, current.clarificationRounds + 1) : current.clarificationRounds,
              generationStatus: mode === 'generate' || mode === 'revise' ? (result.resume ? 'completed' : 'idle') : current.generationStatus,
              generationError: '',
              generationDiagnostic: null,
              agentStage: mode === 'generate' || mode === 'revise'
                ? { stage: 'optimizing_page', message: '已完成一页优化' }
                : { stage: 'validating_facts', message: '已完成事实一致性检查' },
            }
          })
          if (result.resume) setResumeKey(key => key + 1)
        }
        if (done) break
      }
    } catch (error) {
      const failure = error as Error & { generationDiagnostic?: ResumeCustomizationSession['generationDiagnostic']; category?: string }
      const technicalMessage = error instanceof Error ? error.message : ''
      const message = /已保存|请稍后再试|用时较长/.test(technicalMessage)
        ? technicalMessage
        : failure.name === 'AbortError'
          ? '网络连接似乎中断了，你的岗位、经历和上一版简历都已保存。'
          : 'AI 暂时没有完成这次修改。你的岗位、经历和上一版简历都已保存。'
      if (process.env.NODE_ENV === 'development') console.error('[ResumeGeneration:client]', { runId, sessionId, category: failure.category, errorName: failure.name, errorMessage: technicalMessage })
      updateSession(sessionId, current => ({
        ...current,
        assistantStatus: 'idle',
        assistantError: message,
        generationStatus: mode === 'generate' || mode === 'revise' ? 'failed' : current.generationStatus,
        generationError: mode === 'generate' || mode === 'revise' ? message : current.generationError,
        generationDiagnostic: failure.generationDiagnostic || null,
        agentStage: null,
      }))
    } finally {
      inFlight.current.delete(sessionId)
    }
  }

  function sendAssistantMessage(content: string) {
    if (!activeSession) return
    void runAgent(activeSession.id, content, requestMode(activeSession, content))
  }

  function requestMode(session: ResumeCustomizationSession, content: string): 'chat' | 'generate' | 'revise' {
    const stop = isStopClarificationIntent(content)
    if (stop && !session.currentResume) return 'generate'
    const revise = Boolean(session.currentResume && (/(删|移除|不要写|突出|太空|像\s*AI|改|重写|调整|压短|精简|顺序|夸张|放前面)/i.test(content)
      || (/(codex|claude\s*code|qwen\s*agent|cursor|即梦|prd|用户调研|竞品分析|aigc)/i.test(content) && /(我|用|做过|开发|制作|完成|参与)/i.test(content))))
    return revise ? 'revise' : 'chat'
  }

  function retryLastRequest() {
    if (!activeSession || activeSession.assistantStatus === 'sending' || activeSession.generationStatus === 'generating') return
    const lastUserMessage = [...activeSession.messages].reverse().find(message => message.role === 'user')
    if (!lastUserMessage) return
    void runAgent(activeSession.id, lastUserMessage.content, requestMode(activeSession, lastUserMessage.content), undefined, lastUserMessage)
  }

  function handleDirectGenerate() {
    if (activeSession) void runAgent(activeSession.id, '请基于当前已确认事实生成一版一页校招简历。', 'generate')
  }

  function generateFromJD(jobDescription: string) {
    if (activeSession) void runAgent(activeSession.id, '请基于当前已确认事实生成一版一页校招简历。', 'generate', jobDescription)
  }

  function analyzeCurrentJob(jobDescription: string) {
    if (!activeSession) return
    void runAgent(
      activeSession.id,
      '请阅读当前 JD 和已确认经历。先用不超过 5 条简短要点说明：岗位最重视什么、我已有哪类相关证据、如有必要可补充什么。不要生成简历，也不要编造事实。',
      'chat',
      jobDescription
    )
  }

  async function confirmCandidate(candidate: ConversationFactCandidate) {
    const session = sessionsRef.current.find(item => item.id === activeSessionId)
    const currentFactBank = factBankRef.current
    if (!session || !currentFactBank || candidate.candidateType === 'gap') return
    const statement = (session.candidateText[candidate.id] || candidate.statement).trim()
    if (!statement) return
    const fact = { id: candidate.id, statement, category: candidate.category, source: candidate.source }
    const correction = correctionConstraint(statement, session.id, candidate.id)
    const nextFactBank: FactBank = {
      ...currentFactBank,
      conversationFacts: mergeUnique((currentFactBank.conversationFacts || []).filter(item => item.id !== candidate.id), [fact]),
      factConstraints: correction ? mergeUnique(currentFactBank.factConstraints || [], [correction]) : currentFactBank.factConstraints,
    }
    handleFactBankChange(nextFactBank)
    updateSession(session.id, current => ({
      ...current,
      candidateStates: { ...current.candidateStates, [candidate.id]: 'confirmed' },
      confirmedConversationFacts: mergeUnique(current.confirmedConversationFacts, [fact]),
      denials: correction ? mergeUnique(current.denials, [correction]) : current.denials,
    }))
    if (session.jobDescription.trim()) {
      const response = await fetch('/api/resume-agent/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: session.id, factBank: nextFactBank, jobDescription: session.jobDescription, company: session.company, role: session.role, currentResume: session.currentResume }) })
      if (!response.ok) updateSession(session.id, current => ({ ...current, assistantError: '事实已保存，但助手工作区同步失败；下次对话会自动重试。' }))
    }
  }

  function handleCandidateState(candidateId: string, state: ResumeCandidateState) {
    updateActiveSession(session => ({ ...session, candidateStates: { ...session.candidateStates, [candidateId]: state } }))
  }

  function handleResumeChange(nextResume: GeneratedResume) {
    updateActiveSession(session => ({ ...session, currentResume: nextResume, selectedFacts: nextResume.composition?.selectedFactIds || session.selectedFacts, excludedFacts: nextResume.composition?.excludedFacts || session.excludedFacts }))
  }

  function renameSession(sessionId: string, displayName: string) {
    const name = displayName.trim()
    if (!name) return
    updateSession(sessionId, session => ({ ...session, displayName: name.slice(0, 60), displayNameSource: 'manual' }))
  }

  return {
    factBank, activeSession, sessions, activeSessionId, initialized, restored, resumeKey,
    setActiveSessionId, updateActiveSession, handleFactBankChange, handleResumeSettingsChange,
    createNewSession, sendAssistantMessage, retryLastRequest, handleDirectGenerate, confirmCandidate,
    handleCandidateState, handleResumeChange,
    handlePolishStyleChange: (polishStyle: ResumePolishStyle) => updateActiveSession(session => ({ ...session, polishStyle })),
    continueClarification: () => updateActiveSession(session => ({ ...session, assistantPhase: 'clarifying' })),
    generateFromJD, analyzeCurrentJob,
    removeActiveSession,
    removeSession,
    renameSession,
  }
}
