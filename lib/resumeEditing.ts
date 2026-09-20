import type {
  ConversationFact,
  FactBank,
  GeneratedResume,
  ResumeBullet,
  ResumeChangeSummary,
  ResumeEditIntent,
  ResumeSectionType,
} from './types'

export interface ResolvedEditEvidence {
  ids: string[]
  statements: string[]
}

export interface ResumeEditVerification {
  success: boolean
  failures: string[]
}

const CONCEPTS: Array<{ label: string; aliases: string[] }> = [
  { label: 'Excel 数据整理与结构化台账', aliases: ['excel', '数据整理', '汇总台账', '结构化台账', '数据校验', '数据核验'] },
  { label: 'ESG 报告', aliases: ['esg', '社会价值报告', '报告交付'] },
  { label: '产品设计', aliases: ['产品设计', '需求分析', '产品定位', '交互设计', '原型', '产品流程', '产品闭环', '独立设计', '功能规划', '流程设计'] },
  { label: '用户研究', aliases: ['用户研究', '用户调研', '用户访谈', '用户需求'] },
  { label: '技术细节', aliases: ['技术细节', '技术栈', '代码', '接口', '部署', 'codex', 'sdk', 'web mvp', '前端', '模型调用', '业务逻辑开发'] },
  { label: 'AI Agent', aliases: ['ai agent', 'agent', '智能体'] },
]

function compact(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '').replace(/[，。；、：:（）()\[\]【】/|_\-·]/g, '')
}

function includesAlias(value: string, aliases: string[]): boolean {
  const normalized = compact(value)
  return aliases.some(alias => normalized.includes(compact(alias)))
}

function conceptForInstruction(instruction: string): { label: string; aliases: string[] } | undefined {
  return CONCEPTS.find(concept => includesAlias(instruction, concept.aliases))
}

export function resumeEntryId(section: ResumeSectionType, entry: unknown, index = 0): string {
  const value = entry as { id?: string; sourceFactId?: string; company?: string; title?: string; name?: string; organization?: string; role?: string }
  if (section === 'experience') return value.id || value.sourceFactId || `experience:${compact(`${value.company || ''}-${value.title || ''}`) || index}`
  return value.id || `${section}:${compact(`${value.name || value.organization || ''}-${value.role || ''}`) || index}`
}

function entryText(section: ResumeSectionType, entry: unknown): string {
  const value = entry as { company?: string; title?: string; name?: string; organization?: string; role?: string; bullets?: string[] }
  return [value.company, value.title, value.name, value.organization, value.role, ...(value.bullets || [])].filter(Boolean).join(' ')
}

function labelForEntry(section: ResumeSectionType, entry: unknown): string {
  const value = entry as { company?: string; title?: string; name?: string; organization?: string; role?: string }
  if (section === 'experience') return [value.company, value.title].filter(Boolean).join(' · ')
  if (section === 'project') return [value.name, value.role].filter(Boolean).join(' · ')
  return [value.organization, value.role].filter(Boolean).join(' · ')
}

function allEntries(resume: GeneratedResume) {
  return [
    ...resume.experiences.map((entry, index) => ({ section: 'experience' as const, entry, index })),
    ...(resume.projects || []).map((entry, index) => ({ section: 'project' as const, entry, index })),
    ...(resume.campusExperiences || []).map((entry, index) => ({ section: 'campus' as const, entry, index })),
  ]
}

function explicitOrdinal(instruction: string, section: ResumeSectionType): number | null {
  const sectionWord = section === 'project' ? '项目' : section === 'experience' ? '实习|经历' : '校园'
  const match = instruction.match(new RegExp(`第([一二三四五六七八九十\\d]+)个?(?:${sectionWord})`, 'i'))
  if (!match) return null
  const chinese: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
  return (Number(match[1]) || chinese[match[1]] || 1) - 1
}

