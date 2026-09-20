import { randomUUID } from 'node:crypto'
import React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import pdfParse from 'pdf-parse'
import type {
  FactBank,
  FactMatch,
  GeneratedExperience,
  GeneratedResume,
  JDReport,
  JDRequirement,
  ResumeBullet,
  ResumePolishStyle,
} from '@/lib/types'
import { createAIClient, getAIModel } from '@/lib/ai'
import { normalizeFactBank } from '@/lib/normalize'
import { buildChineseJDAnalysisPrompt, buildEvidenceBoundRewritePrompt } from '@/lib/prompts'
import {
  blockedKeywords,
  buildDeterministicFactMatches,
  containsBlockedFact,
  detectRequirementGaps,
  preservesSourceEntities,
  requirementTermsWithoutEvidence,
  scoreFactAgainstRequirement,
  type FactEvidenceRecord,
} from '@/lib/factEvidence'
import { chooseRelevantFacts, estimateResumeCost, trimComposedResume } from '@/lib/resumeComposer'
import { ChineseCampusClassicPDF } from '@/components/resume-templates/ChineseCampusClassicPDF'

interface RawAnalysis extends Omit<JDReport, 'alreadyHave' | 'needToAdd'> {
  requirements?: JDRequirement[]
}

interface RewriteBullet {
  text: string
  sourceFactIds: string[]
  matchedRequirementIds: string[]
  rewriteReason: string
}

interface RewriteItem {
  factId: string
  title?: string
  bullets: RewriteBullet[]
}

const VALID_CATEGORIES = new Set(['content_creation', 'aigc', 'video', 'copywriting', 'visual', 'data', 'collaboration', 'brand', 'other'])

function normalizeRequirements(value: unknown): JDRequirement[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 12).map((item, index) => {
    const source = typeof item === 'object' && item !== null ? item as Record<string, unknown> : {}
    const category = typeof source.category === 'string' && VALID_CATEGORIES.has(source.category) ? source.category as JDRequirement['category'] : 'other'
    const importance: JDRequirement['importance'] = source.importance === 'core' || source.importance === 'important' || source.importance === 'bonus' ? source.importance : 'important'
    return {
      id: typeof source.id === 'string' && source.id.trim() ? source.id : `req-${index + 1}`,
      category,
      requirement: typeof source.requirement === 'string' ? source.requirement.trim() : '',
      importance,
      keywords: Array.isArray(source.keywords) ? source.keywords.filter((keyword): keyword is string => typeof keyword === 'string' && Boolean(keyword.trim())) : [],
    }
  }).filter(requirement => requirement.requirement)
}

function fallbackRequirements(jdText: string): JDRequirement[] {
  return jdText.split(/[。；;\n]/).map(sentence => sentence.trim()).filter(Boolean).slice(0, 8).map((sentence, index) => ({
    id: `req-${index + 1}`,
    category: /AIGC|AI|生成/i.test(sentence) ? 'aigc'
      : /视频|剪辑|分镜|后期/.test(sentence) ? 'video'
        : /文案|脚本/.test(sentence) ? 'copywriting'
          : /品牌|传播|宣传|展会/.test(sentence) ? 'brand'
            : /数据|复盘|分析/.test(sentence) ? 'data' : 'other',
    requirement: sentence,
    importance: index < 3 ? 'core' : index < 6 ? 'important' : 'bonus',
    keywords: sentence.split(/[、，,\s/]+/).filter(term => term.length >= 2).slice(0, 6),
  }))
}

function factScore(text: string, requirements: JDRequirement[]): number {
  const fact: FactEvidenceRecord = { id: 'temporary', type: 'experience', label: '', text }
  return Math.max(0, ...requirements.map(requirement => scoreFactAgainstRequirement(fact, requirement)))
}

function chooseVersion(experience: FactBank['experiences'][number], requirements: JDRequirement[]) {
  return [...experience.versions]
    .sort((a, b) => factScore([b.title, ...b.bullets].join(' '), requirements) - factScore([a.title, ...a.bullets].join(' '), requirements))[0]
    || experience.versions[0]
}

