'use client'

import { useCallback, useRef, useState } from 'react'
import type {
  Award,
  CampusExperience,
  Certificate,
  Contact,
  Education,
  Experience,
  FactBank,
  Project,
  ResumeSettings,
  SkillGroup,
  Version,
} from '@/lib/types'
import { exportFactBank, importFactBank } from '@/lib/storage'
import { AvatarProcessingError, compressAvatar } from '@/lib/avatar'
import { getResumeTemplate, updateTemplateShowAvatarPreference } from '@/lib/resumeTemplates'

function newId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function confirmDelete(message: string, action: () => void) {
  if (window.confirm(message)) action()
}

function toLines(value: string): string[] {
  return value.split('\n').map(line => line.trim()).filter(Boolean)
}

function Field({ label, value, onChange, placeholder, type = 'text', className = '' }: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  className?: string
}) {
  return (
    <label className={className}>
      <span className="field-label">{label}</span>
      <input
        className="input-field w-full"
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}

function TextAreaField({ label, value, onChange, placeholder, rows = 3 }: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <label>
      <span className="field-label">{label}</span>
      <textarea
        className="input-field w-full resize-y"
        rows={rows}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}

function SectionHeader({ title, description, action }: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-3">
      <div>
        <h3 className="section-label mb-1">{title}</h3>
        <p className="section-description mb-0">{description}</p>
      </div>
      {action}
    </div>
  )
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-panel">
      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</p>
      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{description}</p>
    </div>
  )
}

function DeleteButton({ onClick, label = '删除' }: { onClick: () => void; label?: string }) {
  return <button type="button" className="text-button danger" onClick={onClick}>{label}</button>
}

interface Props {
  factBank: FactBank
  settings: ResumeSettings
  onChange: (factBank: FactBank) => void
  onSettingsChange: (settings: ResumeSettings) => void
}

