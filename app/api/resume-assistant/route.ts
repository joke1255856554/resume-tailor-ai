import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import type {
  FactBank,
  FactConstraint,
  JDRequirement,
  ResumeAssistantMessage,
  ResumeAssistantResponse,
} from '@/lib/types'
import { createAIClient, getAIModel } from '@/lib/ai'
import { buildResumeAssistantPrompt } from '@/lib/prompts'
import {
  DEFAULT_MAX_CLARIFICATION_ROUNDS,
  HARD_MAX_CLARIFICATION_ROUNDS,
  MAX_QUESTIONS_PER_ROUND,
  evaluateResumeEvidenceSufficiency,
  isQuestionDenied,
  isStopClarificationIntent,
  questionKeyForText,
} from '@/lib/resumeSufficiency'

const CATEGORIES = new Set(['content_creation', 'aigc', 'video', 'copywriting', 'visual', 'data', 'collaboration', 'brand', 'other', 'general'])
const DENIAL_TERMS = ['剪辑', '调色', '合成', '分镜', '脚本', '字幕', '配乐', '品牌项目', '商业项目', '数据复盘', '素材资产库']
const DENIAL_ALIASES: Record<string, string[]> = {
  调色: ['调色', '色彩调整', '色彩校正', 'color grading'],
  剪辑: ['剪辑', '视频编辑', '视频后期', 'editing'],
  分镜: ['分镜', '故事板', 'storyboard'],
  数据复盘: ['数据复盘', '效果复盘', '投放效果'],
  素材资产库: ['素材资产库', '素材库', '素材管理', '资产管理'],
}

