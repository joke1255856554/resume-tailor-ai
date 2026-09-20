import { NextRequest, NextResponse } from 'next/server'
import * as cheerio from 'cheerio'

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    if (!url) return NextResponse.json({ error: '请先填写岗位链接。' }, { status: 400 })

    // Sites that require JS rendering or login — cannot be scraped
    const jsRenderedSites = ['linkedin.com', 'jobs.netflix.com', 'explore.jobs.netflix.com']
    if (jsRenderedSites.some(site => url.includes(site))) {
      return NextResponse.json({
        error: '该招聘页面无法自动读取，请复制岗位描述后手动粘贴。',
        isLinkedIn: url.includes('linkedin.com'),
      }, { status: 422 })
    }

    // Ashby HQ — use their public posting API
    if (url.includes('ashbyhq.com')) {
      const match = url.match(/ashbyhq\.com\/[^/]+\/([a-f0-9-]{36})/)
      if (!match) {
        return NextResponse.json({ error: '无法识别该岗位链接，请复制岗位描述后手动粘贴。' }, { status: 422 })
      }
      const jobId = match[1]
      const apiRes = await fetch(`https://api.ashbyhq.com/posting-api/job-posting/${jobId}`, {
        headers: { 'Accept': 'application/json' },
      })
      if (!apiRes.ok) {
        return NextResponse.json({ error: '暂时无法读取该岗位，请复制岗位描述后手动粘贴。' }, { status: 422 })
      }
      const data = await apiRes.json()
      const descriptionHtml: string = data?.job?.descriptionHtml ?? data?.descriptionHtml ?? ''
      if (!descriptionHtml) {
        return NextResponse.json({ error: '未能从页面中提取岗位描述，请手动粘贴。' }, { status: 422 })
      }
      const $ = cheerio.load(descriptionHtml)
      const text = $.text().replace(/\s+/g, ' ').trim()
      return NextResponse.json({ jdText: text.slice(0, 8000) })
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    let html: string
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
      })
      clearTimeout(timeout)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      html = await res.text()
    } catch (err: unknown) {
      clearTimeout(timeout)
      if (err instanceof Error && err.name === 'AbortError') {
        return NextResponse.json({ error: '读取页面超时，请复制岗位描述后手动粘贴。' }, { status: 408 })
      }
      return NextResponse.json({ error: '暂时无法读取该链接，请复制岗位描述后手动粘贴。' }, { status: 422 })
    }

    const $ = cheerio.load(html)

    // Remove noise
    $('script, style, nav, header, footer, [class*="cookie"], [class*="banner"], [id*="cookie"]').remove()

    // Try common job posting containers first
    const selectors = [
      '[class*="job-description"]',
      '[class*="jobDescription"]',
      '[class*="job_description"]',
      '[id*="job-description"]',
      '[id*="jobDescription"]',
      '[class*="description"]',
      '[class*="posting-description"]',
      'main',
      'article',
      'body',
    ]

    let text = ''
    for (const sel of selectors) {
      const el = $(sel).first()
      if (el.length) {
        text = el.text().replace(/\s+/g, ' ').trim()
        if (text.length > 200) break
      }
    }

    if (!text || text.length < 100) {
      return NextResponse.json({ error: '未能从页面中提取完整岗位描述，请手动粘贴。' }, { status: 422 })
    }

    // Reject if extracted content looks like JS/JSON rather than a job description
    const trimmed = text.trimStart()
    const looksLikeCode = trimmed.startsWith('{') || trimmed.startsWith('[') ||
      /document\.|\.then\(|console\.log|createElement|innerHTML/.test(trimmed.slice(0, 300))
    if (looksLikeCode) {
      return NextResponse.json({ error: '该页面无法自动读取，请在下方粘贴岗位描述。', needsPaste: true }, { status: 422 })
    }

    // Sanity check: real JDs contain at least some job-related vocabulary
    const jdKeywords = ['responsibilities', 'requirements', 'qualifications', 'experience', 'skills',
      'role', 'position', 'team', 'candidate', 'apply', 'salary', 'benefits', 'location',
      'remote', 'hybrid', 'full-time', 'part-time', 'job', 'hiring', 'opportunity', 'work']
    const lower = text.toLowerCase()
    const matchCount = jdKeywords.filter(k => lower.includes(k)).length
    if (matchCount < 2) {
      return NextResponse.json({ error: '该页面无法自动读取，请在下方粘贴岗位描述。', needsPaste: true }, { status: 422 })
    }

    return NextResponse.json({ jdText: text.slice(0, 8000) })
  } catch (err) {
    console.error('Scrape JD error:', err)
    return NextResponse.json({ error: '岗位页面读取失败，请手动粘贴岗位描述。' }, { status: 500 })
  }
}
