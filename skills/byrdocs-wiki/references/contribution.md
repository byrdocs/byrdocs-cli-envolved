# BYRDocs 维基真题完整贡献流程

本文件是 Agent 执行 Neowiki 新录入、修改、补答案、纠错、贡献恢复、draft PR、CI 和 review 的权威流程。开始编辑或执行 git/gh 写操作前必须完整读取。

## 边界和权威来源

本流程只处理 `byrdocs/byrdocs-neowiki` 的试卷内容：

- `exams/<试卷名>/index.mdx`；
- 同目录的题图、音频等资源；
- 对应的贡献分支和 PR。

只搜索/下载主站资料、上传 PDF/ZIP 或贡献 `byrdocs-archive` metadata 时转到 `byrdocs` Skill。修改 Astro 组件、站点功能或部署逻辑时按普通软件开发任务处理，不套用内容贡献流程。

按以下优先级判断贡献规则：

1. 按 `references/upstream.md` 解析的当前官方编辑指南和仓库说明；
2. BYRDocs Blog 教程；
3. 仅在文档未覆盖时，当前 checkout 的 schema、相关实现和少量近期同类页面；
4. Agent 一般经验。

README 和博客用于解释环境准备、VS Code 插件、预览和人工操作；内容编辑规则仍以官方编辑指南为准。其中的 `git add .`、宽泛 `git pull`、拼写错误或旧目录示例不直接转化为 Agent 规范。

## 执行顺序和阶段门禁

主 `SKILL.md` 的来源、资源、工具、授权和范围门禁在所有阶段持续生效。按下列顺序推进；
缺少证据时保留本地产物并暂停，不用后续 lint、build、draft PR 或事后披露替代前置检查。

| 阶段 | 进入下一阶段前必须成立 |
| --- | --- |
| 路由 | 已确认是维基内容贡献，并确定新录入、修改、补答案、纠错或恢复任务 |
| 准备 | 当前规则和仓库指令已读取；目标 checkout、页面、来源及恢复证据已确定 |
| 查重 | 同一考试页面和 open PR 已检查，目录及复用决定没有歧义 |
| 来源 | 文字、公式、答案和所有必要资源已逐项核对；不确定性已保留 |
| 编辑 | 页面基于当前模板或目标文件，diff 只覆盖授权范围 |
| 验证 | 内容检查和当前 workflow 要求均已执行，失败与缺项已有明确处理决定 |
| 发布 | 身份、fork、branch、已有 PR、精确 diff 和用户授权已重新核对 |
| 收尾 | PR、CI、review 或明确阻塞状态与真实远端一致 |

## 上游和实时仓库索引

先完整读取 `references/upstream.md`，按文档 ID 获取当前官方说明。获得目标 checkout 后，
不要泛读整个项目；按下表区分完成任务必须操作的对象，以及仅在文档未覆盖时使用的
兜底参考：

读取任何兜底参考前，先记录一个具体缺口：本次需要回答的问题、已读取的指南章节，以及
该章节缺少或含糊的必要信息。无法写出这个缺口时，不得读取兜底参考；“确认一下”“补充
细节”“验证文档”或“找个示例”都不是缺口。另一条入口是按指南完成内容后，实际
schema、lint、check 或 build 失败；此时先记录命令和诊断，再只读取与失败直接相关的
最小实现路径。运行验证命令以及读取模板、目标页面等任务对象不受此门禁限制。

