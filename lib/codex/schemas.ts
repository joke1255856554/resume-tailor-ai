import type { JDRequirementCategory } from '../types'
import { GenerationError } from '../generationDiagnostics'

export type CodexResumeAction = 'ask' | 'confirm_facts' | 'resume_generated' | 'resume_updated'

export interface CodexResumeDraft {
  education: Array<{ sourceFactId: string }>
  experiences: Array<{
    sourceFactId: string
    title: string
    bullets: string[]
  }>
  projects: Array<{
    id: string
    sourceFactIds: string[]
    name: string
    role: string
    startDate: string
    endDate: string
    bullets: string[]
  }>
  campusExperiences: Array<{
    sourceFactId: string
    bullets: string[]
  }>
  awardIds: string[]
  skillGroupIds: string[]
  certificateIds: string[]
  skills: string[]
}

export interface CodexResumeAgentOutput {
  action: CodexResumeAction
  assistantMessage: string
  factCandidates: Array<{
    statement: string
    category: JDRequirementCategory | 'general'
    candidateType: 'evidence' | 'gap'
    rationale: string
  }>
  resumeDraft: CodexResumeDraft | null
  changeSummary: string[]
}

const stringArray = { type: 'array', items: { type: 'string' } } as const

export const CODEX_RESUME_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['ask', 'confirm_facts', 'resume_generated', 'resume_updated'] },
    assistantMessage: { type: 'string' },
    factCandidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          statement: { type: 'string' },
          category: { type: 'string', enum: ['content_creation', 'aigc', 'video', 'copywriting', 'visual', 'data', 'collaboration', 'brand', 'other', 'general'] },
          candidateType: { type: 'string', enum: ['evidence', 'gap'] },
          rationale: { type: 'string' },
        },
        required: ['statement', 'category', 'candidateType', 'rationale'],
        additionalProperties: false,
      },
    },
    resumeDraft: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          properties: {
            education: {
              type: 'array',
              items: { type: 'object', properties: { sourceFactId: { type: 'string' } }, required: ['sourceFactId'], additionalProperties: false },
            },
            experiences: {
              type: 'array',
              items: {
                type: 'object',
                properties: { sourceFactId: { type: 'string' }, title: { type: 'string' }, bullets: stringArray },
                required: ['sourceFactId', 'title', 'bullets'],
                additionalProperties: false,
              },
            },
            projects: {
              type: 'array',
              items: {
                type: 'object',
                properties: { id: { type: 'string' }, sourceFactIds: stringArray, name: { type: 'string' }, role: { type: 'string' }, startDate: { type: 'string' }, endDate: { type: 'string' }, bullets: stringArray },
                required: ['id', 'sourceFactIds', 'name', 'role', 'startDate', 'endDate', 'bullets'],
                additionalProperties: false,
              },
            },
            campusExperiences: {
              type: 'array',
              items: {
                type: 'object',
                properties: { sourceFactId: { type: 'string' }, bullets: stringArray },
                required: ['sourceFactId', 'bullets'],
                additionalProperties: false,
              },
            },
            awardIds: stringArray,
            skillGroupIds: stringArray,
            certificateIds: stringArray,
            skills: stringArray,
          },
          required: ['education', 'experiences', 'projects', 'campusExperiences', 'awardIds', 'skillGroupIds', 'certificateIds', 'skills'],
          additionalProperties: false,
        },
      ],
    },
    changeSummary: stringArray,
  },
  required: ['action', 'assistantMessage', 'factCandidates', 'resumeDraft', 'changeSummary'],
  additionalProperties: false,
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function hasString(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'string'
}

function isEducationDraft(value: unknown): boolean {
  return isRecord(value) && hasString(value, 'sourceFactId')
}

function isExperienceDraft(value: unknown): boolean {
  return isRecord(value)
    && hasString(value, 'sourceFactId')
    && hasString(value, 'title')
    && isStringArray(value.bullets)
}

function isProjectDraft(value: unknown): boolean {
  return isRecord(value)
    && hasString(value, 'id')
    && isStringArray(value.sourceFactIds)
    && hasString(value, 'name')
    && hasString(value, 'role')
    && hasString(value, 'startDate')
    && hasString(value, 'endDate')
    && isStringArray(value.bullets)
}

function isCampusDraft(value: unknown): boolean {
  return isRecord(value)
    && hasString(value, 'sourceFactId')
    && isStringArray(value.bullets)
}

export function parseCodexResumeOutput(value: string): CodexResumeAgentOutput {
  let parsed: unknown
  const normalized = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    parsed = JSON.parse(normalized)
  } catch (error) {
    const match = error instanceof Error ? error.message.match(/position\s+(\d+)/i) : null
    throw new GenerationError({
      stage: 'parse-output', category: 'parse', message: 'Codex 返回的结构化结果不是有效 JSON。', retryable: true,
      outputLength: value.length, parsePosition: match ? Number(match[1]) : undefined,
    }, { cause: error })
  }
  const schemaError = (message: string, issues: string[]): never => {
    throw new GenerationError({ stage: 'parse-output', category: 'schema', message, retryable: true, outputLength: value.length, schemaIssues: issues }, { cause: new Error(message) })
  }
  if (!isRecord(parsed)) return schemaError('Codex 返回结果缺少结构化对象。', ['root:not-object'])
  const actions = ['ask', 'confirm_facts', 'resume_generated', 'resume_updated']
  const categories = ['content_creation', 'aigc', 'video', 'copywriting', 'visual', 'data', 'collaboration', 'brand', 'other', 'general']
  if (!actions.includes(String(parsed.action)) || typeof parsed.assistantMessage !== 'string' || !isStringArray(parsed.changeSummary)) {
    schemaError('Codex 返回结果未通过运行时校验。', ['action|assistantMessage|changeSummary'])
  }
  if (!Array.isArray(parsed.factCandidates) || !parsed.factCandidates.every(item => isRecord(item)
    && typeof item.statement === 'string'
    && categories.includes(String(item.category))
    && ['evidence', 'gap'].includes(String(item.candidateType))
    && typeof item.rationale === 'string')) {
    schemaError('Codex 候选事实格式不正确。', ['factCandidates'])
  }
  if (parsed.resumeDraft !== null) {
    if (!isRecord(parsed.resumeDraft)) return schemaError('Codex Resume Draft 格式不正确。', ['resumeDraft:not-object'])
    const draft = parsed.resumeDraft
    if (
      !Array.isArray(draft.education) || !draft.education.every(isEducationDraft)
      || !Array.isArray(draft.experiences) || !draft.experiences.every(isExperienceDraft)
      || !Array.isArray(draft.projects) || !draft.projects.every(isProjectDraft)
      || !Array.isArray(draft.campusExperiences) || !draft.campusExperiences.every(isCampusDraft)
      || !isStringArray(draft.awardIds)
      || !isStringArray(draft.skillGroupIds)
      || !isStringArray(draft.certificateIds)
      || !isStringArray(draft.skills)
    ) {
      schemaError('Codex Resume Draft 缺少必要字段。', ['resumeDraft:required-fields'])
    }
  }
  return parsed as unknown as CodexResumeAgentOutput
}
