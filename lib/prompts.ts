import type {
  Experience,
  FactBank,
  FactMatch,
  JDRequirement,
  ResumeAssistantMessage,
  ResumePolishStyle,
} from './types'

export function buildParsePrompt(text: string, filename: string): string {
  return `You are a resume parser. Extract structured data from the resume text below and return valid JSON.

RESUME TEXT (from file: ${filename}):
${text}

Return JSON with this exact structure:
{
  "contact": {
    "name": "",
    "email": "",
    "phone": "",
    "location": "",
    "linkedin": "",
    "github": "",
    "website": ""
  },
  "experiences": [
    {
      "company": "",
      "location": "",
      "startDate": "",
      "endDate": "",
      "title": "",
      "bullets": ["..."]
    }
  ],
  "education": [
    {
      "school": "",
      "location": "",
      "degree": "",
      "field": "",
      "startDate": "",
      "endDate": "",
      "notes": []
    }
  ],
  "skills": ["Category: skill1, skill2"],
  "projects": [
    {
      "name": "",
      "startDate": "",
      "endDate": "",
      "bullets": ["..."]
    }
  ],
  "awards": [
    { "title": "", "issuer": "", "date": "", "description": "" }
  ],
  "skillGroups": [
    { "label": "", "items": ["..."] }
  ],
  "certificates": [
    { "name": "", "issuer": "", "date": "", "score": "", "description": "" }
  ],
  "campusExperiences": [
    { "organization": "", "role": "", "location": "", "startDate": "", "endDate": "", "bullets": ["..."] }
  ]
}

Parsing rules:
- EXPERIENCES: Extract every work experience, internship, freelance role, and volunteer position. Each role is one object. If someone held multiple titles at the same company, create one experience object per title (they will be merged automatically). Copy bullets verbatim — do not paraphrase, summarize, or rephrase.
- PROJECTS: Extract all personal, academic, or side projects from sections labeled "Projects", "Academic Projects", "Personal Projects", or similar. Each project is one object. startDate and endDate may be empty strings if not stated. Copy bullets verbatim.
- SUMMARY / PROFILE / OBJECTIVE sections: Ignore completely. Do not put any summary text into bullets. These sections do not map to any field.
- BULLETS: Only include actual bullet points or responsibility statements from the Experience or Project section. Never put summary or profile text here.
- DATES: Use the exact format written in the resume (e.g. "Jan 2022", "2020", "Present", "Current"). Use "" if absent.
- SKILLS: Flatten all skills into an array of strings. If the resume has skill categories (e.g. "Languages: Python, SQL"), preserve as "Languages: Python, SQL". If uncategorized, use "Skills: skill1, skill2".
- EDUCATION: Include all degrees and schools. Put honors, GPA, or relevant coursework in notes[]. Do not put standalone awards or certificates only in education notes when they have their own section.
- AWARDS: Extract every scholarship, competition result, academic honor, merit award, and school honor from sections such as "Awards", "Honors", "Scholarships", "获奖荣誉", or equivalent. Preserve the exact title, issuer, date, and any provided description. Return [] only when there is no award/honor evidence.
- SKILL GROUPS: When skills have categories, also return them as skillGroups with one category label and an items array. Keep the legacy skills array populated as a compatibility fallback.
- CERTIFICATES: Extract language tests, professional certificates, licenses, and qualifications into certificates. Do not confuse ordinary skills with certificates.
- CAMPUS EXPERIENCES: Extract student organizations, leadership, campus activities, and volunteer activities that are not employment into campusExperiences.
- CONTACT: For linkedin, extract only the profile slug or full URL. Same for github. If a field is absent, use "".
- If the resume has no projects section, return "projects": [].
- If the resume text is garbled, poorly formatted, or has OCR artifacts, do your best to extract what you can.`
}

