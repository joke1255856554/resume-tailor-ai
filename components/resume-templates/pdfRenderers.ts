import React from 'react'
import type { GeneratedResume, ResumeSettings } from '@/lib/types'
import type { ResumeRendererId } from '@/lib/resumeTemplates'
import { ResumePDFDocument } from '@/components/ResumePDF'
import { ChineseCampusClassicPDF } from './ChineseCampusClassicPDF'

export type ResumePDFRenderer = React.ComponentType<{
  resume: GeneratedResume
  settings: ResumeSettings
}>

const PDF_RENDERERS: Record<ResumeRendererId, ResumePDFRenderer> = {
  'cn-campus-classic': ChineseCampusClassicPDF,
  'ats-classic': ({ resume }) => React.createElement(ResumePDFDocument, { resume }),
}

export function getResumePDFRenderer(rendererId: ResumeRendererId): ResumePDFRenderer {
  return PDF_RENDERERS[rendererId]
}
