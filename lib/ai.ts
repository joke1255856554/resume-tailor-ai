import OpenAI from 'openai'

export function createAIClient(): OpenAI {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY

  if (!apiKey) {
    throw new Error('未配置 AI_API_KEY')
  }

  return new OpenAI({
    apiKey,
    baseURL: process.env.AI_BASE_URL || undefined,
  })
}

export function getAIModel(): string {
  return process.env.AI_MODEL || 'gpt-4o'
}
