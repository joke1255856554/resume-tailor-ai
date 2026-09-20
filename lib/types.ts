export interface Version {
  id: string
  title: string
  bullets: string[]
  sourceFile?: string
}

export interface Experience {
  id: string
  company: string
  location: string
  startDate: string
  endDate: string
  versions: Version[]
}

export interface Education {
  id: string
  school: string
  location: string
  degree: string
  field: string
  focus?: string
  startDate: string
  endDate: string
  notes: string[]
}

export interface Contact {
  name: string
  email: string
  phone: string
  location: string
  linkedin: string
  github: string
  website: string
  avatar?: string
  jobTarget?: string
  wechat?: string
}

export interface Award {
  id: string
  title: string
  issuer?: string
  date?: string
  description?: string
}

export interface CampusExperience {
  id: string
  organization: string
  role: string
  location?: string
  startDate?: string
  endDate?: string
  bullets: string[]
}

export interface Certificate {
  id: string
  name: string
  issuer?: string
  date?: string
  score?: string
  description?: string
}

export interface SkillGroup {
  id: string
  label: string
  items: string[]
}

export type FactSourceType = 'import' | 'manual' | 'conversation'

export interface FactSource {
  sourceType: FactSourceType
  conversationId?: string
  messageId?: string
  createdAt?: string
}

export interface ConversationFact {
  id: string
  statement: string
  category: JDRequirementCategory | 'general'
  source: FactSource
}

export interface FactConstraint {
  id: string
  kind: 'denial' | 'correction'
  statement: string
  blockedKeywords: string[]
  source: FactSource
}

export type JDRequirementCategory =
  | 'content_creation'
  | 'aigc'
  | 'video'
  | 'copywriting'
  | 'visual'
  | 'data'
  | 'collaboration'
  | 'brand'
  | 'other'

export type JDRequirementImportance = 'core' | 'important' | 'bonus'

export interface JDRequirement {
  id: string
  category: JDRequirementCategory
  requirement: string
  importance: JDRequirementImportance
  keywords: string[]
}

export type FactEvidenceStrength = 'strong' | 'partial' | 'weak'

export interface FactMatch {
  factId: string
  factType: 'experience' | 'project' | 'campus' | 'award' | 'skill' | 'certificate' | 'conversation'
  label: string
  requirementIds: string[]
  relevanceScore: number
  evidenceStrength: FactEvidenceStrength
  reasons: string[]
}

export interface RequirementGap {
  requirementId: string
  status: 'sufficient' | 'partial' | 'missing'
  matchedFactIds: string[]
  explanation: string
}

export interface ResumeBullet {
  id: string
  section: 'experience' | 'project' | 'campus'
  itemId: string
  bulletIndex: number
  text: string
  sourceFactIds: string[]
  matchedRequirementIds: string[]
  rewriteReason: string
}

export interface ExcludedResumeFact {
  factId: string
  factType: FactMatch['factType']
  label: string
  reason: string
  relevanceScore: number
}

export interface ResumeComposition {
  targetPages: 1
  estimatedCost: number
  budget: number
  fitsOnePage: boolean
  selectedFactIds: string[]
  excludedFacts: ExcludedResumeFact[]
  suggestions: string[]
  densityTarget?: number
  estimatedDensity?: number
  moduleTargets?: { education: number; experience: number; projects: number; skills: number; other: number }
}

export type ResumePolishStyle = 'conservative' | 'standard' | 'targeted'

export interface ConversationFactCandidate {
  id: string
  statement: string
  category: JDRequirementCategory | 'general'
  /** Evidence is explicitly stated by the user; a gap is only an optional prompt. */
  candidateType?: 'evidence' | 'gap'
  rationale?: string
  confidence: 'confirmed' | 'unconfirmed'
  source: FactSource
}

export interface ResumeAgentSummary {
  adopted: string[]
  excluded: Array<{ label: string; reason: string }>
}

export interface ResumeStrategy {
  persona: string
  targetJob: string
  coreStrengths: string[]
  structureStrategy: string
  adopted: Array<{ label: string; reason: string }>
  excluded: Array<{ label: string; reason: string }>
}

export interface ResumeAgentActivity {
  stage: 'read_jd' | 'extract_model' | 'scan_facts' | 'build_matches' | 'plan_structure' | 'write_projects' | 'validate_truth' | 'optimize_page'
  label: string
  state: 'active' | 'done' | 'failed'
  elapsedMs?: number
  result?: string
}

export interface ResumeAssistantMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface ResumeAssistantResponse {
  assistantMessage: string
  factCandidates: ConversationFactCandidate[]
  openQuestions: string[]
  questionKeys: string[]
  denials: FactConstraint[]
  assistantPhase: ResumeAssistantPhase
  sufficiency: ResumeEvidenceSufficiency
}

export type ResumeAssistantPhase = 'idle' | 'clarifying' | 'ready' | 'stopped'

export type ResumeGenerationStatus = 'idle' | 'generating' | 'completed' | 'failed' | 'interrupted'

export type ResumeCandidateState = 'pending' | 'confirmed' | 'ignored'

export interface ResumeEvidenceSufficiency {
  isSufficient: boolean
  hasBlockingGap: boolean
  coreCoverageRatio: number
  relevantFactCount: number
  roleRelatedPracticeCount: number
  summary: string
}

export type ResumeTemplateId =
  | 'cn-campus-classic'
  | 'cn-campus-two-column'
  | 'cn-general-classic'
  | 'ats-classic'