| 类别 | 触发条件 | 读取路径 | 用途 |
| --- | --- | --- | --- |
| 当前文档 | 录入或修改正文 | 解析 `editing-guide` | 当前内容编辑规范 |
| 当前文档 | 提交前内容检查或处理 PR review | 解析 `review-guide` | 当前 review 范围、分类和输出要求 |
| 任务对象 | 所有实际贡献 | 仓库根目录当前存在的 `CLAUDE.md`、`AGENTS.md` 等指令文件 | 遵守仓库级指令及其作用域 |
| 任务对象 | 新建页面 | `templates/exam-page.mdx` | 使用当前页面骨架，不从 Skill 自造模板 |
| 任务对象 | 修改已有页面 | 目标 `exams/<exam-dir>/index.mdx`、同目录资源和相关 Git 历史 | 读取真正要修改的内容和依据 |
| 任务对象 | 本地验证 | `package.json`、当前 lockfile、`.github/workflows/pr-checks.yml` | 确定当前环境和验证命令；不从中推导编辑规范，也不据此自动安装或修改依赖 |
| 任务对象 | 排查 review 自动化 | `.github/workflows/claude-review.yml`、`.github/workflows/claude.yml` | 仅在对应 Action 或触发流程异常时读取 |
| 兜底参考 | 已记录字段、枚举、格式或目录校验的文档缺口，或相关校验实际失败 | `src/utils/examFrontmatter.ts`、`src/utils/examDirectories.ts`；必要时从 `src/content.config.ts` 跟随 import | 仅补足缺失的机器校验细节或解释失败 |
| 兜底参考 | 已记录本次组件属性或行为的文档缺口，或相关校验实际失败 | `src/components/exam.ts` 和对应的 `src/components/exam/<组件>.astro` | 仅补足缺失的导出或 props，或解释失败 |
| 兜底参考 | 查重，或已记录具体写法的文档缺口 | 少量近期同类 `exams/*/index.mdx` 和 open PR | 判断重复；只回答已记录缺口，不据此新增规则 |

“任务对象”只用于完成和验证本次贡献，不是额外规范来源；“兜底参考”仅回答已记录的
文档遗漏或实际校验失败，不能覆盖文档。指南已经明确说明的规则不得再从兜底参考交叉
验证。若文档允许的内容被 schema 或 CI 拒绝，保留失败证据并报告规则漂移，不静默
改变内容来迁就实现。

某一路径已移动或文件不存在时，先按 `references/upstream.md` 处理文档来源；任务对象和
兜底参考再用当前 import、组件导出、`package.json` scripts 和 workflow 引用定位替代
文件。记录实际路径，不退回猜测，也不扩大为全仓库扫描。review prompt 若引用已不
存在的旧路径，也按规则漂移处理。

## 按证据恢复

不要维护 Agent 自报的 workflow state。从最靠后的可信产物继续：

| 证据 | 继续方式 | 禁止动作 |
| --- | --- | --- |
| 当前用户已有匹配的 open PR | 验证 owner、head、base、draft、changed files 后恢复真实 head | 新建重复 PR；先 push 再验证范围 |
| fork 上已有贡献分支但无 open PR | 检查 diff、提交和历史 PR，让用户决定恢复或换分支 | 覆盖远端分支；自行猜测它可复用 |
| 已有本地贡献 checkout/branch | 验证 remote、base、状态和目标文件后继续 | 清理或提交用户无关改动 |
| 已有 `exams/<exam-dir>/index.mdx` | 读取页面、资源和历史，进入修改或继续验证 | 用模板覆盖非空页面；重复创建目录 |
| 只有 PDF、图片、回忆稿等来源 | 从页面/PR 查重和来源检查开始 | 未查重就创建页面 |

远端 PR、当前文件内容和最新 upstream 的证据优先于旧笔记。依赖已安装、验证已通过、登录仍有效和用户仍授权写入都不是持久状态，到对应步骤时重新检查。

## 统一贡献流程

### 1. 确定任务和工作区

确认是新录入、修改、补答案、纠错还是处理 PR，并记录目标试卷、来源和用户希望完成到本地文件还是 draft PR。

优先使用用户明确指定的 Neowiki checkout；否则使用新的专用绝对路径。已有 checkout 脏时，只在本次路径与原改动不重叠时继续；无法隔离就换专用 checkout。不要在无关仓库创建相对 `exams/`、branch 或 PR body，不清理、覆盖或提交无关改动。

验证 checkout 确实是 `byrdocs/byrdocs-neowiki` 或当前用户的 fork，识别 origin、upstream 和当前默认分支，然后按“上游和实时仓库索引”加载本次任务所需约束。

### 2. 查重页面和 PR

在最新 upstream checkout 中按学年、学期、课程、阶段和备注搜索：

- 完全相同的目录；
- 同一考试但学院、A/B 卷或备注不同的页面；
- 已存在但内容不完整、应直接修改的页面；
- 当前用户或其他贡献者正在处理的 open PR。

目录消歧遵循 `editing-guide`。不能为了避免重名添加无事实依据的学院、卷别或备注。

创建 branch、commit 或 push 前先查询当前用户的 open PR，并读取候选 changed files。只有 owner、head、base 和目标 `exams/<exam-dir>/...` 均匹配时才复用；多个候选时让用户消歧。其他用户的 PR 只作为重复候选，不能写入其 head。

