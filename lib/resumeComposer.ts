import type {
  FactBank,
  FactMatch,
  GeneratedResume,
  JDRequirement,
  Project,
  ResumeBullet,
  ResumeComposition,
} from './types'
import { scoreFactAgainstRequirement, type FactEvidenceRecord } from './factEvidence'

// Calibrated against the A4 preview/PDF usable content height (preview uses 988px).
export const CN_CAMPUS_ONE_PAGE_BUDGET = 980
export const CN_CAMPUS_DENSITY_TARGET = 0.85
export const CN_CAMPUS_UNDERFILLED_THRESHOLD = Math.ceil(CN_CAMPUS_ONE_PAGE_BUDGET * CN_CAMPUS_DENSITY_TARGET)
export const CN_CAMPUS_MODULE_TARGETS = { education: 0.15, experience: 0.25, projects: 0.4, skills: 0.1, other: 0.1 } as const

export interface ComposerSelection {
  experienceIds: string[]
  projectIds: string[]
  campusIds: string[]
  awardIds: string[]
  skillIds: string[]
  certificateIds: string[]
  conversationFactIds: string[]
  excludedFacts: ResumeComposition['excludedFacts']
}

export interface ComposerRevisionConstraints {
  /** Stable entry IDs which must survive this revision's one-page trim. */
  protectedEntryIds?: string[]
  /** User-requested bullets which must not be silently removed. */
  protectedBulletTexts?: string[]
}

function lines(value: string, chars = 46): number {
  return Math.max(1, Math.ceil(value.trim().length / chars))
}

export function estimateResumeCost(resume: GeneratedResume): number {
  let cost = 148
  if (resume.education.length) {
    cost += 34
    cost += resume.education.reduce((sum, item) => sum + 48 + (item.focus ? 18 : 0) + item.notes.reduce((noteSum, note) => noteSum + lines(note) * 19, 0), 0)
  }
  if (resume.experiences.length) {
    cost += 34
    cost += resume.experiences.reduce((sum, item) => sum + 48 + item.bullets.reduce((bulletSum, bullet) => bulletSum + lines(bullet) * 19, 0), 0)
  }
  if ((resume.projects || []).length) {
    cost += 34
    cost += (resume.projects || []).reduce((sum, item) => sum + 44 + (item.role ? 18 : 0) + item.bullets.reduce((bulletSum, bullet) => bulletSum + lines(bullet) * 19, 0), 0)
  }
  if ((resume.campusExperiences || []).length) {
    cost += 34
    cost += (resume.campusExperiences || []).reduce((sum, item) => sum + 44 + item.bullets.reduce((bulletSum, bullet) => bulletSum + lines(bullet) * 19, 0), 0)
  }
  if ((resume.awards || []).length) cost += 34 + (resume.awards || []).length * 31
  const skillCount = (resume.skillGroups || []).length + resume.skills.length + (resume.certificates || []).length
  if (skillCount) cost += 34 + skillCount * 22
  return cost
}

function normalizedProjectName(name: string): string {
  return name.toLowerCase().replace(/[\s，。；、：:（）()\[\]【】/|_-]/g, '')
}

function maxRequirementScore(record: FactEvidenceRecord, requirements: JDRequirement[]): number {
  return Math.max(0, ...requirements.map(requirement => scoreFactAgainstRequirement(record, requirement)))
}

