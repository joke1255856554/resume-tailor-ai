import 'server-only'
import { randomUUID } from 'node:crypto'
import type { Thread } from '@openai/codex-sdk'
import type {
  FactBank,
  FactMatch,
  GeneratedResume,
  JDReport,
  JDRequirement,
  ResumeBullet,
  ResumeAssistantMessage,
  ResumeAgentActivity,
  ResumeStrategy,
  SkillGroup,
} from '../types'
import { normalizeFactBank, normalizeResume } from '../normalize'
import {
  buildDeterministicFactMatches,
  containsBlockedFact,
  detectRequirementGaps,
  flattenFactBank,
  preservesSourceEntities,
} from '../factEvidence'
import {
  CN_CAMPUS_ONE_PAGE_BUDGET,
  CN_CAMPUS_UNDERFILLED_THRESHOLD,
  enrichUnderfilledResume,
  chooseRelevantFacts,
  estimateResumeCost,
  trimComposedResume,
} from '../resumeComposer'
import {
  applyResumeEditPatch,
  buildResumeChangeSummary,
  changeSummaryLines,
  resolveEditEvidence,
  resolveResumeEditIntent,
  verifyResumeEditResult,
} from '../resumeEditing'
import {
  applySectionReorder,
  resolveSectionReorderIntent,
  sectionReorderSummary,
  verifySectionReorder,
} from '../resumeSections'
import { createResumeThread } from './codexClient'
import { buildResumeAgentTurnPrompt } from './resumeAgentPrompt'
import { CODEX_RESUME_OUTPUT_SCHEMA, parseCodexResumeOutput, type CodexResumeAgentOutput, type CodexResumeDraft } from './schemas'
import { syncResumeWorkspace } from './workspace'
import {
  GenerationError,
  classifyGenerationError,
  type GenerationStage,
} from '../generationDiagnostics'

export type CodexResumeSafeEvent =
  | { type: 'status'; stage: 'reading_jd' | 'scanning_facts' | 'matching_role' | 'selecting_evidence' | 'structuring_resume' | 'validating_facts' | 'optimizing_page'; message: string }
  | { type: 'thread'; threadId: string }
  | { type: 'summary'; adopted: string[]; excluded: Array<{ label: string; reason: string }> }
  | { type: 'strategy'; strategy: ResumeStrategy }
  | { type: 'activity'; activity: ResumeAgentActivity }

export interface CodexResumeRunResult {
  threadId: string
  action: CodexResumeAgentOutput['action']
  assistantMessage: string
  factCandidates: Array<{
    id: string
    statement: string
    category: CodexResumeAgentOutput['factCandidates'][number]['category']
    candidateType: CodexResumeAgentOutput['factCandidates'][number]['candidateType']
    rationale: string
  }>
  resume: GeneratedResume | null
  changeSummary: string[]
  layoutAdjustment: 'none' | 'overBudget' | 'underFilled'
}

const BANNED_CONTEXT_PHRASES = ['除上述经历外', '其他相关内容', '涉及一些', '等等相关内容', '等相关内容', '深度参与', '全面赋能', '形成闭环', '项目旨在', '项目背景是', '项目背景为']
const OFFICE_TERMS = /\b(word|ppt|powerpoint)\b|文档编辑|演示文稿/i
const PRACTICE_TERMS = /项目|实践|作品|调研|设计|开发|策划|创作|运营|视频|图像|图片|内容|比赛|研究/i

function compact(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '').replace(/[，。；、：:（）()\[\]【】/|_-]/g, '')
}

function categoryFor(text: string): JDRequirement['category'] {
  if (/aigc|ai|即梦|生成式|人工智能/i.test(text)) return 'aigc'
  if (/视频|剪辑|分镜|字幕|调色/.test(text)) return 'video'
  if (/文案|写作|脚本|内容/.test(text)) return 'copywriting'
  if (/视觉|图片|图像|设计/.test(text)) return 'visual'
  if (/数据|复盘|分析/.test(text)) return 'data'
  if (/沟通|协作|团队/.test(text)) return 'collaboration'
  if (/品牌|传播/.test(text)) return 'brand'
  return 'other'
}

function buildRequirements(jobDescription: string, currentResume: GeneratedResume | null): JDRequirement[] {
  if (currentResume?.requirements?.length) return currentResume.requirements
  const sentences = jobDescription.split(/[。；;\n]/).map(item => item.trim()).filter(item => item.length >= 5).slice(0, 12)
  return sentences.map((sentence, index) => ({
    id: `codex-requirement-${index + 1}`,
    category: categoryFor(sentence),
    requirement: sentence.slice(0, 90),
    importance: /加分|优先/.test(sentence) ? 'bonus' : index < 4 ? 'core' : 'important',
    keywords: [...new Set(sentence.split(/[，、\s]/).map(item => item.trim()).filter(item => item.length >= 2))].slice(0, 8),
  }))
}

function buildAgentSummary(factBank: FactBank, requirements: JDRequirement[]) {
  const matches = buildDeterministicFactMatches(factBank, requirements)
  const selection = chooseRelevantFacts(factBank, requirements, matches)
  const selectedIds = new Set([
    ...selection.experienceIds,
    ...selection.projectIds,
    ...selection.campusIds,
    ...selection.awardIds,
    ...selection.skillIds,
    ...selection.certificateIds,
    ...selection.conversationFactIds,
  ])
  const facts = flattenFactBank(factBank)
  const score = (id: string) => matches.find(item => item.factId === id)?.relevanceScore || 0
  const adopted = facts
    .filter(item => selectedIds.has(item.id))
    .filter(item => score(item.id) >= 18 || (item.type === 'experience' && selection.experienceIds.includes(item.id)))
    .sort((a, b) => score(b.id) - score(a.id))
    .slice(0, 4)
    .map(item => item.label)
  const excluded = selection.excludedFacts
    .filter(item => !selectedIds.has(item.factId))
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 3)
    .map(item => ({ label: item.label, reason: item.reason }))
  return { adopted, excluded }
}

