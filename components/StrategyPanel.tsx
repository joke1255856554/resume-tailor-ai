'use client'

import { useState } from 'react'
import type { GeneratedResume, ResumeCustomizationSession } from '@/lib/types'

interface Props {
  resume: GeneratedResume | null
  session: ResumeCustomizationSession
}

function requirementLabel(resume: GeneratedResume, requirementId: string): string {
  return resume.requirements?.find(item => item.id === requirementId)?.requirement || '岗位相关能力'
}

export default function StrategyPanel({ resume, session }: Props) {
  const [expanded, setExpanded] = useState(false)
  const strategy = session.resumeStrategy
  const gaps = resume?.requirementGaps
    ?.filter(item => item.status !== 'sufficient')
    .slice(0, 3)
    .map(item => ({ label: requirementLabel(resume, item.requirementId), explanation: item.explanation })) || []

  if (!strategy) {
    return <div className="copilot-panel-empty">
      <span className="copilot-empty-icon">◎</span>
      <strong>岗位策略尚未生成</strong>
      <p>分析岗位后，这里会展示候选人定位、核心优势和主打经历。</p>
    </div>
  }

  const strengths = strategy.coreStrengths.slice(0, 3)
  const adopted = strategy.adopted.slice(0, 3)
  const risks = gaps.slice(0, 2)

  return <div className="strategy-panel compact-strategy">
    <section className="strategy-positioning compact"><span>定位</span><h3>{strategy.persona}</h3></section>
    <section className="strategy-scan-block"><span>核心优势</span><div className="strategy-chips">{(strengths.length ? strengths : ['真实项目与执行能力']).map(item => <b key={item}>{item}</b>)}</div></section>
    {adopted.length > 0 && <section className="strategy-scan-block"><span>主打经历</span><ul>{adopted.map(item => <li key={item.label}>{item.label}</li>)}</ul></section>}
    <section className="strategy-scan-block strategy-primary-risk"><span>主要风险</span>{risks.length ? <ul>{risks.map(item => <li key={item.label}>{item.label}</li>)}</ul> : <p>暂未发现阻塞生成的主要风险</p>}</section>
    <button type="button" className="strategy-expand-button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? '收起完整策略' : '查看完整策略'}</button>

    {expanded && <div className="strategy-details">
      <dl className="strategy-facts"><div><dt>目标岗位</dt><dd>{strategy.targetJob}</dd></div><div><dt>结构策略</dt><dd>{strategy.structureStrategy}</dd></div></dl>
      {strategy.adopted.length > 0 && <section className="strategy-list"><div className="copilot-section-label"><span>采用原因</span><small>{strategy.adopted.length} 条</small></div>{strategy.adopted.map(item => <article key={`${item.label}-${item.reason}`}><span className="decision-mark is-used">✓</span><div><strong>{item.label}</strong><p>{item.reason}</p></div></article>)}</section>}
      {strategy.excluded.length > 0 && <section className="strategy-list is-weakened"><div className="copilot-section-label"><span>舍弃或弱化</span><small>{strategy.excluded.length} 条</small></div>{strategy.excluded.map(item => <article key={`${item.label}-${item.reason}`}><span className="decision-mark">×</span><div><strong>{item.label}</strong><p>{item.reason}</p></div></article>)}</section>}
      {gaps.length > 0 && <section className="strategy-risks"><div className="copilot-section-label"><span>详细风险</span><small>不阻塞生成</small></div>{gaps.map(item => <p key={`${item.label}-${item.explanation}`}><strong>{item.label}</strong>{item.explanation}</p>)}</section>}
    </div>}
  </div>
}
