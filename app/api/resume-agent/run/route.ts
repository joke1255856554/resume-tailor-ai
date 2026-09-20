import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import type { FactBank, GeneratedResume, ResumeAssistantMessage } from '@/lib/types'
import { runCodexResumeAgent } from '@/lib/codex/resumeAgent'
import { getResumeAIEngine } from '@/lib/resumeEngine'
import { classifyGenerationError, logGenerationError, publicGenerationMessage, safeGenerationDiagnostic } from '@/lib/generationDiagnostics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 240

const globalRuns = globalThis as typeof globalThis & { resumeAgentActiveRuns?: Map<string, string> }
const activeRuns = globalRuns.resumeAgentActiveRuns || new Map<string, string>()
globalRuns.resumeAgentActiveRuns = activeRuns

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
    const endpoint = body.mode === 'generate' ? '/api/generate-resume' : '/api/resume-assistant'
    const legacyBody = body.mode === 'generate'
      ? { factBank: body.factBank, jdText: body.jobDescription, polishStyle: body.polishStyle }
      : { factBank: body.factBank, jdText: body.jobDescription, requirements: body.currentResume?.requirements || [], messages: body.messages || [], userMessage: body.userMessage, conversationId: body.sessionId, messageId: `legacy-${Date.now()}`, clarificationRound: body.clarificationRound || 0, askedQuestionKeys: body.askedQuestionKeys || [] }
    const legacyResponse = await fetch(new URL(endpoint, url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(legacyBody), cache: 'no-store' })
    const data = await legacyResponse.json().catch(() => ({})) as Record<string, unknown>
    if (!legacyResponse.ok || data.error) return Response.json({ error: String(data.error || 'Legacy Pipeline 未能完成请求。') }, { status: 500 })
    const result = body.mode === 'generate'
      ? { threadId: '', action: 'resume_generated', assistantMessage: '已使用 Legacy Pipeline 生成简历。', factCandidates: [], resume: data.resume, changeSummary: ['Legacy Pipeline fallback'], layoutAdjustment: 'none' }
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
