import { NextRequest, NextResponse } from 'next/server'
import { extractText } from 'unpdf'
import mammoth from 'mammoth'
import { buildParsePrompt } from '@/lib/prompts'
import { createAIClient, getAIModel } from '@/lib/ai'
import { Award, CampusExperience, Certificate, Education, Experience, FactBank, Project, SkillGroup } from '@/lib/types'
import { randomUUID } from 'crypto'

async function detectAndExtractText(buffer: Buffer, filename: string): Promise<string> {
  const isPDF = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46
  const isDOCX = buffer[0] === 0x50 && buffer[1] === 0x4B

  if (isPDF) {
    const { text } = await extractText(new Uint8Array(buffer), { mergePages: true })
    return Array.isArray(text) ? text.join('\n') : text
  } else if (isDOCX) {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  } else {
    return buffer.toString('utf-8')
  }
}

interface ParsedDoc {
  contact: FactBank['contact']
  experiences: Array<{ company: string; location: string; startDate: string; endDate: string; title: string; bullets: string[] }>
  education: Array<{ school: string; location: string; degree: string; field: string; startDate: string; endDate: string; notes: string[] }>
  skills: string[]
  projects?: Array<{ name: string; startDate: string; endDate: string; bullets: string[] }>
  awards?: Array<{ title: string; issuer?: string; date?: string; description?: string }>
  skillGroups?: Array<{ label: string; items: string[] }>
  certificates?: Array<{ name: string; issuer?: string; date?: string; score?: string; description?: string }>
  campusExperiences?: Array<{ organization: string; role: string; location?: string; startDate?: string; endDate?: string; bullets: string[] }>
}

export async function POST(req: NextRequest) {
  try {
    const openai = createAIClient()
    const formData = await req.formData()
    const files = formData.getAll('files') as File[]

    if (!files.length) {
      return NextResponse.json({ error: '请选择要导入的简历文件。' }, { status: 400 })
    }

    const results: { filename: string; parsed: ParsedDoc | null; error?: string }[] = []

    for (const file of files) {
      try {
        const buffer = Buffer.from(await file.arrayBuffer())
        const text = await detectAndExtractText(buffer, file.name)

        const completion = await openai.chat.completions.create({
          model: getAIModel(),
          messages: [{ role: 'user', content: buildParsePrompt(text, file.name) }],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        })

        const parsed = JSON.parse(completion.choices[0].message.content || '{}') as ParsedDoc
        results.push({ filename: file.name, parsed })
      } catch (err) {
        console.error(`Parse resume error (${file.name}):`, err)
        results.push({ filename: file.name, parsed: null, error: '文件解析失败，请检查格式后重试。' })
      }
    }

    // Merge all parsed docs into a single FactBank
    const merged = mergeIntofactBank(results)
    return NextResponse.json({ factBank: merged, errors: results.filter(r => r.error) })
  } catch (err) {
    console.error('Parse resume request error:', err)
    return NextResponse.json({ error: '简历导入未完成，请稍后重试。' }, { status: 500 })
  }
}