function buildResumeStrategy(factBank: FactBank, requirements: JDRequirement[], role: string, sessionEvidence: FactBank['conversationFacts'] = []): ResumeStrategy {
  const matches = buildDeterministicFactMatches(factBank, requirements)
  const summary = buildAgentSummary(factBank, requirements)
  const strongest = matches.filter(item => item.relevanceScore >= 18).sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 4)
  const currentEvidence = (sessionEvidence || []).slice(-2).reverse().map(item => item.statement)
  const coreStrengths = [...new Set([...currentEvidence, ...strongest.map(item => item.label)])].slice(0, 4)
  const targetJob = role.trim() || requirements[0]?.requirement.slice(0, 28) || '目标岗位'
  const personaFocus = requirements.some(item => item.category === 'aigc') ? 'AI 应用与产品实践' : requirements.some(item => item.category === 'data') ? '调研与数据分析' : '岗位相关项目与执行能力'
  return {
    persona: `${targetJob}候选人，突出${personaFocus}`,
    targetJob,
    coreStrengths,
    structureStrategy: '教育 15% · 实习 25% · 项目 40% · 技能 10% · 其他 10%；核心证据前置，弱相关内容压缩或舍弃。',
    adopted: [...currentEvidence.map(label => ({ label, reason: '来自用户当前消息，优先进入本次版本' })), ...summary.adopted.filter(label => !currentEvidence.includes(label)).map(label => ({ label, reason: '与岗位核心能力存在明确事实匹配' }))].slice(0, 5),
    excluded: summary.excluded,
  }
}

function buildRoleSkillGroups(factBank: FactBank, requirements: JDRequirement[], selected: SkillGroup[]): SkillGroup[] {
  const corpus = flattenFactBank(factBank).map(item => item.text).join(' ')
  const roleText = requirements.map(item => `${item.requirement} ${item.keywords.join(' ')}`).join(' ')
  const extract = (values: string[]) => values.filter(value => new RegExp(value.replace(/[.+]/g, '\\$&'), 'i').test(corpus))
  const definitions = [
    { id: 'auto-skill-ai', label: 'AI工具', relevant: /ai|aigc|agent|生成式|智能体/i.test(roleText), values: ['Codex', 'Claude Code', 'Qwen Agent', 'Cursor', 'ChatGPT', 'DeepSeek', '即梦'] },
    { id: 'auto-skill-development', label: '开发能力', relevant: /开发|前端|工程|技术|部署|agent|ai/i.test(roleText), values: ['Next.js', 'React', 'TypeScript', 'JavaScript', 'Python', 'Git', 'API', 'Cloudflare', 'Vercel'] },
    { id: 'auto-skill-product', label: '产品能力', relevant: /产品|需求|用户|运营|迭代|调研|竞品/i.test(roleText), values: ['产品设计', '需求分析', '用户流程设计', 'PRD', '用户调研', '竞品分析', '原型', '系统测试', '持续迭代'] },
    { id: 'auto-skill-design', label: '设计能力', relevant: /设计|视觉|图像|视频|创意/i.test(roleText), values: ['Photoshop', 'Illustrator', 'InDesign', 'Figma', 'Rhino', 'SketchUp', '即梦'] },
  ]
  const generated = definitions.flatMap(group => {
    const items = extract(group.values)
    return group.relevant && items.length ? [{ id: group.id, label: group.label, items }] : []
  })
  const labels = new Set(generated.map(item => compact(item.label)))
  return [...generated, ...selected.filter(item => !labels.has(compact(item.label)))]
}

