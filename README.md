# 简历智配

面向中国大陆应届生与校招求职者的 AI 秋招简历工作台。

项目基于用户经历库中的真实信息，分析目标岗位要求并生成有针对性的简历版本。AI 可以调整表达重点，但不应虚构技能、经历、数据或成果。

## 当前能力

- 经历库：导入 PDF、DOCX 或 TXT 简历，整理个人信息、教育、实习、项目和技能。
- 经历表达版本：同一段经历可保存多个岗位方向的表达版本。
- 岗位分析：读取招聘页面或粘贴岗位描述，提取岗位能力和关键词。
- 简历定制：默认由 Codex Resume Agent 阅读 JD、进行少量关键追问、选择真实素材并生成/修改简历；程序负责事实确认、约束校验、一页排版与 PDF。
- 在线编辑：生成后可直接修改简历内容并重新计算匹配度。
- PDF 导出：服务端生成 PDF，并自动保存对应投递记录。
- 本地持久化：经历库和投递记录保存在浏览器 localStorage 中。
- Legacy AI Pipeline：旧 DeepSeek/OpenAI Chat Completions 流程仅保留作开发级回滚，不再是默认主路径。

## 技术栈

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- `@react-pdf/renderer`
- OpenAI JavaScript SDK（Legacy Pipeline）
- `@openai/codex-sdk`（默认 Resume Agent）
- localStorage

## 本地运行

安装依赖：

```bash
npm install
```

在项目根目录创建 `.env.local`。正式默认使用已登录的 Codex CLI 认证，或配置 `CODEX_API_KEY`；不要将密钥提交到仓库。

如需临时回滚旧流程（开发排障用途），设置：

```env
RESUME_AI_ENGINE=legacy
```

Legacy Pipeline 使用 DeepSeek 时：

```env
AI_API_KEY=你的_API_Key
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-v4-flash
```

使用 OpenAI 时：

```env
AI_API_KEY=你的_API_Key
AI_MODEL=gpt-4o
```

构建并启动：

```bash
npm run build
npm run start
```

打开 [http://localhost:3000](http://localhost:3000)。由于 PDF 渲染依赖较重，推荐使用生产模式进行完整验证。

## 项目结构

```text
app/
  api/
    parse-resume/       简历解析
    resume-agent/       默认 Codex Resume Agent 服务
    generate-resume/    Legacy 岗位分析与简历生成
    boost-ats/          岗位匹配度优化
    download-pdf/       服务端 PDF 导出
    scrape-jd/          招聘页面读取
components/
  FactBankEditor.tsx    经历库
  JDInput.tsx           岗位描述输入
  ResumePreview.tsx     简历预览与编辑
  ResumePDF.tsx         当前 PDF 模板
  ApplicationsLog.tsx  投递记录
lib/
  codex/                隔离 workspace、Thread、Structured Output 与事实校验
  ai.ts                 Legacy AI 服务配置
  prompts.ts            Legacy 提示词
  types.ts              数据类型
  storage.ts            经历库持久化
  applications.ts       投递记录持久化
```

## 开发约束

- 基于现有架构增量修改，不重写 AI pipeline。
- 所有 AI 改写只能使用经历库中已经存在的事实。
- 新增数据字段必须兼容旧 localStorage 与旧投递记录。
- 修改 Next.js 相关代码前，先阅读当前 `node_modules/next/dist/docs/` 中对应文档。

## 当前阶段

已完成 Codex Resume Agent 正式迁移：主流程使用持久 Thread、隔离 Resume workspace、结构化输出与程序侧事实安全门；旧 Pipeline 保留为 `RESUME_AI_ENGINE=legacy` 回滚路径。中文校招模板、中文 PDF 字体与一页 Composer 已用于正式交付。

## License

MIT
