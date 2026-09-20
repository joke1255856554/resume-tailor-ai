'use client'

import React from 'react'
import type { FactMatch, GeneratedResume, JDRequirement, ResumeBullet, ResumeDisplaySection, ResumeSettings } from '@/lib/types'
import { normalizeResumeSectionOrder } from '@/lib/resumeSections'
import {
  buildChineseSkillRows,
  formatDateRange,
  formatDisplayDate,
  hasText,
  toSafeURL,
} from './chineseCampusClassicData'
import { CHINESE_CAMPUS_CLASSIC_THEME as theme } from './chineseCampusClassicTheme'
import { CHINESE_RESUME_ICON_PATHS, type ChineseResumeIcon } from './chineseCampusClassicIcons'

export interface ChineseCampusClassicPreviewProps {
  resume: GeneratedResume
  settings: ResumeSettings
  onChange: (resume: GeneratedResume) => void
}

type SectionKey = ResumeDisplaySection

interface PreviewItem {
  section: SectionKey
  index: number
  cost: number
}

interface PreviewSectionSlice {
  key: SectionKey
  items: PreviewItem[]
}

interface PreviewPage {
  sections: PreviewSectionSlice[]
}

const SECTION_TITLE_COST = 34
const PAGE_CONTENT_BUDGET = 988
const FIRST_PAGE_HEADER_COST = 148

function textLineCost(value: string, charsPerLine = 48): number {
  return Math.max(1, Math.ceil(value.trim().length / charsPerLine)) * 20
}

function createPreviewItems(resume: GeneratedResume): Array<{ key: SectionKey; items: PreviewItem[] }> {
  const skillRows = buildChineseSkillRows(resume)
  const sections: Array<{ key: SectionKey; items: PreviewItem[] }> = [
    {
      key: 'education',
      items: resume.education.map((education, index) => ({
        section: 'education' as const,
        index,
        cost: 56 + (education.focus ? 18 : 0) + education.notes.filter(hasText).reduce((sum, note) => sum + textLineCost(note), 0),
      })),
    },
    {
      key: 'experience',
      items: resume.experiences.map((experience, index) => ({
        section: 'experience' as const,
        index,
        cost: 54 + experience.bullets.filter(hasText).reduce((sum, bullet) => sum + textLineCost(bullet), 0),
      })),
    },
    {
      key: 'projects',
      items: (resume.projects || []).map((project, index) => ({
        section: 'projects' as const,
        index,
        cost: 48 + (project.role ? 20 : 0) + (project.link ? 18 : 0) + project.bullets.filter(hasText).reduce((sum, bullet) => sum + textLineCost(bullet), 0),
      })),
    },
    {
      key: 'campus',
      items: (resume.campusExperiences || []).map((campus, index) => ({
        section: 'campus' as const,
        index,
        cost: 50 + campus.bullets.filter(hasText).reduce((sum, bullet) => sum + textLineCost(bullet), 0),
      })),
    },
    {
      key: 'awards',
      items: (resume.awards || []).map((award, index) => ({
        section: 'awards' as const,
        index,
        cost: 30 + (award.issuer || award.description ? 20 : 0),
      })),
    },
    {
      key: 'skills',
      items: skillRows.map((row, index) => ({
        section: 'skills' as const,
        index,
        cost: 13 + textLineCost(`${row.label}：${row.items.join('、')}`, 56),
      })),
    },
  ]
  const order = normalizeResumeSectionOrder(resume.sectionOrder)
  return sections
    .filter(section => section.items.length > 0)
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
}

function paginateResume(resume: GeneratedResume): PreviewPage[] {
  const pages: PreviewPage[] = [{ sections: [] }]
  let remaining = PAGE_CONTENT_BUDGET - FIRST_PAGE_HEADER_COST

  createPreviewItems(resume).forEach(section => {
    section.items.forEach(item => {
      let page = pages[pages.length - 1]
      let slice: PreviewSectionSlice | undefined = page.sections[page.sections.length - 1]
      const continuesSection = slice?.key === section.key
      const required = item.cost + (continuesSection ? 0 : SECTION_TITLE_COST)

      if (required > remaining && page.sections.length > 0) {
        page = { sections: [] }
        pages.push(page)
        remaining = PAGE_CONTENT_BUDGET
        slice = undefined
      }

      if (!slice || slice.key !== section.key) {
        slice = { key: section.key, items: [] }
        page.sections.push(slice)
        remaining -= SECTION_TITLE_COST
      }
      slice.items.push(item)
      remaining -= item.cost
    })
  })

  return pages
}

