import type {
  FactBank,
  FactConstraint,
  FactMatch,
  JDRequirement,
  JDRequirementCategory,
  RequirementGap,
} from './types'

export interface FactEvidenceRecord {
  id: string
  type: FactMatch['factType']
  label: string
  text: string
}

const CATEGORY_SIGNALS: Record<JDRequirementCategory, string[]> = {
  content_creation: ['内容', '创作', '素材', '传播', '制作', '作品', '汇报', '表达'],
  aigc: ['aigc', 'ai', '人工智能', '生成', '即梦', '图片', '图像', '视频', 'chatgpt', 'deepseek', '提示词'],
  video: ['视频', '短视频', '影片', '剪辑', '分镜', '字幕', '配乐', '调色', '后期'],
  copywriting: ['文案', '写作', '脚本', '报告', '文本', '编辑'],
  visual: ['视觉', '图片', '图像', '设计', '排版', '模型', 'photoshop', 'indesign', 'rhino'],
  data: ['数据', '分析', '复盘', 'gis', '统计', '效果'],
  collaboration: ['协作', '协调', '沟通', '跨部门', '组织', '团队'],
  brand: ['品牌', '传播', '新品', '展会', '宣传', '客户'],
  other: [],
}

const GENERIC_TERMS = new Set(['负责', '参与', '协助', '相关', '工作', '能力', '要求', '完成', '进行', '以及', '内容'])

function compact(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '').replace(/[，。；、：:（）()\[\]【】/|_-]/g, '')
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))]
}

function termsForRequirement(requirement: JDRequirement): string[] {
  const fromSentence = requirement.requirement
    .split(/[\s，。；、：:（）()\[\]【】/|]+/)
    .filter(term => term.length >= 2 && !GENERIC_TERMS.has(term))
  return unique([...requirement.keywords, ...fromSentence])
}

export function flattenFactBank(factBank: FactBank): FactEvidenceRecord[] {
  const facts: FactEvidenceRecord[] = []

  factBank.experiences.forEach(experience => {
    const versionText = experience.versions.flatMap(version => [version.title, ...version.bullets]).join(' ')
    facts.push({
      id: experience.id,
      type: 'experience',
      label: experience.company || experience.versions[0]?.title || '实习经历',
      text: [experience.company, experience.location, versionText].filter(Boolean).join(' '),
    })
  })
  ;(factBank.projects || []).forEach(project => facts.push({
    id: project.id,
    type: 'project',
    label: project.name || '项目经历',
    text: [project.name, project.role, ...project.bullets].filter(Boolean).join(' '),
  }))
  ;(factBank.campusExperiences || []).forEach(campus => facts.push({
    id: campus.id,
    type: 'campus',
    label: [campus.organization, campus.role].filter(Boolean).join(' · '),
    text: [campus.organization, campus.role, campus.location, ...campus.bullets].filter(Boolean).join(' '),
  }))
  ;(factBank.awards || []).forEach(award => facts.push({
    id: award.id,
    type: 'award',
    label: award.title,
    text: [award.title, award.issuer, award.description].filter(Boolean).join(' '),
  }))
  ;(factBank.skillGroups || []).forEach(group => facts.push({
    id: group.id,
    type: 'skill',
    label: group.label || '技能',
    text: [group.label, ...group.items].filter(Boolean).join(' '),
  }))
  factBank.skills.forEach((skill, index) => facts.push({
    id: `legacy-skill-${index}`,
    type: 'skill',
    label: skill.split(/[：:]/)[0] || '技能',
    text: skill,
  }))
  ;(factBank.certificates || []).forEach(certificate => facts.push({
    id: certificate.id,
    type: 'certificate',
    label: certificate.name,
    text: [certificate.name, certificate.score, certificate.issuer, certificate.description].filter(Boolean).join(' '),
  }))
  ;(factBank.conversationFacts || []).forEach(fact => facts.push({
    id: fact.id,
    type: 'conversation',
    label: fact.statement,
    text: fact.statement,
  }))

  return facts.filter(fact => fact.text.trim())
}

