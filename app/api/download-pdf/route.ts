import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { GeneratedResume } from '@/lib/types'
import { normalizeResume, normalizeResumeSettings } from '@/lib/normalize'
import { createRenderedResumeSettings, LEGACY_RESUME_SETTINGS, resolveRenderableTemplate } from '@/lib/resumeTemplates'
import { getResumePDFRenderer } from '@/components/resume-templates/pdfRenderers'
import React from 'react'
import sharp from 'sharp'

export const runtime = 'nodejs'

const MAX_AVATAR_BYTES = 4 * 1024 * 1024

class AvatarPDFError extends Error {}

async function normalizeAvatarForPDF(resume: GeneratedResume, showAvatar: boolean): Promise<GeneratedResume> {
  if (!showAvatar || !resume.contact.avatar) return resume

  const match = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(resume.contact.avatar)
  if (!match) {
    throw new AvatarPDFError('当前头像无法用于 PDF，请重新上传头像，或关闭头像后重试。')
  }

  let source: Buffer
  try {
    source = Buffer.from(match[2].replace(/\s/g, ''), 'base64')
    if (!source.length || source.length > MAX_AVATAR_BYTES) throw new Error('invalid avatar size')
    const metadata = await sharp(source, { failOn: 'error' }).metadata()
    if (!metadata.width || !metadata.height) throw new Error('missing avatar dimensions')
    const jpeg = await sharp(source, { failOn: 'error' })
      .rotate()
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer()
    return {
      ...resume,
      contact: {
        ...resume.contact,
        avatar: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
      },
    }
  } catch {
    throw new AvatarPDFError('头像文件已损坏或格式不受支持，请重新上传头像后再导出。')
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: { resume?: GeneratedResume; templateId?: string; settings?: unknown } = await req.json()
    const normalizedResume = normalizeResume(body.resume)
    if (!normalizedResume) return NextResponse.json({ error: '缺少可导出的简历内容。' }, { status: 400 })

    const settings = normalizeResumeSettings(
      body.settings || (body.templateId ? { templateId: body.templateId } : null),
      LEGACY_RESUME_SETTINGS
    )
    const renderedSettings = createRenderedResumeSettings(settings)
    const resume = await normalizeAvatarForPDF(normalizedResume, renderedSettings.showAvatar)
    const template = resolveRenderableTemplate(renderedSettings.templateId)
    const rendererId = template.pdfRendererId || 'ats-classic'
    const PDFRenderer = getResumePDFRenderer(rendererId)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(React.createElement(PDFRenderer, { resume, settings: renderedSettings }) as any)

    const namePart = (resume.contact.name || '简历').replace(/[\\/:*?"<>|\s]+/g, '')
    const companyPart = (resume.jdReport?.company || '').replace(/[\\/:*?"<>|\s]+/g, '')
    const rolePart = (resume.jdReport?.role || '').replace(/[\\/:*?"<>|\s]+/g, '')
    const fileName = companyPart || rolePart
      ? [namePart, companyPart, rolePart].filter(Boolean).join('_') + '.pdf'
      : `${namePart}_简历.pdf`
    const encodedFileName = encodeURIComponent(fileName).replace(/['()]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="resume.pdf"; filename*=UTF-8''${encodedFileName}`,
      },
    })
  } catch (err) {
    console.error('Download PDF error:', err)
    if (err instanceof AvatarPDFError) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    return NextResponse.json({ error: 'PDF 导出失败，请稍后重试。' }, { status: 500 })
  }
}