function InlineEdit({ value, onChange, style }: {
  value: string
  onChange: (value: string) => void
  style?: React.CSSProperties
}) {
  return (
    <span
      contentEditable
      suppressContentEditableWarning
      onBlur={event => onChange(event.currentTarget.innerText.trim())}
      onKeyDown={event => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
      style={{ outline: 'none', cursor: 'text', ...style }}
    >
      {value}
    </span>
  )
}

function BrowserIcon({ name, size = 14 }: { name: ChineseResumeIcon; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{CHINESE_RESUME_ICON_PATHS[name].map((path, index) => <path key={index} d={path} />)}</svg>
}

function SectionTitle({ section, children }: { section: SectionKey; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8, paddingBottom: 3 }}>
      <span style={{ width: 22, height: 22, display: 'grid', placeItems: 'center', borderRadius: 4, background: theme.colors.accentSoft, color: theme.colors.accent, flexShrink: 0 }}><BrowserIcon name={section} /></span>
      <h2 style={{ margin: 0, color: theme.colors.heading, fontSize: theme.typography.sectionPx, fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{children}</h2>
      <span style={{ height: 1, background: theme.colors.rule, flex: 1 }} />
    </div>
  )
}

function EvidenceControl({ evidence, requirements, factMatches }: {
  evidence: ResumeBullet
  requirements: JDRequirement[]
  factMatches: FactMatch[]
}) {
  const [open, setOpen] = React.useState(false)
  const requirementLabels = evidence.matchedRequirementIds.map(id => requirements.find(item => item.id === id)?.requirement).filter(Boolean)
  const sourceLabels = evidence.sourceFactIds.map(id => factMatches.find(item => item.factId === id)?.label || id)
  return (
    <div style={{ position: 'absolute', right: -42, top: 0, zIndex: open ? 20 : 1 }}>
      <button type="button" onClick={() => setOpen(value => !value)} style={{ border: `1px solid ${theme.colors.rule}`, borderRadius: 4, padding: '1px 5px', background: '#fff', color: theme.colors.accent, fontSize: 9, cursor: 'pointer' }}>依据</button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 24, width: 270, padding: 12, border: `1px solid ${theme.colors.rule}`, borderRadius: 7, background: '#fff', color: theme.colors.body, boxShadow: '0 8px 24px rgb(16 24 40 / 0.16)', fontSize: 10.5, lineHeight: 1.55 }}>
          <strong style={{ display: 'block', color: theme.colors.ink }}>为什么写这一条</strong>
          <div style={{ marginTop: 7 }}><b>匹配岗位要求：</b>{requirementLabels.join('；') || '通用岗位相关表达'}</div>
          <div style={{ marginTop: 5 }}><b>事实来源：</b>{sourceLabels.join('；')}</div>
          <div style={{ marginTop: 5 }}><b>改写说明：</b>{evidence.rewriteReason}</div>
        </div>
      )}
    </div>
  )
}

function BulletList({ bullets, onChange, evidence = [], requirements = [], factMatches = [] }: {
  bullets: string[]
  onChange?: (index: number, value: string) => void
  evidence?: ResumeBullet[]
  requirements?: JDRequirement[]
  factMatches?: FactMatch[]
}) {
  const visibleBullets = bullets.map((text, index) => ({ text, index })).filter(item => hasText(item.text))
  if (!visibleBullets.length) return null
  return (
    <div style={{ marginTop: 4, display: 'grid', gap: 1 }}>
      {visibleBullets.map(item => (
        <div key={item.index} style={{ position: 'relative', display: 'grid', gridTemplateColumns: '12px minmax(0, 1fr)', alignItems: 'start' }}>
          <span aria-hidden="true" style={{ color: theme.colors.muted, lineHeight: theme.typography.lineHeight }}>•</span>
          {onChange ? (
            <InlineEdit value={item.text} onChange={value => onChange(item.index, value)} style={{ lineHeight: theme.typography.lineHeight }} />
          ) : (
            <span style={{ lineHeight: theme.typography.lineHeight }}>{item.text}</span>
          )}
          {evidence.find(entry => entry.bulletIndex === item.index) && <EvidenceControl evidence={evidence.find(entry => entry.bulletIndex === item.index)!} requirements={requirements} factMatches={factMatches} />}
        </div>
      ))}
    </div>
  )
}

