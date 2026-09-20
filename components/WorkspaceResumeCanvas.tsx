'use client'

import type { ReactNode } from 'react'

interface Props {
  displayName: string
  company: string
  role: string
  hasJob: boolean
  hasResume: boolean
  generating: boolean
  canGenerate: boolean
  onStartJob: () => void
  onGenerate: () => void
  toolbarActions?: ReactNode
  evidenceCoverage?: string
  strategyLabel?: string
  children?: ReactNode
}

function ResumeGlyph() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.5 3.5h8L18.5 7v13.5h-12z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M14.5 3.5V7h4M9.5 11h6M9.5 14h6M9.5 17h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
}

export default function WorkspaceResumeCanvas({ displayName, company, role, hasJob, hasResume, generating, canGenerate, onStartJob, onGenerate, toolbarActions, evidenceCoverage, strategyLabel, children }: Props) {
  const jobName = displayName.trim() || [company.trim(), role.trim()].filter(Boolean).join(' · ') || '新目标岗位'
  return <section className="workspace-resume-canvas" data-generating={generating} aria-label="简历画布">
    <header className="resume-canvas-toolbar">
      <div><span className="workspace-eyebrow">RESUME CANVAS</span><strong>{jobName}</strong>{hasResume && <p><span>{evidenceCoverage || '核心要求待分析'}</span><span>当前策略：{strategyLabel || '尚未生成'}</span></p>}</div>
      <div className="resume-canvas-actions">{generating && <span className="canvas-agent-status"><i />AI 正在优化简历<span className="canvas-dots">···</span></span>}<span className="resume-version-badge">{hasResume ? '当前版本 V1' : '未生成'}</span>{toolbarActions}</div>
    </header>

    {hasResume ? children : <div className="resume-empty-workspace"><div className="empty-resume-page">
      <span><ResumeGlyph /></span>
      <strong>{hasJob ? '针对该岗位的简历还没有生成' : '创建你的第一个目标岗位'}</strong>
      <p>{hasJob ? '右侧可以查看岗位策略与证据；Gap 不会阻塞你先生成第一版。' : '把岗位 JD 粘贴进来，AI 会根据你的真实经历建立岗位策略并生成针对性简历。'}</p>
      <button type="button" className="btn-primary" onClick={hasJob ? onGenerate : onStartJob} disabled={hasJob && (!canGenerate || generating)}>{generating ? '正在生成…' : hasJob ? '按当前策略生成简历' : '添加目标岗位'}</button>
      <small>A4 · cn-campus-classic</small>
    </div></div>}
  </section>
}
