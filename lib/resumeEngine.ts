import 'server-only'

export type ResumeAIEngine = 'codex' | 'legacy'

/**
 * Codex is the local product default. Render cannot reuse the developer's local
 * Codex login, so hosted deployments fall back to the API-key based engine.
 * Either environment can still be overridden explicitly.
 */
export function getResumeAIEngine(): ResumeAIEngine {
  if (process.env.RESUME_AI_ENGINE === 'codex') return 'codex'
  if (process.env.RESUME_AI_ENGINE === 'legacy') return 'legacy'
  return process.env.NODE_ENV === 'production' ? 'legacy' : 'codex'
}