export function chooseRelevantFacts(
  factBank: FactBank,
  requirements: JDRequirement[],
  matches: FactMatch[]
): ComposerSelection {
  const matchById = new Map(matches.map(match => [match.factId, match]))
  const score = (id: string) => matchById.get(id)?.relevanceScore || 0
  const excludedFacts: ResumeComposition['excludedFacts'] = []

  const experiences = [...factBank.experiences].sort((a, b) => score(b.id) - score(a.id))
  const selectedExperiences = experiences.filter(item => score(item.id) >= 18).slice(0, 2)
  if (!selectedExperiences.length && experiences[0]) selectedExperiences.push(experiences[0])

  const dedupedProjects = new Map<string, Project>()
  ;(factBank.projects || []).forEach(project => {
    const key = normalizedProjectName(project.name)
    const current = dedupedProjects.get(key)
    if (!current || project.bullets.join('').length > current.bullets.join('').length) dedupedProjects.set(key, project)
    if (current) excludedFacts.push({ factId: current.id, factType: 'project', label: current.name, reason: '与另一条项目记录重复，保留了信息更完整的版本', relevanceScore: score(current.id) })
  })
  const projects = [...dedupedProjects.values()].sort((a, b) => score(b.id) - score(a.id))
  const selectedProjects = projects.filter(item => score(item.id) >= 20).slice(0, 2)

  const conversationFacts = [...(factBank.conversationFacts || [])]
    .map(fact => ({
      fact,
      score: Math.max(score(fact.id), maxRequirementScore({ id: fact.id, type: 'conversation', label: fact.statement, text: fact.statement }, requirements)),
    }))
    .filter(item => item.score >= 30)
    .sort((a, b) => b.score - a.score)

  const campus = [...(factBank.campusExperiences || [])].sort((a, b) => score(b.id) - score(a.id))
  const selectedCampus = campus.filter(item => score(item.id) >= 42).slice(0, 1)
  const awards = [...(factBank.awards || [])].sort((a, b) => score(b.id) - score(a.id)).slice(0, 2)
  const skills = [...(factBank.skillGroups || [])].sort((a, b) => score(b.id) - score(a.id)).slice(0, 5)
  const certificates = [...(factBank.certificates || [])].sort((a, b) => score(b.id) - score(a.id)).slice(0, 3)

  const selectedIds = new Set([
    ...selectedExperiences.map(item => item.id),
    ...selectedProjects.map(item => item.id),
    ...selectedCampus.map(item => item.id),
    ...awards.map(item => item.id),
    ...skills.map(item => item.id),
    ...certificates.map(item => item.id),
    ...conversationFacts.map(item => item.fact.id),
  ])

  matches.forEach(match => {
    if (selectedIds.has(match.factId) || excludedFacts.some(item => item.factId === match.factId)) return
    excludedFacts.push({
      factId: match.factId,
      factType: match.factType,
      label: match.label,
      reason: match.relevanceScore < 20
        ? '与当前岗位要求关联较弱，为保持一页简历未采用'
        : '相关性低于本次已选择素材，为保持重点集中未采用',
      relevanceScore: match.relevanceScore,
    })
  })

  return {
    experienceIds: selectedExperiences.map(item => item.id),
    projectIds: selectedProjects.map(item => item.id),
    campusIds: selectedCampus.map(item => item.id),
    awardIds: awards.map(item => item.id),
    skillIds: skills.map(item => item.id),
    certificateIds: certificates.map(item => item.id),
    conversationFactIds: conversationFacts.map(item => item.fact.id),
    excludedFacts,
  }
}

function removeEvidenceForItem(resume: GeneratedResume, section: 'experience' | 'project' | 'campus', itemId: string): GeneratedResume {
  return { ...resume, bulletEvidence: (resume.bulletEvidence || []).filter(item => !(item.section === section && item.itemId === itemId)) }
}

