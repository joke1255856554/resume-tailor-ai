import React from 'react'
import { join } from 'node:path'
import {
  Document,
  Font,
  Image,
  Link,
  Page,
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
} from '@react-pdf/renderer'
import type { GeneratedResume, ResumeDisplaySection, ResumeSettings } from '@/lib/types'
import { normalizeResumeSectionOrder } from '@/lib/resumeSections'
import {
  buildChineseSkillRows,
  formatDateRange,
  formatDisplayDate,
  hasText,
  toSafeURL,
} from './chineseCampusClassicData'
import { CHINESE_CAMPUS_CLASSIC_THEME as theme } from './chineseCampusClassicTheme'
import { CHINESE_RESUME_ICON_PATHS, type ChineseResumeIcon } from './chineseCampusClassicIcons'

const FONT_FAMILY = 'Noto Sans SC PDF'
const FONT_DIRECTORY = join(process.cwd(), 'public', 'fonts', 'noto-sans-sc')

Font.register({
  family: FONT_FAMILY,
  fonts: [
    { src: join(FONT_DIRECTORY, 'NotoSansSC-Regular.ttf'), fontWeight: 400 },
    { src: join(FONT_DIRECTORY, 'NotoSansSC-Bold.ttf'), fontWeight: 700 },
  ],
})

const styles = StyleSheet.create({
  page: {
    paddingTop: theme.page.paddingTopPt,
    paddingBottom: theme.page.paddingBottomPt + 10,
    paddingHorizontal: theme.page.paddingHorizontalPt,
    backgroundColor: theme.colors.paper,
    color: theme.colors.body,
    fontFamily: FONT_FAMILY,
    fontSize: theme.typography.bodyPt,
    lineHeight: theme.typography.lineHeight,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
    marginBottom: 10,
    borderBottomWidth: 0.75,
    borderBottomColor: theme.colors.rule,
  },
  headerSide: {
    width: 63,
  },
  headerCopy: {
    flex: 1,
    alignItems: 'center',
    textAlign: 'center',
  },
  name: {
    color: theme.colors.ink,
    fontFamily: FONT_FAMILY,
    fontWeight: 700,
    fontSize: theme.typography.namePt,
    letterSpacing: 2,
    lineHeight: 1.2,
  },
  jobTarget: {
    marginTop: 4.5,
    color: theme.colors.accent,
    fontWeight: 700,
    fontSize: 9.5,
  },
  contactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 5.5,
    color: theme.colors.muted,
    fontSize: theme.typography.metaPt,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 5,
  },
  contactIcon: {
    marginRight: 3,
  },
  socialRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 2.5,
    color: theme.colors.muted,
    fontSize: theme.typography.metaPt,
  },
  separator: {
    marginHorizontal: 5,
    color: theme.colors.rule,
  },
  link: {
    color: theme.colors.accent,
    textDecoration: 'none',
  },
  avatar: {
    width: 63,
    height: 84,
    objectFit: 'cover',
    borderWidth: 0.7,
    borderColor: theme.colors.rule,
  },
  section: {
    marginBottom: theme.spacing.sectionGapPt,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionMark: {
    width: 16,
    height: 16,
    marginRight: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentSoft,
  },
  sectionTitle: {
    color: theme.colors.heading,
    fontWeight: 700,
    fontSize: theme.typography.sectionPt,
    letterSpacing: 0.6,
  },
  sectionRule: {
    flex: 1,
    height: 0.5,
    marginLeft: 7,
    backgroundColor: theme.colors.rule,
  },
  item: {
    marginBottom: theme.spacing.itemGapPt,
  },
  compactItem: {
    marginBottom: 3,
  },
  mainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  mainLeft: {
    flex: 1,
    paddingRight: 14,
    color: theme.colors.ink,
    fontWeight: 700,
    fontSize: 9.9,
  },
  meta: {
    color: theme.colors.muted,
    fontSize: theme.typography.metaPt,
  },
  date: {
    minWidth: 92,
    color: theme.colors.muted,
    fontSize: theme.typography.metaPt,
    textAlign: 'right',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 1,
  },
  detailLeft: {
    flex: 1,
    paddingRight: 14,
  },
  detailText: {
    marginTop: 1,
    color: theme.colors.body,
  },
  roleText: {
    color: theme.colors.accent,
    fontWeight: 700,
  },
  focus: {
    marginTop: 1,
    color: theme.colors.muted,
    fontSize: theme.typography.metaPt,
  },
  inlineMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  bullets: {
    marginTop: 2.5,
  },
  bullet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 0.8,
  },
  bulletDot: {
    width: 10,
    color: theme.colors.muted,
  },
  bulletText: {
    flex: 1,
  },
  awardTitle: {
    flex: 1,
    paddingRight: 14,
    color: theme.colors.ink,
    fontWeight: 700,
  },
  skillRow: {
    flexDirection: 'row',
    marginBottom: 2.7,
  },
  skillLabel: {
    width: 69,
    color: theme.colors.heading,
    fontWeight: 700,
  },
  skillItems: {
    flex: 1,
  },
  keywordRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 2,
  },
  keyword: {
    marginRight: 5,
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 2,
    backgroundColor: theme.colors.accentSoft,
    color: theme.colors.accent,
    fontSize: 7.4,
    fontWeight: 700,
  },
  footer: {
    position: 'absolute',
    left: theme.page.paddingHorizontalPt,
    right: theme.page.paddingHorizontalPt,
    bottom: 20,
    color: '#98A2AD',
    fontSize: 7.2,
    textAlign: 'right',
  },
})