export interface ResumeTemplatePreference {
  showAvatar: boolean
}

export interface ResumeSettings {
  templateId: ResumeTemplateId
  showAvatar: boolean
  language?: 'zh-CN' | 'en'
  requestedTemplateId?: ResumeTemplateId
  resolvedTemplateId?: ResumeTemplateId
  templatePreferences?: Partial<Record<ResumeTemplateId, ResumeTemplatePreference>>
}

export interface Project {
  id: string
  name: string
  role?: string
  startDate: string
  endDate: string
  bullets: string[]
  link?: string
}

export interface FactBank {
  contact: Contact
  experiences: Experience[]
  education: Education[]
  skills: string[]
  projects?: Project[]
  skillGroups?: SkillGroup[]
  awards?: Award[]
  campusExperiences?: CampusExperience[]
  certificates?: Certificate[]
  conversationFacts?: ConversationFact[]
  factConstraints?: FactConstraint[]
  schemaVersion?: number
}

export interface GeneratedExperience {
  /** Stable resume-entry identity. Legacy resumes receive one during normalization. */
  id?: string
  sourceFactId?: string
  company: string
  title: string
  location: string
  startDate: string
  endDate: string
  bullets: string[]
}

export type ResumeSectionType = 'experience' | 'project' | 'campus'
export type ResumeDisplaySection = 'education' | 'experience' | 'projects' | 'campus' | 'awards' | 'skills'

export interface ResumeEditIntent {
  type: 'add' | 'remove' | 'rewrite' | 'compress' | 'expand' | 'reorder' | 'emphasize'
  targetSection: ResumeSectionType
  targetEntryId: string
  targetLabel: string
  topic?: string
  instruction: string
  preserveUnrelatedContent: boolean
  maxBullets?: number
  operation: 'replace_entry_bullets' | 'insert_bullet' | 'replace_bullet' | 'remove_bullet' | 'remove_entry'
}

export interface ResumeChangeSummary {
  changedEntries: string[]
  addedBullets: string[]
  removedBullets: string[]
  rewrittenBullets: string[]
  unchangedUnrelatedEntries: boolean
}

export interface JDReport {
  role: string
  company: string
  titleKeywords: string[]
  hardSkills: string[]
  actionKeywords: string[]
  businessContext: string[]
  domainKeywords: string[]
  hardFilters: string[]
  top10: string[]
  alreadyHave: string[]
  needToAdd: string[]
}

export interface GeneratedResume {
  contact: Contact
  education: Education[]
  skills: string[]
  experiences: GeneratedExperience[]
  projects?: Project[]
  skillGroups?: SkillGroup[]
  awards?: Award[]
  campusExperiences?: CampusExperience[]
  certificates?: Certificate[]
  /** Persisted visual module order shared by preview and PDF renderers. */
  sectionOrder?: ResumeDisplaySection[]
  requirements?: JDRequirement[]
  factMatches?: FactMatch[]
  requirementGaps?: RequirementGap[]
  bulletEvidence?: ResumeBullet[]
  composition?: ResumeComposition
  polishStyle?: ResumePolishStyle
  jdKeywordCoverage: {
    covered: string[]
    missing: string[]
    beforeCovered: string[]
    beforeMissing: string[]
    hardSkillsMissing: string[]
    score: number
    beforeScore: number
  }
  jdReport: JDReport
}

export interface ResumeCustomizationSession {
  id: string
  /** Stable UI-only job name. It never changes company, role, JD, or session identity. */
  displayName?: string
  displayNameSource?: 'auto' | 'manual'
  /** Codex Resume Agent thread bound to this job-customization session. */
  codexThreadId?: string | null
  company: string
  role: string
  jobDescription: string
  jobUrl: string
  jdAnalysis: JDReport | null
  messages: ResumeAssistantMessage[]
  factCandidates: ConversationFactCandidate[]
  candidateStates: Record<string, ResumeCandidateState>
  candidateText: Record<string, string>
  confirmedConversationFacts: ConversationFact[]
  denials: FactConstraint[]
  askedQuestionKeys: string[]
  openQuestions: string[]
  currentResume: GeneratedResume | null
  selectedFacts: string[]
  excludedFacts: ExcludedResumeFact[]
  resumeSettings: ResumeSettings
  polishStyle: ResumePolishStyle
  assistantPhase: ResumeAssistantPhase
  assistantStatus: 'idle' | 'sending'
  assistantError: string
  clarificationRounds: number
  generationStatus: ResumeGenerationStatus
  generationError: string
  /** Safe, user-facing activity only. It never contains model reasoning or tool events. */
  agentStage?: { stage: 'reading_jd' | 'scanning_facts' | 'matching_role' | 'selecting_evidence' | 'structuring_resume' | 'validating_facts' | 'optimizing_page'; message: string } | null
  agentSummary?: ResumeAgentSummary | null
  resumeStrategy?: ResumeStrategy | null
  agentActivities?: ResumeAgentActivity[]
  /** Ephemeral development-only diagnostics. Omitted from persisted sessions. */
  generationDiagnostic?: {
    runId: string
    stage: string
    category: string
    retryable: boolean
    summary: string
  } | null
  lastGenerationId: string | null
  createdAt: string
  updatedAt: string
}

export interface Application {
  id: string
  date: string
  company: string
  role: string
  resume: GeneratedResume | null
  jdText: string | null
  resumeSettings?: ResumeSettings
}