export function trimComposedResume(
  resume: GeneratedResume,
  matches: FactMatch[],
  budget = CN_CAMPUS_ONE_PAGE_BUDGET,
  revision: ComposerRevisionConstraints = {},
): GeneratedResume {
  let result = { ...resume }
  const score = (id: string) => matches.find(match => match.factId === id)?.relevanceScore || 0
  const excluded = [...(result.composition?.excludedFacts || [])]
  const protectedEntries = new Set(revision.protectedEntryIds || [])
  const protectedBullets = new Set((revision.protectedBulletTexts || []).map(normalizedBullet))
  const isProtectedBullet = (bullet: string) => protectedBullets.has(normalizedBullet(bullet))

  while (estimateResumeCost(result) > budget) {
    const removableProjects = [...(result.projects || [])]
      .filter(project => !project.id.startsWith('conversation-project-') && !protectedEntries.has(project.id))
      .sort((a, b) => score(a.id) - score(b.id))
    if (removableProjects.length) {
      const project = removableProjects[0]
      result = removeEvidenceForItem({ ...result, projects: (result.projects || []).filter(item => item.id !== project.id) }, 'project', project.id)
      excluded.push({ factId: project.id, factType: 'project', label: project.name, reason: '预计超出一页，自动移除相关性最低的项目', relevanceScore: score(project.id) })
      continue
    }

    const removableCampus = (result.campusExperiences || []).find(item => !protectedEntries.has(item.id))
    if (removableCampus) {
      const campus = removableCampus
      result = removeEvidenceForItem({ ...result, campusExperiences: [] }, 'campus', campus.id)
      excluded.push({ factId: campus.id, factType: 'campus', label: campus.organization, reason: '预计超出一页，优先保留岗位相关实习和项目', relevanceScore: score(campus.id) })
      continue
    }

    const bulletCandidate = [...result.experiences]
      .map((experience, index) => ({
        experience,
        index,
        score: score(experience.sourceFactId || ''),
        removableIndex: experience.bullets.map((bullet, bulletIndex) => ({ bullet, bulletIndex })).reverse().find(item => !isProtectedBullet(item.bullet))?.bulletIndex ?? -1,
      }))
      .filter(item => item.experience.bullets.length > 1 && item.removableIndex >= 0)
      .sort((a, b) => a.score - b.score)[0]
    if (bulletCandidate) {
      const nextBullets = bulletCandidate.experience.bullets.filter((_, index) => index !== bulletCandidate.removableIndex)
      result = {
        ...result,
        experiences: result.experiences.map((item, index) => index === bulletCandidate.index ? { ...item, bullets: nextBullets } : item),
        bulletEvidence: (result.bulletEvidence || []).flatMap(item => {
          if (item.section !== 'experience' || item.itemId !== (bulletCandidate.experience.sourceFactId || '')) return [item]
          if (item.bulletIndex === bulletCandidate.removableIndex) return []
          return [{ ...item, bulletIndex: item.bulletIndex > bulletCandidate.removableIndex ? item.bulletIndex - 1 : item.bulletIndex }]
        }),
      }
      continue
    }

    const projectBulletCandidate = [...(result.projects || [])]
      .map((project, index) => ({
        project,
        index,
        score: score(project.id),
        removableIndex: project.bullets.map((bullet, bulletIndex) => ({ bullet, bulletIndex })).reverse().find(item => !isProtectedBullet(item.bullet))?.bulletIndex ?? -1,
      }))
      .filter(item => item.project.bullets.length > 1 && item.removableIndex >= 0)
      .sort((a, b) => a.score - b.score)[0]
    if (projectBulletCandidate) {
      const nextBullets = projectBulletCandidate.project.bullets.filter((_, index) => index !== projectBulletCandidate.removableIndex)
      result = {
        ...result,
        projects: (result.projects || []).map((item, index) => index === projectBulletCandidate.index ? { ...item, bullets: nextBullets } : item),
        bulletEvidence: (result.bulletEvidence || []).flatMap(item => {
          if (item.section !== 'project' || item.itemId !== projectBulletCandidate.project.id) return [item]
          if (item.bulletIndex === projectBulletCandidate.removableIndex) return []
          return [{ ...item, bulletIndex: item.bulletIndex > projectBulletCandidate.removableIndex ? item.bulletIndex - 1 : item.bulletIndex }]
        }),
      }
      continue
    }

    if ((result.awards || []).length > 1) {
      const removed = (result.awards || []).at(-1)!
      result = { ...result, awards: (result.awards || []).slice(0, -1) }
      excluded.push({ factId: removed.id, factType: 'award', label: removed.title, reason: '预计超出一页，奖项仅保留更相关条目', relevanceScore: score(removed.id) })
      continue
    }

    if ((result.skillGroups || []).length > 2) {
      const removed = (result.skillGroups || []).at(-1)!
      result = { ...result, skillGroups: (result.skillGroups || []).slice(0, -1) }
      excluded.push({ factId: removed.id, factType: 'skill', label: removed.label, reason: '预计超出一页，精简低优先级技能分类', relevanceScore: score(removed.id) })
      continue
    }

    if (result.experiences.length > 1) {
      const sorted = [...result.experiences].filter(item => !protectedEntries.has(item.id || item.sourceFactId || '')).sort((a, b) => score(a.sourceFactId || '') - score(b.sourceFactId || ''))
      if (!sorted.length) break
      const removed = sorted[0]
      result = removeEvidenceForItem({ ...result, experiences: result.experiences.filter(item => item !== removed) }, 'experience', removed.sourceFactId || '')
      excluded.push({ factId: removed.sourceFactId || removed.company, factType: 'experience', label: removed.company, reason: '高相关内容仍超出一页，移除相关性较低的实习经历', relevanceScore: score(removed.sourceFactId || '') })
      continue
    }
    break
  }

  const estimatedCost = estimateResumeCost(result)
  return {
    ...result,
    composition: {
      targetPages: 1,
      estimatedCost,
      budget,
      fitsOnePage: estimatedCost <= budget,
      selectedFactIds: [
        ...result.experiences.map(item => item.sourceFactId || item.company),
        ...(result.projects || []).map(item => item.id),
        ...(result.campusExperiences || []).map(item => item.id),
        ...(result.awards || []).map(item => item.id),
        ...(result.skillGroups || []).map(item => item.id),
      ],
      excludedFacts: excluded,
      suggestions: estimatedCost <= budget ? [] : ['当前高相关内容仍较多，建议继续精简一条项目或一条经历要点。'],
      densityTarget: CN_CAMPUS_DENSITY_TARGET,
      estimatedDensity: Math.min(1, estimatedCost / budget),
      moduleTargets: { ...CN_CAMPUS_MODULE_TARGETS },
    },
  }
}

