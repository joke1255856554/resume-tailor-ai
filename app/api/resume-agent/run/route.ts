import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import type { FactBank, GeneratedResume, ResumeAssistantMessage } from '@/lib/types'
import { runCodexResumeAgent } from '@/lib/codex/resumeAgent'
import { getResumeAIEngine } from '@/lib/resumeEngine'
import { classifyGenerationError, logGenerationError, publicGenerationMessage, safeGenerationDiagnostic } from '@/lib/generationDiagnostics'
import { POST as generateResume } from '@/app/api/generate-resume/route'
import { POST as assistResume } from '@/app/api/resume-assistant/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 240

const globalRuns = globalThis as typeof globalThis & { resumeAgentActiveRuns?: Map<string, string> }
const activeRuns = globalRuns.resumeAgentActiveRuns || new Map<string, string>()
globalRuns.resumeAgentActiveRuns = activeRuns

function factBankWithSessionEvidence(
  factBank: FactBank | undefined,
  sessionEvidence: FactBank['conversationFacts'] = []
): FactBank | undefined {
  if (!factBank) return undefined
  const facts = new Map((factBank.conversationFacts || []).map(fact => [fact.id, fact]))
  for (const fact of sessionEvidence || []) {
    if (fact?.id && fact.statement?.trim()) facts.set(fact.id, fact)
  }
  return { ...factBank, conversationFacts: [...facts.values()] }
}

/** The production Resume Agent endpoint. It intentionally exposes only safe UI events. */
export async function POST(request: NextRequest) {
  const body = await request.json() as {
    sessionId?: string
    runId?: string
    threadId?: string | null
    factBank?: FactBank
    jobDescription?: string
    company?: string
    role?: string
    currentResume?: GeneratedResume | null
    userMessage?: string
    mode?: 'chat' | 'generate' | 'revise'
    clarificationBudgetExhausted?: boolean
    polishStyle?: 'conservative' | 'standard' | 'targeted'
    messages?: unknown[]
    clarificationRound?: number
    askedQuestionKeys?: string[]
    sessionEvidence?: FactBank['conversationFacts']
    debugFault?: 'timeout' | 'malformed-output' | 'schema-output' | 'composer' | 'minimal-compose' | 'edit-verification' | 'edit-verification-hard'
  }

  // Development rollback only. Normal UI never exposes this engine choice.
  if (getResumeAIEngine() === 'legacy') {
    const url = new URL(request.url)
    const shouldGenerate = body.mode === 'generate' || body.mode === 'revise'
    const endpoint = shouldGenerate ? '/api/generate-resume' : '/api/resume-assistant'
    // Session evidence is valid for the current resume immediately, even before
    // the user chooses to save it permanently to the Fact Bank. Previously the
    // hosted fallback discarded this array, so "直接生成" silently used the old
    // profile and revisions were routed to the chat-only endpoint.
    const effectiveFactBank = factBankWithSessionEvidence(body.factBank, body.sessionEvidence)
    const legacyBody = shouldGenerate
      ? {
          factBank: effectiveFactBank,
          jdText: body.jobDescription,
          polishStyle: body.polishStyle,
          currentResume: body.currentResume,
          latestInstruction: body.userMessage,
          preferredFactIds: (body.sessionEvidence || []).map(fact => fact.id),
        }
      : { factBank: effectiveFactBank, jdText: body.jobDescription, requirements: body.currentResume?.requirements || [], messages: body.messages || [], userMessage: body.userMessage, conversationId: body.sessionId, messageId: `legacy-${Date.now()}`, clarificationRound: body.clarificationRound || 0, askedQuestionKeys: body.askedQuestionKeys || [] }
    // Invoke the existing route handler in-process. A server-side fetch back into
    // the same Render instance doubles connection/memory pressure and can be
    // terminated as an HTTP/2 protocol error on the free 512 MB service.
    const legacyRequest = new NextRequest(new URL(endpoint, url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(legacyBody),
    })
    const legacyResponse = shouldGenerate
      ? await generateResume(legacyRequest)
      : await assistResume(legacyRequest)
    const data = await legacyResponse.json().catch(() => ({})) as Record<string, unknown>
    if (!legacyResponse.ok || data.error) return Response.json({ error: String(data.error || 'Legacy Pipeline 未能完成请求。') }, { status: 500 })
    const result = shouldGenerate
      ? {
          threadId: '',
          action: body.mode === 'revise' ? 'resume_updated' : 'resume_generated',
          assistantMessage: body.mode === 'revise' ? '已根据本轮补充更新简历。' : '已结合当前会话事实生成简历。',
          factCandidates: [],
          resume: data.resume,
          changeSummary: [body.mode === 'revise' ? '已结合最新补充事实重新整理当前简历' : '已采用当前会话中明确提供的事实'],
          layoutAdjustment: 'none',
        }
      : { threadId: '', action: data.assistantPhase === 'ready' ? 'resume_updated' : 'ask', assistantMessage: String(data.assistantMessage || 'Legacy Pipeline 已处理本轮信息。'), factCandidates: data.factCandidates || [], resume: null, changeSummary: [], layoutAdjustment: 'none' }
    return new Response(`${JSON.stringify({ type: 'result', result })}\n`, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } })
  }
  if (!body.sessionId || !body.factBank || !body.jobDescription?.trim() || !body.userMessage?.trim()) {
    return Response.json({ error: '缺少简历助手所需的岗位、经历库或用户输入。' }, { status: 400 })
  }

  const runId = body.runId?.trim().slice(0, 80) || `resume_run_${randomUUID()}`
  if (activeRuns.has(body.sessionId)) {
    return Response.json({ error: '这份岗位简历已有一个请求正在执行，请等待当前任务完成。' }, { status: 409 })
  }
  activeRuns.set(body.sessionId, runId)
  const startedAt = Date.now()
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      const send = (value: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`))
      void runCodexResumeAgent({
        runId,
        sessionId: body.sessionId!,
        threadId: body.threadId,
        factBank: body.factBank!,
        jobDescription: body.jobDescription!,
        company: body.company || '',
        role: body.role || '',
        currentResume: body.currentResume,
        userMessage: body.userMessage!,
        mode: body.mode === 'generate' || body.mode === 'revise' ? body.mode : 'chat',
        clarificationBudgetExhausted: Boolean(body.clarificationBudgetExhausted),
        sessionEvidence: body.sessionEvidence,
        messages: (body.messages || []) as ResumeAssistantMessage[],
        debugFault: process.env.NODE_ENV === 'development' && request.headers.get('x-resume-debug') === '1' ? body.debugFault : undefined,
        onEvent: event => send(event),
      }).then(result => {
        if (process.env.NODE_ENV === 'development') console.info('[ResumeGeneration]', { runId, sessionId: body.sessionId, stage: 'complete', durationMs: Date.now() - startedAt })
        send({ type: 'result', result })
      })
        .catch(error => {
          const classified = classifyGenerationError(error, 'agent-request')
          logGenerationError({ runId, sessionId: body.sessionId!, startedAt, error: classified })
          send({
            type: 'error',
            error: {
              category: classified.info.category,
              retryable: classified.info.retryable,
              userMessage: publicGenerationMessage(classified.info.category),
              diagnostic: process.env.NODE_ENV === 'development' ? safeGenerationDiagnostic(classified, runId) : undefined,
            },
          })
        })
        .finally(() => {
          if (activeRuns.get(body.sessionId!) === runId) activeRuns.delete(body.sessionId!)
          controller.close()
        })
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } })
}