export function buildVersionSelectionPrompt(
  jdText: string,
  experiences: Experience[]
): string {
  const expSummary = experiences.map(exp => ({
    id: exp.id,
    company: exp.company,
    versions: exp.versions.map(v => ({
      id: v.id,
      title: v.title,
    }))
  }))

  return `You are a senior recruiter selecting the best job title version for each work experience to maximize a candidate's fit for a specific role.

JOB DESCRIPTION:
${jdText.slice(0, 3000)}

CANDIDATE'S EXPERIENCES WITH AVAILABLE VERSIONS:
${JSON.stringify(expSummary, null, 2)}

Your task — select the single best Version title for each experience.

Rule: Pick the Version whose title a recruiter hiring for this JD would find most relevant.
- Selection is based ENTIRELY on title function match — do NOT consider bullet content
- Choose the title that is closest in job function to the JD's primary role
- "Closest" means same functional family, not necessarily exact wording:
  • For a Product Manager JD: "Product Manager" > "Project Manager" > "Data Analyst" > "Risk Analytics"
  • For a Data Analyst JD: "Risk Data Analytics" > "Project Manager" > "Product Manager"
  • "Cofounder | Product" = product management function
- If no title closely matches the JD function, pick the one with the most transferable skills for that function

Return JSON:
{
  "jdFunction": "...",
  "jdSeniority": "...",
  "selections": [
    { "experienceId": "...", "selectedVersionId": "...", "reason": "one sentence why" }
  ]
}`
}

export function buildJDReportPrompt(jdText: string): string {
  return `You are an expert ATS analyst. Analyze this job description and extract structured keyword data.

JOB DESCRIPTION:
${jdText.slice(0, 3000)}

Extract keywords into these categories. Use EXACT phrasing from the JD. Do NOT include generic soft skills (communication, collaboration, teamwork — these have no ATS value).

Return JSON:
{
  "role": "job title from JD",
  "company": "company name if mentioned, else empty string",
  "titleKeywords": ["exact job title", "close variants", "function words — max 4"],
  "hardSkills": ["tools, software, languages, platforms, technical methods, A/B testing — max 12"],
  "actionKeywords": ["verb + object phrases from Responsibilities section, e.g. 'drive cross-functional execution' — max 8"],
  "businessContext": ["business scenarios and domain concepts, e.g. 'roadmap', 'stakeholder management', 'product launch' — max 10"],
  "domainKeywords": ["industry/domain words, e.g. 'SaaS', 'B2B', 'fintech' — max 5"],
  "hardFilters": ["explicit requirements, e.g. '3+ years', 'Bachelor degree', 'SQL required' — max 6"],
  "top10": ["the 10 most important keywords a recruiter would search for, ranked by importance"]
}`
}

export function buildBulletRewritePrompt(
  top10Keywords: string[],
  variantKeywords: string[],
  missingKeywords: string[],
  experiencesWithNumberedBullets: Array<{
    experienceId: string
    company: string
    numberedBullets: string
  }>
): string {
  const expBlocks = experiencesWithNumberedBullets.map(e =>
    `EXPERIENCE: ${e.company} (id: ${e.experienceId})\nBULLETS:\n${e.numberedBullets}`
  ).join('\n\n')

  return `You are optimizing resume bullet points for ATS (Applicant Tracking System) compatibility using MINIMAL changes.

GOAL: Maximize keyword match with the job description while preserving the original bullet quality as much as possible.

TOP 10 JD KEYWORDS (most important for this role):
${top10Keywords.join(', ')}

RULES (follow in strict order):
1. RETURN UNCHANGED: Any bullet that does not need a keyword change — copy it EXACTLY character-for-character. Do not rephrase, reorder, or improve it.
2. VARIANT FIX: If a bullet contains a variant form of a keyword (e.g. "A/B testing" when JD says "A/B test", or "managing" when JD says "management") — replace ONLY that word/phrase with the JD's exact phrasing. Change absolutely nothing else in that bullet.
3. KEYWORD INSERT: For MISSING keywords only — find the single most relevant bullet and insert the keyword naturally with the absolute minimum edit. If no bullet can naturally accept the keyword, skip it. Do NOT force awkward insertions.
4. NEVER fabricate facts, numbers, company names, tools, or any detail not in the original bullet.
5. NEVER end any bullet with a period.
6. Return the EXACT SAME NUMBER of bullets for each experience — do not merge, split, or drop any bullet.

VARIANT KEYWORDS — find the variant form in the bullets and replace with this exact JD phrasing:
${variantKeywords.length > 0 ? variantKeywords.join(', ') : '(none)'}

MISSING KEYWORDS — not present at all, insert naturally where possible:
${missingKeywords.length > 0 ? missingKeywords.join(', ') : '(none)'}

${expBlocks}

Return JSON (no markdown, no code blocks, just raw JSON):
{
  "experiences": [
    {
      "experienceId": "...",
      "bullets": ["bullet 1", "bullet 2", ...]
    }
  ]
}`
}

