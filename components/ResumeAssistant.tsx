'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { ConversationFactCandidate, FactBank, GeneratedResume, ResumeCandidateState, ResumeCustomizationSession } from '@/lib/types'
import EvidencePanel from '@/components/EvidencePanel'
import StrategyPanel from '@/components/StrategyPanel'

interface Props {
  factBank: FactBank
  resume: GeneratedResume | null
  session: ResumeCustomizationSession
  jobHeader: ReactNode
  onSendMessage: (content: string) => void
  onCandidateTextChange: (candidateId: string, value: string) => void
  onCandidateStateChange: (candidateId: string, state: ResumeCandidateState) => void
  onConfirmCandidate: (candidate: ConversationFactCandidate) => void
  onDirectGenerate: () => void
  onRetryLastRequest: () => void
  onContinueClarification: () => void
}

type CopilotTab = 'strategy' | 'evidence' | 'ai'

const STAGES = [
  ['read_jd', '读取岗位 JD'], ['extract_model', '提取岗位能力模型'], ['scan_facts', '扫描经历库'], ['build_matches', '建立岗位匹配关系'],
  ['plan_structure', '规划简历结构'], ['write_projects', '编写项目经历'], ['validate_truth', '检查真实性'], ['optimize_page', '优化一页布局'],
] as const

const TABS: Array<{ id: CopilotTab; label: string }> = [
  { id: 'strategy', label: '策略' }, { id: 'evidence', label: '证据' }, { id: 'ai', label: 'AI' },
]

const QUICK_ACTIONS = [
  ['更贴合岗位', '请突出与目标岗位最相关的内容。'], ['压短一点', '请在不删除关键信息的前提下压缩内容。'],
  ['调整顺序', '请把最相关的经历调整到更靠前的位置。'], ['检查夸张', '请检查并改正可能夸张、不够准确的表述。'],
] as const

function elapsedLabel(value: number): string {
  return value < 1000 ? `${value}ms` : `${(value / 1000).toFixed(1)}s`
}

