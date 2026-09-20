import React from 'react'
import type { GeneratedResume, ResumeSettings } from '@/lib/types'
import type { ResumeRendererId } from '@/lib/resumeTemplates'
import { ChineseCampusClassicPreview } from './ChineseCampusClassicPreview'

export interface ResumePreviewRendererProps {
  resume: GeneratedResume
  settings: ResumeSettings
  onChange: (resume: GeneratedResume) => void
  legacyRenderer?: React.ReactNode
}

function AtsClassicPreviewAdapter({ legacyRenderer }: ResumePreviewRendererProps) {
  return <>{legacyRenderer}</>
}

const PREVIEW_RENDERERS: Record<ResumeRendererId, React.ComponentType<ResumePreviewRendererProps>> = {
  'cn-campus-classic': ChineseCampusClassicPreview,
  'ats-classic': AtsClassicPreviewAdapter,
}

export function getResumePreviewRenderer(rendererId: ResumeRendererId) {
  return PREVIEW_RENDERERS[rendererId]
}