### 3. 检查来源

| 来源 | 必须检查 | 不得做 |
| --- | --- | --- |
| PDF | 题头、时间、课程、阶段、卷别、全部有效题目和答案页；OCR 后对照公式、选项、表格和题号 | 把整页 PDF 图片当正文；因 OCR 丢失内容 |
| 图片/扫描件 | 可读性、方向、被裁切内容；提取文字，保留必要题图 | 根据答案反推模糊条件；把文字题全部保留为照片 |
| 回忆稿 | 区分明确记得的题意、概述和猜测 | 补造数字、选项、分值或精确原文 |
| 已有页面/review | 完整页面、相关资源、Git 历史和具体反馈 | 只看 diff 片段；未经核验照单全改 |
| BYRDocs 主站 | canonical 文件、课程/时间匹配和 32 位小写 MD5 | 把 wiki URL、短链或标题当作来源 MD5 |
| Typst/LaTeX/其他源码 | 用 curl 或 Raw 获取完整原始文本；识别模板函数（如 `#answer`、`#judge`）的全部参数，答案文件的隐藏解析字段（如第三参数）必须逐条提取 | 只用 WebFetch 获取摘要而丢失参数；只看答案符号忽略配套解析 |

需要主站资料时，调用 `byrdocs` Skill 的搜索/下载能力，但由本 Skill 继续主持维基贡献。

### 4. 建立页面事实

目录、frontmatter 字段及格式按 `editing-guide` 填写，再由当前 schema 的实际验证结果
检查机器约束；除非触发兜底门禁，不主动读取 schema 源码。本流程不复制具体字段列表。
写入的每个事实只能来自材料、当前规则或用户确认；不确定且允许省略的字段应省略，
`来源` 只填已验证的主站 MD5。

新页面从当前 checkout 的模板开始，并删除所有占位文字。目标目录或非空页面已存在时转到修改流程，不覆盖。

### 5. 录入或修改

按照解析后的 `editing-guide` 编写正文，只使用当前仓库导出的 MDX 组件。保持原题编号和结构；来源残缺时不自行补齐题号。

修改已有页面时保持 diff 聚焦。修一道题不应顺手重排全卷、重命名所有资源或润色无关段落；需要扩大范围时先说明理由。

### 6. 验证、确认和发布

按“验证和用户确认”检查内容。用户已明确授权 GitHub 写入且没有事实歧义时，可以继续提交；否则先展示变更、不完整内容和验证结果。之后按“GitHub 贡献”创建或更新 draft PR，并按“CI、review 和完成”收尾。

## 内容要求

### Frontmatter

按 `editing-guide` 填写并使用当前 schema 验证，不在 Skill 中维护字段、枚举或格式
副本。每个值必须有事实依据；表示答案可靠性或完成度的字段必须与整页实际情况一致。

### MDX 结构

- 标题、列表、选项、答案和组件语法完全遵循 `editing-guide`。
- 只有核实的答案才写成确定答案；未知状态按指南支持的方式保留。
- 公式、单位、符号和排版应对照来源，排版修改不能改变题意。
- 不添加仓库未支持的自定义 JSX、脚本或样式。


### 资源

- 资源目录、命名、引用和组件属性遵循 `editing-guide`；每个引用都要验证目标存在。
- 打开本次使用的所有题图和影响题意的附件，核对数值、文字、结构、方向、拓扑与题干和
  答案；文件名、大小或来源可靠不能替代内容核验。当前宿主无法查看必要资源时，在
  commit、push 或 PR 前暂停，请用户提供可检查形式或完成核验。只有用户明确接受精确的
  未核验范围及风险时，才可继续创建 draft PR，并在 PR 中如实披露。
- 不执行 SVG、ZIP、Office 附件中的脚本或宏，不因图像“优化”改变题目条件。

### 答案和回忆题

- 官方答案或充分核验的答案可标可靠；来源附带但未核验的答案只能标存在；条件不足则保留未知或残缺。
- 修改答案时检查完整条件、相关题图并独立验证；无法验证时说明争议，不把 Agent 猜测写成结论。
- 回忆题可以用清晰概述保存已知题意，但不得捏造选项、参数、分值或从答案反推唯一题干。
- 不因页面不完整而删除仍有参考价值的明确内容，也不为“填满”页面复制相似往年题。

## 验证和用户确认

### 范围检查