function BulletList({ bullets }: { bullets: string[] }) {
  const visible = bullets.filter(hasText)
  if (!visible.length) return null
  return (
    <View style={styles.bullets}>
      {visible.map((bullet, index) => (
        <View key={index} style={styles.bullet}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{bullet}</Text>
        </View>
      ))}
    </View>
  )
}

function PDFIcon({ name, size = 10 }: { name: ChineseResumeIcon; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {CHINESE_RESUME_ICON_PATHS[name].map((path, index) => <Path key={index} d={path} fill="none" stroke={theme.colors.accent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />)}
    </Svg>
  )
}

function SectionTitle({ section, children }: { section: ChineseResumeIcon; children: string }) {
  return (
    <View style={styles.sectionTitleRow} minPresenceAhead={105}>
      <View style={styles.sectionMark}><PDFIcon name={section} /></View>
      <Text style={styles.sectionTitle}>{children}</Text>
      <View style={styles.sectionRule} />
    </View>
  )
}

export function ChineseCampusClassicPDF({ resume, settings }: { resume: GeneratedResume; settings: ResumeSettings }) {
  const skillRows = buildChineseSkillRows(resume)
  const showAvatar = Boolean(settings.showAvatar && resume.contact.avatar)
  const priorityKeywords = [...new Set((resume.requirements || []).filter(item => item.importance !== 'bonus').flatMap(item => item.keywords).filter(keyword => keyword.length >= 2 && keyword.length <= 12))]
  const projectKeywords = (projectId: string) => {
    const requirementIds = new Set((resume.bulletEvidence || []).filter(item => item.section === 'project' && item.itemId === projectId).flatMap(item => item.matchedRequirementIds))
    return [...new Set((resume.requirements || []).filter(item => requirementIds.has(item.id)).flatMap(item => item.keywords))].filter(keyword => keyword.length >= 2 && keyword.length <= 10).slice(0, 3)
  }
  const contactItems = ([
    { icon: 'phone', value: resume.contact.phone },
    { icon: 'email', value: resume.contact.email },
    { icon: 'location', value: resume.contact.location },
  ] satisfies Array<{ icon: ChineseResumeIcon; value: string }>).filter(item => hasText(item.value))
  const socialItems: Array<{ label: string; url?: string }> = [
    ...(hasText(resume.contact.wechat) ? [{ label: `微信：${resume.contact.wechat}` }] : []),
    ...(hasText(resume.contact.linkedin) ? [{ label: 'LinkedIn', url: toSafeURL(resume.contact.linkedin) }] : []),
    ...(hasText(resume.contact.github) ? [{ label: 'GitHub', url: toSafeURL(resume.contact.github) }] : []),
    ...(hasText(resume.contact.website) ? [{ label: '个人主页', url: toSafeURL(resume.contact.website) }] : []),
  ]
  const renderSection = (section: ResumeDisplaySection) => {
    if (section === 'education' && resume.education.length > 0) return (
      <View key={section} style={styles.section}>
        <SectionTitle section="education">{theme.labels.education}</SectionTitle>
        {resume.education.map(education => (
          <View key={education.id} style={styles.item}>
            <View style={styles.mainRow}>
              <Text style={styles.mainLeft}>{education.school}</Text>
              <Text style={styles.date}>{[education.location, formatDateRange(education.startDate, education.endDate)].filter(hasText).join(' ｜ ')}</Text>
            </View>
            <Text style={styles.detailText}>{[education.field, education.degree].filter(hasText).join(' · ')}</Text>
            {hasText(education.focus) && <Text style={styles.focus}>{education.focus}</Text>}
            <BulletList bullets={education.notes || []} />
          </View>
        ))}
      </View>
    )
    if (section === 'experience' && resume.experiences.length > 0) return (
      <View key={section} style={styles.section}>
        <SectionTitle section="experience">{theme.labels.experience}</SectionTitle>
        {resume.experiences.map((experience, index) => (
          <View key={`${experience.company}-${index}`} style={styles.item}>
            <View style={styles.mainRow}>
              <Text style={styles.mainLeft}>{experience.company}</Text>
              <Text style={styles.date}>{formatDateRange(experience.startDate, experience.endDate)}</Text>
            </View>
            <Text style={[styles.detailText, styles.roleText]}>{[experience.title, experience.location].filter(hasText).join(' · ')}</Text>
            <BulletList bullets={experience.bullets} />
          </View>
        ))}
      </View>
    )
    if (section === 'projects' && (resume.projects || []).length > 0) return (
      <View key={section} style={styles.section}>
        <SectionTitle section="projects">{theme.labels.projects}</SectionTitle>
        {(resume.projects || []).map(project => {
          const matchedKeywords = projectKeywords(project.id)
          return <View key={project.id} style={styles.item}>
            <View style={styles.mainRow}>
              <Text style={styles.mainLeft}>{project.name}</Text>
              <Text style={styles.date}>{formatDateRange(project.startDate, project.endDate)}</Text>
            </View>
            {(hasText(project.role) || hasText(project.link)) && <View style={styles.inlineMetaRow}>{hasText(project.role) && <Text style={[styles.meta, styles.roleText]}>{project.role}</Text>}{hasText(project.role) && hasText(project.link) && <Text style={styles.separator}>·</Text>}{hasText(project.link) && <Link src={toSafeURL(project.link)} style={[styles.link, styles.meta]}>项目链接</Link>}</View>}
            {matchedKeywords.length > 0 && <View style={styles.keywordRow}>{matchedKeywords.map(keyword => <Text key={keyword} style={styles.keyword}>{keyword}</Text>)}</View>}
            <BulletList bullets={project.bullets} />
          </View>
        })}
      </View>
    )
    if (section === 'campus' && (resume.campusExperiences || []).length > 0) return (
      <View key={section} style={styles.section}>
        <SectionTitle section="campus">{theme.labels.campus}</SectionTitle>
        {(resume.campusExperiences || []).map(campus => (
          <View key={campus.id} style={styles.item}>
            <View style={styles.mainRow}>
              <Text style={styles.mainLeft}>{campus.organization}</Text>
              <Text style={styles.date}>{formatDateRange(campus.startDate, campus.endDate)}</Text>
            </View>
            {(hasText(campus.role) || hasText(campus.location)) && <Text style={styles.meta}>{[campus.role, campus.location].filter(hasText).join(' · ')}</Text>}
            <BulletList bullets={campus.bullets} />
          </View>
        ))}
      </View>
    )
    if (section === 'awards' && (resume.awards || []).length > 0) return (
      <View key={section} style={styles.section}>
        <SectionTitle section="awards">{theme.labels.awards}</SectionTitle>
        {(resume.awards || []).map(award => (
          <View key={award.id} style={styles.compactItem} wrap={false}>
            <View style={styles.mainRow}>
              <Text style={styles.awardTitle}>{award.title}{hasText(award.issuer) ? <Text style={styles.meta}> · {award.issuer}</Text> : null}</Text>
              {hasText(award.date) && <Text style={styles.date}>{formatDisplayDate(award.date)}</Text>}
            </View>
            {hasText(award.description) && <Text style={styles.meta}>{award.description}</Text>}
          </View>
        ))}
      </View>
    )
    if (section === 'skills' && skillRows.length > 0) return (
      <View key={section} style={styles.section}>
        <SectionTitle section="skills">{theme.labels.skills}</SectionTitle>
        {skillRows.map(row => {
          const relevant = priorityKeywords.some(keyword => `${row.label}${row.items.join('')}`.toLowerCase().includes(keyword.toLowerCase()))
          return (
            <View key={row.label} style={styles.skillRow} wrap={false}>
              <Text style={styles.skillLabel}>{row.label}：</Text>
              <Text style={[styles.skillItems, relevant ? { fontWeight: 700 } : {}]}>{row.items.join('、\u200B')}</Text>
            </View>
          )
        })}
      </View>
    )
    return null
  }

  return (
    <Document title={`${resume.contact.name || '候选人'} - 应届生校招简历`} author={resume.contact.name || undefined}>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header} wrap={false}>
          {showAvatar && <View style={styles.headerSide} />}
          <View style={styles.headerCopy}>
            <Text style={styles.name}>{resume.contact.name}</Text>
            {hasText(resume.contact.jobTarget) && <Text style={styles.jobTarget}>求职方向：{resume.contact.jobTarget}</Text>}
            {contactItems.length > 0 && (
              <View style={styles.contactRow}>
                {contactItems.map(item => (
                  <View key={item.icon} style={styles.contactItem}>
                    <View style={styles.contactIcon}><PDFIcon name={item.icon} size={7.5} /></View>
                    {item.icon === 'email' ? <Link src={`mailto:${item.value}`} style={styles.link}>{item.value}</Link> : <Text>{item.value}</Text>}
                  </View>
                ))}
              </View>
            )}
            {socialItems.length > 0 && (
              <View style={styles.socialRow}>
                {socialItems.map((item, index) => (
                  <React.Fragment key={item.label}>
                    {index > 0 && <Text style={styles.separator}>｜</Text>}
                    {item.url ? <Link src={item.url} style={styles.link}>{item.label}</Link> : <Text>{item.label}</Text>}
                  </React.Fragment>
                ))}
              </View>
            )}
          </View>
          {showAvatar && <Image src={resume.contact.avatar!} style={styles.avatar} />}
        </View>

        {normalizeResumeSectionOrder(resume.sectionOrder).map(renderSection)}

        <Text
          fixed
          style={styles.footer}
          render={({ pageNumber, totalPages }) => totalPages > 1 ? `${pageNumber} / ${totalPages}` : ''}
        />
      </Page>
    </Document>
  )
}