export function ChineseCampusClassicPreview({ resume, settings, onChange }: ChineseCampusClassicPreviewProps) {
  const pages = paginateResume(resume)
  const skillRows = buildChineseSkillRows(resume)
  const showAvatar = Boolean(settings.showAvatar && resume.contact.avatar)
  const priorityKeywords = [...new Set((resume.requirements || [])
    .filter(requirement => requirement.importance !== 'bonus')
    .flatMap(requirement => requirement.keywords)
    .filter(keyword => keyword.length >= 2 && keyword.length <= 12))]
  const projectKeywords = (projectId: string) => {
    const requirementIds = new Set((resume.bulletEvidence || []).filter(item => item.section === 'project' && item.itemId === projectId).flatMap(item => item.matchedRequirementIds))
    return [...new Set((resume.requirements || []).filter(item => requirementIds.has(item.id)).flatMap(item => item.keywords))]
      .filter(keyword => keyword.length >= 2 && keyword.length <= 10)
      .slice(0, 3)
  }
  const skillRowRelevant = (label: string, items: string[]) => priorityKeywords.some(keyword => `${label}${items.join('')}`.toLowerCase().includes(keyword.toLowerCase()))

  const updateContact = (field: keyof GeneratedResume['contact'], value: string) => {
    onChange({ ...resume, contact: { ...resume.contact, [field]: value } })
  }
  const updateEducation = (index: number, field: string, value: string) => {
    onChange({ ...resume, education: resume.education.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) })
  }
  const updateExperience = (index: number, field: string, value: string) => {
    onChange({ ...resume, experiences: resume.experiences.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) })
  }
  const updateExperienceBullet = (index: number, bulletIndex: number, value: string) => {
    onChange({
      ...resume,
      experiences: resume.experiences.map((item, itemIndex) => itemIndex === index
        ? { ...item, bullets: item.bullets.map((bullet, currentIndex) => currentIndex === bulletIndex ? value : bullet) }
        : item),
    })
  }
  const updateProject = (index: number, field: string, value: string) => {
    onChange({ ...resume, projects: (resume.projects || []).map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) })
  }
  const updateProjectBullet = (index: number, bulletIndex: number, value: string) => {
    onChange({
      ...resume,
      projects: (resume.projects || []).map((item, itemIndex) => itemIndex === index
        ? { ...item, bullets: item.bullets.map((bullet, currentIndex) => currentIndex === bulletIndex ? value : bullet) }
        : item),
    })
  }

  const renderItem = (item: PreviewItem) => {
    if (item.section === 'education') {
      const education = resume.education[item.index]
      return (
        <div key={`${item.section}-${item.index}`} style={{ marginBottom: theme.spacing.itemGapPx }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 18, alignItems: 'baseline' }}>
            <InlineEdit value={education.school} onChange={value => updateEducation(item.index, 'school', value)} style={{ color: theme.colors.ink, fontWeight: 700, fontSize: 13.7 }} />
            <span style={{ color: theme.colors.muted, fontSize: theme.typography.metaPx, whiteSpace: 'nowrap' }}>{[education.location, formatDateRange(education.startDate, education.endDate)].filter(hasText).join(' ｜ ')}</span>
          </div>
          <div style={{ marginTop: 2, color: theme.colors.body }}>
            <span>
              {hasText(education.field) && <InlineEdit value={education.field} onChange={value => updateEducation(item.index, 'field', value)} />}
              {hasText(education.field) && hasText(education.degree) && <span style={{ color: theme.colors.rule }}> · </span>}
              {hasText(education.degree) && <InlineEdit value={education.degree} onChange={value => updateEducation(item.index, 'degree', value)} />}
            </span>
          </div>
          {hasText(education.focus) && <div style={{ color: theme.colors.muted, fontSize: theme.typography.metaPx, marginTop: 2 }}><InlineEdit value={education.focus} onChange={value => updateEducation(item.index, 'focus', value)} /></div>}
          <BulletList bullets={education.notes || []} onChange={(bulletIndex, value) => {
            onChange({ ...resume, education: resume.education.map((current, currentIndex) => currentIndex === item.index ? { ...current, notes: current.notes.map((note, noteIndex) => noteIndex === bulletIndex ? value : note) } : current) })
          }} />
        </div>
      )
    }

    if (item.section === 'experience') {
      const experience = resume.experiences[item.index]
      return (
        <div key={`${item.section}-${item.index}`} style={{ marginBottom: theme.spacing.itemGapPx }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 18, alignItems: 'baseline' }}>
            <InlineEdit value={experience.company} onChange={value => updateExperience(item.index, 'company', value)} style={{ color: theme.colors.ink, fontWeight: 700, fontSize: 13.5 }} />
            <span style={{ color: theme.colors.muted, fontSize: theme.typography.metaPx, whiteSpace: 'nowrap' }}>{formatDateRange(experience.startDate, experience.endDate)}</span>
          </div>
          <div style={{ marginTop: 2, color: theme.colors.body }}>
            <InlineEdit value={experience.title} onChange={value => updateExperience(item.index, 'title', value)} style={{ color: theme.colors.accent, fontWeight: 600 }} />
            {hasText(experience.location) && <><span style={{ color: theme.colors.rule }}> · </span><InlineEdit value={experience.location} onChange={value => updateExperience(item.index, 'location', value)} style={{ color: theme.colors.muted }} /></>}
          </div>
          <BulletList bullets={experience.bullets} onChange={(bulletIndex, value) => updateExperienceBullet(item.index, bulletIndex, value)} evidence={(resume.bulletEvidence || []).filter(entry => entry.section === 'experience' && entry.itemId === (experience.sourceFactId || ''))} requirements={resume.requirements} factMatches={resume.factMatches} />
        </div>
      )
    }

    if (item.section === 'projects') {
      const project = (resume.projects || [])[item.index]
      const matchedKeywords = projectKeywords(project.id)
      return (
        <div key={`${item.section}-${item.index}`} style={{ marginBottom: theme.spacing.itemGapPx }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 18, alignItems: 'baseline' }}>
            <InlineEdit value={project.name} onChange={value => updateProject(item.index, 'name', value)} style={{ color: theme.colors.ink, fontWeight: 700, fontSize: 13.3 }} />
            <span style={{ color: theme.colors.muted, fontSize: theme.typography.metaPx, whiteSpace: 'nowrap' }}>{formatDateRange(project.startDate, project.endDate)}</span>
          </div>
          {(hasText(project.role) || hasText(project.link)) && <div style={{ color: theme.colors.muted, fontSize: theme.typography.metaPx, marginTop: 2 }}>{hasText(project.role) && <InlineEdit value={project.role} onChange={value => updateProject(item.index, 'role', value)} style={{ color: theme.colors.accent, fontWeight: 600 }} />}{hasText(project.role) && hasText(project.link) && <span style={{ color: theme.colors.rule }}> · </span>}{hasText(project.link) && <a href={toSafeURL(project.link)} target="_blank" rel="noreferrer" style={{ color: theme.colors.accent, textDecoration: 'none' }}>项目链接</a>}</div>}
          {matchedKeywords.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>{matchedKeywords.map(keyword => <span key={keyword} style={{ padding: '1px 5px', borderRadius: 3, background: theme.colors.accentSoft, color: theme.colors.accent, fontSize: 9.5, fontWeight: 600 }}>{keyword}</span>)}</div>}
          <BulletList bullets={project.bullets} onChange={(bulletIndex, value) => updateProjectBullet(item.index, bulletIndex, value)} evidence={(resume.bulletEvidence || []).filter(entry => entry.section === 'project' && entry.itemId === project.id)} requirements={resume.requirements} factMatches={resume.factMatches} />
        </div>
      )
    }

    if (item.section === 'campus') {
      const campus = (resume.campusExperiences || [])[item.index]
      return (
        <div key={`${item.section}-${item.index}`} style={{ marginBottom: theme.spacing.itemGapPx }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 18, alignItems: 'baseline' }}>
            <span style={{ color: theme.colors.ink, fontWeight: 700, fontSize: 13.1 }}>{campus.organization}</span>
            <span style={{ color: theme.colors.muted, fontSize: theme.typography.metaPx, whiteSpace: 'nowrap' }}>{formatDateRange(campus.startDate, campus.endDate)}</span>
          </div>
          {(hasText(campus.role) || hasText(campus.location)) && <div style={{ color: theme.colors.muted, fontSize: theme.typography.metaPx, marginTop: 2 }}>{[campus.role, campus.location].filter(hasText).join(' · ')}</div>}
          <BulletList bullets={campus.bullets} evidence={(resume.bulletEvidence || []).filter(entry => entry.section === 'campus' && entry.itemId === campus.id)} requirements={resume.requirements} factMatches={resume.factMatches} />
        </div>
      )
    }

    if (item.section === 'awards') {
      const award = (resume.awards || [])[item.index]
      return (
        <div key={`${item.section}-${item.index}`} style={{ marginBottom: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 18, alignItems: 'baseline' }}>
            <span style={{ color: theme.colors.ink, fontWeight: 600 }}>{award.title}{hasText(award.issuer) && <span style={{ color: theme.colors.muted, fontWeight: 400 }}> · {award.issuer}</span>}</span>
            {hasText(award.date) && <span style={{ color: theme.colors.muted, fontSize: theme.typography.metaPx, whiteSpace: 'nowrap' }}>{formatDisplayDate(award.date)}</span>}
          </div>
          {hasText(award.description) && <div style={{ color: theme.colors.muted, fontSize: theme.typography.metaPx, marginTop: 1 }}>{award.description}</div>}
        </div>
      )
    }

    const row = skillRows[item.index]
    const relevant = skillRowRelevant(row.label, row.items)
    return (
      <div key={`${item.section}-${item.index}`} style={{ display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr)', gap: 4, marginBottom: 4, lineHeight: theme.typography.lineHeight }}>
        <span style={{ color: theme.colors.heading, fontWeight: 700 }}>{row.label}：</span>
        <span style={{ fontWeight: relevant ? 600 : 400 }}>{row.items.join('、')}</span>
      </div>
    )
  }

  const contactLine = ([
    { icon: 'phone', value: resume.contact.phone },
    { icon: 'email', value: resume.contact.email },
    { icon: 'location', value: resume.contact.location },
  ] satisfies Array<{ icon: ChineseResumeIcon; value: string }>).filter(item => hasText(item.value))
  const socialItems: React.ReactNode[] = []
  if (hasText(resume.contact.wechat)) socialItems.push(<span key="wechat">微信：{resume.contact.wechat}</span>)
  if (hasText(resume.contact.linkedin)) socialItems.push(<a key="linkedin" href={toSafeURL(resume.contact.linkedin)} target="_blank" rel="noreferrer">LinkedIn</a>)
  if (hasText(resume.contact.github)) socialItems.push(<a key="github" href={toSafeURL(resume.contact.github)} target="_blank" rel="noreferrer">GitHub</a>)
  if (hasText(resume.contact.website)) socialItems.push(<a key="website" href={toSafeURL(resume.contact.website)} target="_blank" rel="noreferrer">个人主页</a>)

  return (
    <div className="cn-campus-preview-workspace" aria-label="应届生校招经典单栏简历预览">
      {pages.map((page, pageIndex) => (
        <article className="cn-campus-preview-page" key={pageIndex} aria-label={`简历第 ${pageIndex + 1} 页`}>
          {pageIndex === 0 && (
            <header style={{ display: 'grid', gridTemplateColumns: showAvatar ? '84px minmax(0, 1fr) 84px' : '1fr', columnGap: showAvatar ? 18 : 0, alignItems: 'center', paddingBottom: 13, marginBottom: 14, borderBottom: `1px solid ${theme.colors.rule}` }}>
              {showAvatar && <span aria-hidden="true" style={{ width: 84 }} />}
              <div style={{ minWidth: 0, textAlign: 'center' }}>
                <InlineEdit value={resume.contact.name} onChange={value => updateContact('name', value)} style={{ display: 'inline-block', color: theme.colors.ink, fontSize: theme.typography.namePx, fontWeight: 700, letterSpacing: '0.12em', lineHeight: 1.2 }} />
                {hasText(resume.contact.jobTarget) && <div style={{ marginTop: 6, color: theme.colors.accent, fontSize: 13.1, fontWeight: 600 }}>求职方向：<InlineEdit value={resume.contact.jobTarget} onChange={value => updateContact('jobTarget', value)} /></div>}
                {contactLine.length > 0 && <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '4px 12px', marginTop: 8, color: theme.colors.muted, fontSize: theme.typography.metaPx }}>{contactLine.map(item => <span key={item.icon} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><BrowserIcon name={item.icon} size={11} /><span>{item.value}</span></span>)}</div>}
                {socialItems.length > 0 && <div className="cn-campus-header-links" style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '3px 8px', marginTop: 4, color: theme.colors.muted, fontSize: theme.typography.metaPx }}>{socialItems.map((item, index) => <React.Fragment key={index}>{index > 0 && <span style={{ color: theme.colors.rule }}>｜</span>}{item}</React.Fragment>)}</div>}
              </div>
              {showAvatar && <img src={resume.contact.avatar} alt={`${resume.contact.name || '候选人'}头像`} style={{ width: 84, height: 112, objectFit: 'cover', borderRadius: 1, border: `1px solid ${theme.colors.rule}` }} />}
            </header>
          )}

          {page.sections.map(section => (
            <section key={section.key} style={{ marginBottom: theme.spacing.sectionGapPx }}>
              <SectionTitle section={section.key}>{theme.labels[section.key]}</SectionTitle>
              {section.items.map(renderItem)}
            </section>
          ))}
        </article>
      ))}
    </div>
  )
}
