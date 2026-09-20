import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Link,
} from '@react-pdf/renderer'
import { GeneratedResume } from '@/lib/types'

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Times-Roman',
    fontSize: 8.5,
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 36,
    lineHeight: 1.25,
    color: '#000000',
  },
  // Header
  name: {
    fontSize: 14,
    fontFamily: 'Times-Bold',
    textAlign: 'center',
    marginBottom: 6,
  },
  contactLine: {
    fontSize: 8,
    color: '#333333',
    marginBottom: 8,
  },
  // Section
  sectionTitle: {
    fontFamily: 'Times-Bold',
    fontSize: 8.5,
    textTransform: 'uppercase',
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
    paddingBottom: 1,
    marginBottom: 4,
    marginTop: 3,
  },
  // Experience
  expHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  company: {
    fontFamily: 'Times-Bold',
    fontSize: 8.5,
  },
  location: {
    fontSize: 8.5,
    fontFamily: 'Times-Bold',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  title: {
    fontSize: 8.5,
    fontFamily: 'Times-Italic',
  },
  dates: {
    fontSize: 8.5,
    color: '#333333',
  },
  bullet: {
    flexDirection: 'row',
    marginBottom: 1.5,
    paddingRight: 4,
  },
  bulletDot: {
    width: 10,
    fontSize: 8.5,
  },
  bulletText: {
    flex: 1,
    fontSize: 8.5,
    textAlign: 'justify',
  },
  expBlock: {
    marginBottom: 5,
  },
  // Education
  eduHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  school: {
    fontFamily: 'Times-Bold',
    fontSize: 8.5,
  },
  degreeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  degree: {
    fontFamily: 'Times-Italic',
    fontSize: 8.5,
  },
  degreeField: {
    fontFamily: 'Times-BoldItalic',
    fontSize: 8.5,
  },
  // Skills
  skillLine: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  skillBullet: {
    width: 10,
    fontSize: 8.5,
  },
  skillCategory: {
    fontFamily: 'Times-Bold',
    fontSize: 8.5,
  },
  skillText: {
    flex: 1,
    fontSize: 8.5,
  },
})

function toAbsoluteURL(str: string): string {
  if (str.startsWith('http')) return str
  return 'https://' + str
}

function parseSkillLine(line: string): { category: string; items: string } {
  const colonIdx = line.indexOf(':')
  if (colonIdx === -1) return { category: '', items: line }
  return {
    category: line.slice(0, colonIdx + 1),
    items: line.slice(colonIdx + 1),
  }
}

function isURL(str: string): boolean {
  return str.startsWith('http://') || str.startsWith('https://') || str.includes('linkedin.com') || str.includes('github.com')
}

function toURL(str: string): string {
  if (str.startsWith('http')) return str
  return 'https://' + str
}

export function ResumePDFDocument({ resume }: { resume: GeneratedResume }) {
  const { phone, email, linkedin, github, website } = resume.contact
  const contactItems: Array<{ label: string; url?: string }> = [
    ...(phone ? [{ label: phone }] : []),
    ...(email ? [{ label: email, url: `mailto:${email}` }] : []),
    ...(linkedin ? [{ label: 'LinkedIn', url: toAbsoluteURL(linkedin) }] : []),
    ...(github ? [{ label: 'GitHub', url: toAbsoluteURL(github) }] : []),
    ...(website ? [{ label: 'Website', url: toAbsoluteURL(website) }] : []),
  ]

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <Text style={styles.name}>{resume.contact.name}</Text>
        <View style={{ ...styles.contactLine, flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' }}>
          {contactItems.map((item, i) => (
            <Text key={i} style={{ fontSize: 8, color: '#333333' }}>
              {i > 0 ? ' | ' : ''}
              {item.url ? (
                <Link src={item.url} style={{ color: '#1155CC' }}>{item.label}</Link>
              ) : item.label}
            </Text>
          ))}
        </View>

        {/* Education */}
        {resume.education.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>EDUCATION</Text>
            {resume.education.map((edu) => (
              <View key={edu.id} style={styles.expBlock}>
                <View style={styles.eduHeader}>
                  <Text style={styles.school}>{edu.school}</Text>
                  <Text style={styles.location}>{edu.location}</Text>
                </View>
                <View style={styles.degreeRow}>
                  <Text>
                    <Text style={styles.degree}>{edu.degree}</Text>
                    {edu.field ? (
                      <Text style={styles.degree}>, <Text style={styles.degreeField}>{edu.field}</Text></Text>
                    ) : null}
                  </Text>
                  <Text style={styles.dates}>{edu.startDate}{edu.endDate ? ` – ${edu.endDate}` : ''}</Text>
                </View>
                {edu.notes.filter(n => n.trim()).map((note, i) => (
                  <View key={i} style={styles.bullet}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{note}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Skills */}
        {resume.skills.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>SKILLS</Text>
            {resume.skills.map((line, i) => {
              const { category, items } = parseSkillLine(line)
              return (
                <View key={i} style={styles.skillLine}>
                  <Text style={styles.skillBullet}>•</Text>
                  <Text style={styles.skillText}>
                    <Text style={styles.skillCategory}>{category}</Text>
                    {items}
                  </Text>
                </View>
              )
            })}
          </View>
        )}

        {/* Work Experience */}
        {resume.experiences.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>WORK EXPERIENCE</Text>
            {resume.experiences.map((exp, i) => (
              <View key={i} style={i === resume.experiences.length - 1 && !(resume.projects || []).length ? { ...styles.expBlock, marginBottom: 0 } : styles.expBlock}>
                <View style={styles.expHeader}>
                  <Text style={styles.company}>{exp.company}</Text>
                  <Text style={styles.location}>{exp.location}</Text>
                </View>
                <View style={styles.titleRow}>
                  <Text style={styles.title}>{exp.title}</Text>
                  <Text style={styles.dates}>{exp.startDate}{exp.endDate ? ` – ${exp.endDate}` : ''}</Text>
                </View>
                {exp.bullets.filter(b => b.trim()).map((bullet, j) => (
                  <View key={j} style={styles.bullet}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{bullet}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Projects */}
        {(resume.projects || []).length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>PROJECTS</Text>
            {(resume.projects || []).map((proj, i, arr) => (
              <View key={i} style={i === arr.length - 1 ? { ...styles.expBlock, marginBottom: 0 } : styles.expBlock}>
                <View style={styles.expHeader}>
                  <Text style={styles.company}>{proj.name}</Text>
                  <Text style={styles.company}>
                    {proj.startDate || ''}{proj.startDate && proj.endDate ? ' – ' : ''}{proj.endDate || ''}
                  </Text>
                </View>
                {proj.bullets.filter(b => b.trim()).map((bullet, j) => (
                  <View key={j} style={styles.bullet}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{bullet}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}
      </Page>
    </Document>
  )
}