export function buildAggressiveBulletRewritePrompt(
  top10Keywords: string[],
  missingBusinessContext: string[],
  missingHardSkills: string[],
  experiencesWithNumberedBullets: Array<{
    experienceId: string
    company: string
    numberedBullets: string
  }>
): string {
  const expBlocks = experiencesWithNumberedBullets.map(e =>
    `EXPERIENCE: ${e.company} (id: ${e.experienceId})\nBULLETS:\n${e.numberedBullets}`
  ).join('\n\n')

  return `You are optimizing resume bullet points for maximum ATS keyword coverage.

TOP 10 JD KEYWORDS:
${top10Keywords.join(', ')}

RULES:
1. RETURN UNCHANGED: Any bullet that does not need changes — copy EXACTLY.
2. BUSINESS CONTEXT KEYWORDS — these are general PM/business concepts (e.g. NPS, feature development, friction points, consumer experiences). For each one, find the most relevant bullet and work it in naturally. Be proactive — if a bullet is about the same topic, add the keyword even if it requires a small rewrite of that phrase. Do NOT fabricate metrics or company-specific facts.
3. HARD SKILLS KEYWORDS — only insert if the bullet already demonstrates use of that skill. Do not add a tool the candidate clearly didn't use.
4. NEVER fabricate numbers, company names, or specific achievements not in the original.
5. NEVER end any bullet with a period.
6. Return the EXACT SAME NUMBER of bullets per experience.

MISSING BUSINESS CONTEXT KEYWORDS (insert proactively):
${missingBusinessContext.length > 0 ? missingBusinessContext.join(', ') : '(none)'}

MISSING HARD SKILLS (insert only where evidenced):
${missingHardSkills.length > 0 ? missingHardSkills.join(', ') : '(none)'}

${expBlocks}

Return JSON (no markdown, no code blocks, just raw JSON):
{
  "experiences": [
    {
      "experienceId": "...",
      "bullets": ["bullet 1", "bullet 2", ...]
    }
  ]
}`
}

export function buildSkillsBoostPrompt(
  currentSkills: string[],
  missingKeywords: string[]
): string {
  return `You are adding missing ATS keywords into an existing resume skills section.

CURRENT SKILLS:
${currentSkills.join('\n')}

MISSING KEYWORDS TO ADD:
${missingKeywords.join(', ')}

RULES:
- Add each missing keyword to the most relevant existing skill category
- If no existing category fits, add a new category line
- Keep EVERY existing skill — do not remove or modify existing content
- Format: "CategoryName: skill1, skill2, skill3"
- Keep to 2-4 total skill lines
- If a keyword is a business concept, outcome, or process (not a tool, technology, or methodology), do NOT add it to skills — skip it entirely

Return JSON (no markdown):
{
  "skills": ["CategoryName: skill1, skill2", ...]
}`
}

export function buildSkillsPrompt(
  jdText: string,
  rawSkills: string[]
): string {
  return `You are organizing skills for a resume based on a job description.

JOB DESCRIPTION (excerpt):
${jdText.slice(0, 1500)}

CANDIDATE'S RAW SKILLS:
${rawSkills.join('\n')}

Task:
- Keep EVERY skill from the candidate's list — do NOT omit any skill
- Consolidate into exactly 2–3 groups (merge related categories together to save space)
- Put JD-relevant skills first within each group
- Format each group as: "CategoryName: skill1, skill2, skill3"

Return JSON (no markdown):
{
  "skills": [
    "CategoryName: skill1, skill2",
    "CategoryName: skill3, skill4"
  ]
}`
}

