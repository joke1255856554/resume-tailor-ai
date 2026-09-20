'use client'

import React, { useState, useRef, useEffect } from 'react'
import { GeneratedResume, ResumeSettings, ResumeTemplateId } from '@/lib/types'
import {
  createRenderedResumeSettings,
  RESUME_TEMPLATE_IDS,
  RESUME_TEMPLATE_REGISTRY,
  resolveRenderableTemplate,
  switchResumeTemplate,
} from '@/lib/resumeTemplates'
import { getResumePreviewRenderer } from '@/components/resume-templates/previewRenderers'

interface Props {
  resume: GeneratedResume
  settings: ResumeSettings
  onChange: (r: GeneratedResume) => void
  onSettingsChange: (settings: ResumeSettings) => void
  onDownloaded?: () => void
}

// Editable: uses ref-based DOM updates so hover re-renders never reset typed content
interface EditableProps {
  value: string
  onChange: (v: string) => void
  style?: React.CSSProperties
  tag?: 'span' | 'div'
  bold?: boolean // render value with bold category (for skills)
}

function Editable({ value, onChange, style, tag = 'span' }: EditableProps) {
  const elRef = useRef<HTMLElement | null>(null)
  const isEditing = useRef(false)

  // Callback ref: set initial innerHTML on mount
  const mountRef = (el: HTMLElement | null) => {
    elRef.current = el
    if (el && !isEditing.current) {
      el.innerHTML = value
    }
  }

  // Sync external value changes (e.g. delete another row) when not editing
  useEffect(() => {
    if (elRef.current && !isEditing.current) {
      elRef.current.innerHTML = value
    }
  }, [value])

  const sharedProps: React.HTMLAttributes<HTMLElement> = {
    contentEditable: true,
    suppressContentEditableWarning: true,
    onFocus: () => { isEditing.current = true },
    onBlur: (e) => {
      isEditing.current = false
      onChange((e.currentTarget as HTMLElement).innerText.trim())
    },
    style: { outline: 'none', cursor: 'text', ...style },
  }

  if (tag === 'div') {
    return <div ref={el => mountRef(el)} {...sharedProps as React.HTMLAttributes<HTMLDivElement>} />
  }
  return <span ref={el => mountRef(el)} {...sharedProps as React.HTMLAttributes<HTMLSpanElement>} />
}

