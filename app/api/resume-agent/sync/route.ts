import { NextRequest, NextResponse } from 'next/server'
import type { FactBank, GeneratedResume } from '@/lib/types'
import { syncResumeWorkspace } from '@/lib/codex/workspace'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { sessionId?: string; factBank?: FactBank; jobDescription?: string; company?: string; role?: string; currentResume?: GeneratedResume | null }
    if (!body.sessionId || !body.factBank || !body.jobDescription?.trim()) return NextResponse.json({ error: '缺少助手工作区同步数据。' }, { status: 400 })
    await syncResumeWorkspace({ sessionId: body.sessionId, factBank: body.factBank, jobDescription: body.jobDescription, company: body.company, role: body.role, currentResume: body.currentResume })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '助手工作区同步失败。' }, { status: 500 })
  }
}