确认 diff 只包含本次试卷目录和用户明确授权的关联文件，无依赖、构建产物、临时文件或其他试卷改动。检查 `git diff --check` 和 staged diff。

### 内容检查

- 解析 `editing-guide` 和 `review-guide`，完成其中适用于本次页面的检查；
- 页面通过当前 schema，且没有模板占位文字或失效资源引用；
- PDF/图片中的有效题目没有因 OCR 或分页丢失；
- 页面没有把不确定内容改写成确定事实。

必要时启动当前仓库预览并访问 `/exam/<exam-dir>`，检查公式、选择交互、答案折叠、图片位置和缺失资源提示。VS Code 插件或 `pnpm dev` 预览不能替代 CI。

按当前 workflow 运行验证；当前基线通常是：

```bash
pnpm lint
pnpm check
pnpm build
```

命令变化时以当前 CI 为准。失败要区分本次内容错误、仓库基线和环境问题，不删内容或绕过校验伪造成功。

使用能保留原始退出码和完整必要诊断的方式运行验证；不要把命令接到截断输出的管道后，
再把管道成功误报为验证成功。缺少依赖时不自动运行 `pnpm install`、`npm install` 或其他
安装命令，先说明缺口并询问用户。

验证因环境限制（如内存或磁盘空间）失败时，可以继续完善本地内容，但不得把它报告为
通过。外部发布只有在项目当前规则明确允许，或用户已看到失败阶段、诊断和风险并明确
接受该未验证范围时才能继续；draft PR 本身不构成豁免。

GitHub 写入前向用户说明：

- 目标试卷和仓库相对路径；
- 新增/修改的题目、答案和资源；
- frontmatter 事实来源；
- 回忆内容、缺题以及尚待用户决定的来源或资源冲突；
- lint/check/build 实际结果；
- 将创建新 draft PR 还是更新已有 PR。

用户当前请求已明确包含 commit/push/PR 且不存在需要决定的事实歧义时不必重复确认。否则在外部写入前暂停。构建通过不代表内容事实、版权或收录政策已经获批。

## GitHub、PR、CI 和 Review

目标仓库是 `byrdocs/byrdocs-neowiki`，base 使用当前实际默认分支。

进入本节前再次检查：页面与必要资源已核对；重复和来源冲突已解决；验证结果及经用户
接受的未验证范围已记录；实际 diff 只包含目标试卷；任何外部写入都在用户授权范围内。
任一项不成立时不得用 draft PR 或 CI 代替。

### 身份、fork 和 base

先确认 GitHub CLI 可用，再执行只读检查：

```bash
gh --version
gh auth status
gh api user --jq .login
gh repo view byrdocs/byrdocs-neowiki --json defaultBranchRef,nameWithOwner
```

不得读取或展示 access token。没有 fork 时，询问用户是否允许创建：

```bash
gh repo fork byrdocs/byrdocs-neowiki --clone=false
```

不要强制同步、重置或 force push 用户 fork 的默认分支。

验证 remote 配置：`origin` 必须指向当前用户 fork，`upstream` 指向目标仓库。如果 checkout 的 `origin` 指向主仓库，先 rename 再添加 fork：

```bash
git remote rename origin upstream
git remote add origin https://github.com/<user>/byrdocs-neowiki.git
```

如果 `upstream` 已存在，验证其 URL 指向 `byrdocs/byrdocs-neowiki`（HTTPS 和 SSH 均为合法形式）。确认后 fetch 最新 base：

```bash
git fetch upstream master
```

### 先查询已有 PR

必须在创建本地分支、commit 或 push 前查询已有 open PR。先列出当前用户在目标仓库的 open PR：

```bash
gh pr list --repo byrdocs/byrdocs-neowiki \
  --author "@me" --state open --limit 100 \
  --json number,url,isDraft,headRepositoryOwner,headRefName,baseRefName
```

对候选逐一用 `gh pr view` 读取 `files`。恢复已有 PR 时使用它的真实 head；只有 owner、head、base 和目标 `exams/<exam-dir>/...` 均匹配时才复用。多个候选时让用户消歧，不自行选择一个写入。其他用户的 PR 只作为重复候选，不能写入其 head。

新任务或已有可信 branch 时，再精确查询：

```bash
gh pr list --repo byrdocs/byrdocs-neowiki \
  --head <branch> --state open \
  --json number,url,isDraft,headRepositoryOwner,headRefName,baseRefName
```

### 准备分支

