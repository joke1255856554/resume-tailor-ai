import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '简历智配｜AI 秋招简历工作台',
  description: '管理真实经历，根据目标岗位生成有针对性的简历版本。',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
