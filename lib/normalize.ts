import type {
  Application,
  Award,
  CampusExperience,
  Certificate,
  Contact,
  ConversationFact,
  Education,
  Experience,
  FactConstraint,
  FactBank,
  FactMatch,
  GeneratedResume,
  JDRequirement,
  JDReport,
  Project,
  ResumeSettings,
  SkillGroup,
  Version,
} from './types'
import {
  DEFAULT_RESUME_SETTINGS,
  isResumeTemplateId,
} from './resumeTemplates'
import { normalizeResumeSectionOrder } from './resumeSections'

export const CURRENT_SCHEMA_VERSION = 3

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function optionalText(value: unknown): string | undefined {
  const normalized = text(value).trim()
  return normalized || undefined
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function id(value: unknown, fallback: string): string {
  return optionalText(value) || fallback
}

function stableTextId(value: string, index: number): string {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return `${(hash >>> 0).toString(36)}-${index}`
}

export function normalizeContact(value: unknown): Contact {
  const source = isRecord(value) ? value : {}
  return {
    name: text(source.name),
    email: text(source.email),
    phone: text(source.phone),
    location: text(source.location),
    linkedin: text(source.linkedin),
    github: text(source.github),
    website: text(source.website),
    avatar: optionalText(source.avatar),
    jobTarget: optionalText(source.jobTarget),
    wechat: optionalText(source.wechat),
  }
}

function normalizeVersion(value: unknown, index: number): Version {
  const source = isRecord(value) ? value : {}
  return {
    id: id(source.id, `legacy-version-${index}`),
    title: text(source.title),
    bullets: stringList(source.bullets),
    sourceFile: optionalText(source.sourceFile),
  }
}

function normalizeExperience(value: unknown, index: number): Experience {
  const source = isRecord(value) ? value : {}
  const rawVersions = Array.isArray(source.versions)
    ? source.versions
    : Array.isArray(source.frames) ? source.frames : []
  return {
    id: id(source.id, `legacy-experience-${index}`),
    company: text(source.company),
    location: text(source.location),
    startDate: text(source.startDate),
    endDate: text(source.endDate),
    versions: rawVersions.map(normalizeVersion),
  }
}

function normalizeEducation(value: unknown, index: number): Education {
  const source = isRecord(value) ? value : {}
  return {
    id: id(source.id, `legacy-education-${index}`),
    school: text(source.school),
    location: text(source.location),
    degree: text(source.degree),
    field: text(source.field),
    focus: optionalText(source.focus),
    startDate: text(source.startDate),
    endDate: text(source.endDate),
    notes: stringList(source.notes),
  }
}

function normalizeProject(value: unknown, index: number): Project {
  const source = isRecord(value) ? value : {}
  return {
    id: id(source.id, `legacy-project-${index}`),
    name: text(source.name),
    role: optionalText(source.role),
    startDate: text(source.startDate),
    endDate: text(source.endDate),
    bullets: stringList(source.bullets),
    link: optionalText(source.link),
  }
}

function normalizeAward(value: unknown, index: number): Award {
  const source = isRecord(value) ? value : {}
  return {
    id: id(source.id, `legacy-award-${index}`),
    title: text(source.title),
    issuer: optionalText(source.issuer),
    date: optionalText(source.date),
    description: optionalText(source.description),
  }
}

function normalizeCampusExperience(value: unknown, index: number): CampusExperience {
  const source = isRecord(value) ? value : {}
  return {
    id: id(source.id, `legacy-campus-${index}`),
    organization: text(source.organization),
    role: text(source.role),
    location: optionalText(source.location),
    startDate: optionalText(source.startDate),
    endDate: optionalText(source.endDate),
    bullets: stringList(source.bullets),
  }
}

function normalizeCertificate(value: unknown, index: number): Certificate {
  const source = isRecord(value) ? value : {}
  return {
    id: id(source.id, `legacy-certificate-${index}`),
    name: text(source.name),
    issuer: optionalText(source.issuer),
    date: optionalText(source.date),
    score: optionalText(source.score),
    description: optionalText(source.description),
  }
}

function normalizeSkillGroup(value: unknown, index: number): SkillGroup {
  const source = isRecord(value) ? value : {}
  return {
    id: id(source.id, `legacy-skill-group-${index}`),
    label: text(source.label),
    items: stringList(source.items),
  }
}

function normalizeConversationFact(value: unknown, index: number): ConversationFact {
  const source = isRecord(value) ? value : {}
  const provenance = isRecord(source.source) ? source.source : {}
  const allowedCategories = ['content_creation', 'aigc', 'video', 'copywriting', 'visual', 'data', 'collaboration', 'brand', 'other', 'general']
  return {
    id: id(source.id, `conversation-fact-${index}`),
    statement: text(source.statement),
    category: allowedCategories.includes(text(source.category)) ? source.category as ConversationFact['category'] : 'general',
    source: {
      sourceType: provenance.sourceType === 'import' || provenance.sourceType === 'manual' || provenance.sourceType === 'conversation' ? provenance.sourceType : 'conversation',
      conversationId: optionalText(provenance.conversationId),
      messageId: optionalText(provenance.messageId),
      createdAt: optionalText(provenance.createdAt),
    },
  }
}

function normalizeFactConstraint(value: unknown, index: number): FactConstraint {
  const source = isRecord(value) ? value : {}
  const provenance = isRecord(source.source) ? source.source : {}
  return {
    id: id(source.id, `fact-constraint-${index}`),
    kind: source.kind === 'correction' ? 'correction' : 'denial',
    statement: text(source.statement),
    blockedKeywords: stringList(source.blockedKeywords),
    source: {
      sourceType: 'conversation',
      conversationId: optionalText(provenance.conversationId),
      messageId: optionalText(provenance.messageId),
      createdAt: optionalText(provenance.createdAt),
    },
  }
}

export function normalizeFactBank(value: unknown): FactBank {
  const source = isRecord(value) ? value : {}
  return {
    contact: normalizeContact(source.contact),
    experiences: Array.isArray(source.experiences) ? source.experiences.map(normalizeExperience) : [],
    education: Array.isArray(source.education) ? source.education.map(normalizeEducation) : [],
    skills: stringList(source.skills),
    projects: Array.isArray(source.projects) ? source.projects.map(normalizeProject) : [],
    skillGroups: Array.isArray(source.skillGroups) ? source.skillGroups.map(normalizeSkillGroup) : [],
    awards: Array.isArray(source.awards) ? source.awards.map(normalizeAward) : [],
    campusExperiences: Array.isArray(source.campusExperiences) ? source.campusExperiences.map(normalizeCampusExperience) : [],
    certificates: Array.isArray(source.certificates) ? source.certificates.map(normalizeCertificate) : [],
    conversationFacts: Array.isArray(source.conversationFacts) ? source.conversationFacts.map(normalizeConversationFact) : [],
    factConstraints: Array.isArray(source.factConstraints) ? source.factConstraints.map(normalizeFactConstraint) : [],
    schemaVersion: CURRENT_SCHEMA_VERSION,
  }
}

function normalizeJDReport(value: unknown): JDReport {
  const source = isRecord(value) ? value : {}
  return {
    role: text(source.role),
    company: text(source.company),
    titleKeywords: stringList(source.titleKeywords),
    hardSkills: stringList(source.hardSkills),
    actionKeywords: stringList(source.actionKeywords),
    businessContext: stringList(source.businessContext),
    domainKeywords: stringList(source.domainKeywords),
    hardFilters: stringList(source.hardFilters),
    top10: stringList(source.top10),
    alreadyHave: stringList(source.alreadyHave),
    needToAdd: stringList(source.needToAdd),
  }
}

function normalizeJDRequirement(value: unknown, index: number): JDRequirement {
  const source = isRecord(value) ? value : {}
  const categories = ['content_creation', 'aigc', 'video', 'copywriting', 'visual', 'data', 'collaboration', 'brand', 'other']
  const importance = source.importance === 'core' || source.importance === 'important' || source.importance === 'bonus' ? source.importance : 'important'
  return {
    id: id(source.id, `requirement-${index}`),
    category: categories.includes(text(source.category)) ? source.category as JDRequirement['category'] : 'other',
    requirement: text(source.requirement),
    importance,
    keywords: stringList(source.keywords),
  }
}

function normalizeFactMatch(value: unknown, index: number): FactMatch {
  const source = isRecord(value) ? value : {}
  const factTypes = ['experience', 'project', 'campus', 'award', 'skill', 'certificate', 'conversation']
  const strength = source.evidenceStrength === 'strong' || source.evidenceStrength === 'partial' || source.evidenceStrength === 'weak' ? source.evidenceStrength : 'weak'
  return {
    factId: id(source.factId, `fact-match-${index}`),
    factType: factTypes.includes(text(source.factType)) ? source.factType as FactMatch['factType'] : 'experience',
    label: text(source.label),
    requirementIds: stringList(source.requirementIds),
    relevanceScore: typeof source.relevanceScore === 'number' ? Math.max(0, Math.min(100, source.relevanceScore)) : 0,
    evidenceStrength: strength,
    reasons: stringList(source.reasons),
  }
}

export function normalizeResume(value: unknown): GeneratedResume | null {
  if (!isRecord(value)) return null
  const source = value
  const coverage = isRecord(source.jdKeywordCoverage) ? source.jdKeywordCoverage : {}
  return {
    contact: normalizeContact(source.contact),
    education: Array.isArray(source.education) ? source.education.map(normalizeEducation) : [],
    skills: stringList(source.skills),
    experiences: Array.isArray(source.experiences)
      ? source.experiences.map((item, index) => {
          const exp = isRecord(item) ? item : {}
          const sourceFactId = optionalText(exp.sourceFactId)
          return {
            id: optionalText(exp.id) || sourceFactId || `experience-${stableTextId([text(exp.company), text(exp.title), text(exp.startDate), text(exp.endDate)].join('|'), index)}`,
            sourceFactId,
            company: text(exp.company),
            title: text(exp.title),
            location: text(exp.location),
            startDate: text(exp.startDate),
            endDate: text(exp.endDate),
            bullets: stringList(exp.bullets),
          }
        })
      : [],
    projects: Array.isArray(source.projects) ? source.projects.map(normalizeProject) : [],
    skillGroups: Array.isArray(source.skillGroups) ? source.skillGroups.map(normalizeSkillGroup) : [],
    awards: Array.isArray(source.awards) ? source.awards.map(normalizeAward) : [],
    campusExperiences: Array.isArray(source.campusExperiences) ? source.campusExperiences.map(normalizeCampusExperience) : [],
    certificates: Array.isArray(source.certificates) ? source.certificates.map(normalizeCertificate) : [],
    sectionOrder: normalizeResumeSectionOrder(source.sectionOrder),
    requirements: Array.isArray(source.requirements) ? source.requirements.map(normalizeJDRequirement) : [],
    factMatches: Array.isArray(source.factMatches) ? source.factMatches.map(normalizeFactMatch) : [],
    requirementGaps: Array.isArray(source.requirementGaps) ? source.requirementGaps.map((item, index) => {
      const gap = isRecord(item) ? item : {}
      return {
        requirementId: id(gap.requirementId, `gap-${index}`),
        status: gap.status === 'sufficient' || gap.status === 'partial' || gap.status === 'missing' ? gap.status : 'missing',
        matchedFactIds: stringList(gap.matchedFactIds),
        explanation: text(gap.explanation),
      }
    }) : [],
    bulletEvidence: Array.isArray(source.bulletEvidence) ? source.bulletEvidence.map((item, index) => {
      const bullet = isRecord(item) ? item : {}
      return {
        id: id(bullet.id, `bullet-evidence-${index}`),
        section: bullet.section === 'project' || bullet.section === 'campus' ? bullet.section : 'experience',
        itemId: text(bullet.itemId),
        bulletIndex: typeof bullet.bulletIndex === 'number' ? bullet.bulletIndex : 0,
        text: text(bullet.text),
        sourceFactIds: stringList(bullet.sourceFactIds),
        matchedRequirementIds: stringList(bullet.matchedRequirementIds),
        rewriteReason: text(bullet.rewriteReason),
      }
    }) : [],
    composition: isRecord(source.composition) ? {
      targetPages: 1,
      estimatedCost: typeof source.composition.estimatedCost === 'number' ? source.composition.estimatedCost : 0,
      budget: typeof source.composition.budget === 'number' ? source.composition.budget : 0,
      fitsOnePage: source.composition.fitsOnePage !== false,
      selectedFactIds: stringList(source.composition.selectedFactIds),
      excludedFacts: Array.isArray(source.composition.excludedFacts) ? source.composition.excludedFacts.map((item, index) => {
        const excluded = isRecord(item) ? item : {}
        return {
          factId: id(excluded.factId, `excluded-${index}`),
          factType: ['experience', 'project', 'campus', 'award', 'skill', 'certificate', 'conversation'].includes(text(excluded.factType)) ? excluded.factType as FactMatch['factType'] : 'project',
          label: text(excluded.label),
          reason: text(excluded.reason),
          relevanceScore: typeof excluded.relevanceScore === 'number' ? excluded.relevanceScore : 0,
        }
      }) : [],
      suggestions: stringList(source.composition.suggestions),
      densityTarget: typeof source.composition.densityTarget === 'number' ? source.composition.densityTarget : 0.85,
      estimatedDensity: typeof source.composition.estimatedDensity === 'number' ? source.composition.estimatedDensity : 0,
      moduleTargets: isRecord(source.composition.moduleTargets) ? {
        education: typeof source.composition.moduleTargets.education === 'number' ? source.composition.moduleTargets.education : 0.15,
        experience: typeof source.composition.moduleTargets.experience === 'number' ? source.composition.moduleTargets.experience : 0.25,
        projects: typeof source.composition.moduleTargets.projects === 'number' ? source.composition.moduleTargets.projects : 0.4,
        skills: typeof source.composition.moduleTargets.skills === 'number' ? source.composition.moduleTargets.skills : 0.1,
        other: typeof source.composition.moduleTargets.other === 'number' ? source.composition.moduleTargets.other : 0.1,
      } : { education: 0.15, experience: 0.25, projects: 0.4, skills: 0.1, other: 0.1 },
    } : undefined,
    polishStyle: source.polishStyle === 'conservative' || source.polishStyle === 'targeted' ? source.polishStyle : 'standard',
    jdKeywordCoverage: {
      covered: stringList(coverage.covered),
      missing: stringList(coverage.missing),
      beforeCovered: stringList(coverage.beforeCovered),
      beforeMissing: stringList(coverage.beforeMissing),
      hardSkillsMissing: stringList(coverage.hardSkillsMissing),
      score: typeof coverage.score === 'number' ? coverage.score : 0,
      beforeScore: typeof coverage.beforeScore === 'number' ? coverage.beforeScore : 0,
    },
    jdReport: normalizeJDReport(source.jdReport),
  }
}

export function normalizeResumeSettings(
  value: unknown,
  fallback: ResumeSettings = DEFAULT_RESUME_SETTINGS
): ResumeSettings {
  const source = isRecord(value) ? value : {}
  const templateId = isResumeTemplateId(source.templateId) ? source.templateId : fallback.templateId
  const preferencesSource = isRecord(source.templatePreferences) ? source.templatePreferences : {}
  const templatePreferences: ResumeSettings['templatePreferences'] = { ...fallback.templatePreferences }
  Object.entries(preferencesSource).forEach(([key, preference]) => {
    if (!isResumeTemplateId(key) || !isRecord(preference) || typeof preference.showAvatar !== 'boolean') return
    templatePreferences![key] = { showAvatar: preference.showAvatar }
  })
  // Before per-template preferences existed, showAvatar represented the active
  // template. Preserve that explicit user choice during the one-time fallback.
  if (!Object.keys(preferencesSource).length && typeof source.showAvatar === 'boolean') {
    templatePreferences![templateId] = { showAvatar: source.showAvatar }
  }
  return {
    templateId,
    showAvatar: typeof source.showAvatar === 'boolean' ? source.showAvatar : fallback.showAvatar,
    language: source.language === 'zh-CN' || source.language === 'en' ? source.language : fallback.language,
    requestedTemplateId: isResumeTemplateId(source.requestedTemplateId) ? source.requestedTemplateId : undefined,
    resolvedTemplateId: isResumeTemplateId(source.resolvedTemplateId) ? source.resolvedTemplateId : undefined,
    templatePreferences,
  }
}

export function normalizeApplication(
  value: unknown,
  legacySettings: ResumeSettings,
  index = 0
): Application {
  const source = isRecord(value) ? value : {}
  return {
    id: id(source.id, `legacy-application-${text(source.date) || index}`),
    date: text(source.date) || new Date().toISOString(),
    company: text(source.company) || '—',
    role: text(source.role) || '—',
    resume: normalizeResume(source.resume),
    jdText: typeof source.jdText === 'string' ? source.jdText : null,
    resumeSettings: normalizeResumeSettings(source.resumeSettings, legacySettings),
  }
}
