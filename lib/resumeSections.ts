import type { GeneratedResume, ResumeDisplaySection } from './types'

export const DEFAULT_RESUME_SECTION_ORDER: ResumeDisplaySection[] = [
  'education',
  'experience',
  'projects',
  'campus',
  'awards',
  'skills',
]

export const RESUME_SECTION_LABELS: Record<ResumeDisplaySection, string> = {
  education: '教育经历',
  experience: '实习经历',
  projects: '项目经历',
  campus: '校园经历',
  awards: '获奖荣誉',
  skills: '技能',
}

const SECTION_ALIASES: Record<ResumeDisplaySection, RegExp> = {
  education: /教育(?:经历|背景)?|学历/gi,
  experience: /实习(?:经历)?|工作经历/gi,
  projects: /项目(?:经历)?/gi,
  campus: /校园(?:经历)?|社团经历/gi,
  awards: /获奖荣誉|奖项|荣誉/gi,
  skills: /技能(?:清单|模块)?|专业能力/gi,
}

export interface ResumeSectionReorderIntent {
  targetSection: ResumeDisplaySection
  referenceSection?: ResumeDisplaySection
  placement: 'before' | 'after' | 'first' | 'last'
  instruction: string
}

export function normalizeResumeSectionOrder(value: unknown): ResumeDisplaySection[] {
  const valid = new Set<ResumeDisplaySection>(DEFAULT_RESUME_SECTION_ORDER)
  const supplied = Array.isArray(value)
    ? value.filter((item): item is ResumeDisplaySection => typeof item === 'string' && valid.has(item as ResumeDisplaySection))
    : []
  return [...new Set([...supplied, ...DEFAULT_RESUME_SECTION_ORDER])]
}

export function resolveSectionReorderIntent(instruction: string): ResumeSectionReorderIntent | null {
  if (/(不要|不需要|别|不应该).{0,12}(放到|放在|移到|挪到|调到|移动到|置于|置顶)/i.test(instruction)) return null
  if (!/(放到|放在|移到|挪到|调到|移动到|置于|顺序|置顶|最前|最后)/i.test(instruction)) return null

  const mentions = (Object.entries(SECTION_ALIASES) as Array<[ResumeDisplaySection, RegExp]>).flatMap(([section, pattern]) => {
    pattern.lastIndex = 0
    return [...instruction.matchAll(pattern)].map(match => ({ section, index: match.index ?? Number.MAX_SAFE_INTEGER }))
  }).sort((a, b) => a.index - b.index)
  const uniqueMentions = mentions.filter((mention, index) => mentions.findIndex(item => item.section === mention.section) === index)
  if (!uniqueMentions.length) return null

  const targetSection = uniqueMentions[0].section
  if (/置顶|最前面|最前方|放到最前/i.test(instruction)) {
    return { targetSection, placement: 'first', instruction }
  }
  if (/最后面|最后方|放到最后|置底/i.test(instruction)) {
    return { targetSection, placement: 'last', instruction }
  }
  const referenceSection = uniqueMentions.find(item => item.section !== targetSection)?.section
  if (!referenceSection) return null
  const placement = /(之前|前面|前方|前边)/i.test(instruction)
    ? 'before'
    : /(之后|后面|后方|后边)/i.test(instruction) ? 'after' : null
  return placement ? { targetSection, referenceSection, placement, instruction } : null
}

export function applySectionReorder(resume: GeneratedResume, intent: ResumeSectionReorderIntent): GeneratedResume {
  const order = normalizeResumeSectionOrder(resume.sectionOrder).filter(section => section !== intent.targetSection)
  if (intent.placement === 'first') order.unshift(intent.targetSection)
  else if (intent.placement === 'last') order.push(intent.targetSection)
  else {
    const referenceIndex = order.indexOf(intent.referenceSection!)
    const insertionIndex = intent.placement === 'before' ? referenceIndex : referenceIndex + 1
    order.splice(Math.max(0, insertionIndex), 0, intent.targetSection)
  }
  return { ...resume, sectionOrder: order }
}

export function verifySectionReorder(resume: GeneratedResume, intent: ResumeSectionReorderIntent): boolean {
  const order = normalizeResumeSectionOrder(resume.sectionOrder)
  const targetIndex = order.indexOf(intent.targetSection)
  if (intent.placement === 'first') return targetIndex === 0
  if (intent.placement === 'last') return targetIndex === order.length - 1
  const referenceIndex = order.indexOf(intent.referenceSection!)
  return intent.placement === 'before' ? targetIndex < referenceIndex : targetIndex > referenceIndex
}

export function sectionReorderSummary(intent: ResumeSectionReorderIntent): string {
  const target = RESUME_SECTION_LABELS[intent.targetSection]
  if (intent.placement === 'first') return `已将「${target}」移动到简历最前面。其他内容未修改。`
  if (intent.placement === 'last') return `已将「${target}」移动到简历最后面。其他内容未修改。`
  const reference = RESUME_SECTION_LABELS[intent.referenceSection!]
  return `已将「${target}」移动到「${reference}」${intent.placement === 'before' ? '之前' : '之后'}。其他内容未修改。`
}