export default function ResumeAssistant({ factBank, resume, session, jobHeader, onSendMessage, onCandidateTextChange, onCandidateStateChange, onConfirmCandidate, onDirectGenerate, onRetryLastRequest, onContinueClarification }: Props) {
  const [input, setInput] = useState('')
  const [activeTab, setActiveTab] = useState<CopilotTab>('strategy')
  const [activityExpanded, setActivityExpanded] = useState(false)
  const messagesRef = useRef<HTMLDivElement>(null)
  const shouldFollowLatestRef = useRef(true)
  const wasActivityRunningRef = useRef(false)
  const sending = session.assistantStatus === 'sending'
  const generating = session.generationStatus === 'generating'
  const generationFailed = session.generationStatus === 'failed'
  const activityRunning = sending || generating
  const ready = Boolean(resume) || session.assistantPhase === 'ready' || session.assistantPhase === 'stopped'
  const activities = session.agentActivities || []
  const completedActivities = activities.filter(item => item.state === 'done')
  const activityDuration = completedActivities.reduce((total, item) => total + (item.elapsedMs || 0), 0)
  const evidenceCount = session.selectedFacts.length || resume?.factMatches?.filter(item => item.evidenceStrength !== 'weak').length || 0
  const activeActivity = [...activities].reverse().find(item => item.state === 'active')
  const activitySummary = generationFailed
    ? '生成没有完成'
    : activityRunning
    ? activeActivity?.label ? `正在${activeActivity.label}` : '正在整理岗位与经历'
    : `${resume ? '已生成' : '已完成本轮整理'}${evidenceCount ? ` · 使用 ${evidenceCount} 条真实证据` : ''}${activityDuration ? ` · ${elapsedLabel(activityDuration)}` : ''}`
  const showActivityRun = activityRunning || activities.length > 0 || generationFailed

  useEffect(() => {
    setActiveTab('strategy')
    setActivityExpanded(false)
  }, [session.id])

  useEffect(() => {
    if (activityRunning) {
      setActiveTab('ai')
      setActivityExpanded(false)
    } else if (wasActivityRunningRef.current) {
      setActivityExpanded(false)
    }
    wasActivityRunningRef.current = activityRunning
  }, [activityRunning, generationFailed])

  useEffect(() => {
    if (activeTab !== 'ai' || !shouldFollowLatestRef.current) return
    const frame = requestAnimationFrame(() => {
      const body = messagesRef.current
      if (body) body.scrollTop = body.scrollHeight
    })
    return () => cancelAnimationFrame(frame)
  }, [activeTab, session.messages.length, sending, generating, activities.length])

  function submit(value = input) {
    const content = value.trim()
    if (!content || sending || generating) return
    setInput('')
    onSendMessage(content)
  }

  function supplement(statement: string) {
    setInput(`我补充一段关于“${statement}”的真实经历：`)
    setActiveTab('ai')
  }

  function growComposer(event: FormEvent<HTMLTextAreaElement>) {
    const textarea = event.currentTarget
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`
  }

  const tabCounts = useMemo(() => ({
    evidence: session.factCandidates.filter(candidate => (candidate.candidateType || 'evidence') === 'evidence' && session.candidateStates[candidate.id] !== 'ignored').length,
    gap: session.factCandidates.filter(candidate => candidate.candidateType === 'gap' && session.candidateStates[candidate.id] !== 'ignored').length,
  }), [session.candidateStates, session.factCandidates])

  return <div id="job-copilot" className="resume-assistant-shell">
    <div className="copilot-job-input">{jobHeader}</div>

    <nav className="copilot-tabs" aria-label="岗位 Copilot">
      {TABS.map(tab => <button key={tab.id} type="button" className={activeTab === tab.id ? 'is-active' : ''} aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>
        {tab.label}{tab.id === 'evidence' && (tabCounts.evidence + tabCounts.gap) > 0 && <span>{tabCounts.evidence + tabCounts.gap}</span>}
      </button>)}
    </nav>

    <div className="copilot-tab-body">
      {activeTab === 'strategy' && <StrategyPanel resume={resume} session={session} />}
      {activeTab === 'evidence' && <EvidencePanel factBank={factBank} resume={resume} session={session} onCandidateTextChange={onCandidateTextChange} onCandidateStateChange={onCandidateStateChange} onConfirmCandidate={onConfirmCandidate} onSupplement={supplement} />}
      {activeTab === 'ai' && <section className="ai-panel" aria-label="AI 简历助手">
        <header><div><h2>AI 简历助手</h2><p>告诉我你想修改哪里，或补充新的真实经历。</p></div>{ready && !activityRunning && <span>✓ 可生成</span>}</header>
        <div ref={messagesRef} className="assistant-messages" aria-live="polite" onScroll={event => {
          const body = event.currentTarget
          shouldFollowLatestRef.current = body.scrollHeight - body.scrollTop - body.clientHeight < 100
        }}>
          {session.messages.length === 0 && <div className="assistant-message assistant">我会基于真实经历协助你完善这份岗位简历。你可以先分析 JD，也可以补充一段最相关的经历。</div>}
          {session.messages.map(message => <div key={message.id} className={`assistant-message ${message.role}`}>{message.content}</div>)}
          {showActivityRun && <section className="agent-activity agent-run-message" data-running={activityRunning} data-failed={generationFailed} aria-live="polite">
            <button type="button" className="agent-activity-summary" aria-expanded={activityExpanded} onClick={() => setActivityExpanded(value => !value)}>
              <span className={generationFailed ? 'activity-failed' : activityRunning ? 'activity-pulse' : 'activity-check'}>{generationFailed ? '!' : activityRunning ? '●' : '✓'}</span>
              {activityRunning ? <span className="agent-run-copy"><strong>{resume ? '正在优化简历' : '正在整理岗位与经历'}</strong><small>{activitySummary}<i className="typing-dots" aria-hidden="true"><i /><i /><i /></i></small></span> : <strong>{activitySummary}</strong>}
              <small>{activityExpanded ? '收起' : '详情'}</small>
            </button>
            {activityExpanded && <div className="agent-timeline">{STAGES.map(([stage, label]) => {
              const activity = activities.find(item => item.stage === stage)
              const state = activity?.state || 'todo'
              return <div key={stage} data-state={state}><span>{state === 'done' ? '✓' : state === 'failed' ? '×' : state === 'active' ? '→' : '○'}</span><div><p>{label}{activity?.elapsedMs ? <time>{elapsedLabel(activity.elapsedMs)}</time> : null}</p>{activity?.result && <small>{activity.result}</small>}</div></div>
            })}</div>}
            {generationFailed && <div className="agent-run-error">
              <p>{session.assistantError || '你的岗位、经历和上一版简历都已保存。'}</p>
              {process.env.NODE_ENV === 'development' && session.generationDiagnostic && <details><summary>开发诊断</summary><p>失败阶段：{session.generationDiagnostic.stage}</p><p>类型：{session.generationDiagnostic.category}</p><p>runId：{session.generationDiagnostic.runId}</p><p>错误摘要：{session.generationDiagnostic.summary}</p></details>}
              <button type="button" onClick={onRetryLastRequest}>重新尝试</button>
            </div>}
          </section>}
        </div>
        {session.assistantError && !generationFailed && <div className="notice notice-error assistant-error-notice" role="alert"><span>{session.assistantError}</span>{/AI 暂时没有完成|你的岗位、简历和经历都已保存/.test(session.assistantError) && <button type="button" onClick={onRetryLastRequest}>重试</button>}</div>}
        {!resume && !generating && <div className="workflow-actions">{ready ? <><button type="button" className="btn-primary" onClick={onDirectGenerate}>生成第一版</button><button type="button" className="text-button" onClick={onContinueClarification}>继续补充经历</button></> : <button type="button" className="text-button" disabled={!factBank.experiences.length || !session.jobDescription.trim()} onClick={onDirectGenerate}>先生成一版</button>}</div>}
        {!resume && session.openQuestions.length > 0 && <div className="open-questions"><strong>可选补充</strong>{session.openQuestions.slice(0, 3).map(question => <button key={question} type="button" onClick={() => setInput(question)}>{question}</button>)}</div>}
      </section>}
    </div>

    {activeTab === 'ai' && <footer className="copilot-footer">
      {resume && <div className="quick-actions" aria-label="快捷修改"><span>快捷修改</span>{QUICK_ACTIONS.map(([label, prompt]) => <button key={label} type="button" onClick={() => submit(prompt)} disabled={sending || generating}>{label}</button>)}</div>}
      <div className="assistant-composer"><textarea value={input} onInput={growComposer} onChange={event => setInput(event.target.value)} rows={3} placeholder={resume ? '告诉 AI 你想怎么修改这份简历…' : '补充一段最相关的真实经历…'} onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit() }} /><div className="composer-footer"><span>Ctrl / ⌘ + Enter 发送</span><button type="button" className="btn-primary" disabled={sending || generating || !input.trim()} onClick={() => submit()}>{sending ? '执行中…' : '发送'}</button></div></div>
    </footer>}
  </div>
}
