---
name: byrdocs-wiki
description: Use when 用户想在 BYRDocs 维基真题录入或修改试题、补充或纠正答案、处理题图/音频/MDX、贡献 wiki.byrdocs.org 页面、创建或更新 byrdocs/byrdocs-neowiki PR，或处理该仓库的 CI 和 review。
---

# BYRDocs 维基真题贡献

用这个 Skill 把 PDF、图片、回忆稿或已有页面整理成可阅读、可交互的维基真题，
或修改、补全并贡献已有试题。目标产物位于
`byrdocs/byrdocs-neowiki` 的 `exams/<试卷名>/index.mdx` 和同目录资源文件。

## 先区分两种“贡献”

| 用户目标 | 使用入口 |
| --- | --- |
| 搜索或下载主站资料、上传 PDF/ZIP、填写 archive metadata | `byrdocs` |
| 录入题目、修改维基页面、补答案、处理 MDX/题图、贡献 Neowiki PR | 本 Skill |

用户只说“贡献试题”且上下文不能判断时，只问类似：

> 你希望把原始试卷文件上传到 BYR Docs 资料库，还是把试题整理成可阅读的维基真题页面？

如果用户只想上传原始文件而不录题，停止本流程并转到 `byrdocs`。如果维基贡献需要
搜索、下载主站文件或确认来源 MD5，本 Skill 保持总流程所有权，按需使用 `byrdocs`
能力完成该子步骤。

## 不可变原则

- 开始任何编辑、git/gh 写操作、恢复已有贡献或处理 CI/review 前，必须完整读取
  `references/contribution.md`。
- 准备录入或修改正文时，还必须读取 `references/editing-guide.mdx`。需要环境准备、
  本地预览或普通人工贡献说明时读取 `references/project-readme.md`。
- checkout 存在时，必须读取它当前的 `CLAUDE.md`/`AGENTS.md`、`src/guide/index.mdx`、
  frontmatter schema、模板、相关组件和 CI；不能只依赖打包快照。
- 对于文档里未提及的部分，可以参考 upstream 仓库的其他试题是怎么写的。
- 不编造题目、选项、分值、答案、学院、考试时间或来源。回忆题允许不完整和非原文
  表达，但必须如实保留不确定性。
- 不把整页试卷照片当正文。除必要题图和音频外，内容应录成符合项目规范的 MDX。
- 不添加项目未支持的自定义 JSX、脚本、样式或远程资源。不执行来源压缩包中的脚本。
- 不读取、展示或提交 token、cookie、校园网密码、GitHub access token、本机隐私路径
  或不必要的个人信息。
- 默认创建 draft PR。只有用户明确要求，才能标记 ready for review。

## 事实来源优先级

发生冲突时按以下顺序处理：

1. 当前 Neowiki checkout 的实现、schema 和 CI；
2. 当前 checkout 的编辑指南、模板、仓库说明和同类最新页面；
3. 本 Skill 打包的 guide/README 快照；
4. BYRDocs Blog 教程；
5. Agent 一般经验。

博客和快照可以解释操作，但不能覆盖当前代码或 CI。发现规则漂移时，按当前 checkout
执行，并在最终回复中指出快照需要刷新。

## 任务路由

### 新录入

从来源材料建立一个新试卷目录和 `index.mdx`。先查同一考试是否已有页面或 open PR，
再确认目录名、frontmatter、题目范围和资源。优先使用当前 checkout 的
`templates/exam-page.mdx`，不要从 Skill 复制另一份模板。

### 修改、补答案或纠错

先读取目标页面、相关资源、提交历史和用户提供的依据，只改能够核实的内容。答案或
解析有争议时说明依据和不确定性；不要为了填满页面而猜答案。

### 从回忆录题

清晰表达已知题意，不伪造精确原文、数字或选项。允许保留缺失题号、概述和明确的
占位信息。只根据实际答案覆盖情况填写 `答案完成度`。

### 恢复贡献或处理 PR

先查远端 open PR、真实 head、changed files、当前分支和目标试卷目录，从最靠后的可信
产物继续。更新同一 PR，不重复创建页面、分支或 PR。

## 完整工作流

1. 确认任务类型、目标试卷和来源材料。
2. 发现或准备专用 Neowiki checkout，保留用户无关改动。
3. 读取当前仓库规则并同步最新 upstream base。
4. 查重现有页面、同名目录和当前用户 open PR。
5. 检查来源，列出可验证事实、缺失内容和不确定项。
6. 创建或修改 `exams/<试卷名>/index.mdx` 及同目录资源。
7. 检查 frontmatter、正文结构、组件、公式、答案、题图和音频。
8. 运行当前仓库要求的 lint、check 和 build。
9. 向用户报告变更、依据、不完整内容、warning 和验证结果。
10. 已获得 GitHub 写入授权时，只提交本次相关文件并创建或更新 draft PR。
11. 核对 PR 的 base、head、draft、changed files、CI 和 review。

每一步的门禁、恢复证据和命令边界以 `references/contribution.md` 为准，不能根据这份
摘要自行补全。

## BYRDocs CLI 边界

Neowiki 编辑、校验和 GitHub 操作不使用 `byrdocs wiki` 等不存在的命令。当前 CLI
只在需要主站搜索、下载或来源 MD5 时作为辅助；MDX 校验必须使用目标 Neowiki
checkout 自己的命令。

## 最终回复

- 给出创建或修改的试卷页面和仓库相对路径。
- 说明来源、已核实事实、仍不完整或不确定的内容。
- 报告 lint/check/build 的实际结果。
- 已创建或更新 PR 时给出 URL、draft/ready、CI 和 review 状态。
- 暂停时指出最靠后的持久化产物和需要用户决定的唯一下一步。
- 不倾倒长日志、完整 GitHub JSON 或任何敏感信息。