function normalizeCandidates(candidates: CodexResumeAgentOutput['factCandidates'], userMessage: string) {
  const tools = ['Codex', 'Claude Code', 'Qwen Agent', 'Cursor']
    .filter(tool => userMessage.toLowerCase().includes(tool.toLowerCase()))
  const hasToolPractice = tools.length > 0 && /(做过|用过|使用|实践|开发|搭建|完成)/i.test(userMessage)
  const hasJimengVideo = /即梦/.test(userMessage) && /视频/.test(userMessage)
  const toolPattern = /codex|claude\s*code|qwen\s*agent|cursor/i
  const normalized = candidates.filter(candidate => {
    if (candidate.candidateType === 'gap' && toolPattern.test(candidate.statement)) return false
    if (hasToolPractice && candidate.candidateType === 'evidence' && toolPattern.test(candidate.statement)) return false
    if (hasJimengVideo && candidate.candidateType === 'evidence' && /即梦|视频/.test(candidate.statement)) return false
    return candidate.statement.trim()
  })
  if (hasToolPractice) normalized.unshift({
    statement: `使用 AI Coding 工具开展实践（${tools.join('、')}）`,
    category: 'aigc',
    candidateType: 'evidence',
    rationale: '这是你在聊天中明确描述的 AI Coding 实践，可作为岗位相关证据。',
  })
  if (hasJimengVideo) normalized.push({
    statement: '使用即梦进行 AI 视频创作实践',
    category: 'video',
    candidateType: 'evidence',
    rationale: '这是你在聊天中明确描述的 AIGC 视频实践。',
  })
  const seen = new Set<string>()
  return normalized.filter(candidate => {
    const key = `${candidate.candidateType}:${compact(candidate.statement)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 4)
}

function sourceTextForFact(factBank: FactBank, factId: string): string {
  return flattenFactBank(factBank).find(item => item.id === factId)?.text || ''
}

function safeBullet(text: string, sourceText: string, factBank: FactBank): string | null {
  const bullet = text.trim().replace(/^[•·\-]\s*/, '')
  if (!bullet || bullet.length > 150) return null
  if (BANNED_CONTEXT_PHRASES.some(phrase => bullet.includes(phrase))) return null
  if (containsBlockedFact(bullet, factBank.factConstraints)) return null
  if (!preservesSourceEntities(bullet, sourceText)) return null
  return bullet
}

function safeBullets(values: string[], sourceText: string, factBank: FactBank, limit = 4): string[] {
  return [...new Set(values.map(item => safeBullet(item, sourceText, factBank)).filter((item): item is string => Boolean(item)))].slice(0, limit)
}

function buildJDReport(company: string, role: string, requirements: JDRequirement[], gaps: ReturnType<typeof detectRequirementGaps>): JDReport {
  const haveIds = new Set(gaps.filter(gap => gap.status !== 'missing').map(gap => gap.requirementId))
  const alreadyHave = requirements.filter(item => haveIds.has(item.id)).map(item => item.requirement)
  const needToAdd = requirements.filter(item => !haveIds.has(item.id)).map(item => item.requirement)
  return {
    role,
    company,
    titleKeywords: requirements.filter(item => item.importance === 'core').map(item => item.requirement).slice(0, 5),
    hardSkills: requirements.filter(item => ['aigc', 'video', 'visual', 'data'].includes(item.category)).map(item => item.requirement).slice(0, 6),
    actionKeywords: [],
    businessContext: requirements.filter(item => ['brand', 'content_creation', 'copywriting'].includes(item.category)).map(item => item.requirement).slice(0, 5),
    domainKeywords: [],
    hardFilters: [],
    top10: requirements.map(item => item.requirement).slice(0, 10),
    alreadyHave,
    needToAdd,
  }
}

function buildCoverage(requirements: JDRequirement[], gaps: ReturnType<typeof detectRequirementGaps>, currentResume: GeneratedResume | null) {
  const covered = requirements.filter(requirement => gaps.find(gap => gap.requirementId === requirement.id)?.status !== 'missing').map(item => item.requirement)
  const missing = requirements.filter(requirement => !covered.includes(requirement.requirement)).map(item => item.requirement)
  const score = requirements.length ? Math.round((covered.length / requirements.length) * 100) : 0
  return {
    covered,
    missing,
    beforeCovered: currentResume?.jdKeywordCoverage.covered || [],
    beforeMissing: currentResume?.jdKeywordCoverage.missing || [],
    hardSkillsMissing: missing.slice(0, 3),
    score,
    beforeScore: currentResume?.jdKeywordCoverage.score || 0,
  }
}

function buildGeneratedResume(args: {
  draft: CodexResumeDraft
  factBank: FactBank
  jobDescription: string
  company: string
  role: string
  currentResume: GeneratedResume | null
}): { resume: GeneratedResume; rawCost: number; matches: FactMatch[] } {
  const factBank = normalizeFactBank(args.factBank)
  const requirements = buildRequirements(args.jobDescription, args.currentResume)
  const matches = buildDeterministicFactMatches(factBank, requirements)
  const gaps = detectRequirementGaps(requirements, matches)
  const bulletEvidence: ResumeBullet[] = []

  const education = args.draft.education.flatMap(item => {
    const source = factBank.education.find(entry => entry.id === item.sourceFactId)
    return source ? [{ ...source }] : []
  })

  const experiences = args.draft.experiences.flatMap(item => {
    const source = factBank.experiences.find(entry => entry.id === item.sourceFactId)
    if (!source) return []
    const sourceText = sourceTextForFact(factBank, source.id)
    const bullets = safeBullets(item.bullets, sourceText, factBank)
    if (!bullets.length) return []
    const sourceTitles = source.versions.map(version => version.title).filter(Boolean)
    const title = sourceTitles.some(value => compact(value) === compact(item.title)) ? item.title : sourceTitles[0] || item.title
    bullets.forEach((text, bulletIndex) => bulletEvidence.push({ id: randomUUID(), section: 'experience', itemId: source.id, bulletIndex, text, sourceFactIds: [source.id], matchedRequirementIds: matches.find(match => match.factId === source.id)?.requirementIds || [], rewriteReason: 'Codex 基于已确认经历按岗位相关性重写' }))
    return [{ id: source.id, sourceFactId: source.id, company: source.company, title, location: source.location, startDate: source.startDate, endDate: source.endDate, bullets }]
  }).sort((a, b) => relevanceScore(matches, b.sourceFactId || '') - relevanceScore(matches, a.sourceFactId || ''))

  const projects = args.draft.projects.flatMap(item => {
    const sourceIds = [...new Set(item.sourceFactIds)].filter(id => sourceTextForFact(factBank, id))
    if (!sourceIds.length) return []
    const sourceText = sourceIds.map(id => sourceTextForFact(factBank, id)).join(' ')
    const bullets = safeBullets(item.bullets, sourceText, factBank, 3)
    const combined = [item.name, item.role, ...bullets].join(' ')
    if (!bullets.length || (OFFICE_TERMS.test(combined) && !PRACTICE_TERMS.test(combined.replace(OFFICE_TERMS, '')))) return []
    const original = factBank.projects?.find(project => project.id === item.id)
    const projectId = original?.id || `conversation-project-${sourceIds[0]}`
    const name = original?.name || item.name.trim() || '个人实践'
    const role = original?.role || item.role.trim() || '个人实践'
    bullets.forEach((text, bulletIndex) => bulletEvidence.push({ id: randomUUID(), section: 'project', itemId: projectId, bulletIndex, text, sourceFactIds: sourceIds, matchedRequirementIds: [...new Set(sourceIds.flatMap(id => matches.find(match => match.factId === id)?.requirementIds || []))], rewriteReason: 'Codex 仅使用已确认事实组织项目表达' }))
    return [{ id: projectId, name, role, startDate: original?.startDate || item.startDate, endDate: original?.endDate || item.endDate, bullets, link: original?.link }]
  }).sort((a, b) => {
    const evidenceScore = (projectId: string) => Math.max(0, ...bulletEvidence.filter(item => item.section === 'project' && item.itemId === projectId).flatMap(item => item.sourceFactIds).map(id => relevanceScore(matches, id)))
    return evidenceScore(b.id) - evidenceScore(a.id)
  })

  const campusExperiences = args.draft.campusExperiences.flatMap(item => {
    const source = factBank.campusExperiences?.find(entry => entry.id === item.sourceFactId)
    if (!source) return []
    const bullets = safeBullets(item.bullets, sourceTextForFact(factBank, source.id), factBank, 3)
    if (!bullets.length) return []
    bullets.forEach((text, bulletIndex) => bulletEvidence.push({ id: randomUUID(), section: 'campus', itemId: source.id, bulletIndex, text, sourceFactIds: [source.id], matchedRequirementIds: matches.find(match => match.factId === source.id)?.requirementIds || [], rewriteReason: 'Codex 基于校园经历事实调整表达' }))
    return [{ ...source, bullets }]
  })

  const awards = args.draft.awardIds.flatMap(id => {
    const source = factBank.awards?.find(item => item.id === id)
    return source ? [{ ...source }] : []
  })
  const selectedSkillGroups = args.draft.skillGroupIds.flatMap(id => {
    const source = factBank.skillGroups?.find(item => item.id === id)
    return source ? [{ ...source, items: [...source.items] }] : []
  }).sort((a, b) => relevanceScore(matches, b.id) - relevanceScore(matches, a.id))
  const skillGroups = buildRoleSkillGroups(factBank, requirements, selectedSkillGroups)
  const certificates = args.draft.certificateIds.flatMap(id => {
    const source = factBank.certificates?.find(item => item.id === id)
    return source ? [{ ...source }] : []
  })
  const allowedLegacySkills = new Set(factBank.skills.map(compact))
  const skills = args.draft.skills.filter(item => allowedLegacySkills.has(compact(item))).slice(0, 6)

  const raw: GeneratedResume = {
    contact: factBank.contact,
    education,
    skills,
    experiences,
    projects,
    skillGroups,
    awards,
    campusExperiences,
    certificates,
    requirements,
    factMatches: matches,
    requirementGaps: gaps,
    bulletEvidence,
    polishStyle: 'standard',
    jdKeywordCoverage: buildCoverage(requirements, gaps, args.currentResume),
    jdReport: buildJDReport(args.company, args.role, requirements, gaps),
  }
  const normalized = normalizeResume(raw)
  if (!normalized) throw new Error('Codex Resume Draft 无法规范化。')
  const composed = enrichUnderfilledResume(trimComposedResume(normalized, matches), factBank, matches)
  const rawCost = estimateResumeCost(composed)
  return { resume: composed, rawCost, matches }
}

function relevanceScore(matches: FactMatch[], factId: string): number {
  return matches.find(match => match.factId === factId)?.relevanceScore || 0
}

/**
 * A sparse page is acceptable. This guard prevents an under-filled retry from
 * adding a clearly irrelevant fact merely to raise the visual cost.
 */
function keepRelevantUnderfillRevision(
  baseline: GeneratedResume,
  refined: GeneratedResume,
  matches: FactMatch[]
): GeneratedResume {
  const baselineProjects = new Set((baseline.projects || []).map(project => project.id))
  const baselineExperiences = new Set(baseline.experiences.map(experience => experience.sourceFactId || experience.company))
  const baselineCampus = new Set((baseline.campusExperiences || []).map(item => item.id))
  const baselineSkills = new Set((baseline.skillGroups || []).map(item => item.id))
  const evidenceFor = (itemId: string) => (refined.bulletEvidence || []).filter(item => item.itemId === itemId).flatMap(item => item.sourceFactIds)

  const projects = (refined.projects || []).filter(project => {
    if (baselineProjects.has(project.id)) return true
    const sources = evidenceFor(project.id)
    return sources.some(id => relevanceScore(matches, id) >= 20)
  })
  const experiences = refined.experiences.filter(experience => {
    const id = experience.sourceFactId || experience.company
    return baselineExperiences.has(id) || relevanceScore(matches, id) >= 18
  })
  const campusExperiences = (refined.campusExperiences || []).filter(item => baselineCampus.has(item.id) || relevanceScore(matches, item.id) >= 20)
  const skillGroups = (refined.skillGroups || []).filter(item => baselineSkills.has(item.id) || relevanceScore(matches, item.id) >= 20)
  const keptProjectIds = new Set(projects.map(item => item.id))
  const keptExperienceIds = new Set(experiences.map(item => item.sourceFactId || item.company))
  const keptCampusIds = new Set(campusExperiences.map(item => item.id))

  return trimComposedResume({
    ...refined,
    projects,
    experiences,
    campusExperiences,
    skillGroups,
    bulletEvidence: (refined.bulletEvidence || []).filter(item =>
      (item.section === 'project' && keptProjectIds.has(item.itemId))
      || (item.section === 'experience' && keptExperienceIds.has(item.itemId))
      || (item.section === 'campus' && keptCampusIds.has(item.itemId))
    ),
  }, matches)
}

async function executeStructuredTurn(
  thread: Thread,
  prompt: string,
  onEvent: (event: CodexResumeSafeEvent) => void,
  deadlineAt: number,
): Promise<string> {
  const maxTurnMs = Number(process.env.CODEX_RESUME_TIMEOUT_MS) || 180_000
  const runOnce = async (): Promise<string> => {
    const timeoutMs = Math.min(maxTurnMs, Math.max(1, deadlineAt - Date.now()))
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let finalResponse = ''
    let lastSdkError: Error | null = null
    try {
      const { events } = await thread.runStreamed(prompt, { outputSchema: CODEX_RESUME_OUTPUT_SCHEMA, signal: controller.signal })
      for await (const event of events) {
        if (event.type === 'thread.started') {
          onEvent({ type: 'thread', threadId: event.thread_id })
        } else if (event.type === 'item.completed') {
          if (event.item.type === 'agent_message') finalResponse = event.item.text
          else if (event.item.type === 'error') lastSdkError = new Error(event.item.message)
        } else if (event.type === 'turn.failed') {
          throw new Error(event.error.message)
        } else if (event.type === 'error') {
          lastSdkError = new Error(event.message)
          // Earlier reconnect notices may recover. "waiting for network" is the
          // SDK's terminal transport state and must not be hidden until timeout.
          if (/waiting for network/i.test(event.message)) throw lastSdkError
        }
      }
      if (!finalResponse) throw lastSdkError || new Error('Codex 没有返回最终结构化结果。')
      return finalResponse
    } catch (error) {
      if (controller.signal.aborted) {
        if (lastSdkError) {
          const transportError = classifyGenerationError(lastSdkError, 'agent-request')
          if (transportError.info.category === 'network') throw transportError
        }
        throw new GenerationError({
          stage: 'agent-request', category: 'timeout', message: `Codex agent request exceeded ${timeoutMs}ms.`, retryable: true,
        }, { cause: lastSdkError || error })
      }
      throw classifyGenerationError(error, 'agent-request')
    } finally {
      clearTimeout(timer)
    }
  }

  try {
    return await runOnce()
  } catch (error) {
    const classified = classifyGenerationError(error, 'agent-request')
    if (classified.info.category !== 'network' || Date.now() + 1_000 >= deadlineAt) throw classified
    await new Promise(resolve => setTimeout(resolve, 500))
    return runOnce()
  }
}

async function parseWithOneRepair(
  thread: Thread,
  raw: string,
  onEvent: (event: CodexResumeSafeEvent) => void,
  deadlineAt: number,
  runId: string,
): Promise<CodexResumeAgentOutput> {
  try {
    return parseCodexResumeOutput(raw)
  } catch (error) {
    const classified = classifyGenerationError(error, 'parse-output')
    if (!['parse', 'schema'].includes(classified.info.category) || Date.now() + 30_000 >= deadlineAt) throw classified
    if (process.env.NODE_ENV === 'development') console.warn('[ResumeGeneration]', { runId, stage: 'parse-output', category: classified.info.category, repairAttempt: 1, outputLength: raw.length })
    const repairedRaw = await executeStructuredTurn(
      thread,
      '上一次响应未通过结构化格式校验。请重新输出完整结果，严格符合提供的 JSON Schema；只输出结构化结果，不要解释、不要 Markdown 代码块，不要增加任何新事实。',
      onEvent,
      deadlineAt,
    )
    try {
      return parseCodexResumeOutput(repairedRaw)
    } catch (repairError) {
      throw classifyGenerationError(repairError, 'parse-output')
    }
  }
}

function errorDetails(error: unknown): string {
  const details: string[] = []
  const seen = new Set<unknown>()
  let current: unknown = error
  while (current && !seen.has(current)) {
    seen.add(current)
    if (current instanceof Error) {
      details.push(current.name, current.message)
      current = current.cause
      continue
    }
    if (typeof current === 'object') {
      const value = current as { code?: unknown; message?: unknown; cause?: unknown }
      if (typeof value.code === 'string') details.push(value.code)
      if (typeof value.message === 'string') details.push(value.message)
      current = value.cause
      continue
    }
    details.push(String(current))
    break
  }
  return details.join(' ').toLowerCase()
}

export function isRecoverableThreadError(error: unknown): boolean {
  const message = errorDetails(error)
  const missingContext = /not[ _-]?found|does not exist|unknown|invalid|expired|deleted|unable to (?:load|resume)|cannot (?:load|resume)|failed to resume|no rollout|missing rollout/.test(message)
  const threadContext = /thread|conversation|rollout|session/.test(message)
  return threadContext && missingContext
}

export async function runCodexResumeAgent(args: {
  runId: string
  sessionId: string
  threadId?: string | null
  factBank: FactBank
  jobDescription: string
  company: string
  role: string
  currentResume?: GeneratedResume | null
  userMessage: string
  mode: 'chat' | 'generate' | 'revise'
  clarificationBudgetExhausted?: boolean
  sessionEvidence?: FactBank['conversationFacts']
  messages?: ResumeAssistantMessage[]
  /** Internal guard: a missing Codex thread may be rebuilt only once per user request. */
  threadRecoveryAttempted?: boolean
  /** Internal run deadline shared by thread recovery. */
  deadlineAt?: number
  /** Development-only fault injection used by the reliability test matrix. */
  debugFault?: 'timeout' | 'malformed-output' | 'schema-output' | 'composer' | 'minimal-compose' | 'edit-verification' | 'edit-verification-hard'
  onEvent: (event: CodexResumeSafeEvent) => void
}): Promise<CodexResumeRunResult> {
  const deadlineAt = args.deadlineAt || Date.now() + 230_000
  let generationStage: GenerationStage = 'prepare-context'
  let currentActivity: ResumeAgentActivity['stage'] | null = null
  const activityStarted = new Map<ResumeAgentActivity['stage'], number>()
  const activityLabels: Record<ResumeAgentActivity['stage'], string> = {
    read_jd: '读取岗位 JD', extract_model: '提取岗位能力模型', scan_facts: '扫描经历库', build_matches: '建立岗位匹配关系',
    plan_structure: '规划简历结构', write_projects: '编写项目经历', validate_truth: '检查真实性', optimize_page: '优化一页布局',
  }
  const begin = (stage: ResumeAgentActivity['stage']) => {
    currentActivity = stage
    activityStarted.set(stage, Date.now())
    args.onEvent({ type: 'activity', activity: { stage, label: activityLabels[stage], state: 'active' } })
  }
  const finish = (stage: ResumeAgentActivity['stage'], result: string) => {
    args.onEvent({ type: 'activity', activity: { stage, label: activityLabels[stage], state: 'done', elapsedMs: Math.max(1, Date.now() - (activityStarted.get(stage) || Date.now())), result } })
  }
  const failActivity = () => {
    if (!currentActivity) return
    args.onEvent({ type: 'activity', activity: {
      stage: currentActivity,
      label: activityLabels[currentActivity],
      state: 'failed',
      elapsedMs: Math.max(1, Date.now() - (activityStarted.get(currentActivity) || Date.now())),
      result: '此步骤未完成，可重新尝试',
    } })
  }

  try {
  begin('read_jd')
  args.onEvent({ type: 'status', stage: 'reading_jd', message: '读取岗位 JD' })
  const currentResume = normalizeResume(args.currentResume)
  finish('read_jd', `已读取 ${args.jobDescription.trim().length} 字岗位信息`)

  begin('extract_model')
  const requirements = buildRequirements(args.jobDescription, currentResume)
  finish('extract_model', `提取 ${requirements.length} 项岗位能力要求`)

  begin('scan_facts')
  const factBank = normalizeFactBank({
    ...args.factBank,
    conversationFacts: [...(args.factBank.conversationFacts || []), ...(args.sessionEvidence || [])],
  })
  generationStage = 'prepare-context'
  const workspace = await syncResumeWorkspace({ ...args, factBank: args.factBank, currentResume, latestInstruction: args.userMessage })
  args.onEvent({ type: 'status', stage: 'scanning_facts', message: '扫描经历库' })
  finish('scan_facts', `读取 ${flattenFactBank(factBank).length} 条事实与会话证据`)

  begin('build_matches')
  const strategy = buildResumeStrategy(factBank, requirements, args.role, args.sessionEvidence)
  args.onEvent({ type: 'strategy', strategy })
  finish('build_matches', `确认 ${strategy.adopted.length} 条核心素材，舍弃 ${strategy.excluded.length} 条弱相关素材`)
  if (args.mode === 'generate' || args.mode === 'revise') {
    args.onEvent({ type: 'summary', ...buildAgentSummary(factBank, requirements) })
  }

  const sectionReorderIntent = args.mode === 'revise' && currentResume
    ? resolveSectionReorderIntent(args.userMessage)
    : null
  if (sectionReorderIntent && currentResume) {
    begin('plan_structure')
    finish('plan_structure', `已定位「${sectionReorderIntent.targetSection}」模块顺序，本轮不改写简历内容`)
    begin('write_projects')
    const editedResume = applySectionReorder(currentResume, sectionReorderIntent)
    const orderChanged = (currentResume.sectionOrder || []).join('|') !== (editedResume.sectionOrder || []).join('|')
    finish('write_projects', '已应用模块顺序调整')
    begin('validate_truth')
    const verified = verifySectionReorder(editedResume, sectionReorderIntent)
    if (process.env.NODE_ENV === 'development') console.info('[ResumeEdit]', {
      runId: args.runId,
      intent: 'section-reorder',
      target: sectionReorderIntent.targetSection,
      reference: sectionReorderIntent.referenceSection,
      placement: sectionReorderIntent.placement,
      before: currentResume.sectionOrder,
      after: editedResume.sectionOrder,
      verification: verified ? 'success' : 'failed',
    })
    if (!verified) {
      throw new GenerationError({ stage: 'validate-output', category: 'validation', message: 'Resume section reorder verification failed.', retryable: false })
    }
    finish('validate_truth', '最终 Resume 模块顺序已验证')
    begin('optimize_page')
    finish('optimize_page', '仅调整模块顺序，简历内容保持不变')
    const verifiedSummary = orderChanged
      ? sectionReorderSummary(sectionReorderIntent)
      : '当前模块顺序已经符合你的要求，无需重复修改。'
    generationStage = 'persist-session'
    await syncResumeWorkspace({ ...args, factBank: args.factBank, currentResume: editedResume, latestInstruction: args.userMessage })
    generationStage = 'complete'
    return {
      threadId: args.threadId || '', action: 'resume_updated',
      assistantMessage: verifiedSummary,
      factCandidates: [], resume: editedResume, changeSummary: orderChanged ? [verifiedSummary] : [], layoutAdjustment: 'none',
    }
  }

  const editIntent = args.mode === 'revise' ? resolveResumeEditIntent(args.userMessage, currentResume) : null
  if (editIntent && currentResume) {
    begin('plan_structure')
    finish('plan_structure', `已定位「${editIntent.targetLabel}」，本轮仅应用局部修改`)
    const evidence = resolveEditEvidence(editIntent, currentResume, factBank)
    const needsEvidence = ['add', 'expand', 'rewrite', 'emphasize'].includes(editIntent.type) && Boolean(editIntent.topic)
    if (needsEvidence && !evidence.ids.length) {
      begin('validate_truth')
      finish('validate_truth', '未找到支持该修改的真实 Evidence，未改动当前简历')
      if (process.env.NODE_ENV === 'development') console.warn('[ResumeEdit]', { runId: args.runId, intent: editIntent.type, target: editIntent.targetEntryId, operation: editIntent.operation, patchApplied: false, verification: 'missing-evidence' })
      return {
        threadId: args.threadId || '', action: 'ask',
        assistantMessage: `目前没有找到支持“${editIntent.topic}”的真实经历，因此没有修改最终简历。你可以补充具体做过什么。`,
        factCandidates: [], resume: null, changeSummary: [], layoutAdjustment: 'none',
      }
    }

    begin('write_projects')
    const firstPatch = applyResumeEditPatch(currentResume, editIntent, evidence)
    finish('write_projects', `已应用 ${editIntent.operation} 到「${editIntent.targetLabel}」`)
    begin('validate_truth')
    generationStage = 'compose-resume'
    const matches = currentResume.factMatches?.length ? currentResume.factMatches : buildDeterministicFactMatches(factBank, requirements)
    const compose = (patched: ReturnType<typeof applyResumeEditPatch>) => trimComposedResume(
      patched.resume,
      matches,
      CN_CAMPUS_ONE_PAGE_BUDGET,
      { protectedEntryIds: [editIntent.targetEntryId], protectedBulletTexts: patched.protectedBulletTexts },
    )
    let editedResume = compose(firstPatch)
    if ((args.debugFault === 'edit-verification' || args.debugFault === 'edit-verification-hard') && editIntent.topic) {
      editedResume = applyResumeEditPatch(editedResume, { ...editIntent, type: 'remove', operation: 'remove_bullet' }, { ids: [], statements: [] }).resume
    }
    let verification = verifyResumeEditResult({ before: currentResume, after: editedResume, intent: editIntent, evidence })
    let repaired = false
    if (!verification.success) {
      repaired = true
      const repairPatch = applyResumeEditPatch(currentResume, editIntent, evidence)
      editedResume = compose(repairPatch)
      if (args.debugFault === 'edit-verification-hard' && editIntent.topic) {
        editedResume = applyResumeEditPatch(editedResume, { ...editIntent, type: 'remove', operation: 'remove_bullet' }, { ids: [], statements: [] }).resume
      }
      verification = verifyResumeEditResult({ before: currentResume, after: editedResume, intent: editIntent, evidence })
    }
    if (process.env.NODE_ENV === 'development') console.info('[ResumeEdit]', {
      runId: args.runId, intent: editIntent.type, target: editIntent.targetEntryId, operation: editIntent.operation,
      evidenceCount: evidence.ids.length, patchApplied: true, composer: 'success', repaired,
      verification: verification.success ? 'success' : 'failed', failures: verification.failures,
    })
    if (!verification.success) {
      throw new GenerationError({ stage: 'validate-output', category: 'validation', message: `Resume edit verification failed: ${verification.failures.join('; ')}`, retryable: false })
    }
    finish('validate_truth', `修改已通过最终 Resume 验证${repaired ? '（已自动修复一次）' : ''}`)
    begin('optimize_page')
    finish('optimize_page', `内容密度 ${Math.round((editedResume.composition?.estimatedDensity || 0) * 100)}%，用户本轮要求已锁定保留`)
    const diff = buildResumeChangeSummary(currentResume, editedResume)
    const verifiedSummary = changeSummaryLines(diff, editIntent)
    generationStage = 'persist-session'
    await syncResumeWorkspace({ ...args, factBank: args.factBank, currentResume: editedResume, latestInstruction: args.userMessage })
    generationStage = 'complete'
    return {
      threadId: args.threadId || '', action: 'resume_updated',
      assistantMessage: verifiedSummary.length ? verifiedSummary.join('\n') : '这次没有产生可验证的简历变化，当前版本保持不变。',
      factCandidates: [], resume: editedResume, changeSummary: verifiedSummary, layoutAdjustment: 'none',
    }
  }

  begin('plan_structure')
  generationStage = args.threadId ? 'resume-thread' : 'create-thread'
  const thread = createResumeThread(workspace, args.threadId)
  finish('plan_structure', '采用项目优先的一页结构，核心证据前置')
    begin('write_projects')
    generationStage = 'agent-request'
    if (args.debugFault === 'timeout') throw new GenerationError({ stage: 'agent-request', category: 'timeout', message: 'Injected agent timeout.', retryable: true })
    const firstRaw = args.debugFault === 'malformed-output'
      ? '{"action":'
      : args.debugFault === 'schema-output'
        ? '{}'
        : args.debugFault === 'composer' || args.debugFault === 'minimal-compose'
          ? JSON.stringify({
            action: 'resume_updated', assistantMessage: 'debug', factCandidates: [], changeSummary: [],
            resumeDraft: { education: [], experiences: [], projects: [], campusExperiences: [], awardIds: [], skillGroupIds: [], certificateIds: [], skills: [] },
          })
        : await executeStructuredTurn(thread, buildResumeAgentTurnPrompt({
      userMessage: args.userMessage,
      mode: args.mode,
      clarificationBudgetExhausted: args.clarificationBudgetExhausted,
    }), args.onEvent, deadlineAt)
    finish('write_projects', `已收到 ${firstRaw.length} 字符结构化草稿`)
    begin('validate_truth')
    generationStage = 'parse-output'
    let output = await parseWithOneRepair(thread, firstRaw, args.onEvent, deadlineAt, args.runId)
    generationStage = 'validate-output'
    // Runtime schema validation completed above; composition below applies the
    // evidence allow-list and normalizes optional resume sections.
    generationStage = 'compose-resume'
    if (args.debugFault === 'composer') throw new GenerationError({ stage: 'compose-resume', category: 'composer', message: 'Injected composer failure.', retryable: false })
    let built = output.resumeDraft ? buildGeneratedResume({ draft: output.resumeDraft, factBank, jobDescription: args.jobDescription, company: args.company, role: args.role, currentResume }) : null
    finish('validate_truth', built ? `完成 ${output.resumeDraft?.projects.length || 0} 个项目、${output.resumeDraft?.experiences.length || 0} 段实习与 ${built.resume.bulletEvidence?.length || 0} 条事实来源核验` : '未发现进入简历的未确认内容')
    let layoutAdjustment: CodexResumeRunResult['layoutAdjustment'] = 'none'

    begin('optimize_page')
    if (built && (args.mode === 'generate' || args.mode === 'revise')) {
      const overBudget = built.rawCost > CN_CAMPUS_ONE_PAGE_BUDGET
      const underFilled = built.rawCost < CN_CAMPUS_UNDERFILLED_THRESHOLD
        && flattenFactBank(factBank).length > built.resume.composition!.selectedFactIds.length
      if ((overBudget || underFilled) && Date.now() + 30_000 < deadlineAt) {
        layoutAdjustment = overBudget ? 'overBudget' : 'underFilled'
        const feedback = overBudget
          ? `当前草稿预计 cost=${built.rawCost}，一页预算=${CN_CAMPUS_ONE_PAGE_BUDGET}。请删除低相关内容，不要缩小字体，不得增加新事实。`
          : `当前草稿预计 cost=${built.rawCost}，低于 85% 内容密度目标。请按教育15%、实习25%、项目40%、技能10%、其他10%的目标检查：高相关经历能否增加真实 bullet、当前消息或 Session Evidence 是否遗漏、第二优先级但仍明确相关的项目、相关奖项或技能。不要加入低相关经历，不要用废话填充；若事实确实不足，宁可诚实留白。`
        generationStage = 'agent-request'
        const refinedRaw = await executeStructuredTurn(thread, buildResumeAgentTurnPrompt({ userMessage: '根据版面反馈调整当前完整简历。', mode: 'revise', layoutFeedback: feedback }), args.onEvent, deadlineAt)
        generationStage = 'parse-output'
        const refinedOutput = await parseWithOneRepair(thread, refinedRaw, args.onEvent, deadlineAt, args.runId)
        if (refinedOutput.resumeDraft) {
          output = refinedOutput
          generationStage = 'compose-resume'
          const refined = buildGeneratedResume({ draft: refinedOutput.resumeDraft, factBank, jobDescription: args.jobDescription, company: args.company, role: args.role, currentResume })
          built = underFilled
            ? { ...refined, resume: keepRelevantUnderfillRevision(built.resume, refined.resume, refined.matches), rawCost: estimateResumeCost(keepRelevantUnderfillRevision(built.resume, refined.resume, refined.matches)) }
            : refined
        }
      }
      args.onEvent({ type: 'status', stage: 'optimizing_page', message: '正在完成一页优化' })
    }
    finish('optimize_page', built ? `内容密度 ${Math.round((built.resume.composition?.estimatedDensity || 0) * 100)}%，${built.resume.composition?.fitsOnePage ? '保持一页' : '仍需精简'}` : '本轮未生成简历版面')
    const threadId = thread.id
    if (!threadId) throw new Error('Codex Thread 未返回可恢复的 thread ID。')
    let verifiedChangeSummary = output.changeSummary
    let verifiedAssistantMessage = output.assistantMessage
    if (built && currentResume && args.mode === 'revise') {
      const diff = buildResumeChangeSummary(currentResume, built.resume)
      verifiedChangeSummary = changeSummaryLines(diff)
      if (!verifiedChangeSummary.length) verifiedAssistantMessage = '这次没有产生可验证的简历变化，当前版本保持不变。'
    }
    if (built) {
      generationStage = 'persist-session'
      await syncResumeWorkspace({ ...args, factBank: args.factBank, currentResume: built.resume, latestInstruction: args.userMessage })
    }
    generationStage = 'complete'
    return {
      threadId,
      action: output.action,
      assistantMessage: verifiedAssistantMessage,
      factCandidates: normalizeCandidates(output.factCandidates, args.userMessage).map(candidate => ({ id: randomUUID(), statement: candidate.statement.trim(), category: candidate.category, candidateType: candidate.candidateType, rationale: candidate.rationale })),
      resume: built?.resume || null,
      changeSummary: verifiedChangeSummary,
      layoutAdjustment,
    }
  } catch (error) {
    if (args.threadId && !args.threadRecoveryAttempted && isRecoverableThreadError(error)) {
      return runCodexResumeAgent({
        ...args,
        threadId: null,
        threadRecoveryAttempted: true,
        deadlineAt,
      })
    }
    failActivity()
    throw classifyGenerationError(error, generationStage)
  }
}