// SkillEditable: whole skill line is editable including bold category
function SkillEditable({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const elRef = useRef<HTMLDivElement | null>(null)
  const isEditing = useRef(false)

  const { category, items } = parseSkillLine(value)
  const html = `<strong>${category}</strong>${items}`

  const mountRef = (el: HTMLDivElement | null) => {
    elRef.current = el
    if (el && !isEditing.current) {
      el.innerHTML = html
    }
  }

  useEffect(() => {
    if (elRef.current && !isEditing.current) {
      elRef.current.innerHTML = html
    }
  }, [html])

  return (
    <div
      ref={el => mountRef(el)}
      contentEditable
      suppressContentEditableWarning
      onFocus={() => { isEditing.current = true }}
      onBlur={e => {
        isEditing.current = false
        onChange((e.currentTarget as HTMLElement).innerText.trim())
      }}
      style={{ flex: 1, outline: 'none', cursor: 'text' }}
    />
  )
}

function parseSkillLine(line: string): { category: string; items: string } {
  const colonIdx = line.indexOf(':')
  if (colonIdx === -1) return { category: '', items: line }
  return { category: line.slice(0, colonIdx + 1), items: line.slice(colonIdx + 1) }
}

// Row with hover-reveal delete button
function Row({ id, hovered, setHovered, onDelete, children, style }: {
  id: string
  hovered: string | null
  setHovered: (v: string | null) => void
  onDelete: () => void
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  const [btnHot, setBtnHot] = useState(false)
  const isHovered = hovered === id
  return (
    <div
      onMouseEnter={() => setHovered(id)}
      onMouseLeave={() => setHovered(null)}
      style={{ display: 'flex', alignItems: 'flex-start', ...style }}
    >
      {children}
      {isHovered && (
        <button
          onMouseEnter={() => setBtnHot(true)}
          onMouseLeave={() => setBtnHot(false)}
          onClick={onDelete}
          style={{ marginLeft: '5px', flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: btnHot ? '#cc2222' : '#aaa', fontSize: '13px', lineHeight: 1.2, padding: '0 2px', fontFamily: 'sans-serif' }}
        >×</button>
      )}
    </div>
  )
}

export default function ResumePreview({ resume, settings, onChange, onSettingsChange, onDownloaded }: Props) {
  const [downloading, setDownloading] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const [showReport, setShowReport] = useState(false)
  const [actionError, setActionError] = useState('')

  const upContact = (field: keyof typeof resume.contact, v: string) =>
    onChange({ ...resume, contact: { ...resume.contact, [field]: v } })

  const upEdu = (id: string, field: string, v: string) =>
    onChange({ ...resume, education: resume.education.map(e => e.id === id ? { ...e, [field]: v } : e) })

  const upEduNote = (id: string, ni: number, v: string) =>
    onChange({ ...resume, education: resume.education.map(e => e.id === id ? { ...e, notes: e.notes.map((n, i) => i === ni ? v : n) } : e) })

  const deleteEduNote = (id: string, ni: number) =>
    onChange({ ...resume, education: resume.education.map(e => e.id === id ? { ...e, notes: e.notes.filter((_, i) => i !== ni) } : e) })

  const upExp = (idx: number, field: string, v: string) =>
    onChange({ ...resume, experiences: resume.experiences.map((e, i) => i === idx ? { ...e, [field]: v } : e) })

  const upBullet = (ei: number, bi: number, v: string) =>
    onChange({ ...resume, experiences: resume.experiences.map((e, i) => i === ei ? { ...e, bullets: e.bullets.map((b, j) => j === bi ? v : b) } : e) })

  const deleteBullet = (ei: number, bi: number) =>
    onChange({ ...resume, experiences: resume.experiences.map((e, i) => i === ei ? { ...e, bullets: e.bullets.filter((_, j) => j !== bi) } : e) })

  const addBullet = (ei: number) =>
    onChange({ ...resume, experiences: resume.experiences.map((e, i) => i === ei ? { ...e, bullets: [...e.bullets, ''] } : e) })

  const upSkill = (idx: number, v: string) =>
    onChange({ ...resume, skills: resume.skills.map((s, i) => i === idx ? v : s) })

  const deleteSkill = (idx: number) =>
    onChange({ ...resume, skills: resume.skills.filter((_, i) => i !== idx) })

  const upProj = (idx: number, field: string, v: string) =>
    onChange({ ...resume, projects: (resume.projects || []).map((p, i) => i === idx ? { ...p, [field]: v } : p) })

  const upProjBullet = (pi: number, bi: number, v: string) =>
    onChange({ ...resume, projects: (resume.projects || []).map((p, i) => i === pi ? { ...p, bullets: p.bullets.map((b, j) => j === bi ? v : b) } : p) })

  const deleteProjBullet = (pi: number, bi: number) =>
    onChange({ ...resume, projects: (resume.projects || []).map((p, i) => i === pi ? { ...p, bullets: p.bullets.filter((_, j) => j !== bi) } : p) })

  const addProjBullet = (pi: number) =>
    onChange({ ...resume, projects: (resume.projects || []).map((p, i) => i === pi ? { ...p, bullets: [...p.bullets, ''] } : p) })

  async function downloadPDF() {
    setDownloading(true)
    setActionError('')
    try {
      const res = await fetch('/api/download-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume, templateId: settings.templateId, settings }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(payload?.error || 'PDF 导出失败，请稍后重试。')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const namePart = (resume.contact.name || 'Resume').replace(/\s+/g, '')
      const companyPart = (resume.jdReport?.company || '').replace(/\s+/g, '')
      a.download = companyPart ? `${namePart}_${companyPart}.pdf` : `${namePart}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      onDownloaded?.()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'PDF 导出失败，请稍后重试。')
    } finally {
      setDownloading(false)
    }
  }

  const { phone, email, linkedin, github, website } = resume.contact

  const rpt = resume.jdReport
  const renderedSettings = createRenderedResumeSettings(settings)
  const renderedTemplate = resolveRenderableTemplate(renderedSettings.templateId)
  const PreviewRenderer = getResumePreviewRenderer(renderedTemplate.previewRendererId || 'ats-classic')

  return (
    <div className="flex flex-col h-full">
      <div className="resume-preview-controls">
        <div className="resume-template-control"><label htmlFor="resume-template-compact">模板</label><select id="resume-template-compact" className="input-field" value={settings.templateId} onChange={event => {
          const templateId = event.target.value as ResumeTemplateId
          onSettingsChange(switchResumeTemplate(settings, templateId))
        }}>{RESUME_TEMPLATE_IDS.map(templateId => { const template = RESUME_TEMPLATE_REGISTRY[templateId]; return <option key={template.id} value={template.id} disabled={template.status !== 'available'}>{template.name}{template.status !== 'available' ? '（即将支持）' : ''}</option> })}</select></div>
        <div className="resume-preview-actions">
          {rpt && <button type="button" onClick={() => setShowReport(value => !value)}>{showReport ? '收起岗位分析' : '查看岗位分析'}</button>}
          <button type="button" onClick={downloadPDF} disabled={downloading}>{downloading ? '正在导出…' : '导出 PDF'}</button>
        </div>
        <small>{renderedTemplate.id === 'cn-campus-classic' ? '点击简历文字可直接编辑' : '点击文字可编辑，悬停在行上可删除'}</small>
        {showReport && rpt && (
          <div className="resume-job-analysis">
            <div>
              <p style={{ color: 'var(--text-muted)', fontWeight: 700, marginBottom: 7, fontSize: 11 }}>目标岗位</p>
              <p style={{ color: 'var(--text)', lineHeight: 1.6 }}>{rpt.role}{rpt.company ? ` · ${rpt.company}` : ''}</p>
            </div>
            {[
              { label: '专业技能', items: rpt.hardSkills, color: 'var(--red)' },
              { label: '业务场景', items: rpt.businessContext, color: 'var(--blue)' },
              { label: '岗位能力', items: rpt.titleKeywords, color: '#6558b8' },
              { label: '关键动作', items: rpt.actionKeywords, color: 'var(--text-muted)' },
              { label: '行业领域', items: rpt.domainKeywords, color: 'var(--text-muted)' },
              { label: '硬性条件', items: rpt.hardFilters, color: 'var(--orange)' },
            ].map(({ label, items, color }) => items?.length > 0 && (
              <div key={label}>
                <p style={{ color, fontWeight: 700, marginBottom: 7, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
                <p style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>{items.join(', ')}</p>
              </div>
            ))}
            <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', gap: 24 }}>
              <div style={{ flex: 1 }}>
                <p style={{ color: 'var(--text)', fontWeight: 700, marginBottom: 7, fontSize: 11 }}>核心关键词</p>
                <p style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>{rpt.top10?.join(', ')}</p>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ color: 'var(--green)', fontWeight: 700, marginBottom: 7, fontSize: 11 }}>已覆盖</p>
                <p style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>{rpt.alreadyHave?.join(', ') || '—'}</p>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ color: 'var(--red)', fontWeight: 700, marginBottom: 7, fontSize: 11 }}>待补充</p>
                <p style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>{rpt.needToAdd?.join(', ') || '—'}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {actionError && <div className="notice notice-error mb-4" role="alert">{actionError}</div>}

      {/* Resume */}
      <PreviewRenderer resume={resume} settings={renderedSettings} onChange={onChange} legacyRenderer={<div className="overflow-auto flex-1">
        <div className="bg-white text-black mx-auto shadow-xl relative" style={{ width: '816px', minHeight: '1056px', padding: '36px', fontFamily: 'var(--font-sans)', fontSize: '8.5pt', lineHeight: 1.35, transform: 'scale(1.08)', transformOrigin: 'top center', marginBottom: '104px' }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '6px' }}>
            <div style={{ fontSize: '14pt', fontWeight: 'bold', marginBottom: '6px' }}>
              <Editable value={resume.contact.name} onChange={v => upContact('name', v)} />
            </div>
            <div style={{ fontSize: '8pt', color: '#333', display: 'flex', justifyContent: 'center', flexWrap: 'wrap' }}>
              {[
                phone ? <Editable key="phone" value={phone} onChange={v => upContact('phone', v)} /> : null,
                email ? <a key="email" href={`mailto:${email}`} style={{ color: '#1155CC' }}><Editable value={email} onChange={v => upContact('email', v)} /></a> : null,
                linkedin ? <a key="linkedin" href={linkedin.startsWith('http') ? linkedin : `https://${linkedin}`} style={{ color: '#1155CC' }}>LinkedIn</a> : null,
                github ? <a key="github" href={github.startsWith('http') ? github : `https://${github}`} style={{ color: '#1155CC' }}>GitHub</a> : null,
                website ? <a key="website" href={website.startsWith('http') ? website : `https://${website}`} style={{ color: '#1155CC' }}>个人主页</a> : null,
              ].filter(Boolean).reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, <span key={`sep-${i}`} style={{ margin: '0 4px' }}>|</span>, el], [])}
            </div>
          </div>

          {/* Education */}
          {resume.education.length > 0 && (
            <div style={{ marginTop: '6px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '9pt', borderBottom: '1px solid #475467', paddingBottom: '2px', marginBottom: '5px' }}>教育经历</div>
              {resume.education.map((edu) => (
                <div key={edu.id} style={{ marginBottom: '5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 'bold' }}><Editable value={edu.school} onChange={v => upEdu(edu.id, 'school', v)} /></span>
                    <span style={{ fontWeight: 'bold' }}><Editable value={edu.location} onChange={v => upEdu(edu.id, 'location', v)} /></span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>
                      <em><Editable value={edu.degree} onChange={v => upEdu(edu.id, 'degree', v)} /></em>
                      {edu.field && <span>, <strong><em><Editable value={edu.field} onChange={v => upEdu(edu.id, 'field', v)} /></em></strong></span>}
                    </span>
                    <span style={{ color: '#333' }}>
                      <Editable value={edu.startDate} onChange={v => upEdu(edu.id, 'startDate', v)} />
                      {edu.endDate ? <span> – <Editable value={edu.endDate} onChange={v => upEdu(edu.id, 'endDate', v)} /></span> : ''}
                    </span>
                  </div>
                  {edu.notes?.map((note, ni) => (
                    <Row key={ni} id={`edunote-${edu.id}-${ni}`} hovered={hovered} setHovered={setHovered} onDelete={() => deleteEduNote(edu.id, ni)} style={{ marginLeft: '10px' }}>
                      <span style={{ width: '12px', flexShrink: 0, userSelect: 'none' }}>•</span>
                      <Editable value={note} onChange={v => upEduNote(edu.id, ni, v)} style={{ flex: 1 }} />
                    </Row>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Skills */}
          {resume.skills.length > 0 && (
            <div style={{ marginTop: '6px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '9pt', borderBottom: '1px solid #475467', paddingBottom: '2px', marginBottom: '5px' }}>专业技能</div>
              {resume.skills.map((line, i) => (
                <Row key={i} id={`skill-${i}`} hovered={hovered} setHovered={setHovered} onDelete={() => deleteSkill(i)} style={{ marginBottom: '2px' }}>
                  <span style={{ width: '10px', flexShrink: 0, userSelect: 'none' }}>•</span>
                  <SkillEditable value={line} onChange={v => upSkill(i, v)} />
                </Row>
              ))}
              <button
                onClick={() => onChange({ ...resume, skills: [...resume.skills, ''] })}
                style={{ fontSize: '7.5pt', color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0 0 10px' }}
              >+ 添加技能</button>
            </div>
          )}

          {/* Work Experience */}
          {resume.experiences.length > 0 && (
            <div style={{ marginTop: '6px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '9pt', borderBottom: '1px solid #475467', paddingBottom: '2px', marginBottom: '5px' }}>实习 / 工作经历</div>
              {resume.experiences.map((exp, i) => (
                <div key={i} style={{ marginBottom: '5px' }}>
                  <Row id={`exp-header-${i}`} hovered={hovered} setHovered={setHovered} onDelete={() => onChange({ ...resume, experiences: resume.experiences.filter((_, j) => j !== i) })} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 'bold' }}><Editable value={exp.company} onChange={v => upExp(i, 'company', v)} /></span>
                    <span style={{ fontWeight: 'bold' }}><Editable value={exp.location} onChange={v => upExp(i, 'location', v)} /></span>
                  </Row>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <Editable value={exp.title} onChange={v => upExp(i, 'title', v)} style={{ fontStyle: 'italic' }} />
                    <span style={{ color: '#333' }}>
                      <Editable value={exp.startDate} onChange={v => upExp(i, 'startDate', v)} />
                      {exp.endDate ? <span> – <Editable value={exp.endDate} onChange={v => upExp(i, 'endDate', v)} /></span> : ''}
                    </span>
                  </div>
                  {exp.bullets.map((bullet, j) => (
                    <Row key={j} id={`bullet-${i}-${j}`} hovered={hovered} setHovered={setHovered} onDelete={() => deleteBullet(i, j)} style={{ marginBottom: '1.5px' }}>
                      <span style={{ width: '10px', flexShrink: 0, userSelect: 'none' }}>•</span>
                      <Editable value={bullet} onChange={v => upBullet(i, j, v)} style={{ flex: 1, textAlign: 'left' }} />
                    </Row>
                  ))}
                  <button
                    onClick={() => addBullet(i)}
                    style={{ marginLeft: '10px', marginTop: '2px', background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: '7.5pt', fontFamily: 'var(--font-sans)', padding: 0 }}
                  >+ 添加要点</button>
                </div>
              ))}
            </div>
          )}

          {/* Projects */}
          {(resume.projects || []).length > 0 && (
            <div style={{ marginTop: '6px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '9pt', borderBottom: '1px solid #475467', paddingBottom: '2px', marginBottom: '5px' }}>项目经历</div>
              {(resume.projects || []).map((proj, pi) => (
                <div key={proj.id} style={{ marginBottom: '5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span style={{ fontWeight: 'bold' }}><Editable value={proj.name} onChange={v => upProj(pi, 'name', v)} /></span>
                    <span style={{ fontWeight: 'bold', color: '#333' }}>
                      {proj.startDate && <Editable value={proj.startDate} onChange={v => upProj(pi, 'startDate', v)} />}
                      {proj.startDate && proj.endDate && <span> – </span>}
                      {proj.endDate && <Editable value={proj.endDate} onChange={v => upProj(pi, 'endDate', v)} />}
                    </span>
                  </div>
                  {proj.bullets.map((bullet, bi) => (
                    <Row key={bi} id={`projbullet-${pi}-${bi}`} hovered={hovered} setHovered={setHovered} onDelete={() => deleteProjBullet(pi, bi)} style={{ marginBottom: '1.5px' }}>
                      <span style={{ width: '10px', flexShrink: 0, userSelect: 'none' }}>•</span>
                      <Editable value={bullet} onChange={v => upProjBullet(pi, bi, v)} style={{ flex: 1, textAlign: 'left' }} />
                    </Row>
                  ))}
                  <button
                    onClick={() => addProjBullet(pi)}
                    style={{ marginLeft: '10px', marginTop: '2px', background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: '7.5pt', fontFamily: 'var(--font-sans)', padding: 0 }}
                  >+ 添加要点</button>
                </div>
              ))}
            </div>
          )}

          {/* Page boundary */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: '1008px', borderTop: '2px dashed rgba(239,68,68,0.5)', pointerEvents: 'none' }} />
        </div>
      </div>} />
    </div>
  )
}
