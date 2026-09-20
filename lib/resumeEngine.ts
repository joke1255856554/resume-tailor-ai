import 'server-only'

export type ResumeAIEngine = 'codex' | 'legacy'

/**
 * Codex is the product default. Legacy remains an explicit environment-level
 * rollback switch during the migration and is never exposed in normal UI.
 */
export function getResumeAIEngine(): ResumeAIEngine {
  return process.env.RESUME_AI_ENGINE === 'legacy' ? 'legacy' : 'codex'
}
