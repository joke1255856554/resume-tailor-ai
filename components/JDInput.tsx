'use client'

import { useState } from 'react'
import type { FactBank, ResumeGenerationStatus, ResumePolishStyle } from '@/lib/types'

interface Props {
  factBank: FactBank; jobUrl: string; jobDescription: string; company: string; role: string; displayName: string
  polishStyle: ResumePolishStyle; generationStatus: ResumeGenerationStatus; generationError: string
  assistantStatus: 'idle' | 'sending'; isSessionLocked: boolean
  onJobUrlChange: (value: string) => void; onJobDescriptionChange: (value: string) => void
  onPolishStyleChange: (style: ResumePolishStyle) => void; onAnalyze: (jdText: string) => void; onNewSession: () => void
  onRename: (displayName: string) => void
}

type InputMode = 'url' | 'text'

export default function JDInput({ factBank, jobUrl, jobDescription, company, role, displayName, polishStyle, generationStatus, generationError, assistantStatus, isSessionLocked, onJobUrlChange, onJobDescriptionChange, onPolishStyleChange, onAnalyze, onNewSession, onRename }: Props) {
  const [mode, setMode] = useState<InputMode>(jobUrl ? 'url' : 'text')
  const [scraping, setScraping] = useState(false)
  const [scrapeError, setScrapeError] = useState('')
  const [showJD, setShowJD] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(displayName)
  const busy = generationStatus === 'generating' || assistantStatus === 'sending'
  const hasAnalyzed = Boolean(jobDescription && isSessionLocked)
  const jobTitle = displayName || role || '当前目标岗位'
  const error = scrapeError || generationError

  async function scrapeURL() {
    if (!jobUrl.trim() || scraping || isSessionLocked) return
    setScraping(true); setScrapeError('')
    try {
      const response = await fetch('/api/scrape-jd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: jobUrl.trim() }) })
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || '暂时无法读取该网页。')
      onJobDescriptionChange(data.jdText || ''); setMode('text')
    } catch (caught) {
      setScrapeError(caught instanceof Error ? caught.message : '暂时无法读取该网页，请复制岗位描述后粘贴。'); setMode('text')
    } finally { setScraping(false) }
  }

  const finishRename = () => {
    if (renameValue.trim()) onRename(renameValue)
    else setRenameValue(jobTitle)
    setRenaming(false)
  }

  if (hasAnalyzed) return <section className="job-context" aria-label="当前目标岗位">
    <div className="job-context-heading"><div><p className="copilot-eyebrow">当前岗位</p>{renaming ? <input autoFocus className="job-context-rename" value={renameValue} maxLength={60} aria-label="当前岗位显示名称" onChange={event => setRenameValue(event.target.value)} onBlur={finishRename} onKeyDown={event => { if (event.key === 'Enter') finishRename(); if (event.key === 'Escape') { setRenameValue(jobTitle); setRenaming(false) } }} /> : <div className="job-context-title"><strong>{jobTitle}</strong><button type="button" aria-label="重命名当前岗位" title="重命名岗位" onClick={() => { setRenameValue(jobTitle); setRenaming(true) }}>✎</button></div>}{company && company !== jobTitle && <span className="job-company">{company}</span>}<p>JD 已分析 · {jobDescription.length.toLocaleString()} 字</p></div><button type="button" className="btn-secondary whitespace-nowrap" title="新建岗位不会影响当前对话或简历" onClick={onNewSession}>新建岗位</button></div>
    <div className="job-context-actions"><button type="button" className="text-button" onClick={() => setShowJD(value => !value)}>{showJD ? '收起 JD' : '查看 JD'}</button></div>
    {showJD && <textarea className="input-field job-context-jd" rows={6} value={jobDescription} readOnly aria-label="已锁定的岗位描述" />}
  </section>

  return <section className="job-input" aria-label="目标岗位">
    <div><p className="copilot-eyebrow">AI 简历助手</p><h2>把岗位 JD 发给我</h2><p>我会结合你的真实经历，和你一起完成一版简历。</p></div>
    <div className="job-input-switch" role="tablist" aria-label="JD 输入方式"><button type="button" role="tab" aria-selected={mode === 'url'} onClick={() => setMode('url')} className={mode === 'url' ? 'is-active' : ''}>岗位链接</button><button type="button" role="tab" aria-selected={mode === 'text'} onClick={() => setMode('text')} className={mode === 'text' ? 'is-active' : ''}>粘贴 JD</button></div>
    {mode === 'url' ? <div className="space-y-2"><div className="flex gap-2"><input className="input-field flex-1" value={jobUrl} onChange={event => onJobUrlChange(event.target.value)} onKeyDown={event => event.key === 'Enter' && scrapeURL()} placeholder="https://jobs.example.com/role/123" disabled={scraping || busy} /><button type="button" className="btn-secondary whitespace-nowrap" onClick={scrapeURL} disabled={scraping || busy || !jobUrl.trim()}>{scraping ? '正在读取…' : '读取岗位'}</button></div><textarea className="input-field w-full resize-none font-mono text-xs" rows={8} value={jobDescription} onChange={event => onJobDescriptionChange(event.target.value)} placeholder="读取后可在这里检查或补充岗位描述…" disabled={busy} /></div> : <textarea className="input-field w-full resize-none font-mono text-xs" rows={9} value={jobDescription} onChange={event => onJobDescriptionChange(event.target.value)} placeholder="请粘贴完整岗位描述，包括岗位职责、任职要求和加分项…" disabled={busy} />}
    {error && <div className={generationStatus === 'interrupted' ? 'notice notice-warning' : 'notice notice-error'} role="alert">{error}</div>}
    {!factBank.experiences.length && <p className="job-input-hint">请先在经历库补充至少一段真实实习或工作经历。</p>}
    <details className="polish-options"><summary>润色偏好：{polishStyle === 'conservative' ? '保守' : polishStyle === 'targeted' ? '强调岗位匹配' : '标准'}</summary><select className="input-field w-full mt-2" value={polishStyle} onChange={event => onPolishStyleChange(event.target.value as ResumePolishStyle)} disabled={busy}><option value="conservative">保守润色</option><option value="standard">标准润色（推荐）</option><option value="targeted">强调岗位匹配</option></select></details>
    <button type="button" onClick={() => onAnalyze(jobDescription)} disabled={busy || scraping || !jobDescription.trim() || !factBank.experiences.length} className="btn-primary w-full">{busy ? '正在分析岗位…' : '分析这个岗位'}</button>
  </section>
}
