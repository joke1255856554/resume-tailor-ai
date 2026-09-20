import { NextRequest } from 'next/server'
import type { FactBank, GeneratedResume } from '@/lib/types'
import { runCodexResumeAgent } from '@/lib/codex/resumeAgent'
import { randomUUID } from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    sessionId?: string
    threadId?: string | null
    factBank?: FactBank
    jobDescription?: string
    company?: string
    role?: string
    currentResume?: GeneratedResume | null
    userMessage?: string
    mode?: 'chat' | 'generate' | 'revise'
  }
  if (!body.sessionId || !body.factBank || !body.jobDescription?.trim() || !body.userMessage?.trim()) {
    return Response.json({ error: '缺少 Codex 实验所需的 Session、经历库、JD 或用户输入。' }, { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      const send = (value: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`))
      void runCodexResumeAgent({
        runId: `resume_run_${randomUUID()}`,
        sessionId: body.sessionId!,
        threadId: body.threadId,
        factBank: body.factBank!,
        jobDescription: body.jobDescription!,
        company: body.company || '',
        role: body.role || '',
        currentResume: body.currentResume,
        userMessage: body.userMessage!,
        mode: body.mode === 'generate' || body.mode === 'revise' ? body.mode : 'chat',
        onEvent: event => send(event),
      }).then(result => send({ type: 'result', result })).catch(error => send({ type: 'error', error: error instanceof Error ? error.message : 'Codex 实验运行失败。' })).finally(() => controller.close())
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } })
}
