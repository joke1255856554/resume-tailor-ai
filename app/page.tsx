'use client'

import { useEffect, useRef, useState } from 'react'
import type { ResumeSettings } from '@/lib/types'
import { createRenderedResumeSettings } from '@/lib/resumeTemplates'
import { loadApplications, saveApplication, type Application } from '@/lib/applications'
import { useResumeCustomization } from '@/hooks/useResumeCustomization'
import FactBankEditor from '@/components/FactBankEditor'
import JDInput from '@/components/JDInput'
import ResumePreview from '@/components/ResumePreview'
import ResumeAssistant from '@/components/ResumeAssistant'
import ApplicationsLog from '@/components/ApplicationsLog'
import JobWorkspaceSidebar from '@/components/JobWorkspaceSidebar'
import WorkspaceResumeCanvas from '@/components/WorkspaceResumeCanvas'
import { sessionDisplayName } from '@/lib/customizationSessions'

type Tab = 'factbank' | 'generate' | 'applications'

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'factbank', label: '经历库' },
  { id: 'generate', label: '岗位工作台' },
  { id: 'applications', label: '投递记录' },
]

function BrandIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 4.5h7.5L18 8v11.5H7z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M14.5 4.5V8H18M9.8 12h5.4M9.8 15h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
}

export default function Home() {
  const [tab, setTab] = useState<Tab>('factbank')
  const [applications, setApplications] = useState<Application[]>([])
  const [saved, setSaved] = useState(false)
  const copilotPanelRef = useRef<HTMLDivElement>(null)
  const customization = useResumeCustomization()
  const { factBank, activeSession } = customization

  useEffect(() => { setApplications(loadApplications()) }, [])

  useEffect(() => {
    const panel = copilotPanelRef.current
    if (!panel || tab !== 'generate' || !activeSession?.currentResume) return
    let frame = 0
    const updateAvailableHeight = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (window.innerWidth <= 1180) {
          panel.style.removeProperty('--copilot-available-height')
          return
        }
        const rootStyles = getComputedStyle(document.documentElement)
        const stickyTop = Number.parseFloat(rootStyles.getPropertyValue('--copilot-sticky-top')) || 80
        const bottomGap = Number.parseFloat(rootStyles.getPropertyValue('--copilot-bottom-gap')) || 16
        const visibleTop = Math.max(panel.getBoundingClientRect().top, stickyTop)
        panel.style.setProperty('--copilot-available-height', `${Math.max(0, window.innerHeight - visibleTop - bottomGap)}px`)
      })
    }
    updateAvailableHeight()
    window.addEventListener('resize', updateAvailableHeight)
    window.addEventListener('scroll', updateAvailableHeight, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', updateAvailableHeight)
      window.removeEventListener('scroll', updateAvailableHeight)
    }
  }, [tab, activeSession?.id, activeSession?.currentResume])

  if (!factBank || !activeSession) return <div className="min-h-screen flex flex-col items-center justify-center gap-3" aria-live="polite"><div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" /><p className="text-sm" style={{ color: 'var(--text-muted)' }}>正在恢复工作台…</p></div>

  const resume = activeSession.currentResume
  const hasFactBank = factBank.experiences.length > 0
  const hasJobContext = Boolean(activeSession.company.trim() || activeSession.role.trim() || activeSession.jobDescription.trim() || activeSession.jobUrl.trim() || activeSession.messages.length)
  const sessionLabel = sessionDisplayName(activeSession)
  const appliedSessionIds = new Set(customization.sessions.filter(session => applications.some(application => application.company === session.company && application.role === session.role)).map(session => session.id))
  const coreRequirements = resume?.requirements?.filter(requirement => requirement.importance === 'core') || []
  const coveredCore = coreRequirements.filter(requirement => resume?.requirementGaps?.some(gap => gap.requirementId === requirement.id && gap.status !== 'missing')).length
  const evidenceCoverageLabel = coreRequirements.length ? `${coveredCore} / ${coreRequirements.length} 核心要求已有证据` : '核心要求待分析'

  function handleSettingsChange(settings: ResumeSettings) {
    customization.handleResumeSettingsChange(settings)
    setSaved(false)
  }

  function saveCurrentApplication() {
    if (!resume || !activeSession || saved) return
    saveApplication({ company: activeSession.company || resume.jdReport?.company || '—', role: activeSession.role || resume.jdReport?.role || '—', resume, jdText: activeSession.jobDescription || null, resumeSettings: createRenderedResumeSettings(activeSession.resumeSettings) })
    setApplications(loadApplications())
    setSaved(true)
  }

  const jobInput = <JDInput key={activeSession.id} factBank={factBank} jobUrl={activeSession.jobUrl} jobDescription={activeSession.jobDescription} company={activeSession.company} role={activeSession.role} displayName={sessionLabel} polishStyle={activeSession.polishStyle} generationStatus={activeSession.generationStatus} generationError={activeSession.generationError} assistantStatus={activeSession.assistantStatus} isSessionLocked={Boolean(activeSession.currentResume || activeSession.messages.length)} onJobUrlChange={value => customization.updateActiveSession(session => ({ ...session, jobUrl: value, generationStatus: 'idle', generationError: '' }))} onJobDescriptionChange={value => customization.updateActiveSession(session => ({ ...session, jobDescription: value, generationStatus: 'idle', generationError: '' }))} onPolishStyleChange={customization.handlePolishStyleChange} onAnalyze={customization.analyzeCurrentJob} onNewSession={() => { customization.createNewSession(); setSaved(false) }} onRename={displayName => customization.renameSession(activeSession.id, displayName)} />

  return <div className="app-shell">
    <header className="app-header"><div className="app-header-inner">
      <div className="flex items-center gap-3"><span className="brand-mark"><BrandIcon /></span><div><div className="brand-name">简历智配</div><div className="brand-subtitle">AI 秋招简历工作台</div></div></div>
      <nav className="top-nav" aria-label="主导航">{tabs.map(item => {
        const count = item.id === 'factbank' ? factBank.experiences.length : item.id === 'applications' ? applications.length : 0
        return <button key={item.id} type="button" className="nav-tab" data-active={tab === item.id} aria-current={tab === item.id ? 'page' : undefined} onClick={() => setTab(item.id)}>{item.label}{count > 0 && <span className="nav-count">{count}</span>}{item.id === 'generate' && activeSession.generationStatus === 'generating' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" aria-label="正在生成" />}{item.id === 'generate' && activeSession.generationStatus === 'completed' && tab !== 'generate' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" aria-label="简历已生成" />}</button>
      })}</nav>
      <div className="local-status">{activeSession.generationStatus === 'generating' ? `${sessionLabel} · 正在生成简历` : activeSession.generationStatus === 'completed' ? '简历已生成 · 数据已保存在本机' : '数据已保存在本机'}</div>
    </div></header>

    <div className="app-workspace-layout">
    <JobWorkspaceSidebar sessions={customization.sessions} activeSessionId={customization.activeSessionId} appliedSessionIds={appliedSessionIds} onCreate={() => { customization.createNewSession(); setTab('generate'); setSaved(false) }} onSelect={sessionId => { customization.setActiveSessionId(sessionId); setTab('generate'); setSaved(false) }} onRemove={customization.removeSession} onRename={customization.renameSession} />
    <main className="page-container">
      {tab === 'factbank' && <section className="animate-fade-up"><div className="page-heading"><h1 className="page-title">我的经历库</h1><p className="page-description">集中管理你的教育、实习、项目和技能信息。所有简历内容都以这里的真实经历为依据。</p></div><FactBankEditor factBank={factBank} settings={activeSession.resumeSettings} onChange={customization.handleFactBankChange} onSettingsChange={handleSettingsChange} /></section>}

      {tab === 'generate' && <section className="animate-fade-up job-workspace-main">
        {customization.restored && <div className="notice notice-success mb-5">已恢复上次的岗位定制进度。</div>}
        {!hasFactBank && <div className="notice notice-warning mb-6">经历库中还没有实习或工作经历。请先补充真实经历，再开始定制简历。</div>}
        <div className="job-workspace-grid">
          <WorkspaceResumeCanvas
            displayName={sessionLabel}
            company={activeSession.company}
            role={activeSession.role}
            hasJob={hasJobContext}
            hasResume={Boolean(resume)}
            generating={activeSession.generationStatus === 'generating'}
            canGenerate={Boolean(activeSession.jobDescription.trim() && hasFactBank)}
            onGenerate={customization.handleDirectGenerate}
            evidenceCoverage={evidenceCoverageLabel}
            strategyLabel={activeSession.resumeStrategy?.persona}
            onStartJob={() => {
              document.getElementById('job-copilot')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              window.setTimeout(() => document.querySelector<HTMLElement>('.job-input textarea, .job-input input')?.focus(), 250)
            }}
            toolbarActions={resume ? <button type="button" className="canvas-toolbar-button" onClick={saveCurrentApplication} disabled={saved}>{saved ? '已保存投递' : '保存投递'}</button> : undefined}
          >
            {resume && <div className="animate-fade-up resume-canvas-preview"><ResumePreview key={customization.resumeKey} resume={resume} settings={activeSession.resumeSettings} onChange={nextResume => { customization.handleResumeChange(nextResume); setSaved(false) }} onSettingsChange={handleSettingsChange} onDownloaded={saveCurrentApplication} /></div>}
          </WorkspaceResumeCanvas>
          <aside ref={copilotPanelRef} className={`resume-copilot-card ${activeSession.jobDescription ? 'has-agent' : 'job-setup-card'}`} aria-label={`${sessionLabel}岗位 Copilot`}>
            {activeSession.jobDescription ? <ResumeAssistant jobHeader={jobInput} factBank={factBank} resume={resume} session={activeSession} onSendMessage={customization.sendAssistantMessage} onCandidateTextChange={(candidateId, value) => customization.updateActiveSession(session => ({ ...session, candidateText: { ...session.candidateText, [candidateId]: value } }))} onCandidateStateChange={customization.handleCandidateState} onConfirmCandidate={candidate => void customization.confirmCandidate(candidate)} onDirectGenerate={customization.handleDirectGenerate} onRetryLastRequest={customization.retryLastRequest} onContinueClarification={customization.continueClarification} /> : jobInput}
          </aside>
        </div>
      </section>}

      {tab === 'applications' && <section className="animate-fade-up"><div className="page-heading"><h1 className="page-title">投递记录</h1><p className="page-description">记录已投递岗位及对应简历版本，方便后续回顾和跟进。</p></div><ApplicationsLog applications={applications} onChange={setApplications} /></section>}
    </main>
    </div>
  </div>
}
