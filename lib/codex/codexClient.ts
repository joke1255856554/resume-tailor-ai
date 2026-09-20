import 'server-only'
import { Codex, type Thread, type ThreadOptions } from '@openai/codex-sdk'

let client: Codex | null = null

export function getCodexClient(): Codex {
  if (!client) {
    client = new Codex({
      config: {
        show_raw_agent_reasoning: false,
        web_search: 'disabled',
        features: { plugins: false },
      },
    })
  }
  return client
}

function threadOptions(workingDirectory: string): ThreadOptions {
  return {
    workingDirectory,
    skipGitRepoCheck: true,
    sandboxMode: 'workspace-write',
    approvalPolicy: 'never',
    networkAccessEnabled: false,
    webSearchMode: 'disabled',
    model: process.env.CODEX_RESUME_MODEL || undefined,
    modelReasoningEffort: 'medium',
  }
}

export function createResumeThread(workingDirectory: string, threadId?: string | null): Thread {
  const codex = getCodexClient()
  return threadId
    ? codex.resumeThread(threadId, threadOptions(workingDirectory))
    : codex.startThread(threadOptions(workingDirectory))
}
