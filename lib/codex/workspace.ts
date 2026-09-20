import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { FactBank, GeneratedResume, ResumeAssistantMessage } from '../types'
import { normalizeFactBank, normalizeResume } from '../normalize'
import { RESUME_AGENT_RULES } from './resumeAgentPrompt'

const WORKSPACE_ROOT_NAME = '.codex-resume-workspaces'

function safeSessionId(sessionId: string): string {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(sessionId)) throw new Error('Codex 实验 Session ID 不合法。')
  return sessionId
}

export function getResumeWorkspacePath(sessionId: string): string {
  const root = path.resolve(process.cwd(), WORKSPACE_ROOT_NAME)
  const workspace = path.resolve(root, safeSessionId(sessionId))
  if (!workspace.startsWith(`${root}${path.sep}`)) throw new Error('Codex Resume workspace 路径越界。')
  return workspace
}

export async function syncResumeWorkspace(args: {
  sessionId: string
  factBank: FactBank
  jobDescription: string
  company?: string
  role?: string
  currentResume?: GeneratedResume | null
  sessionEvidence?: FactBank['conversationFacts']
  messages?: ResumeAssistantMessage[]
  latestInstruction?: string
}): Promise<string> {
  const workspace = getResumeWorkspacePath(args.sessionId)
  await mkdir(workspace, { recursive: true })
  const factBank = normalizeFactBank(args.factBank)
  const resume = normalizeResume(args.currentResume) || null
  // The agent needs contact text, not the embedded image bytes. A real avatar can
  // add tens or hundreds of KB twice (profile + current resume), making every
  // Codex turn spend most of its budget reading irrelevant base64 data.
  const agentFactBank = {
    ...factBank,
    contact: { ...factBank.contact, avatar: '' },
  }
  // current-resume.json is an editing reference. Matching matrices, provenance
  // records and JD analysis are deterministic application output and are rebuilt
  // after the turn; sending them back to the model only inflates context.
  const agentResume = resume ? {
    contact: { ...resume.contact, avatar: '' },
    education: resume.education,
    experiences: resume.experiences,
    projects: resume.projects,
    campusExperiences: resume.campusExperiences,
    awards: resume.awards,
    skillGroups: resume.skillGroups,
    certificates: resume.certificates,
    skills: resume.skills,
    sectionOrder: resume.sectionOrder,
    polishStyle: resume.polishStyle,
    composition: resume.composition,
  } : null
  const jd = [`# Target Job`, args.company ? `Company: ${args.company}` : '', args.role ? `Role: ${args.role}` : '', '', args.jobDescription.trim()].filter(Boolean).join('\n')
  const context = {
    sessionEvidence: args.sessionEvidence || [],
    recentMessages: (args.messages || []).slice(-12),
    latestInstruction: args.latestInstruction || '',
    note: 'sessionEvidence 可立即用于当前简历，但只有用户确认后才会长期写入 Fact Bank。',
  }
  await Promise.all([
    writeFile(path.join(workspace, 'master-profile.json'), JSON.stringify(agentFactBank, null, 2), 'utf8'),
    writeFile(path.join(workspace, 'job-description.md'), jd, 'utf8'),
    writeFile(path.join(workspace, 'current-resume.json'), JSON.stringify(agentResume, null, 2), 'utf8'),
    writeFile(path.join(workspace, 'conversation-context.json'), JSON.stringify(context, null, 2), 'utf8'),
    writeFile(path.join(workspace, 'RESUME_AGENT.md'), RESUME_AGENT_RULES, 'utf8'),
  ])
  return workspace
}