function resolveTarget(instruction: string, resume: GeneratedResume, topic?: { label: string; aliases: string[] }) {
  const projectOrdinal = explicitOrdinal(instruction, 'project')
  if (projectOrdinal !== null && resume.projects?.[projectOrdinal]) return { section: 'project' as const, entry: resume.projects[projectOrdinal], index: projectOrdinal }
  const experienceOrdinal = explicitOrdinal(instruction, 'experience')
  if (experienceOrdinal !== null && resume.experiences[experienceOrdinal]) return { section: 'experience' as const, entry: resume.experiences[experienceOrdinal], index: experienceOrdinal }

  const instructionCompact = compact(instruction)
  const ranked = allEntries(resume).map(candidate => {
    const value = candidate.entry as { company?: string; title?: string; name?: string; organization?: string; role?: string; bullets?: string[] }
    const labels = [value.company, value.title, value.name, value.organization, value.role].filter((item): item is string => Boolean(item && item.length >= 2))
    const labelVariants = labels.flatMap(label => {
      const root = label.split(/[｜|·]/)[0].replace(/(集团股份有限公司|股份有限公司|有限责任公司|有限公司|集团|公司)$/, '')
      const prefixes = Array.from({ length: Math.min(6, root.length) - 1 }, (_, index) => root.slice(0, index + 2))
      return [label, root, ...prefixes].filter(item => compact(item).length >= 2)
    })
    let score = labelVariants.reduce((total, label) => total + (instructionCompact.includes(compact(label)) ? 100 : 0), 0)
    const text = entryText(candidate.section, candidate.entry)
    if (/esg|社会价值报告/i.test(instruction) && /esg|社会价值报告/i.test(text)) score += 65
    if (topic && includesAlias(text, topic.aliases)) score += 35
    return { ...candidate, score }
  }).sort((a, b) => b.score - a.score)
  return ranked[0]?.score > 0 ? ranked[0] : null
}

export function resolveResumeEditIntent(instruction: string, resume: GeneratedResume | null): ResumeEditIntent | null {
  if (!resume || !instruction.trim()) return null
  if (/(整体|整份|全部|重新生成|更贴合岗位|一页压缩|所有项目|所有经历)/i.test(instruction)) return null
  const topic = conceptForInstruction(instruction)
  const target = resolveTarget(instruction, resume, topic)
  if (!target) return null

  const deleteEntry = /(删除|移除|不要).*(实习|经历|项目)|把.*(实习|经历|项目).*(删除|移除)/i.test(instruction) && !topic
  const remove = /(删除|移除|删掉|去掉|不要)/i.test(instruction)
  const compress = /(压短|精简|缩短|压缩|减到|保留.{0,8}[一二三四五六七八九十\d]+条)/i.test(instruction)
  const reorder = /(顺序|放前面|置顶|调到)/i.test(instruction)
  const emphasize = /(突出|强调|弱化|减少.*细节)/i.test(instruction)
  const rewrite = /(改写|换一种说法|重写)/i.test(instruction)
  const expand = /(展开|扩写|多写|详细)/i.test(instruction)
  const add = /(增加|新增|补充|加上|加入|少了|少一点|体现)/i.test(instruction) || Boolean(topic)
  const countMatch = instruction.match(/(?:到|保留|压缩为?)\s*([一二三四五六七八九十\d]+)\s*条/)
  const chinese: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
  const maxBullets = countMatch ? (Number(countMatch[1]) || chinese[countMatch[1]]) : undefined
  const type: ResumeEditIntent['type'] = deleteEntry || remove ? 'remove' : compress ? 'compress' : reorder ? 'reorder' : emphasize ? 'emphasize' : rewrite ? 'rewrite' : expand ? 'expand' : add ? 'add' : 'rewrite'
  const operation: ResumeEditIntent['operation'] = deleteEntry
    ? 'remove_entry'
    : remove ? 'remove_bullet'
      : type === 'add' || type === 'expand' ? 'insert_bullet'
        : type === 'compress' || type === 'reorder' ? 'replace_entry_bullets'
          : 'replace_bullet'

  return {
    type,
    targetSection: target.section,
    targetEntryId: resumeEntryId(target.section, target.entry, target.index),
    targetLabel: labelForEntry(target.section, target.entry),
    topic: topic?.label,
    instruction,
    preserveUnrelatedContent: true,
    maxBullets,
    operation,
  }
}