没有匹配 PR 时，检查远端同名分支是否已被旧 PR 占用：

```bash
git show-ref --verify --quiet refs/remotes/origin/<branch>
gh pr list --repo byrdocs/byrdocs-neowiki \
  --head <branch> --state all \
  --json number,url,state,headRepositoryOwner,headRefName
```

远端同名分支存在但无对应 PR，或对应 PR 已关闭时，暂停让用户决定恢复还是换名。

分支名确定一次并通过校验，不直接拼接未经规范化的用户标题：

```bash
git check-ref-format --branch "<branch>"
```

确认后从最新 upstream/master 创建：

```bash
git checkout -b <branch> upstream/master
```

### 暂存、提交和推送

提交前检查 status、diff 和 staged files，只暂存本次试卷目录：

```bash
git status --porcelain
git add -- exams/<exam-dir>
git status --porcelain  # 必须只显示本次目录
```

出现无关变更时停止，不清理或提交用户的其他改动。

push 前再次 fetch 对应远端 head，确认没有并发更新。非 fast-forward 时安全整合，不 force push：

```bash
git fetch origin <branch>
git push -u origin <branch>
```

### 创建或更新 draft PR

PR body 写入独立文件，使用 `--body-file` 避免 shell 转义问题。body 必须包含：

- 试卷：学年、学期、科目、阶段
- 来源：源仓库/文件及题图出处
- 内容摘要：题型、数量、答案覆盖情况
- 经用户明确接受的未完成项、未验证范围及原因
- 验证结果：lint/check/build 实际输出
- 查重情况：已有页面和 open PR 的检查结果
- 尾注：`*由 [BYR Docs Wiki Skill](https://github.com/byrdocs/byrdocs-cli-envolved) 创建*`

不包含本机绝对路径、凭证、token 或长日志。

已有 PR 时更新同一 PR：

```bash
gh pr edit <number> --repo byrdocs/byrdocs-neowiki \
  --body-file <pr-body-file>
```

没有匹配 PR 时创建新的 draft：

```bash
gh pr create \
  --repo byrdocs/byrdocs-neowiki \
  --base master \
  --head <user>:<branch> \
  --draft \
  --title "<简洁标题>" \
  --body-file <pr-body-file>
```

`--head` 的 owner 必须是当前个人账号，不填组织名。创建或更新后核对：

```bash
gh pr view <number> --repo byrdocs/byrdocs-neowiki \
  --json url,isDraft,state,headRefName,baseRefName,statusCheckRollup,reviews,files
```

默认保持 draft。只有用户明确要求时才标记 ready for review。

## CI、review 和完成

读取真实 checks、diff、reviews、comments 和 changed files：

```bash
gh pr view <number> --repo byrdocs/byrdocs-neowiki \
  --json statusCheckRollup,reviews,reviewDecision,comments,files
gh pr checks <number> --repo byrdocs/byrdocs-neowiki
gh pr diff <number> --repo byrdocs/byrdocs-neowiki
```

- lint/check/build 失败时读取对应日志并优先本地复现；
- frontmatter、目录、组件和资源问题按当前实现修复；
- 内容正确性反馈重新核对来源、公式和题图；
- 图片无法辨认时明确说明，不能静默跳过；
- 排版建议不伪装成渲染或内容错误；
- 只修本次试卷，不顺手修改其他试卷使全局检查变绿；
- 政策、版权和是否适合收录交给维护者与用户决定；
- 分支落后导致无关错误时安全整合 upstream，不重置用户 fork 默认分支。

修正后 push 到同一 head，重新核对 changed files 和 checks。review thread 是否 resolved 以 GitHub 实际状态为准。

最终或暂停时报告：

- 目标页面和最靠后的持久化产物；
- 来源及 canonical MD5（如有）；
- 已录入/修改和仍缺失的内容；
- 未核验答案、模糊题图等不确定项；
- lint/check/build 结果；
- PR URL、draft/ready、CI/review 状态；
- 用户下一步或明确阻塞原因。

恢复错误时回到最接近的可信证据：规则冲突就重读当前 checkout；目录已存在就修改而非覆盖；工作区脏就精确隔离；远端 branch/PR 已存在就验证后复用；事实、授权或用户决定缺失就保留本地产物并暂停。

任何完成声明都必须对应实际文件、命令输出或 GitHub 状态。不要输出敏感信息、长 JSON dump 或无关日志。