function mergeIntofactBank(
  results: { filename: string; parsed: ParsedDoc | null; error?: string }[]
): FactBank {
  const factBank: FactBank = {
    contact: { name: '', email: '', phone: '', location: '', linkedin: '', github: '', website: '' },
    experiences: [],
    education: [],
    skills: [],
    projects: [],
    awards: [],
    skillGroups: [],
    certificates: [],
    campusExperiences: [],
  }

  const successResults = results.filter(r => r.parsed)

  // Use contact from first successful parse
  if (successResults[0]?.parsed) {
    factBank.contact = successResults[0].parsed.contact
  }

  // Merge experiences: group by company name (case-insensitive)
  const experienceMap = new Map<string, Experience>()

  for (const result of successResults) {
    if (!result.parsed) continue
    for (const exp of result.parsed.experiences) {
      const key = exp.company.toLowerCase().trim()
      if (!experienceMap.has(key)) {
        experienceMap.set(key, {
          id: randomUUID(),
          company: exp.company,
          location: exp.location,
          startDate: exp.startDate,
          endDate: exp.endDate,
          versions: [],
        })
      }
      const existing = experienceMap.get(key)!
      existing.versions.push({
        id: randomUUID(),
        title: exp.title,
        bullets: exp.bullets,
        sourceFile: result.filename,
      })
    }
  }
  factBank.experiences = Array.from(experienceMap.values())

  // Merge education: deduplicate by school name
  const educationMap = new Map<string, Education>()
  for (const result of successResults) {
    if (!result.parsed) continue
    for (const edu of result.parsed.education) {
      const key = edu.school.toLowerCase().trim()
      if (!educationMap.has(key)) {
        educationMap.set(key, { id: randomUUID(), ...edu })
      }
    }
  }
  factBank.education = Array.from(educationMap.values())

  // Merge skills: collect all unique skill lines
  const skillSet = new Set<string>()
  for (const result of successResults) {
    if (!result.parsed) continue
    for (const s of result.parsed.skills) {
      skillSet.add(s)
    }
  }
  factBank.skills = Array.from(skillSet)

  // Merge projects: deduplicate by project name
  const projectMap = new Map<string, Project>()
  for (const result of successResults) {
    if (!result.parsed?.projects) continue
    for (const proj of result.parsed.projects) {
      const key = proj.name.toLowerCase().trim()
      if (!projectMap.has(key)) {
        projectMap.set(key, { id: randomUUID(), ...proj })
      }
    }
  }
  factBank.projects = Array.from(projectMap.values())

  // Merge awards/honors: keep distinct title + date pairs so importing multiple
  // resume files does not silently erase an award from another file.
  const awardMap = new Map<string, Award>()
  for (const result of successResults) {
    for (const award of result.parsed?.awards || []) {
      if (!award.title?.trim()) continue
      const key = `${award.title.trim().toLowerCase()}|${(award.date || '').trim().toLowerCase()}`
      if (!awardMap.has(key)) awardMap.set(key, { id: randomUUID(), title: award.title.trim(), issuer: award.issuer?.trim() || undefined, date: award.date?.trim() || undefined, description: award.description?.trim() || undefined })
    }
  }
  factBank.awards = Array.from(awardMap.values())

  // Prefer structured skill groups, while retaining uncategorized legacy lines.
  const skillGroupMap = new Map<string, SkillGroup>()
  for (const result of successResults) {
    for (const group of result.parsed?.skillGroups || []) {
      if (!group.label?.trim() || !Array.isArray(group.items)) continue
      const key = group.label.trim().toLowerCase()
      const current = skillGroupMap.get(key) || { id: randomUUID(), label: group.label.trim(), items: [] }
      current.items = [...new Set([...current.items, ...group.items.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim())])]
      skillGroupMap.set(key, current)
    }
  }
  factBank.skillGroups = Array.from(skillGroupMap.values())

  const certificateMap = new Map<string, Certificate>()
  for (const result of successResults) {
    for (const certificate of result.parsed?.certificates || []) {
      if (!certificate.name?.trim()) continue
      const key = `${certificate.name.trim().toLowerCase()}|${(certificate.date || '').trim().toLowerCase()}`
      if (!certificateMap.has(key)) certificateMap.set(key, { id: randomUUID(), name: certificate.name.trim(), issuer: certificate.issuer?.trim() || undefined, date: certificate.date?.trim() || undefined, score: certificate.score?.trim() || undefined, description: certificate.description?.trim() || undefined })
    }
  }
  factBank.certificates = Array.from(certificateMap.values())

  const campusMap = new Map<string, CampusExperience>()
  for (const result of successResults) {
    for (const campus of result.parsed?.campusExperiences || []) {
      if (!campus.organization?.trim()) continue
      const key = `${campus.organization.trim().toLowerCase()}|${(campus.role || '').trim().toLowerCase()}`
      if (!campusMap.has(key)) campusMap.set(key, { id: randomUUID(), organization: campus.organization.trim(), role: campus.role?.trim() || '', location: campus.location?.trim() || undefined, startDate: campus.startDate?.trim() || undefined, endDate: campus.endDate?.trim() || undefined, bullets: (campus.bullets || []).filter(Boolean) })
    }
  }
  factBank.campusExperiences = Array.from(campusMap.values())

  return factBank
}