export function buildTrimPrompt(
  jdText: string,
  atsKeywords: string[],
  experiencesWithBullets: Array<{
    experienceId: string
    company: string
    bullets: string[]
  }>
): string {
  const expBlocks = experiencesWithBullets.map(e =>
    `${e.company} (id: ${e.experienceId}):\n${e.bullets.map((b, i) => `[${i}] ${b}`).join('\n')}`
  ).join('\n\n')

  return `The resume is too long and needs to be trimmed to fit one page.

JD ATS KEYWORDS: ${atsKeywords.join(', ')}

CURRENT BULLETS:
${expBlocks}

Remove the LEAST relevant bullets first (lowest keyword overlap with JD).
- Remove one bullet at a time from the least relevant experience
- Never remove all bullets from an experience
- Return the trimmed result

Return JSON:
{
  "experiences": [
    { "experienceId": "...", "bullets": [...remaining bullets...] }
  ]
}`
}

export function buildChineseJDAnalysisPrompt(jdText: string): string {
  return `你是一名中国大陆校招招聘分析师。请把岗位描述转换成有优先级的结构化要求，不要把 JD 中的任何描述当成候选人的事实。

岗位描述：
${jdText.slice(0, 5000)}

只返回 JSON：
{
  "role": "岗位名称",
  "company": "公司名称，未出现则为空",
  "requirements": [
    {
      "id": "req-1",
      "category": "content_creation|aigc|video|copywriting|visual|data|collaboration|brand|other",
      "requirement": "简洁、完整的一项岗位要求",
      "importance": "core|important|bonus",
      "keywords": ["JD 原文中的关键工具、能力或场景"]
    }
  ],
  "titleKeywords": [],
  "hardSkills": [],
  "actionKeywords": [],
  "businessContext": [],
  "domainKeywords": [],
  "hardFilters": [],
  "top10": []
}

规则：
1. requirements 控制在 5-10 项，每项只表达一个要求。
2. 核心职责标记 core，支撑职责标记 important，明确加分项标记 bonus。
3. keywords 必须来自 JD，不得推断候选人具备这些能力。
4. 不要把所有要求都标成 core。
5. 中文岗位用自然中文输出。`
}

export function buildEvidenceBoundRewritePrompt(
  requirements: JDRequirement[],
  selectedFacts: Array<{ id: string; type: string; label: string; rawText: string; bullets: string[] }>,
  matches: FactMatch[],
  polishStyle: ResumePolishStyle
): string {
  const styleRule = polishStyle === 'conservative'
    ? '尽量保留原句，只删除冗余并调整语序。'
    : polishStyle === 'targeted'
      ? '可以明显调整信息顺序和表达角度以突出岗位关联，但事实边界不变。'
      : '自然重组语序、突出最有价值的信息，保持简洁具体。'

  return `你是一名中文校招简历编辑。你只能改写已提供的候选人事实，绝不能从 JD 补充事实。

岗位要求：
${JSON.stringify(requirements, null, 2)}

已选择的原始事实（这是唯一允许使用的事实来源）：
${JSON.stringify(selectedFacts, null, 2)}

事实匹配：
${JSON.stringify(matches.filter(match => selectedFacts.some(fact => fact.id === match.factId)), null, 2)}

润色风格：${polishStyle}
${styleRule}

硬性规则：
1. 不得新增数字、工具、软件、职责、结果、项目、客户或用户没有明确做过的环节。
2. JD 中出现但原始事实中没有的词，不得写入 bullet。
3. 可以删除低价值信息、重排语序、把已有事实转换成招聘者更容易理解的表达。
4. 每个事实最多 2 条 bullet，每条建议 22-48 个汉字；没有可写内容时返回原事实。
5. sourceFactIds 必须只引用上面的事实 id。
6. matchedRequirementIds 只能引用岗位要求 id。
7. rewriteReason 说明改变了什么表达角度，并明确未新增事实。
8. 不要编造商业用途；个人练习只能写成个人实践。

只返回 JSON：
{
  "items": [
    {
      "factId": "事实 id",
      "title": "仅在原始事实已经支持时可调整标题，否则保留原题",
      "bullets": [
        {
          "text": "中文简历 bullet",
          "sourceFactIds": ["事实 id"],
          "matchedRequirementIds": ["req-1"],
          "rewriteReason": "说明"
        }
      ]
    }
  ]
}`
}