export default function FactBankEditor({ factBank, settings, onChange, onSettingsChange }: Props) {
  const [uploading, setUploading] = useState(false)
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  const [avatarError, setAvatarError] = useState('')
  const [avatarProcessing, setAvatarProcessing] = useState(false)
  const [expandedEdu, setExpandedEdu] = useState<Set<string>>(new Set())
  const [expandedExp, setExpandedExp] = useState<Set<string>>(new Set())
  const [expandedProj, setExpandedProj] = useState<Set<string>>(new Set())
  const [expandedCampus, setExpandedCampus] = useState<Set<string>>(new Set())
  const [activeVersion, setActiveVersion] = useState<Record<string, string>>({})
  const resumeFileRef = useRef<HTMLInputElement>(null)
  const avatarFileRef = useRef<HTMLInputElement>(null)

  const update = useCallback((next: FactBank) => onChange(next), [onChange])

  async function handleResumeUpload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    setUploadErrors([])
    try {
      const form = new FormData()
      Array.from(files).forEach(file => form.append('files', file))
      const response = await fetch('/api/parse-resume', { method: 'POST', body: form })
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || '简历导入失败，请稍后重试。')
      const incoming = data.factBank as FactBank
      update({
        ...factBank,
        contact: factBank.contact.name ? factBank.contact : incoming.contact,
        education: mergeEducation(factBank.education, incoming.education),
        experiences: mergeExperiences(factBank.experiences, incoming.experiences),
        skills: Array.from(new Set([...factBank.skills, ...incoming.skills])),
        projects: mergeProjects(factBank.projects || [], incoming.projects || []),
        awards: mergeAwards(factBank.awards || [], incoming.awards || []),
        skillGroups: mergeSkillGroups(factBank.skillGroups || [], incoming.skillGroups || []),
        certificates: mergeCertificates(factBank.certificates || [], incoming.certificates || []),
        campusExperiences: mergeCampusExperiences(factBank.campusExperiences || [], incoming.campusExperiences || []),
      })
      if (data.errors?.length) {
        setUploadErrors(data.errors.map((item: { filename: string; error: string }) => `${item.filename}：${item.error}`))
      }
    } catch (error) {
      setUploadErrors([error instanceof Error ? error.message : '简历导入失败，请稍后重试。'])
    } finally {
      setUploading(false)
      if (resumeFileRef.current) resumeFileRef.current.value = ''
    }
  }

  async function handleAvatarUpload(file: File | undefined) {
    if (!file) return
    setAvatarProcessing(true)
    setAvatarError('')
    try {
      const avatar = await compressAvatar(file)
      update({ ...factBank, contact: { ...factBank.contact, avatar } })
    } catch (error) {
      setAvatarError(error instanceof AvatarProcessingError ? error.message : '图片处理失败，请重新选择。')
    } finally {
      setAvatarProcessing(false)
      if (avatarFileRef.current) avatarFileRef.current.value = ''
    }
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      update(await importFactBank(file))
      setUploadErrors([])
    } catch (error) {
      setUploadErrors([error instanceof Error ? error.message : '无法导入该备份文件。'])
    } finally {
      event.target.value = ''
    }
  }

  function updateContact(field: keyof Contact, value: string | undefined) {
    update({ ...factBank, contact: { ...factBank.contact, [field]: value } })
  }

  function addEducation() {
    const entry: Education = {
      id: newId(), school: '', location: '', degree: '', field: '', focus: '',
      startDate: '', endDate: '', notes: [],
    }
    update({ ...factBank, education: [...factBank.education, entry] })
    setExpandedEdu(previous => new Set(previous).add(entry.id))
  }

  function updateEducation(id: string, patch: Partial<Education>) {
    update({ ...factBank, education: factBank.education.map(item => item.id === id ? { ...item, ...patch } : item) })
  }

  function addExperience() {
    const versionId = newId()
    const entry: Experience = {
      id: newId(), company: '', location: '', startDate: '', endDate: '',
      versions: [{ id: versionId, title: '原始版', bullets: [''] }],
    }
    update({ ...factBank, experiences: [...factBank.experiences, entry] })
    setExpandedExp(previous => new Set(previous).add(entry.id))
    setActiveVersion(previous => ({ ...previous, [entry.id]: versionId }))
  }

  function updateExperience(id: string, patch: Partial<Experience>) {
    update({ ...factBank, experiences: factBank.experiences.map(item => item.id === id ? { ...item, ...patch } : item) })
  }

  function updateVersion(experienceId: string, versionId: string, patch: Partial<Version>) {
    update({
      ...factBank,
      experiences: factBank.experiences.map(item => item.id === experienceId
        ? { ...item, versions: item.versions.map(version => version.id === versionId ? { ...version, ...patch } : version) }
        : item),
    })
  }

  function addVersion(experienceId: string, source?: Version) {
    const version: Version = {
      id: newId(),
      title: source ? `${source.title || '原始版'}副本` : '新表达版本',
      bullets: source ? [...source.bullets] : [''],
    }
    const experience = factBank.experiences.find(item => item.id === experienceId)
    if (!experience) return
    updateExperience(experienceId, { versions: [...experience.versions, version] })
    setActiveVersion(previous => ({ ...previous, [experienceId]: version.id }))
  }

  function addProject() {
    const entry: Project = { id: newId(), name: '', role: '', startDate: '', endDate: '', bullets: [''], link: '' }
    update({ ...factBank, projects: [...(factBank.projects || []), entry] })
    setExpandedProj(previous => new Set(previous).add(entry.id))
  }

  function updateProject(id: string, patch: Partial<Project>) {
    update({ ...factBank, projects: (factBank.projects || []).map(item => item.id === id ? { ...item, ...patch } : item) })
  }

  function addCampusExperience() {
    const entry: CampusExperience = {
      id: newId(), organization: '', role: '', location: '', startDate: '', endDate: '', bullets: [''],
    }
    update({ ...factBank, campusExperiences: [...(factBank.campusExperiences || []), entry] })
    setExpandedCampus(previous => new Set(previous).add(entry.id))
  }

  function updateCampus(id: string, patch: Partial<CampusExperience>) {
    update({
      ...factBank,
      campusExperiences: (factBank.campusExperiences || []).map(item => item.id === id ? { ...item, ...patch } : item),
    })
  }

  function addAward() {
    const entry: Award = { id: newId(), title: '', issuer: '', date: '', description: '' }
    update({ ...factBank, awards: [...(factBank.awards || []), entry] })
  }

  function updateAward(id: string, patch: Partial<Award>) {
    update({ ...factBank, awards: (factBank.awards || []).map(item => item.id === id ? { ...item, ...patch } : item) })
  }

  function addSkillGroup() {
    const entry: SkillGroup = { id: newId(), label: '', items: [] }
    update({ ...factBank, skillGroups: [...(factBank.skillGroups || []), entry] })
  }

  function updateSkillGroup(id: string, patch: Partial<SkillGroup>) {
    update({ ...factBank, skillGroups: (factBank.skillGroups || []).map(item => item.id === id ? { ...item, ...patch } : item) })
  }

  function addCertificate() {
    const entry: Certificate = { id: newId(), name: '', issuer: '', date: '', score: '', description: '' }
    update({ ...factBank, certificates: [...(factBank.certificates || []), entry] })
  }

  function updateCertificate(id: string, patch: Partial<Certificate>) {
    update({
      ...factBank,
      certificates: (factBank.certificates || []).map(item => item.id === id ? { ...item, ...patch } : item),
    })
  }

  return (
    <div className="space-y-8">
      <div
        className="resume-import-zone"
        onClick={() => resumeFileRef.current?.click()}
        onDragOver={event => event.preventDefault()}
        onDrop={event => { event.preventDefault(); handleResumeUpload(event.dataTransfer.files) }}
      >
        <input ref={resumeFileRef} type="file" className="hidden" multiple accept=".pdf,.docx,.txt" onChange={event => handleResumeUpload(event.target.files)} />
        {uploading ? (
          <div className="flex items-center justify-center gap-3">
            <span className="w-4 h-4 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>正在识别并整理简历内容…</span>
          </div>
        ) : (
          <>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15v4h14v-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <p className="font-medium mt-2">导入已有简历</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>支持 PDF、DOCX、TXT，可一次导入多份</p>
          </>
        )}
      </div>

      {uploadErrors.length > 0 && (
        <div className="notice notice-error" role="alert">
          {uploadErrors.map((message, index) => <p key={index}>{message}</p>)}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={() => exportFactBank(factBank)}>导出备份</button>
          <label className="btn-ghost cursor-pointer">导入备份<input type="file" accept=".json" className="hidden" onChange={handleImport} /></label>
        </div>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>修改会自动保存在本机</span>
      </div>

      <section className="library-section">
        <SectionHeader title="个人信息" description="管理简历顶部展示的基本资料。未填写的字段不会强制显示。" />
        <div className="card profile-card">
          <div className="avatar-column">
            <button type="button" className="avatar-frame" onClick={() => avatarFileRef.current?.click()} disabled={avatarProcessing}>
              {factBank.contact.avatar
                ? <img src={factBank.contact.avatar} alt="当前简历照片" />
                : <span>{avatarProcessing ? '处理中…' : '上传照片'}</span>}
            </button>
            <input ref={avatarFileRef} type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={event => handleAvatarUpload(event.target.files?.[0])} />
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" className="text-button" onClick={() => avatarFileRef.current?.click()}>{factBank.contact.avatar ? '更换照片' : '选择照片'}</button>
              {factBank.contact.avatar && (
                <DeleteButton label="删除照片" onClick={() => confirmDelete('确定删除当前照片吗？', () => updateContact('avatar', undefined))} />
              )}
            </div>
            <label className={`toggle-row ${!factBank.contact.avatar ? 'is-disabled' : ''}`}>
              <input
                type="checkbox"
                checked={settings.showAvatar}
                disabled={!factBank.contact.avatar || !getResumeTemplate(settings.requestedTemplateId || settings.templateId).supportsAvatar}
                onChange={event => onSettingsChange(updateTemplateShowAvatarPreference(settings, event.target.checked))}
              />
              <span>在简历中显示头像</span>
            </label>
            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>支持 JPG、PNG、WebP，上传后自动压缩</p>
            {avatarError && <p className="text-xs text-center" style={{ color: 'var(--red)' }} role="alert">{avatarError}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 min-w-0">
            <Field label="姓名" value={factBank.contact.name} onChange={value => updateContact('name', value)} placeholder="请输入姓名" />
            <Field label="求职方向" value={factBank.contact.jobTarget || ''} onChange={value => updateContact('jobTarget', value)} placeholder="例如：产品经理 / 用户研究" />
            <Field label="手机号码" value={factBank.contact.phone} onChange={value => updateContact('phone', value)} placeholder="请输入手机号码" />
            <Field label="邮箱" type="email" value={factBank.contact.email} onChange={value => updateContact('email', value)} placeholder="请输入邮箱" />
            <Field label="所在地" value={factBank.contact.location} onChange={value => updateContact('location', value)} placeholder="例如：广州" />
            <Field label="微信（选填）" value={factBank.contact.wechat || ''} onChange={value => updateContact('wechat', value)} placeholder="请输入微信号" />
            <Field label="GitHub（选填）" value={factBank.contact.github} onChange={value => updateContact('github', value)} placeholder="个人主页链接或用户名" />
            <Field label="个人主页（选填）" value={factBank.contact.website} onChange={value => updateContact('website', value)} placeholder="作品集或个人网站" />
            <Field label="LinkedIn（选填）" value={factBank.contact.linkedin} onChange={value => updateContact('linkedin', value)} placeholder="LinkedIn 主页" className="md:col-span-2" />
          </div>
        </div>
      </section>

      <section className="library-section">
        <SectionHeader title="教育经历" description="记录学校、学历、专业与研究方向，应届生简历会优先使用这些信息。" action={<button type="button" className="btn-ghost" onClick={addEducation}>+ 添加教育经历</button>} />
        <div className="space-y-3">
          {factBank.education.length === 0 && <EmptyPanel title="还没有教育经历" description="添加本科、硕士或其他与求职相关的教育背景。" />}
          {factBank.education.map(education => {
            const open = expandedEdu.has(education.id)
            return (
              <article key={education.id} className="card summary-card">
                <button type="button" className="summary-trigger" onClick={() => setExpandedEdu(previous => toggleSet(previous, education.id))}>
                  <span>
                    <strong>{education.school || '未填写学校'}</strong>
                    <small>{[education.degree, education.field, education.focus].filter(Boolean).join('｜') || '补充学历、专业和研究方向'}</small>
                  </span>
                  <span className="summary-meta">{[education.startDate, education.endDate].filter(Boolean).join(' – ') || '时间待补充'} · {open ? '收起' : '编辑'}</span>
                </button>
                {open && (
                  <div className="editor-panel">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      <Field label="学校" value={education.school} onChange={value => updateEducation(education.id, { school: value })} />
                      <Field label="学历" value={education.degree} onChange={value => updateEducation(education.id, { degree: value })} placeholder="例如：硕士研究生" />
                      <Field label="专业" value={education.field} onChange={value => updateEducation(education.id, { field: value })} />
                      <Field label="研究方向（选填）" value={education.focus || ''} onChange={value => updateEducation(education.id, { focus: value })} />
                      <Field label="开始时间" value={education.startDate} onChange={value => updateEducation(education.id, { startDate: value })} placeholder="2024.09" />
                      <Field label="毕业时间" value={education.endDate} onChange={value => updateEducation(education.id, { endDate: value })} placeholder="2027.06" />
                      <Field label="地点" value={education.location} onChange={value => updateEducation(education.id, { location: value })} />
                    </div>
                    <TextAreaField label="补充说明（每行一条，选填）" value={education.notes.join('\n')} onChange={value => updateEducation(education.id, { notes: toLines(value) })} placeholder="奖学金、主修课程或其他教育亮点" rows={2} />
                    <div className="flex justify-end"><DeleteButton onClick={() => confirmDelete('确定删除这条教育经历吗？', () => update({ ...factBank, education: factBank.education.filter(item => item.id !== education.id) }))} /></div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </section>

      <section className="library-section">
        <SectionHeader title="实习 / 工作经历" description="记录真实职责和成果；同一经历可以保存多个岗位方向的表达版本。" action={<button type="button" className="btn-ghost" onClick={addExperience}>+ 添加经历</button>} />
        <div className="space-y-3">
          {factBank.experiences.length === 0 && <EmptyPanel title="还没有实习或工作经历" description="实习、兼职、志愿岗位和正式工作都可以记录在这里。" />}
          {factBank.experiences.map(experience => {
            const open = expandedExp.has(experience.id)
            const selectedId = activeVersion[experience.id] || experience.versions[0]?.id
            const version = experience.versions.find(item => item.id === selectedId) || experience.versions[0]
            const bulletCount = version?.bullets.filter(Boolean).length || 0
            return (
              <article key={experience.id} className="card summary-card">
                <button type="button" className="summary-trigger" onClick={() => setExpandedExp(previous => toggleSet(previous, experience.id))}>
                  <span>
                    <strong>{experience.company || '未填写公司 / 组织'}</strong>
                    <small>{version?.title || '岗位待补充'} · {experience.location || '地点待补充'}</small>
                  </span>
                  <span className="summary-meta">{bulletCount} 个要点 · {experience.versions.length} 个表达版本 · {open ? '收起' : '编辑'}</span>
                </button>
                {open && (
                  <div className="editor-panel">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                      <Field label="公司 / 组织" value={experience.company} onChange={value => updateExperience(experience.id, { company: value })} />
                      <Field label="地点" value={experience.location} onChange={value => updateExperience(experience.id, { location: value })} />
                      <Field label="开始时间" value={experience.startDate} onChange={value => updateExperience(experience.id, { startDate: value })} />
                      <Field label="结束时间" value={experience.endDate} onChange={value => updateExperience(experience.id, { endDate: value })} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <span className="field-label mb-0">经历表达版本</span>
                        <button type="button" className="text-button" onClick={() => addVersion(experience.id)}>+ 新建版本</button>
                      </div>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {experience.versions.map(item => (
                          <button key={item.id} type="button" className={`version-tab ${item.id === selectedId ? 'is-active' : ''}`} onClick={() => setActiveVersion(previous => ({ ...previous, [experience.id]: item.id }))}>{item.title || '未命名版本'}</button>
                        ))}
                      </div>
                      {version && (
                        <div className="nested-editor">
                          <Field label="岗位 / 版本名称" value={version.title} onChange={value => updateVersion(experience.id, version.id, { title: value })} placeholder="例如：产品岗位版" />
                          <TextAreaField label="经历要点（每行一条）" value={version.bullets.join('\n')} onChange={value => updateVersion(experience.id, version.id, { bullets: value.split('\n') })} placeholder="动作 + 对象 + 方法 + 真实结果" rows={5} />
                          <div className="flex flex-wrap justify-between gap-2">
                            <button type="button" className="text-button" onClick={() => addVersion(experience.id, version)}>复制当前版本</button>
                            {experience.versions.length > 1 && <DeleteButton label="删除当前版本" onClick={() => confirmDelete('确定删除当前表达版本吗？', () => updateExperience(experience.id, { versions: experience.versions.filter(item => item.id !== version.id) }))} />}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex justify-end"><DeleteButton onClick={() => confirmDelete('确定删除整段实习 / 工作经历吗？', () => update({ ...factBank, experiences: factBank.experiences.filter(item => item.id !== experience.id) }))} /></div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </section>

      <section className="library-section">
        <SectionHeader title="项目经历" description="课程设计、科研课题、竞赛项目和个人项目都可以记录在这里。" action={<button type="button" className="btn-ghost" onClick={addProject}>+ 添加项目</button>} />
        <div className="space-y-3">
          {(factBank.projects || []).length === 0 && <EmptyPanel title="还没有项目经历" description="记录项目目标、你的角色、具体工作和真实产出。" />}
          {(factBank.projects || []).map(project => {
            const open = expandedProj.has(project.id)
            return (
              <article key={project.id} className="card summary-card">
                <button type="button" className="summary-trigger" onClick={() => setExpandedProj(previous => toggleSet(previous, project.id))}>
                  <span><strong>{project.name || '未填写项目名称'}</strong><small>{project.role || '角色待补充'}</small></span>
                  <span className="summary-meta">{project.bullets.filter(Boolean).length} 个要点 · {open ? '收起' : '编辑'}</span>
                </button>
                {open && (
                  <div className="editor-panel">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                      <Field label="项目名称" value={project.name} onChange={value => updateProject(project.id, { name: value })} />
                      <Field label="角色（选填）" value={project.role || ''} onChange={value => updateProject(project.id, { role: value })} />
                      <Field label="开始时间" value={project.startDate} onChange={value => updateProject(project.id, { startDate: value })} />
                      <Field label="结束时间" value={project.endDate} onChange={value => updateProject(project.id, { endDate: value })} />
                    </div>
                    <Field label="项目链接（选填）" value={project.link || ''} onChange={value => updateProject(project.id, { link: value })} placeholder="作品、报告或项目主页" />
                    <TextAreaField label="项目要点（每行一条）" value={project.bullets.join('\n')} onChange={value => updateProject(project.id, { bullets: value.split('\n') })} rows={4} />
                    <div className="flex justify-end"><DeleteButton onClick={() => confirmDelete('确定删除这个项目吗？', () => update({ ...factBank, projects: (factBank.projects || []).filter(item => item.id !== project.id) }))} /></div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </section>

      <section className="library-section">
        <SectionHeader title="校园经历" description="记录学生组织、班级工作、社团和志愿服务等经历。" action={<button type="button" className="btn-ghost" onClick={addCampusExperience}>+ 添加校园经历</button>} />
        <div className="space-y-3">
          {(factBank.campusExperiences || []).length === 0 && <EmptyPanel title="还没有校园经历" description="班委、学生组织、社团骨干和志愿活动都可以记录。" />}
          {(factBank.campusExperiences || []).map(campus => {
            const open = expandedCampus.has(campus.id)
            return (
              <article key={campus.id} className="card summary-card campus-card">
                <button type="button" className="summary-trigger" onClick={() => setExpandedCampus(previous => toggleSet(previous, campus.id))}>
                  <span><strong>{campus.organization || '未填写组织 / 班级'}</strong><small>{campus.role || '角色待补充'} · {campus.location || '地点选填'}</small></span>
                  <span className="summary-meta">{campus.bullets.filter(Boolean).length} 个要点 · {open ? '收起' : '编辑'}</span>
                </button>
                {open && (
                  <div className="editor-panel">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      <Field label="组织 / 班级" value={campus.organization} onChange={value => updateCampus(campus.id, { organization: value })} />
                      <Field label="角色" value={campus.role} onChange={value => updateCampus(campus.id, { role: value })} />
                      <Field label="地点（选填）" value={campus.location || ''} onChange={value => updateCampus(campus.id, { location: value })} />
                      <Field label="开始时间" value={campus.startDate || ''} onChange={value => updateCampus(campus.id, { startDate: value })} />
                      <Field label="结束时间" value={campus.endDate || ''} onChange={value => updateCampus(campus.id, { endDate: value })} />
                    </div>
                    <TextAreaField label="经历要点（每行一条）" value={campus.bullets.join('\n')} onChange={value => updateCampus(campus.id, { bullets: value.split('\n') })} placeholder="例如：组织班级活动，协调同学分工并支持日常事务执行" rows={4} />
                    <div className="flex justify-end"><DeleteButton onClick={() => confirmDelete('确定删除这条校园经历吗？', () => update({ ...factBank, campusExperiences: (factBank.campusExperiences || []).filter(item => item.id !== campus.id) }))} /></div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </section>

      <section className="library-section">
        <SectionHeader title="获奖荣誉" description="记录奖学金、竞赛获奖和院校荣誉。" action={<button type="button" className="btn-ghost" onClick={addAward}>+ 添加奖项</button>} />
        <div className="space-y-3">
          {(factBank.awards || []).length === 0 && <EmptyPanel title="还没有获奖荣誉" description="竞赛奖项、奖学金和优秀学生干部等都可以记录。" />}
          {(factBank.awards || []).map(award => (
            <article key={award.id} className="card compact-editor">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[2fr_1fr_160px] gap-3">
                <Field label="奖项名称" value={award.title} onChange={value => updateAward(award.id, { title: value })} />
                <Field label="颁发机构（选填）" value={award.issuer || ''} onChange={value => updateAward(award.id, { issuer: value })} />
                <Field label="时间" value={award.date || ''} onChange={value => updateAward(award.id, { date: value })} placeholder="2021.07" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                <Field label="说明（选填）" value={award.description || ''} onChange={value => updateAward(award.id, { description: value })} />
                <DeleteButton onClick={() => confirmDelete('确定删除这条获奖荣誉吗？', () => update({ ...factBank, awards: (factBank.awards || []).filter(item => item.id !== award.id) }))} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="library-section">
        <SectionHeader title="技能与证书" description="按类别整理能力，并单独记录语言考试和资格证书。" />

        <div className="subsection-block">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div><h4 className="font-semibold">技能</h4><p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>推荐使用“设计与建模”“办公软件”“AI 与数据”“语言能力”等分类。</p></div>
            <button type="button" className="btn-ghost" onClick={addSkillGroup}>+ 添加技能分类</button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {(factBank.skillGroups || []).map(group => (
              <article key={group.id} className="card compact-editor">
                <Field label="分类名称" value={group.label} onChange={value => updateSkillGroup(group.id, { label: value })} placeholder="例如：设计与建模" />
                <TextAreaField label="技能（每行一项）" value={group.items.join('\n')} onChange={value => updateSkillGroup(group.id, { items: toLines(value) })} placeholder={'PS\n天正 CAD\nRhino'} rows={4} />
                <div className="flex justify-end"><DeleteButton onClick={() => confirmDelete('确定删除这个技能分类吗？', () => update({ ...factBank, skillGroups: (factBank.skillGroups || []).filter(item => item.id !== group.id) }))} /></div>
              </article>
            ))}
          </div>

          {(factBank.skillGroups || []).length === 0 && factBank.skills.length === 0 && (
            <EmptyPanel title="还没有技能信息" description="按类别添加软件工具、语言能力和其他求职技能。" />
          )}

          {factBank.skills.length > 0 && (
            <div className="legacy-skills mt-4">
              <div className="mb-2"><strong className="text-sm">已有技能条目</strong><p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>这是旧版经历库中的技能数据，仍会完整保留和使用。</p></div>
              <div className="space-y-2">
                {factBank.skills.map((skill, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input className="input-field flex-1" value={skill} onChange={event => update({ ...factBank, skills: factBank.skills.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} />
                    <DeleteButton onClick={() => confirmDelete('确定删除这条技能信息吗？', () => update({ ...factBank, skills: factBank.skills.filter((_, itemIndex) => itemIndex !== index) }))} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="subsection-block mt-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div><h4 className="font-semibold">证书 / 考试</h4><p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>记录 CET、资格证书和其他可验证的考试成绩。</p></div>
            <button type="button" className="btn-ghost" onClick={addCertificate}>+ 添加证书</button>
          </div>
          <div className="space-y-3">
            {(factBank.certificates || []).length === 0 && <EmptyPanel title="还没有证书或考试记录" description="例如 CET-4、CET-6、职业资格证书。" />}
            {(factBank.certificates || []).map(certificate => (
              <article key={certificate.id} className="card compact-editor">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Field label="证书 / 考试名称" value={certificate.name} onChange={value => updateCertificate(certificate.id, { name: value })} placeholder="例如：CET-4" />
                  <Field label="成绩（选填）" value={certificate.score || ''} onChange={value => updateCertificate(certificate.id, { score: value })} placeholder="432" />
                  <Field label="颁发机构（选填）" value={certificate.issuer || ''} onChange={value => updateCertificate(certificate.id, { issuer: value })} />
                  <Field label="时间（选填）" value={certificate.date || ''} onChange={value => updateCertificate(certificate.id, { date: value })} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                  <Field label="说明（选填）" value={certificate.description || ''} onChange={value => updateCertificate(certificate.id, { description: value })} />
                  <DeleteButton onClick={() => confirmDelete('确定删除这条证书记录吗？', () => update({ ...factBank, certificates: (factBank.certificates || []).filter(item => item.id !== certificate.id) }))} />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function toggleSet(previous: Set<string>, id: string): Set<string> {
  const next = new Set(previous)
  next.has(id) ? next.delete(id) : next.add(id)
  return next
}

function mergeEducation(existing: Education[], incoming: Education[]): Education[] {
  const map = new Map(existing.map(item => [item.school.toLowerCase().trim(), item]))
  incoming.forEach(item => {
    const key = item.school.toLowerCase().trim()
    if (!map.has(key)) map.set(key, item)
  })
  return Array.from(map.values())
}

function mergeExperiences(existing: Experience[], incoming: Experience[]): Experience[] {
  const map = new Map(existing.map(item => [item.company.toLowerCase().trim(), item]))
  incoming.forEach(item => {
    const key = item.company.toLowerCase().trim()
    const current = map.get(key)
    map.set(key, current ? { ...current, versions: [...current.versions, ...item.versions] } : item)
  })
  return Array.from(map.values())
}

function mergeProjects(existing: Project[], incoming: Project[]): Project[] {
  const map = new Map(existing.map(item => [item.name.toLowerCase().trim(), item]))
  incoming.forEach(item => {
    const key = item.name.toLowerCase().trim()
    if (!map.has(key)) map.set(key, item)
  })
  return Array.from(map.values())
}

function mergeAwards(existing: Award[], incoming: Award[]): Award[] {
  const map = new Map(existing.map(item => [`${item.title.toLowerCase().trim()}|${item.date || ''}`, item]))
  incoming.forEach(item => {
    const key = `${item.title.toLowerCase().trim()}|${item.date || ''}`
    if (!map.has(key)) map.set(key, item)
  })
  return Array.from(map.values())
}

function mergeSkillGroups(existing: SkillGroup[], incoming: SkillGroup[]): SkillGroup[] {
  const map = new Map(existing.map(item => [item.label.toLowerCase().trim(), item]))
  incoming.forEach(item => {
    const key = item.label.toLowerCase().trim()
    const current = map.get(key)
    map.set(key, current ? { ...current, items: Array.from(new Set([...current.items, ...item.items])) } : item)
  })
  return Array.from(map.values())
}

function mergeCertificates(existing: Certificate[], incoming: Certificate[]): Certificate[] {
  const map = new Map(existing.map(item => [`${item.name.toLowerCase().trim()}|${item.date || ''}`, item]))
  incoming.forEach(item => {
    const key = `${item.name.toLowerCase().trim()}|${item.date || ''}`
    if (!map.has(key)) map.set(key, item)
  })
  return Array.from(map.values())
}

function mergeCampusExperiences(existing: CampusExperience[], incoming: CampusExperience[]): CampusExperience[] {
  const map = new Map(existing.map(item => [`${item.organization.toLowerCase().trim()}|${item.role.toLowerCase().trim()}`, item]))
  incoming.forEach(item => {
    const key = `${item.organization.toLowerCase().trim()}|${item.role.toLowerCase().trim()}`
    if (!map.has(key)) map.set(key, item)
  })
  return Array.from(map.values())
}
