'use client'

import { useMemo, useState } from 'react'
import type { ResumeCustomizationSession } from '@/lib/types'
import { sessionDisplayName } from '@/lib/customizationSessions'

type SidebarFilter = 'all' | 'active' | 'generated' | 'not_started'

interface Props {
  sessions: ResumeCustomizationSession[]
  activeSessionId: string | null
  appliedSessionIds: Set<string>
  onCreate: () => void
  onSelect: (sessionId: string) => void
  onRemove: (sessionId: string) => void
  onRename: (sessionId: string, displayName: string) => void
}

function sessionStatus(session: ResumeCustomizationSession) {
  if (session.generationStatus === 'generating') return { key: 'active', label: '生成中', tone: 'running' }
  if (session.assistantStatus === 'sending') return { key: 'active', label: '分析中', tone: 'running' }
  if (session.currentResume) return { key: 'generated', label: '已生成简历', tone: 'done' }
  if (session.jobDescription.trim()) return { key: 'active', label: '待生成', tone: 'ready' }
  return { key: 'not_started', label: '待开始', tone: 'idle' }
}

function displayDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '刚刚'
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date)
}

function evidenceCoverage(session: ResumeCustomizationSession): string {
  const requirements = session.currentResume?.requirements || []
  const gaps = session.currentResume?.requirementGaps || []
  const core = requirements.filter(item => item.importance === 'core')
  if (core.length && gaps.length) {
    const covered = core.filter(requirement => gaps.some(gap => gap.requirementId === requirement.id && gap.status !== 'missing')).length
    return `${covered} / ${core.length}`
  }
  const score = session.currentResume?.jdKeywordCoverage.score
  return typeof score === 'number' ? `${score}%` : '—'
}

export default function JobWorkspaceSidebar({ sessions, activeSessionId, appliedSessionIds, onCreate, onSelect, onRemove, onRename }: Props) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<SidebarFilter>('all')
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null)
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const beginRename = (sessionId: string, title: string) => {
    setRenameValue(title)
    setRenamingSessionId(sessionId)
    setMenuSessionId(null)
  }
  const finishRename = (sessionId: string) => {
    if (renameValue.trim()) onRename(sessionId, renameValue)
    setRenamingSessionId(null)
  }
  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return [...sessions]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .filter(session => !keyword || `${sessionDisplayName(session)} ${session.company} ${session.role} ${session.jobDescription}`.toLowerCase().includes(keyword))
      .filter(session => filter === 'all' || sessionStatus(session).key === filter)
  }, [filter, query, sessions])

  return <aside className="job-workspace-sidebar" aria-label="目标岗位">
    <div className="job-sidebar-head">
      <div><span>AI JOB WORKSPACE</span><strong>目标岗位</strong></div>
      <span className="job-total">{sessions.length}</span>
    </div>
    <button type="button" className="new-job-button" onClick={onCreate}><span>＋</span>新建岗位</button>
    <label className="job-search"><span aria-hidden="true">⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索公司或岗位" aria-label="搜索公司或岗位" /></label>
    <div className="job-filters" aria-label="岗位筛选">
      {([['all', '全部'], ['active', '进行中'], ['generated', '已生成'], ['not_started', '待开始']] as const).map(([value, label]) => <button key={value} type="button" data-active={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
    </div>
    <div className="job-session-list">
      {visible.length === 0 && <div className="job-list-empty">没有符合条件的岗位</div>}
      {visible.map(session => {
        const status = sessionStatus(session)
        const source = session.jobUrl.trim() ? '链接 JD' : session.jobDescription.trim() ? '粘贴 JD' : '待添加 JD'
        const title = sessionDisplayName(session)
        const renaming = renamingSessionId === session.id
        return <article key={session.id} className="job-session-card" data-active={session.id === activeSessionId}>
          <div className="job-session-main" role="button" tabIndex={0} onClick={() => onSelect(session.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') onSelect(session.id) }} aria-current={session.id === activeSessionId ? 'page' : undefined}>
            <div className="job-card-title"><div className="job-title-line"><strong>{title}</strong><button type="button" className="job-title-rename" aria-label={`重命名${title}`} title="重命名岗位" onClick={event => { event.stopPropagation(); beginRename(session.id, title) }}>✎</button></div><span data-tone={status.tone}>{status.label}</span></div>
            <div className="job-card-meta"><span>{source}</span><span>{displayDate(session.updatedAt)}</span></div>
            <div className="job-card-stats"><span><small>证据覆盖</small><b>{evidenceCoverage(session)}</b></span><span><small>简历版本</small><b>{session.currentResume ? 'V1' : '未生成'}</b></span><span><small>投递状态</small><b>{appliedSessionIds.has(session.id) ? '已保存' : '未投递'}</b></span></div>
          </div>
          <button type="button" className="job-card-menu-button" aria-label={`${title}更多操作`} aria-expanded={menuSessionId === session.id} onClick={() => setMenuSessionId(current => current === session.id ? null : session.id)}>···</button>
          {menuSessionId === session.id && <div className="job-card-menu">
            <button type="button" onClick={() => beginRename(session.id, title)}>重命名</button>
            <button type="button" className="is-danger" onClick={() => { setMenuSessionId(null); if (window.confirm(`删除“${title}”？\n\n该岗位的 JD、聊天和当前简历会从本地删除。`)) onRemove(session.id) }}>删除岗位</button>
          </div>}
          {renaming && <form className="job-rename-inline" onSubmit={event => { event.preventDefault(); finishRename(session.id) }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) finishRename(session.id) }}>
            <input autoFocus value={renameValue} maxLength={60} aria-label="岗位显示名称" onChange={event => setRenameValue(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setRenamingSessionId(null) }} />
            <div><button type="button" onClick={() => setRenamingSessionId(null)}>取消</button><button type="submit" disabled={!renameValue.trim()}>保存</button></div>
          </form>}
        </article>
      })}
    </div>
    <div className="job-sidebar-foot"><span>所有岗位独立保存</span><small>AI 会话与岗位上下文不会混用</small></div>
  </aside>
}
