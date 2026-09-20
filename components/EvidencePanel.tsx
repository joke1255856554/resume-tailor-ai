'use client'

import { useMemo, useState } from 'react'
import type { ConversationFactCandidate, FactBank, GeneratedResume, ResumeCandidateState, ResumeCustomizationSession } from '@/lib/types'

interface Props {
  factBank: FactBank
  resume: GeneratedResume | null
  session: ResumeCustomizationSession
  onCandidateTextChange: (candidateId: string, value: string) => void
  onCandidateStateChange: (candidateId: string, state: ResumeCandidateState) => void
  onConfirmCandidate: (candidate: ConversationFactCandidate) => void
  onSupplement: (statement: string) => void
}

type CoverageStrength = 'strong' | 'partial' | 'none'
type EvidenceRef = { id: string; label: string; detail: string; source: '我的经历' | '当前对话' | '用户确认' }

const STRENGTH_LABELS: Record<CoverageStrength, string> = { strong: '强', partial: '一般', none: '暂无' }
const PRIORITY_LABELS = { core: '核心', important: '重要', bonus: '加分' } as const

export default function EvidencePanel({ factBank, resume, session, onCandidateTextChange, onCandidateStateChange, onConfirmCandidate, onSupplement }: Props) {
  const [editingCandidates, setEditingCandidates] = useState<Record<string, boolean>>({})
  const [dismissedRequirements, setDismissedRequirements] = useState<Set<string>>(new Set())
  const [showAllRequirements, setShowAllRequirements] = useState(false)
  const visibleCandidates = session.factCandidates.filter(candidate => session.candidateStates[candidate.id] !== 'ignored')
  const evidenceCandidates = visibleCandidates.filter(candidate => (candidate.candidateType || 'evidence') === 'evidence')
  const gapCandidates = visibleCandidates.filter(candidate => candidate.candidateType === 'gap')

  const sourceForFact = (factId: string): EvidenceRef | null => {
    const confirmedConversation = session.confirmedConversationFacts.find(item => item.id === factId)
    if (confirmedConversation) return { id: factId, label: confirmedConversation.statement.slice(0, 42), detail: confirmedConversation.statement, source: '用户确认' }
    const savedConversation = (factBank.conversationFacts || []).find(item => item.id === factId)
    if (savedConversation) return { id: factId, label: savedConversation.statement.slice(0, 42), detail: savedConversation.statement, source: '用户确认' }
    const experience = factBank.experiences.find(item => item.id === factId)
    if (experience) return { id: factId, label: experience.company, detail: experience.versions.flatMap(version => version.bullets).find(Boolean) || experience.versions[0]?.title || '经历库中的实习／工作经历', source: '我的经历' }
    const project = factBank.projects?.find(item => item.id === factId)
    if (project) return { id: factId, label: project.name, detail: project.bullets.find(Boolean) || project.role || '经历库中的项目经历', source: '我的经历' }
    const campus = factBank.campusExperiences?.find(item => item.id === factId)
    if (campus) return { id: factId, label: campus.organization, detail: campus.bullets.find(Boolean) || campus.role, source: '我的经历' }
    const award = factBank.awards?.find(item => item.id === factId)
    if (award) return { id: factId, label: award.title, detail: award.description || award.issuer || '经历库中的奖项', source: '我的经历' }
    const skill = factBank.skillGroups?.find(item => item.id === factId)
    if (skill) return { id: factId, label: skill.label, detail: skill.items.join(' · '), source: '我的经历' }
    const certificate = factBank.certificates?.find(item => item.id === factId)
    if (certificate) return { id: factId, label: certificate.name, detail: certificate.description || certificate.score || certificate.issuer || '经历库中的证书', source: '我的经历' }
    return null
  }

  const mappings = useMemo(() => (resume?.requirements || []).map(requirement => {
    const gap = resume?.requirementGaps?.find(item => item.requirementId === requirement.id)
    const matches = (resume?.factMatches || []).filter(match => match.requirementIds.includes(requirement.id) && match.evidenceStrength !== 'weak')
    const refs = new Map<string, EvidenceRef>()
    matches.forEach(match => {
      const ref = sourceForFact(match.factId) || { id: match.factId, label: match.label, detail: match.reasons[0] || '已有真实经历支持', source: match.factType === 'conversation' ? '当前对话' as const : '我的经历' as const }
      refs.set(ref.id, ref)
    })
    ;(resume?.bulletEvidence || []).filter(bullet => bullet.matchedRequirementIds.includes(requirement.id)).forEach(bullet => {
      bullet.sourceFactIds.forEach(factId => {
        const source = sourceForFact(factId)
        if (source) refs.set(factId, { ...source, detail: bullet.text || source.detail })
      })
    })
    const strength: CoverageStrength = gap?.status === 'sufficient' || matches.some(match => match.evidenceStrength === 'strong') ? 'strong' : gap?.status === 'partial' || refs.size ? 'partial' : 'none'
    return { requirement, gap, strength, evidence: [...refs.values()].slice(0, 4) }
  }).sort((a, b) => ({ core: 0, important: 1, bonus: 2 }[a.requirement.importance] - { core: 0, important: 1, bonus: 2 }[b.requirement.importance])), [resume, factBank, session.confirmedConversationFacts])

  const coreMappings = mappings.filter(item => item.requirement.importance === 'core')
  const coveredCore = coreMappings.filter(item => item.strength !== 'none').length
  const defaultMappings = coreMappings.length ? coreMappings : mappings
  const visibleMappings = (showAllRequirements ? mappings : defaultMappings).filter(item => !dismissedRequirements.has(item.requirement.id))

  return <div className="evidence-panel evidence-mapping-v2">
    <section className="evidence-coverage"><div><span>证据覆盖</span><strong>{coreMappings.length ? `${coveredCore} / ${coreMappings.length}` : '待分析'}</strong></div><p>{coreMappings.length ? '项核心要求已有真实证据；不使用关键词百分比。' : '完成岗位分析后，将按岗位要求展示真实证据。'}</p></section>

    {mappings.length > 0 && <section className="requirement-mapping-list">
      <div className="copilot-section-label"><span>岗位要求 ↔ 真实证据</span><small>{mappings.length} 项</small></div>
      {visibleMappings.map(item => <details key={item.requirement.id} className="requirement-mapping-item" data-strength={item.strength}>
        <summary><span className="coverage-dot" aria-hidden="true" /><div><strong>{item.requirement.requirement}</strong><small>{PRIORITY_LABELS[item.requirement.importance]}要求</small></div><b>{STRENGTH_LABELS[item.strength]}</b></summary>
        <div className="requirement-mapping-body">
          <p className="requirement-why">岗位关注：{item.requirement.keywords.length ? item.requirement.keywords.slice(0, 5).join('、') : item.gap?.explanation || '该岗位将这项能力列为要求。'}</p>
          {item.evidence.length > 0 ? <div className="mapped-evidence-list">{item.evidence.map(evidence => <article key={evidence.id}><div><strong>{evidence.label}</strong><span>{evidence.source}</span></div><p>“{evidence.detail}”</p></article>)}</div> : <div className="mapping-empty"><p>目前没有足够真实证据。Gap 不会自动写入简历。</p><div><button type="button" onClick={() => onSupplement(item.requirement.requirement)}>补充相关经历</button><button type="button" onClick={() => setDismissedRequirements(current => new Set(current).add(item.requirement.id))}>暂时没有</button></div></div>}
        </div>
      </details>)}
      {mappings.length > defaultMappings.length && <button type="button" className="evidence-show-all" onClick={() => setShowAllRequirements(value => !value)}>{showAllRequirements ? '只看核心要求' : `查看其余 ${mappings.length - defaultMappings.length} 项要求`}</button>}
    </section>}

    {evidenceCandidates.length > 0 && <details className="evidence-secondary"><summary>当前对话发现 {evidenceCandidates.length} 条可用证据</summary><section className="evidence-group evidence-candidates">{evidenceCandidates.map(candidate => {
      const state = session.candidateStates[candidate.id] || 'pending'
      const editing = Boolean(editingCandidates[candidate.id])
      return <article key={candidate.id} className="evidence-candidate-card" data-state={state}><span className="decision-mark is-used">{state === 'confirmed' || candidate.confidence === 'confirmed' ? '✓' : '+'}</span><div>{editing && state !== 'confirmed' ? <input autoFocus value={session.candidateText[candidate.id] ?? candidate.statement} onChange={event => onCandidateTextChange(candidate.id, event.target.value)} /> : <strong>{session.candidateText[candidate.id] ?? candidate.statement}</strong>}<p>来源：当前对话{candidate.rationale ? ` · ${candidate.rationale}` : ''}</p>{state === 'confirmed' ? <small>✓ 已加入长期经历库</small> : <div className="candidate-actions"><button type="button" onClick={() => onConfirmCandidate(candidate)}>加入经历库</button><button type="button" onClick={() => setEditingCandidates(current => ({ ...current, [candidate.id]: !editing }))}>{editing ? '完成修改' : '修改'}</button><button type="button" onClick={() => onCandidateStateChange(candidate.id, 'ignored')}>忽略</button></div>}</div></article>
    })}</section></details>}

    {gapCandidates.length > 0 && <section className="evidence-group gap-candidates"><div className="copilot-section-label"><span>可补充项</span><small>不阻塞生成</small></div>{gapCandidates.map(candidate => <details key={candidate.id} className="gap-candidate-compact"><summary><strong>{candidate.statement}</strong><span>可补充</span></summary><div><p>{candidate.rationale || '岗位关注这项能力，但目前没有明确的真实证据。'}</p><small>目前证据不足，不会自动写入简历。</small><div className="candidate-actions"><button type="button" onClick={() => onSupplement(candidate.statement)}>补充相关经历</button><button type="button" onClick={() => onCandidateStateChange(candidate.id, 'ignored')}>暂时没有</button></div></div></details>)}</section>}

    {!mappings.length && !evidenceCandidates.length && !gapCandidates.length && <div className="copilot-panel-empty compact"><span className="copilot-empty-icon">◇</span><strong>还没有证据映射</strong><p>分析 JD 后，这里会直接展示每项岗位要求由哪些真实经历支持。</p></div>}
  </div>
}