function pickRelevantBullets(bullets: string[], requirements: JDRequirement[], factBank: FactBank): string[] {
  return bullets
    .filter(bullet => bullet.trim() && !containsBlockedFact(bullet, factBank.factConstraints))
    .map((bullet, index) => ({ bullet: bullet.trim(), index, score: factScore(bullet, requirements) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 2)
    .map(item => item.bullet)
}

function safeRewriteForFact(args: {
  factId: string
  rawBullets: string[]
  rawText: string
  rewrite?: RewriteItem
  requirements: JDRequirement[]
  factBank: FactBank
  forbiddenTerms: string[]
  section: ResumeBullet['section']
  itemId: string
}): { bullets: string[]; evidence: ResumeBullet[] } {
  const fallback = pickRelevantBullets(args.rawBullets.length ? args.rawBullets : [args.rawText], args.requirements, args.factBank)
  const requirementIds = new Set(args.requirements.map(requirement => requirement.id))
  const source = [args.rawText, ...args.rawBullets].join(' ')
  const denied = blockedKeywords(args.factBank.factConstraints)
  const proposed = Array.isArray(args.rewrite?.bullets) ? args.rewrite!.bullets.slice(0, 2) : []
  const accepted = proposed.filter(bullet => {
    if (!bullet?.text?.trim()) return false
    if (!Array.isArray(bullet.sourceFactIds) || !bullet.sourceFactIds.includes(args.factId)) return false
    if (bullet.sourceFactIds.some(id => id !== args.factId)) return false
    if (containsBlockedFact(bullet.text, args.factBank.factConstraints)) return false
    if (denied.some(term => bullet.text.toLowerCase().includes(term.toLowerCase()))) return false
    if (args.forbiddenTerms.some(term => bullet.text.toLowerCase().includes(term.toLowerCase()))) return false
    return preservesSourceEntities(bullet.text, source)
  })

  const bullets = accepted.length ? accepted.map(item => item.text.trim()) : fallback
  const evidence = bullets.map((text, bulletIndex) => {
    const acceptedEvidence = accepted[bulletIndex]
    return {
      id: randomUUID(),
      section: args.section,
      itemId: args.itemId,
      bulletIndex,
      text,
      sourceFactIds: [args.factId],
      matchedRequirementIds: acceptedEvidence
        ? acceptedEvidence.matchedRequirementIds.filter(id => requirementIds.has(id))
        : args.requirements.filter(requirement => scoreFactAgainstRequirement({ id: args.factId, type: args.section === 'experience' ? 'experience' : args.section, label: '', text: source }, requirement) >= 24).map(requirement => requirement.id),
      rewriteReason: acceptedEvidence?.rewriteReason || '保留原始事实，仅按岗位相关性选择内容，没有新增事实。',
    }
  })
  return { bullets, evidence }
}

async function countChinesePDFPages(resume: GeneratedResume): Promise<number> {
  try {
    const settings = { templateId: 'cn-campus-classic' as const, showAvatar: true, language: 'zh-CN' as const }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(React.createElement(ChineseCampusClassicPDF, { resume, settings }) as any)
    return (await pdfParse(buffer)).numpages
  } catch (error) {
    console.error('[composer] PDF validation failed:', error)
    return 1
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { factBank?: FactBank; jdText?: string; polishStyle?: ResumePolishStyle }
    if (!body.factBank || !body.jdText?.trim()) return NextResponse.json({ error: '缺少经历库或岗位描述。' }, { status: 400 })

    const factBank = normalizeFactBank(body.factBank)
    const jdText = body.jdText.trim()
    const polishStyle: ResumePolishStyle = body.polishStyle === 'conservative' || body.polishStyle === 'targeted' ? body.polishStyle : 'standard'
    const openai = createAIClient()
    const model = getAIModel()
    const analysisCompletion = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: buildChineseJDAnalysisPrompt(jdText) }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    })
    const analysis = JSON.parse(analysisCompletion.choices[0].message.content || '{}') as RawAnalysis
    const requirements = normalizeRequirements(analysis.requirements)
    const safeRequirements = requirements.length ? requirements : fallbackRequirements(jdText)
    const factMatches = buildDeterministicFactMatches(factBank, safeRequirements)
    const requirementGaps = detectRequirementGaps(safeRequirements, factMatches)
    const selection = chooseRelevantFacts(factBank, safeRequirements, factMatches)
    const selectedIds = new Set([...selection.experienceIds, ...selection.projectIds, ...selection.campusIds, ...selection.conversationFactIds])

    const selectedNarrativeFacts: Array<{ id: string; type: string; label: string; rawText: string; bullets: string[] }> = []
    selection.experienceIds.forEach(id => {
      const experience = factBank.experiences.find(item => item.id === id)
      if (!experience) return
      const version = chooseVersion(experience, safeRequirements)
      if (version) selectedNarrativeFacts.push({ id, type: 'experience', label: `${experience.company} · ${version.title}`, rawText: [experience.company, version.title, ...version.bullets].join(' '), bullets: version.bullets })
    })
    selection.projectIds.forEach(id => {
      const project = (factBank.projects || []).find(item => item.id === id)
      if (project) selectedNarrativeFacts.push({ id, type: 'project', label: project.name, rawText: [project.name, project.role, ...project.bullets].filter(Boolean).join(' '), bullets: project.bullets })
    })
    selection.campusIds.forEach(id => {
      const campus = (factBank.campusExperiences || []).find(item => item.id === id)
      if (campus) selectedNarrativeFacts.push({ id, type: 'campus', label: `${campus.organization} · ${campus.role}`, rawText: [campus.organization, campus.role, ...campus.bullets].join(' '), bullets: campus.bullets })
    })
    selection.conversationFactIds.forEach(id => {
      const fact = (factBank.conversationFacts || []).find(item => item.id === id)
      if (fact) selectedNarrativeFacts.push({ id, type: 'conversation', label: fact.statement, rawText: fact.statement, bullets: [fact.statement] })
    })

    let rewriteItems: RewriteItem[] = []
    if (selectedNarrativeFacts.length) {
      try {
        const rewriteCompletion = await openai.chat.completions.create({
          model,
          messages: [{ role: 'user', content: buildEvidenceBoundRewritePrompt(safeRequirements, selectedNarrativeFacts, factMatches, polishStyle) }],
          response_format: { type: 'json_object' },
          temperature: polishStyle === 'targeted' ? 0.25 : 0.15,
        })
        const parsed = JSON.parse(rewriteCompletion.choices[0].message.content || '{}') as { items?: RewriteItem[] }
        rewriteItems = Array.isArray(parsed.items) ? parsed.items : []
      } catch (error) {
        console.error('[rewrite] using fact-preserving fallback:', error)
      }
    }

    const rewriteByFactId = new Map(rewriteItems.map(item => [item.factId, item]))
    const forbiddenTerms = requirementTermsWithoutEvidence(safeRequirements, factBank)
    const bulletEvidence: ResumeBullet[] = []
    const experiences: GeneratedExperience[] = selection.experienceIds.flatMap(id => {
      const experience = factBank.experiences.find(item => item.id === id)
      if (!experience) return []
      const version = chooseVersion(experience, safeRequirements)
      if (!version) return []
      const rewritten = safeRewriteForFact({ factId: id, rawBullets: version.bullets, rawText: [experience.company, version.title, ...version.bullets].join(' '), rewrite: rewriteByFactId.get(id), requirements: safeRequirements, factBank, forbiddenTerms, section: 'experience', itemId: id })
      bulletEvidence.push(...rewritten.evidence)
      return [{ sourceFactId: id, company: experience.company, title: version.title, location: experience.location, startDate: experience.startDate, endDate: experience.endDate, bullets: rewritten.bullets }]
    })

    const projects = selection.projectIds.flatMap(id => {
      const project = (factBank.projects || []).find(item => item.id === id)
      if (!project) return []
      const rewritten = safeRewriteForFact({ factId: id, rawBullets: project.bullets, rawText: [project.name, project.role, ...project.bullets].filter(Boolean).join(' '), rewrite: rewriteByFactId.get(id), requirements: safeRequirements, factBank, forbiddenTerms, section: 'project', itemId: id })
      bulletEvidence.push(...rewritten.evidence)
      return [{ ...project, bullets: rewritten.bullets }]
    })

    if (selection.conversationFactIds.length) {
      const conversationProjectId = `conversation-project-${selection.conversationFactIds.join('-')}`
      const conversationBullets: string[] = []
      selection.conversationFactIds.forEach(id => {
        const fact = (factBank.conversationFacts || []).find(item => item.id === id)
        if (!fact || containsBlockedFact(fact.statement, factBank.factConstraints)) return
        const rewritten = safeRewriteForFact({ factId: id, rawBullets: [fact.statement], rawText: fact.statement, rewrite: rewriteByFactId.get(id), requirements: safeRequirements, factBank, forbiddenTerms, section: 'project', itemId: conversationProjectId })
        const offset = conversationBullets.length
        conversationBullets.push(...rewritten.bullets)
        bulletEvidence.push(...rewritten.evidence.map(item => ({ ...item, bulletIndex: item.bulletIndex + offset })))
      })
      if (conversationBullets.length) projects.unshift({ id: conversationProjectId, name: '个人 AIGC 创作实践', role: '个人实践', startDate: '', endDate: '', bullets: conversationBullets.slice(0, 2) })
    }

    const campusExperiences = selection.campusIds.flatMap(id => {
      const campus = (factBank.campusExperiences || []).find(item => item.id === id)
      if (!campus) return []
      const rewritten = safeRewriteForFact({ factId: id, rawBullets: campus.bullets, rawText: [campus.organization, campus.role, ...campus.bullets].join(' '), rewrite: rewriteByFactId.get(id), requirements: safeRequirements, factBank, forbiddenTerms, section: 'campus', itemId: id })
      bulletEvidence.push(...rewritten.evidence)
      return [{ ...campus, bullets: rewritten.bullets }]
    })

    const deniedTerms = blockedKeywords(factBank.factConstraints)
    const skillGroups = selection.skillIds.flatMap(id => {
      const group = (factBank.skillGroups || []).find(item => item.id === id)
      if (!group) return []
      const items = group.items.filter(item => !deniedTerms.some(term => item.toLowerCase().includes(term.toLowerCase())))
      return items.length ? [{ ...group, items }] : []
    })
    const skills = factBank.skills
      .filter((_, index) => (factMatches.find(match => match.factId === `legacy-skill-${index}`)?.relevanceScore || 0) >= 18)
      .filter(skill => !containsBlockedFact(skill, factBank.factConstraints))
      .slice(0, 3)
    const awards = selection.awardIds.flatMap(id => (factBank.awards || []).filter(item => item.id === id))
    const certificates = selection.certificateIds.flatMap(id => (factBank.certificates || []).filter(item => item.id === id))
    const selectedRequirementIds = new Set(factMatches.filter(match => selectedIds.has(match.factId) && match.evidenceStrength !== 'weak').flatMap(match => match.requirementIds))
    const coveredRequirements = safeRequirements.filter(requirement => selectedRequirementIds.has(requirement.id))
    const missingRequirements = safeRequirements.filter(requirement => !selectedRequirementIds.has(requirement.id))
    const narrativeMatches = factMatches.filter(match => ['experience', 'project', 'campus', 'conversation'].includes(match.factType))
    const selectedNarrativeMatches = narrativeMatches.filter(match => selectedIds.has(match.factId))
    const beforeFocusScore = narrativeMatches.length ? Math.round(narrativeMatches.reduce((sum, match) => sum + match.relevanceScore, 0) / narrativeMatches.length) : 0
    const afterFocusScore = selectedNarrativeMatches.length ? Math.round(selectedNarrativeMatches.reduce((sum, match) => sum + match.relevanceScore, 0) / selectedNarrativeMatches.length) : 0
    const jdReport: JDReport = {
      role: analysis.role || '', company: analysis.company || '', titleKeywords: analysis.titleKeywords || [], hardSkills: analysis.hardSkills || [],
      actionKeywords: analysis.actionKeywords || [], businessContext: analysis.businessContext || [], domainKeywords: analysis.domainKeywords || [], hardFilters: analysis.hardFilters || [], top10: analysis.top10 || [],
      alreadyHave: coveredRequirements.map(requirement => requirement.requirement), needToAdd: missingRequirements.map(requirement => requirement.requirement),
    }

    let resume: GeneratedResume = {
      contact: factBank.contact, education: factBank.education, skills, experiences, projects, skillGroups, awards, campusExperiences, certificates,
      requirements: safeRequirements, factMatches, requirementGaps, bulletEvidence, polishStyle,
      jdKeywordCoverage: {
        covered: coveredRequirements.map(requirement => requirement.requirement), missing: missingRequirements.map(requirement => requirement.requirement),
        beforeCovered: safeRequirements.filter(requirement => requirementGaps.find(gap => gap.requirementId === requirement.id)?.status === 'sufficient').map(requirement => requirement.requirement),
        beforeMissing: safeRequirements.filter(requirement => requirementGaps.find(gap => gap.requirementId === requirement.id)?.status === 'missing').map(requirement => requirement.requirement),
        hardSkillsMissing: safeRequirements.filter(requirement => requirement.importance === 'core' && !selectedRequirementIds.has(requirement.id)).map(requirement => requirement.requirement), score: afterFocusScore, beforeScore: beforeFocusScore,
      },
      jdReport,
      composition: { targetPages: 1, estimatedCost: 0, budget: 0, fitsOnePage: false, selectedFactIds: [...selectedIds], excludedFacts: selection.excludedFacts, suggestions: [] },
    }

    resume = trimComposedResume(resume, factMatches)
    let pageCount = await countChinesePDFPages(resume)
    let validationBudget = resume.composition?.budget || 850
    for (let attempt = 0; pageCount > 1 && attempt < 4; attempt += 1) {
      validationBudget -= 70
      resume = trimComposedResume(resume, factMatches, validationBudget)
      pageCount = await countChinesePDFPages(resume)
    }
    resume = { ...resume, composition: { ...resume.composition!, estimatedCost: estimateResumeCost(resume), fitsOnePage: pageCount === 1, suggestions: pageCount === 1 ? [] : ['当前高相关内容仍较多，建议继续精简。可优先删除相关性最低的项目或次要 bullet。'] } }
    return NextResponse.json({ resume })
  } catch (error) {
    console.error('Generate resume error:', error)
    return NextResponse.json({ error: '简历生成未完成，请检查 AI 配置或稍后重试。' }, { status: 500 })
  }
}
