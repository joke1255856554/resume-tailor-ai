export type GenerationStage =
  | 'prepare-context'
  | 'resume-thread'
  | 'create-thread'
  | 'agent-request'
  | 'parse-output'
  | 'validate-output'
  | 'compose-resume'
  | 'persist-session'
  | 'complete'

export type GenerationErrorCategory =
  | 'network'
  | 'rate-limit'
  | 'thread'
  | 'timeout'
  | 'abort'
  | 'parse'
  | 'schema'
  | 'validation'
  | 'composer'
  | 'persistence'
  | 'unknown'

export interface GenerationErrorInfo {
  stage: GenerationStage
  category: GenerationErrorCategory
  message: string
  retryable: boolean
  statusCode?: number
  errorCode?: string
  outputLength?: number
  parsePosition?: number
  schemaIssues?: string[]
}

type ErrorLike = {
  name?: unknown
  message?: unknown
  code?: unknown
  status?: unknown
  statusCode?: unknown
  cause?: unknown
}

function errorChain(error: unknown): ErrorLike[] {
  const chain: ErrorLike[] = []
  const seen = new Set<unknown>()
  let current = error
  while (current && !seen.has(current)) {
    seen.add(current)
    if (typeof current === 'object') {
      const value = current as ErrorLike
      chain.push(value)
      current = value.cause
    } else {
      chain.push({ message: String(current) })
      break
    }
  }
  return chain
}

function numericStatus(chain: ErrorLike[]): number | undefined {
  for (const item of chain) {
    const value = typeof item.statusCode === 'number' ? item.statusCode : item.status
    if (typeof value === 'number') return value
  }
  return undefined
}

export class GenerationError extends Error {
  readonly info: GenerationErrorInfo

  constructor(info: GenerationErrorInfo, options?: { cause?: unknown }) {
    super(info.message, options)
    this.name = 'GenerationError'
    this.info = info
  }
}

export function classifyGenerationError(error: unknown, stage: GenerationStage): GenerationError {
  if (error instanceof GenerationError) return error
  const chain = errorChain(error)
  const message = chain.map(item => typeof item.message === 'string' ? item.message : '').filter(Boolean).join(' | ') || 'Unknown generation error'
  const normalized = message.toLowerCase()
  const statusCode = numericStatus(chain)
  const explicitCode = chain.map(item => typeof item.code === 'string' ? item.code : '').find(Boolean)
  const messageCode = message.match(/\b(?:os error|error code)\s*([a-z0-9_-]+)/i)?.[1]
  const errorCode = explicitCode || messageCode

  let category: GenerationErrorCategory = 'unknown'
  if (statusCode === 429 || /rate.?limit|too many requests|429/.test(normalized)) category = 'rate-limit'
  else if (/timed?\s*out|timeout|超时/.test(normalized)) category = 'timeout'
  else if (/aborterror|aborted|abort/.test(normalized)) category = 'abort'
  else if (/thread|conversation|rollout|resume/.test(normalized) && /not.?found|does not exist|unknown|invalid|expired|deleted|missing|unable|cannot|failed/.test(normalized)) category = 'thread'
  else if ((statusCode !== undefined && statusCode >= 500) || /econn|enotfound|network|fetch failed|socket|套接字|connection|stream disconnected|websockets?|https transport/.test(normalized)) category = 'network'
  else if (stage === 'parse-output' && /json|parse|syntax/.test(normalized)) category = 'parse'
  else if (stage === 'parse-output') category = 'schema'
  else if (stage === 'validate-output') category = 'validation'
  else if (stage === 'compose-resume') category = 'composer'
  else if (stage === 'persist-session') category = 'persistence'

  const retryable = category === 'network' || category === 'thread' || category === 'timeout' || category === 'abort' || category === 'parse' || category === 'schema'
  return new GenerationError({ stage, category, message, retryable, statusCode, errorCode }, { cause: error })
}

export function publicGenerationMessage(category: GenerationErrorCategory): string {
  if (category === 'network' || category === 'abort') return '网络连接似乎中断了，你的岗位、经历和上一版简历都已保存。'
  if (category === 'rate-limit') return 'AI 当前请求较多，请稍后再试。你的岗位、经历和上一版简历都已保存。'
  if (category === 'timeout') return '这次整理用时较长，没有在限定时间内完成。你的岗位、经历和上一版简历都已保存。'
  return 'AI 暂时没有完成这次修改。你的岗位、经历和上一版简历都已保存。'
}

export function logGenerationError(args: {
  runId: string
  sessionId: string
  startedAt: number
  error: GenerationError
}): void {
  const cause = args.error.cause
  const source = cause instanceof Error ? cause : args.error
  console.error('[ResumeGeneration]', {
    runId: args.runId,
    sessionId: args.sessionId,
    stage: args.error.info.stage,
    category: args.error.info.category,
    retryable: args.error.info.retryable,
    durationMs: Date.now() - args.startedAt,
    errorName: source.name,
    errorMessage: source.message,
    statusCode: args.error.info.statusCode,
    errorCode: args.error.info.errorCode,
    outputLength: args.error.info.outputLength,
    parsePosition: args.error.info.parsePosition,
    schemaIssues: args.error.info.schemaIssues,
  })
}

export function safeGenerationDiagnostic(error: GenerationError, runId: string) {
  return {
    runId,
    stage: error.info.stage,
    category: error.info.category,
    retryable: error.info.retryable,
    summary: error.info.message.slice(0, 240),
  }
}
