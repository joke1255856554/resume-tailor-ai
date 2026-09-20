export interface InferredJobIdentity { company: string; role: string }

function clean(value: string): string {
  return value.replace(/^[\s#>*•·-]+|[\s，。；;]+$/g, '').trim().slice(0, 50)
}

/** Conservative JD identity inference. Missing fields stay empty rather than guessed. */
export function inferJobIdentity(jobDescription: string, currentCompany = '', currentRole = ''): InferredJobIdentity {
  const lines = jobDescription.split(/\r?\n/).map(clean).filter(Boolean).slice(0, 12)
  const text = lines.join('\n')
  const companyMatch = text.match(/(?:公司名称|招聘单位|企业名称|公司|企业)\s*[：:]\s*([^\n]{2,40})/i)
  const roleMatch = text.match(/(?:职位名称|岗位名称|招聘职位|目标岗位|职位|岗位)\s*[：:]\s*([^\n]{2,40})/i)
  let company = currentCompany.trim() || clean(companyMatch?.[1] || '')
  let role = currentRole.trim() || clean(roleMatch?.[1] || '')

  if (!company || !role) {
    const splitHeader = lines
      .map(line => line.split(/\s*[|｜·—–]\s*/).map(clean).filter(Boolean))
      .find(parts => parts.length === 2 && /产品|运营|设计|工程师|开发|算法|研究|实习|顾问|经理|专员|aigc|ai\s/i.test(parts[1]))
    if (splitHeader) {
      if (!company) company = splitHeader[0]
      if (!role) role = splitHeader[1]
    }
  }

  if (!role) {
    role = lines.find(line => line.length <= 32
      && /产品|运营|设计|工程师|开发|算法|研究|实习|顾问|经理|专员|aigc|ai\s/i.test(line)
      && !/职责|要求|资格|我们|公司介绍/.test(line)
      && !/^(负责|参与|协助|完成|开展|制定|推动|支持|具备|熟悉|拥有|要求|能够|善于)/.test(line)) || ''
  }
  if (!company) {
    company = lines.find(line => line !== role && line.length <= 32 && /公司|集团|科技|网络|智能|跳动|腾讯|阿里|字节|百度|美团|京东/.test(line) && !/职责|岗位|职位|要求/.test(line)) || ''
  }
  return { company: clean(company), role: clean(role) }
}
