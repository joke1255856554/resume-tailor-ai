import type {
  FactBank,
  FactConstraint,
  JDRequirement,
  RequirementGap,
  ResumeEvidenceSufficiency,
} from './types'
import { buildDeterministicFactMatches, detectRequirementGaps } from './factEvidence'

export const DEFAULT_MAX_CLARIFICATION_ROUNDS = 2
export const HARD_MAX_CLARIFICATION_ROUNDS = 3
export const MAX_QUESTIONS_PER_ROUND = 3

const QUESTION_ALIASES: Record<string, string[]> = {
  video_color_grading: ['调色', '色彩调整', '色彩校正', 'colorgrading', 'colorgrade'],
  video_editing: ['剪辑', '视频编辑', '视频后期', 'cutting', 'editing'],
  storyboarding: ['分镜', '故事板', 'storyboard'],
  copywriting: ['文案', '脚本', '写作', 'copywriting'],
  data_review: ['数据复盘', '效果复盘', '数据分析', '投放效果'],
  asset_library: ['素材资产库', '素材库', '资产管理', '素材管理'],
  aigc_tools: ['aigc工具', 'ai工具', '即梦', '可灵', 'midjourney', 'stable diffusion'],
  video_generation: ['ai视频', '视频生成', '生成视频'],
  image_generation: ['ai图片', 'ai图像', '图片生成', '图像生成'],
}

function compact(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '').replace(/[，。；、：:（）()\[\]【】/|_\-?？]/g, '')
}

export function questionKeyForText(question: string): string {
  const normalized = compact(question)
  for (const [key, aliases] of Object.entries(QUESTION_ALIASES)) {
    if (aliases.some(alias => normalized.includes(compact(alias)))) return key
  }
  return `question:${normalized.slice(0, 36)}`
}

export function denialQuestionKeys(constraints: FactConstraint[]): Set<string> {
  const keys = new Set<string>()
  constraints.forEach(constraint => {
    const corpus = [constraint.statement, ...constraint.blockedKeywords].join(' ')
    const normalized = compact(corpus)
    Object.entries(QUESTION_ALIASES).forEach(([key, aliases]) => {
      if (aliases.some(alias => normalized.includes(compact(alias)))) keys.add(key)
    })
    constraint.blockedKeywords.forEach(keyword => keys.add(questionKeyForText(keyword)))
  })
  return keys
}

export function isQuestionDenied(question: string, constraints: FactConstraint[]): boolean {
  const deniedKeys = denialQuestionKeys(constraints)
  const key = questionKeyForText(question)
  if (deniedKeys.has(key)) return true
  const normalized = compact(question)
  return constraints.some(constraint => constraint.blockedKeywords.some(keyword => normalized.includes(compact(keyword))))
}

export function isStopClarificationIntent(message: string): boolean {
  return /(先这样吧|直接生成|其他不用问了|先给我出一版|这些我没有做过|不用再问|先生成|就这样)/i.test(message)
}

export function evaluateResumeEvidenceSufficiency(
  factBank: FactBank,
  requirements: JDRequirement[],
  suppliedGaps?: RequirementGap[]
): ResumeEvidenceSufficiency {
  const matches = buildDeterministicFactMatches(factBank, requirements)
  const gaps = suppliedGaps || detectRequirementGaps(requirements, matches)
  const coreIds = new Set(requirements.filter(item => item.importance === 'core').map(item => item.id))
  const coreGaps = gaps.filter(gap => coreIds.has(gap.requirementId))
  const coveredCore = coreGaps.reduce((total, gap) => total + (gap.status === 'sufficient' ? 1 : gap.status === 'partial' ? 0.5 : 0), 0)
  const coreCoverageRatio = coreGaps.length ? coveredCore / coreGaps.length : 1
  const relevantMatches = matches.filter(match => match.evidenceStrength !== 'weak')
  const practiceMatches = relevantMatches.filter(match => ['experience', 'project', 'campus', 'conversation'].includes(match.factType))
  const coveredRequirements = gaps.filter(gap => gap.status !== 'missing').length
  const hasRolePractice = practiceMatches.length > 0
  const hasMeaningfulMaterial = practiceMatches.length >= 2 || (hasRolePractice && coveredRequirements >= 2)
  const hasBlockingGap = !hasRolePractice || (coreGaps.length > 0 && coreCoverageRatio === 0 && relevantMatches.length < 2)
  const isSufficient = !hasBlockingGap && (hasMeaningfulMaterial || coreCoverageRatio >= 0.5)

  return {
    isSufficient,
    hasBlockingGap,
    coreCoverageRatio: Math.round(coreCoverageRatio * 100) / 100,
    relevantFactCount: relevantMatches.length,
    roleRelatedPracticeCount: practiceMatches.length,
    summary: isSufficient
      ? '现有事实足以生成一版有重点的一页简历，未确认能力会保持为空。'
      : hasBlockingGap
        ? '目前几乎没有可支撑核心岗位要求的实践事实，补充一项相关经历会明显提升简历质量。'
        : '现有事实可以生成基础版本；再补充一项高相关实践会更有竞争力。',
  }
}
