import 'server-only'

export type ResumeAIEngine = 'codex' | 'legacy'

/**
 * Codex is the local product default. Render cannot reuse the developer's local
 * Codex login, so hosted deployments fall back to the API-key based engine.
 * Development can still be overridden explicitly. Production deliberately
 * ignores a stale `RESUME_AI_ENGINE=codex` value because the hosted container
 * does not have the developer's local Codex runtime.
 */
export function getResumeAIEngine(): ResumeAIEngine {
  if (process.env.NODE_ENV === 'production') return 'legacy'
  if (process.env.RESUME_AI_ENGINE === 'codex') return 'codex'
  if (process.env.RESUME_AI_ENGINE === 'legacy') return 'legacy'
  return 'codex'
}