function explicitDenials(
  message: string,
  requirements: JDRequirement[],
  conversationId: string,
  messageId: string
): FactConstraint[] {
  if (!/(没有|没做过|不会|不具备|不要写|不能写|不是负责|只是参与|只是协助)/.test(message)) return []
  const requirementTerms = requirements.flatMap(requirement => requirement.keywords)
  const aliasTerms = Object.entries(DENIAL_ALIASES)
    .filter(([, aliases]) => aliases.some(alias => message.toLowerCase().includes(alias.toLowerCase())))
    .map(([term]) => term)
  const terms = [...new Set([...aliasTerms, ...DENIAL_TERMS, ...requirementTerms])].filter(term => term && (aliasTerms.includes(term) || message.toLowerCase().includes(term.toLowerCase())))
  return terms.map(term => ({
    id: randomUUID(),
    kind: /(不是负责|只是参与|只是协助)/.test(message) ? 'correction' : 'denial',
    statement: message.trim(),
    blockedKeywords: DENIAL_ALIASES[term] || [term],
    source: { sourceType: 'conversation', conversationId, messageId, createdAt: new Date().toISOString() },
  }))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      factBank?: FactBank
      jdText?: string
      requirements?: JDRequirement[]
      messages?: ResumeAssistantMessage[]
      userMessage?: string
      conversationId?: string
      messageId?: string
      clarificationRound?: number
      maxClarificationRounds?: number
      askedQuestionKeys?: string[]
    }
    if (!body.factBank || !body.jdText?.trim() || !body.userMessage?.trim()) {
      return NextResponse.json({ error: '缺少岗位、经历库或对话内容。' }, { status: 400 })
    }

    const conversationId = body.conversationId || randomUUID()
    const messageId = body.messageId || randomUUID()
    const requirements = Array.isArray(body.requirements) ? body.requirements : []
    const clarificationRound = Math.max(0, Number(body.clarificationRound) || 0)
    const maxClarificationRounds = Math.min(
      HARD_MAX_CLARIFICATION_ROUNDS,
      Math.max(1, Number(body.maxClarificationRounds) || DEFAULT_MAX_CLARIFICATION_ROUNDS)
    )
    const askedQuestionKeys = Array.isArray(body.askedQuestionKeys) ? body.askedQuestionKeys.filter((item): item is string => typeof item === 'string') : []
    const source = { sourceType: 'conversation' as const, conversationId, messageId, createdAt: new Date().toISOString() }
    const completion = await createAIClient().chat.completions.create({
      model: getAIModel(),
      messages: [{
        role: 'user',
        content: buildResumeAssistantPrompt({
          jdText: body.jdText,
          requirements,
          factBank: body.factBank,
          messages: Array.isArray(body.messages) ? body.messages : [],
          userMessage: body.userMessage,
          conversationId,
          messageId,
          clarificationRound,
          maxClarificationRounds,
          askedQuestionKeys,
        }),
      }],
      response_format: { type: 'json_object' },
      temperature: 0.15,
    })
    const raw = JSON.parse(completion.choices[0].message.content || '{}') as Record<string, unknown>
    const rawCandidates = Array.isArray(raw.factCandidates) ? raw.factCandidates : []
    const factCandidates = rawCandidates.slice(0, 8).flatMap((item) => {
      if (typeof item !== 'object' || item === null) return []
      const candidate = item as Record<string, unknown>
      const statement = typeof candidate.statement === 'string' ? candidate.statement.trim().replace(/^用户(?:明确)?/, '') : ''
      if (!statement) return []
      return [{
        id: randomUUID(),
        statement,
        category: typeof candidate.category === 'string' && CATEGORIES.has(candidate.category) ? candidate.category as ResumeAssistantResponse['factCandidates'][number]['category'] : 'general' as const,
        confidence: candidate.confidence === 'unconfirmed' ? 'unconfirmed' as const : 'confirmed' as const,
        source,
      }]
    })
    const rawDenials = Array.isArray(raw.denials) ? raw.denials : []
    const modelDenials: FactConstraint[] = rawDenials.slice(0, 8).flatMap(item => {
      if (typeof item !== 'object' || item === null) return []
      const denial = item as Record<string, unknown>
      const statement = typeof denial.statement === 'string' ? denial.statement.trim() : ''
      const blockedKeywords = Array.isArray(denial.blockedKeywords) ? denial.blockedKeywords.filter((term): term is string => typeof term === 'string' && Boolean(term.trim())) : []
      if (!statement || !blockedKeywords.length) return []
      return [{ id: randomUUID(), kind: denial.kind === 'correction' ? 'correction' as const : 'denial' as const, statement, blockedKeywords, source }]
    })
    const deterministicDenials = explicitDenials(body.userMessage, requirements, conversationId, messageId)
    const denials = [...modelDenials, ...deterministicDenials].filter((item, index, list) => list.findIndex(other => other.blockedKeywords.join('|') === item.blockedKeywords.join('|')) === index)
    const provisionalFactBank: FactBank = {
      ...body.factBank,
      conversationFacts: [
        ...(body.factBank.conversationFacts || []),
        ...factCandidates.map(candidate => ({ id: candidate.id, statement: candidate.statement, category: candidate.category, source: candidate.source })),
      ],
      factConstraints: [...(body.factBank.factConstraints || []), ...denials],
    }
    const sufficiency = evaluateResumeEvidenceSufficiency(provisionalFactBank, requirements)
    const stopIntent = isStopClarificationIntent(body.userMessage)
    const budgetExhausted = clarificationRound + 1 >= maxClarificationRounds
    const rawQuestions = Array.isArray(raw.openQuestions)
      ? raw.openQuestions.filter((question): question is string => typeof question === 'string' && Boolean(question.trim()))
      : []
    const questionPairs = rawQuestions
      .map(question => ({ question: question.trim(), key: questionKeyForText(question) }))
      .filter(item => !askedQuestionKeys.includes(item.key))
      .filter(item => !isQuestionDenied(item.question, provisionalFactBank.factConstraints || []))
      .filter((item, index, list) => list.findIndex(other => other.key === item.key) === index)
      .slice(0, MAX_QUESTIONS_PER_ROUND)
    const shouldStop = stopIntent || budgetExhausted || sufficiency.isSufficient
    const openQuestions = shouldStop ? [] : questionPairs.map(item => item.question)
    const questionKeys = shouldStop ? [] : questionPairs.map(item => item.key)
    const assistantPhase = stopIntent ? 'stopped' as const : shouldStop || !openQuestions.length ? 'ready' as const : 'clarifying' as const
    const readyMessage = stopIntent
      ? '我会停止主动追问，并使用目前已经确认的事实生成。未确认或已否认的能力不会写入。'
      : '现有信息已经足够生成第一版简历。未确认的能力不会写入；你可以直接生成，也可以继续补充真实经历。'
    const capturedMessage = factCandidates.length
      ? `我已整理出 ${factCandidates.length} 条候选事实，请确认准确后再写入经历库。`
      : '我已记录你刚才的补充。'
    const response: ResumeAssistantResponse = {
      assistantMessage: shouldStop
        ? `${capturedMessage}\n\n${readyMessage}`
        : typeof raw.assistantMessage === 'string' && raw.assistantMessage.trim()
          ? raw.assistantMessage.trim()
          : '我已经记录你明确说出的内容，只会继续确认对当前岗位最有价值的信息。',
      factCandidates,
      openQuestions,
      questionKeys,
      denials,
      assistantPhase,
      sufficiency,
    }
    return NextResponse.json(response)
  } catch (error) {
    console.error('Resume assistant error:', error)
    return NextResponse.json({ error: 'AI 简历助手暂时无法回复，请稍后重试。' }, { status: 500 })
  }
}