export function buildResumeAssistantPrompt(args: {
  jdText: string
  requirements: JDRequirement[]
  factBank: FactBank
  messages: ResumeAssistantMessage[]
  userMessage: string
  conversationId: string
  messageId: string
  clarificationRound: number
  maxClarificationRounds: number
  askedQuestionKeys: string[]
}): string {
  const knownFacts = [
    ...args.factBank.experiences.map(item => ({ id: item.id, type: 'experience', text: [item.company, ...item.versions.flatMap(version => [version.title, ...version.bullets])].join(' ') })),
    ...(args.factBank.projects || []).map(item => ({ id: item.id, type: 'project', text: [item.name, item.role, ...item.bullets].filter(Boolean).join(' ') })),
    ...(args.factBank.conversationFacts || []).map(item => ({ id: item.id, type: 'conversation', text: item.statement })),
  ]

  return `你是“AI 简历助手”，只负责收集、澄清和修正与当前岗位有关的真实事实。你不是自由聊天机器人，也不能直接把 JD 要求变成用户事实。

当前 JD：
${args.jdText.slice(0, 4000)}

结构化岗位要求：
${JSON.stringify(args.requirements, null, 2)}

已经确认的经历摘要：
${JSON.stringify(knownFacts, null, 2)}

已经明确否认或修正的能力：
${JSON.stringify(args.factBank.factConstraints || [], null, 2)}

追问状态：
- 当前将进入第 ${args.clarificationRound + 1} 轮
- 最多 ${args.maxClarificationRounds} 轮
- 已经问过的问题键：${JSON.stringify(args.askedQuestionKeys)}

最近对话：
${JSON.stringify(args.messages.slice(-10), null, 2)}

用户最新输入：
${args.userMessage}

任务：
1. 提取用户已经明确说出的事实，不确定的内容必须标记 unconfirmed。
2. 只对“核心要求 + 已有部分证据 + 补充后明显可能进入一页简历”的信息追问；每轮最多 3 个问题，尽量组合在一轮中。
3. 如果用户否认或纠正某项能力（例如“没有调色”“只是参与不是负责”），优先输出 denials，blockedKeywords 必须列出被否认的能力词。
4. 不得推断用户会剪辑、调色、分镜、品牌商业项目或任何未明确说过的内容。
5. 不要追问 bonus、低重要度、与现有经历距离很远或不影响一页简历的缺口；不要换同义表达重复询问已经问过或否认的能力。
6. 如果现有信息已足够形成岗位相关实践，或用户表达“先这样/直接生成/不用问了”，不要继续提问，openQuestions 返回空数组，并告诉用户可以先生成第一版，未确认能力不会写入。
7. assistantMessage 用自然中文回应，告诉用户哪些内容有价值、还需要确认什么。不要展示 JSON。

只返回 JSON：
{
  "assistantMessage": "自然中文回复",
  "factCandidates": [
    {
      "statement": "单一、原始、可确认的事实陈述",
      "category": "content_creation|aigc|video|copywriting|visual|data|collaboration|brand|other|general",
      "confidence": "confirmed|unconfirmed"
    }
  ],
  "openQuestions": ["需要用户继续回答的问题"],
  "denials": [
    {
      "kind": "denial|correction",
      "statement": "用户的否认或纠正",
      "blockedKeywords": ["不得再出现在简历中的能力词"]
    }
  ]
}

所有候选事实的来源将由系统写入 conversationId=${args.conversationId}、messageId=${args.messageId}，你不要自行编造来源字段。`
}