export function scoreFactAgainstRequirement(fact: FactEvidenceRecord, requirement: JDRequirement): number {
  const haystack = compact(fact.text)
  const terms = termsForRequirement(requirement)
  const directHits = terms.filter(term => haystack.includes(compact(term)))
  let score = Math.min(82, directHits.length * 26)

  const categorySignals = CATEGORY_SIGNALS[requirement.category]
  const categoryHits = categorySignals.filter(signal => haystack.includes(compact(signal))).length
  score += Math.min(18, categoryHits * 6)

  if (fact.type === 'conversation' && (directHits.length > 0 || categoryHits >= 2)) score = Math.max(score, 78)
  if (fact.type === 'skill' && directHits.length > 0) score = Math.max(score, 58)
  if (fact.type === 'skill' && requirement.category === 'aigc' && categoryHits > 0) score = Math.max(score, 38)
  if (requirement.importance === 'core') score = Math.min(100, score + 6)
  if (requirement.importance === 'bonus') score = Math.max(0, score - 6)
  return Math.max(0, Math.min(100, score))
}

export function buildDeterministicFactMatches(factBank: FactBank, requirements: JDRequirement[]): FactMatch[] {
  return flattenFactBank(factBank).map(fact => {
    const scored = requirements
      .map(requirement => ({ requirement, score: scoreFactAgainstRequirement(fact, requirement) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
    const relevanceScore = scored[0]?.score || 0
    return {
      factId: fact.id,
      factType: fact.type,
      label: fact.label,
      requirementIds: scored.filter(item => item.score >= 24).map(item => item.requirement.id),
      relevanceScore,
      evidenceStrength: relevanceScore >= 70 ? 'strong' : relevanceScore >= 38 ? 'partial' : 'weak',
      reasons: scored.slice(0, 2).map(item => `与“${item.requirement.requirement}”存在已记录事实交集`),
    }
  })
}

export function detectRequirementGaps(requirements: JDRequirement[], matches: FactMatch[]): RequirementGap[] {
  return requirements.map(requirement => {
    const related = matches
      .filter(match => match.requirementIds.includes(requirement.id))
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
    const strongest = related[0]
    const status = strongest?.evidenceStrength === 'strong'
      ? 'sufficient'
      : strongest?.evidenceStrength === 'partial' ? 'partial' : 'missing'
    return {
      requirementId: requirement.id,
      status,
      matchedFactIds: related.map(match => match.factId),
      explanation: status === 'sufficient'
        ? `已有较充分证据：${strongest.label}`
        : status === 'partial'
          ? `存在部分相关事实，但仍缺少更具体的作品、过程或结果：${strongest.label}`
          : '经历库中暂无可直接支持该要求的已确认事实',
    }
  })
}

export function requirementTermsWithoutEvidence(
  requirements: JDRequirement[],
  factBank: FactBank
): string[] {
  const corpus = compact(flattenFactBank(factBank).map(fact => fact.text).join(' '))
  return unique(requirements.flatMap(termsForRequirement))
    .filter(term => term.length >= 2 && !GENERIC_TERMS.has(term) && !corpus.includes(compact(term)))
}

export function blockedKeywords(constraints: FactConstraint[] | undefined): string[] {
  return unique((constraints || []).flatMap(constraint => constraint.blockedKeywords))
}

export function containsBlockedFact(text: string, constraints: FactConstraint[] | undefined): boolean {
  const normalized = compact(text)
  return blockedKeywords(constraints).some(keyword => normalized.includes(compact(keyword)))
}

export function preservesSourceEntities(candidate: string, source: string): boolean {
  const sourceLower = source.toLowerCase()
  const candidateEntities = candidate.match(/[A-Za-z][A-Za-z0-9+.#-]{1,}|\d+(?:\.\d+)?%?/g) || []
  return candidateEntities.every(entity => sourceLower.includes(entity.toLowerCase()))
}