function targetAliases(intent: ResumeEditIntent, resume: GeneratedResume): string[] {
  const target = allEntries(resume).find(item => resumeEntryId(item.section, item.entry, item.index) === intent.targetEntryId)
  if (!target) return []
  const value = target.entry as { company?: string; title?: string; name?: string; organization?: string; role?: string }
  return [value.company, value.title, value.name, value.organization, value.role].filter((item): item is string => Boolean(item && item.length >= 2))
}

export function resolveEditEvidence(intent: ResumeEditIntent, resume: GeneratedResume, factBank: FactBank): ResolvedEditEvidence {
  if (intent.operation === 'remove_bullet' || intent.operation === 'remove_entry' || intent.type === 'compress' || intent.type === 'reorder') return { ids: [], statements: [] }
  const concept = CONCEPTS.find(item => item.label === intent.topic)
  if (!concept) return { ids: [], statements: [] }
  const aliases = targetAliases(intent, resume)
  const conversationFacts = factBank.conversationFacts || []
  const groups = new Map<string, ConversationFact[]>()
  conversationFacts.forEach(fact => {
    const key = fact.source.messageId || fact.id
    groups.set(key, [...(groups.get(key) || []), fact])
  })
  const matchingConversation = conversationFacts.filter(fact => {
    if (!includesAlias(fact.statement, concept.aliases)) return false
    const group = groups.get(fact.source.messageId || fact.id) || [fact]
    const groupText = group.map(item => item.statement).join(' ')
    return aliases.length === 0 || aliases.some(alias => compact(groupText).includes(compact(alias))) || /esg/i.test(intent.instruction) && /esg|报告|问卷|台账/i.test(groupText)
  })
  if (matchingConversation.length) return { ids: matchingConversation.map(item => item.id), statements: matchingConversation.map(item => item.statement) }

  const sourceId = intent.targetEntryId.replace(/^conversation-project-/, '')
  const sourceText = intent.targetSection === 'experience'
    ? factBank.experiences.find(item => item.id === sourceId)?.versions.flatMap(version => version.bullets).join(' ')
    : intent.targetSection === 'project'
      ? factBank.projects?.find(item => item.id === sourceId)?.bullets.join(' ')
      : factBank.campusExperiences?.find(item => item.id === sourceId)?.bullets.join(' ')
  return sourceText && includesAlias(sourceText, concept.aliases) ? { ids: [sourceId], statements: [sourceText] } : { ids: [], statements: [] }
}

function cloneResume(resume: GeneratedResume): GeneratedResume {
  return JSON.parse(JSON.stringify(resume)) as GeneratedResume
}

function bulletMatchesTopic(text: string, topic?: string): boolean {
  const concept = CONCEPTS.find(item => item.label === topic)
  return concept ? includesAlias(text, concept.aliases) : false
}

function preferredEvidenceBullet(evidence: ResolvedEditEvidence): string {
  return evidence.statements.sort((a, b) => Number(/excel|台账/i.test(b)) - Number(/excel|台账/i.test(a)) || b.length - a.length)[0]?.trim().replace(/^[•·\-]\s*/, '') || ''
}

