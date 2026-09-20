import { NextRequest, NextResponse } from 'next/server'
import type { GeneratedResume } from '@/lib/types'

export async function POST(req: NextRequest) {
  const body = await req.json() as { resume?: GeneratedResume }
  if (!body.resume) return NextResponse.json({ error: '缺少简历内容。' }, { status: 400 })

  // Phase 5: JD keywords are never allowed to create candidate facts. The old
  // keyword-insertion flow is intentionally retired; users add evidence through
  // the assistant, confirm it, and then regenerate through the evidence-bound composer.
  return NextResponse.json({
    resume: body.resume,
    message: '匹配度只能通过已确认事实提升。请在 AI 简历助手中补充真实经历后重新生成。',
  })
}