function normalizedBullet(value: string): string {
  return value.toLowerCase().replace(/[\s，。；、：:（）()\[\]【】/|_-]/g, '')
}

function appendVerifiedBullets(current: string[], source: string[], limit: number): string[] {
  const seen = new Set(current.map(normalizedBullet))
  const additions = source.filter(item => item.trim() && !seen.has(normalizedBullet(item)))
  return [...current, ...additions].slice(0, limit)
}

/**
 * Raise a sparse campus resume toward the one-page target using only text that
 * already exists in the Fact Bank. This is deliberately deterministic: JD
 * requirements affect ranking, never the content that gets inserted.
 */
export function enrichUnderfilledResume(
  resume: GeneratedResume,
  factBank: FactBank,
  matches: FactMatch[],
  budget = CN_CAMPUS_ONE_PAGE_BUDGET
): GeneratedResume {
  let result = { ...resume }
  const score = (id: string) => matches.find(match => match.factId === id)?.relevanceScore || 0
  const evidence = [...(result.bulletEvidence || [])]
  const addEvidence = (section: ResumeBullet['section'], itemId: string, bullets: string[], sourceFactIds: string[]) => {
    bullets.forEach((text, bulletIndex) => {
      if (evidence.some(item => item.section === section && item.itemId === itemId && item.bulletIndex === bulletIndex)) return
      evidence.push({
        id: `verified-${section}-${itemId}-${bulletIndex}`,
        section,
        itemId,
        bulletIndex,
        text,
        sourceFactIds,
        matchedRequirementIds: [...new Set(sourceFactIds.flatMap(id => matches.find(match => match.factId === id)?.requirementIds || []))],
        rewriteReason: '为提升一页信息完整度，保留经历库中的原始真实表述',
      })
    })
  }
  const accept = (candidate: GeneratedResume) => {
    if (estimateResumeCost(candidate) > budget) return false
    result = candidate
    return true
  }

  // First restore detail inside already selected, high-value entries.
  result.experiences.forEach((experience, index) => {
    if (estimateResumeCost(result) >= CN_CAMPUS_UNDERFILLED_THRESHOLD) return
    const source = factBank.experiences.find(item => item.id === experience.sourceFactId)
    if (!source) return
    const sourceBullets = [...source.versions].sort((a, b) => b.bullets.length - a.bullets.length).flatMap(version => version.bullets)
    const bullets = appendVerifiedBullets(experience.bullets, sourceBullets, 3)
    if (bullets.length === experience.bullets.length) return
    const candidate = { ...result, experiences: result.experiences.map((item, itemIndex) => itemIndex === index ? { ...item, bullets } : item) }
    if (accept(candidate)) addEvidence('experience', source.id, bullets, [source.id])
  })
  ;(result.projects || []).forEach((project, index) => {
    if (estimateResumeCost(result) >= CN_CAMPUS_UNDERFILLED_THRESHOLD) return
    const source = factBank.projects?.find(item => item.id === project.id)
    if (!source) return
    const bullets = appendVerifiedBullets(project.bullets, source.bullets, 3)
    if (bullets.length === project.bullets.length) return
    const candidate = { ...result, projects: (result.projects || []).map((item, itemIndex) => itemIndex === index ? { ...item, bullets } : item) }
    if (accept(candidate)) addEvidence('project', source.id, bullets, [source.id])
  })

  // Then restore omitted but still relevant evidence in ranking order.
  const experienceIds = new Set(result.experiences.map(item => item.sourceFactId))
  for (const source of [...factBank.experiences].sort((a, b) => score(b.id) - score(a.id))) {
    if (estimateResumeCost(result) >= CN_CAMPUS_UNDERFILLED_THRESHOLD || result.experiences.length >= 2) break
    if (experienceIds.has(source.id) || score(source.id) < 18) continue
    const version = [...source.versions].sort((a, b) => b.bullets.length - a.bullets.length)[0]
    if (!version?.bullets.some(item => item.trim())) continue
    const bullets = version.bullets.filter(item => item.trim()).slice(0, 3)
    const candidate = { ...result, experiences: [...result.experiences, { sourceFactId: source.id, company: source.company, title: version.title, location: source.location, startDate: source.startDate, endDate: source.endDate, bullets }] }
    if (accept(candidate)) {
      experienceIds.add(source.id)
      addEvidence('experience', source.id, bullets, [source.id])
    }
  }
  const projectIds = new Set((result.projects || []).map(item => item.id))
  for (const source of [...(factBank.projects || [])].sort((a, b) => score(b.id) - score(a.id))) {
    if (estimateResumeCost(result) >= CN_CAMPUS_UNDERFILLED_THRESHOLD || (result.projects || []).length >= 3) break
    if (projectIds.has(source.id) || score(source.id) < 20 || !source.bullets.some(item => item.trim())) continue
    const project = { ...source, bullets: source.bullets.filter(item => item.trim()).slice(0, 3) }
    if (accept({ ...result, projects: [...(result.projects || []), project] })) {
      projectIds.add(source.id)
      addEvidence('project', source.id, project.bullets, [source.id])
    }
  }

  if (!result.education.length && factBank.education.length) accept({ ...result, education: factBank.education.map(item => ({ ...item, notes: [...item.notes] })) })
  for (const award of [...(factBank.awards || [])].sort((a, b) => score(b.id) - score(a.id))) {
    if (estimateResumeCost(result) >= CN_CAMPUS_UNDERFILLED_THRESHOLD || (result.awards || []).length >= 3) break
    if ((result.awards || []).some(item => item.id === award.id)) continue
    accept({ ...result, awards: [...(result.awards || []), { ...award }] })
  }
  for (const group of [...(factBank.skillGroups || [])].sort((a, b) => score(b.id) - score(a.id))) {
    if (estimateResumeCost(result) >= CN_CAMPUS_UNDERFILLED_THRESHOLD || (result.skillGroups || []).length >= 5) break
    if ((result.skillGroups || []).some(item => item.id === group.id)) continue
    accept({ ...result, skillGroups: [...(result.skillGroups || []), { ...group, items: [...group.items] }] })
  }
  for (const certificate of factBank.certificates || []) {
    if (estimateResumeCost(result) >= CN_CAMPUS_UNDERFILLED_THRESHOLD || (result.certificates || []).length >= 3) break
    if ((result.certificates || []).some(item => item.id === certificate.id)) continue
    accept({ ...result, certificates: [...(result.certificates || []), { ...certificate }] })
  }

  return trimComposedResume({ ...result, bulletEvidence: evidence }, matches, budget)
}