export function applyResumeEditPatch(
  before: GeneratedResume,
  intent: ResumeEditIntent,
  evidence: ResolvedEditEvidence,
): { resume: GeneratedResume; protectedBulletTexts: string[] } {
  const next = cloneResume(before)
  const protectedBulletTexts: string[] = []
  const locate = () => {
    if (intent.targetSection === 'experience') return next.experiences.find(item => resumeEntryId('experience', item) === intent.targetEntryId)
    if (intent.targetSection === 'project') return (next.projects || []).find(item => resumeEntryId('project', item) === intent.targetEntryId)
    return (next.campusExperiences || []).find(item => resumeEntryId('campus', item) === intent.targetEntryId)
  }

  if (intent.operation === 'remove_entry') {
    if (intent.targetSection === 'experience') next.experiences = next.experiences.filter(item => resumeEntryId('experience', item) !== intent.targetEntryId)
    if (intent.targetSection === 'project') next.projects = (next.projects || []).filter(item => resumeEntryId('project', item) !== intent.targetEntryId)
    if (intent.targetSection === 'campus') next.campusExperiences = (next.campusExperiences || []).filter(item => resumeEntryId('campus', item) !== intent.targetEntryId)
    next.bulletEvidence = (next.bulletEvidence || []).filter(item => item.itemId !== intent.targetEntryId)
    return { resume: next, protectedBulletTexts }
  }

  const target = locate()
  if (!target) return { resume: next, protectedBulletTexts }
  const originalBullets = [...target.bullets]
  if (intent.operation === 'remove_bullet') {
    target.bullets = target.bullets.filter(item => !bulletMatchesTopic(item, intent.topic))
  } else if (intent.type === 'compress') {
    const limit = intent.maxBullets || Math.max(1, target.bullets.length - 1)
    const protectedExisting = target.bullets.filter(item => bulletMatchesTopic(item, intent.topic))
    target.bullets = [...protectedExisting, ...target.bullets.filter(item => !protectedExisting.includes(item))].slice(0, limit)
    protectedBulletTexts.push(...protectedExisting)
  } else if (intent.type === 'reorder') {
    target.bullets = [...target.bullets].reverse()
  } else {
    const evidenceBullet = preferredEvidenceBullet(evidence)
    if (evidenceBullet && !target.bullets.some(item => bulletMatchesTopic(item, intent.topic))) target.bullets.push(evidenceBullet)
    if (intent.type === 'emphasize' && intent.topic) target.bullets.sort((a, b) => Number(bulletMatchesTopic(b, intent.topic)) - Number(bulletMatchesTopic(a, intent.topic)))
    if (/减少技术细节/i.test(intent.instruction) && target.bullets.length > 1) {
      const nonTechnical = target.bullets.filter(item => !includesAlias(item, CONCEPTS.find(concept => concept.label === '技术细节')!.aliases) || bulletMatchesTopic(item, intent.topic))
      if (nonTechnical.length) target.bullets = nonTechnical
    }
    if (evidenceBullet) protectedBulletTexts.push(evidenceBullet)
  }

  const itemId = intent.targetSection === 'experience'
    ? (target as { sourceFactId?: string; id?: string }).sourceFactId || intent.targetEntryId
    : (target as { id: string }).id
  const existingEvidence = (next.bulletEvidence || []).filter(item => !(item.section === intent.targetSection && item.itemId === itemId))
  const previousEvidence = before.bulletEvidence || []
  const rebuilt: ResumeBullet[] = target.bullets.map((text, bulletIndex) => {
    const previous = previousEvidence.find(item => item.section === intent.targetSection && item.itemId === itemId && item.text === text)
    return previous ? { ...previous, bulletIndex } : {
      id: `edit-${intent.targetEntryId}-${bulletIndex}-${compact(text).slice(0, 18)}`,
      section: intent.targetSection,
      itemId,
      bulletIndex,
      text,
      sourceFactIds: evidence.ids,
      matchedRequirementIds: [],
      rewriteReason: '用户本轮明确要求，基于已确认 Evidence 写入目标经历',
    }
  })
  next.bulletEvidence = [...existingEvidence, ...rebuilt]
  if (originalBullets.join('\n') === target.bullets.join('\n')) protectedBulletTexts.length = 0
  return { resume: next, protectedBulletTexts }
}

function findTarget(resume: GeneratedResume, intent: ResumeEditIntent) {
  return allEntries(resume).find(item => resumeEntryId(item.section, item.entry, item.index) === intent.targetEntryId)
}

export function verifyResumeEditResult(args: {
  before: GeneratedResume
  after: GeneratedResume
  intent: ResumeEditIntent
  evidence: ResolvedEditEvidence
}): ResumeEditVerification {
  const failures: string[] = []
  const target = findTarget(args.after, args.intent)
  if (args.intent.operation === 'remove_entry') {
    if (target) failures.push('targetEntry still exists')
    return { success: failures.length === 0, failures }
  }
  if (!target) return { success: false, failures: ['targetEntry missing after compose'] }
  const targetText = entryText(target.section, target.entry)
  if (args.intent.operation === 'remove_bullet') {
    if (bulletMatchesTopic(targetText, args.intent.topic)) failures.push(`mustExcludeConcept: ${args.intent.topic} still present`)
  } else if (args.intent.topic && !bulletMatchesTopic(targetText, args.intent.topic)) {
    failures.push(`mustIncludeConcept: ${args.intent.topic} missing`)
  }
  if (args.intent.maxBullets && (target.entry as { bullets: string[] }).bullets.length !== args.intent.maxBullets) failures.push(`expected ${args.intent.maxBullets} bullets`)
  if (['add', 'expand', 'rewrite', 'emphasize'].includes(args.intent.type) && args.intent.topic) {
    if (!args.evidence.ids.length) failures.push('requested concept has no resolved Evidence')
    const itemId = args.intent.targetSection === 'experience'
      ? (target.entry as { sourceFactId?: string }).sourceFactId || args.intent.targetEntryId
      : args.intent.targetEntryId
    const supported = (args.after.bulletEvidence || []).some(item => item.section === args.intent.targetSection && item.itemId === itemId && item.sourceFactIds.some(id => args.evidence.ids.includes(id)) && bulletMatchesTopic(item.text, args.intent.topic))
    if (!supported) failures.push('requested content is missing Evidence refs')
  }
  if (args.intent.type === 'add') {
    const beforeTarget = findTarget(args.before, args.intent)
    const beforeText = beforeTarget ? entryText(beforeTarget.section, beforeTarget.entry) : ''
    for (const concept of CONCEPTS.filter(item => item.label !== args.intent.topic && includesAlias(beforeText, item.aliases))) {
      if (!includesAlias(targetText, concept.aliases)) failures.push(`mustPreserveConcept: ${concept.label} missing`)
    }
  }
  return { success: failures.length === 0, failures }
}

function entriesById(resume: GeneratedResume): Map<string, { label: string; bullets: string[] }> {
  return new Map(allEntries(resume).map(item => [resumeEntryId(item.section, item.entry, item.index), { label: labelForEntry(item.section, item.entry), bullets: [...(item.entry as { bullets: string[] }).bullets] }]))
}

export function buildResumeChangeSummary(before: GeneratedResume, after: GeneratedResume): ResumeChangeSummary {
  const previous = entriesById(before)
  const current = entriesById(after)
  const changedEntries: string[] = []
  const addedBullets: string[] = []
  const removedBullets: string[] = []
  for (const [id, entry] of current) {
    const old = previous.get(id)
    if (!old) {
      changedEntries.push(entry.label)
      addedBullets.push(...entry.bullets)
      continue
    }
    const added = entry.bullets.filter(item => !old.bullets.includes(item))
    const removed = old.bullets.filter(item => !entry.bullets.includes(item))
    if (added.length || removed.length) changedEntries.push(entry.label)
    addedBullets.push(...added)
    removedBullets.push(...removed)
  }
  for (const [id, entry] of previous) {
    if (!current.has(id)) {
      changedEntries.push(entry.label)
      removedBullets.push(...entry.bullets)
    }
  }
  const rewrittenBullets = addedBullets.length === removedBullets.length && addedBullets.length > 0 ? addedBullets : []
  return {
    changedEntries: [...new Set(changedEntries)],
    addedBullets,
    removedBullets,
    rewrittenBullets,
    unchangedUnrelatedEntries: changedEntries.length <= 1,
  }
}

export function changeSummaryLines(summary: ResumeChangeSummary, intent?: ResumeEditIntent): string[] {
  const lines: string[] = []
  const primaryEntry = intent && summary.changedEntries.length
    ? summary.changedEntries.find(label => compact(label).includes(compact(intent.targetLabel)) || compact(intent.targetLabel).includes(compact(label))) || intent.targetLabel
    : summary.changedEntries[0]
  if (primaryEntry) lines.push(`已更新「${primaryEntry}」`)
  if (summary.addedBullets[0]) lines.push(`新增：${summary.addedBullets[0]}`)
  if (summary.removedBullets[0] && !summary.addedBullets.length) lines.push(`删除：${summary.removedBullets[0]}`)
  if (summary.unchangedUnrelatedEntries && intent?.preserveUnrelatedContent) lines.push('其他经历未调整')
  else if (summary.changedEntries.length > 1) lines.push(`为保持一页，同时调整了 ${summary.changedEntries.slice(1).join('、')}`)
  return lines.slice(0, 4)
}
