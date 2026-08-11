# BYRDocs 资料贡献完整流程

本文件是 BYRDocs 资料贡献、贡献恢复、metadata PR、CI 和 review 的权威流程。开始执行前必须完整读取；不要只读取局部章节，也不要根据主 `SKILL.md` 的入口摘要自行补全步骤。

## 适用范围

以下动作都属于本流程：上传资料、创建或修改 metadata、恢复中断的贡献、创建或更新 `byrdocs/byrdocs-archive` PR，以及处理该 PR 的 CI/review。

- BYRDocs CLI 身份和 GitHub 身份是两套系统。`byrdocs auth ...` 只负责 BYRDocs 上传/下载；`gh ...` 只负责 GitHub fork、push 和 PR。
- 上传成功只表示二进制文件进入 BYRDocs 存储。只有 metadata PR 合并后，资料才进入正式展示和搜索流程。
- BYRDocs 文件以 MD5 和扩展名命名，例如 `<md5>.pdf` 或 `<md5>.zip`；metadata 使用相同 MD5，路径为 `metadata/<md5>.yml`。
- 搜索和 CLI 的共享契约仍以主 `SKILL.md` 为准。本文件不另建一套登录或 JSON 解析契约。
- 不要直接调用主站内部 API。搜索只使用公开搜索 MCP/HTTP API；贡献只通过 BYRDocs CLI 和 `gh`。除非用户正在维护 CLI 本身，不要绕过这些入口。

## 执行顺序和阶段门禁

主 `SKILL.md` 的授权、事实、工具和范围门禁在所有阶段持续生效。按下列顺序推进；某阶段
证据不完整时保留已有产物并暂停，不提前运行后续阶段来“看看能不能做”。

| 阶段 | 进入下一阶段前必须成立 |
| --- | --- |
| 准备 | 目标资料、来源文件和专用 workspace 已确定；恢复时已找到最靠后的可信产物 |
| 检查 | 已按实时 `file-rules` 检查文件内容、类型、质量和可收录性 |
| 查重 | 已完成语义查重；重复、版本或质量差异已得到处理决定 |
| 主站 | 当前任务所需 CLI 和服务可用；上传身份满足；得到一致的 canonical file-ref |
| Metadata | 字段均有来源，未知项按规则询问或省略；validate/preview 结果已处理 |
| 发布 | GitHub 身份、fork、branch、已有 PR 和精确 diff 已核对；写操作在授权范围内 |
| 收尾 | PR、CI、review 或明确阻塞状态与真实远端一致 |

## 本流程的领域边界

- 本流程不依赖 BYR Docs Publish；网页贡献状态不能作为本流程的 CLI、workspace 或 PR 证据。
- metadata 事实必须来自资料、当前文档/schema、可靠查询、搜索结果或用户确认。校验通过、
  非空模板和 `ready_for_pr` 都不能替代事实依据。
- 普通新增贡献只修改本次 `metadata/<md5>.yml`；除非用户明确提出，不修改其他 metadata。
- 字段和枚举以实时文档/schema 为准，不在 Skill 中复制；同类 metadata 只用于文档未覆盖
  时理解现有表达，不能把常见写法提升为规则。
- archive checkout 只在 GitHub 阶段准备；普通贡献默认创建 draft PR。

## 工作区和路径安全

贡献必须使用专用的绝对路径 workspace。不要在用户当前无关仓库下创建相对 `workspace/`、`metadata/`、Git branch、commit 或 PR body。可使用系统临时目录或用户明确指定的贡献目录，例如：

```text
<absolute-workspace>/
  generated/
    metadata/<md5>.yml
    pr-body.md
  archive/
```

源文件可以留在原路径；如需复制，只把普通数据文件复制到专用 workspace。PR 前，将 `<absolute-workspace>/generated/metadata/<md5>.yml` 复制到 `<absolute-workspace>/archive/metadata/<md5>.yml`。

路径规则：

- 开始前记录绝对 workspace、源文件绝对路径和生成文件路径。只有进入 GitHub 写入阶段时才确定并创建 archive checkout 路径。
- 最终回复和 PR body 只写仓库相对路径 `metadata/<md5>.yml`，不要泄露本机绝对路径。
- 运行 CLI 前确认 shell 与路径格式一致，例如 PowerShell 使用 Windows 路径；WSL 使用 `/mnt/c/...`，不要在 WSL 命令中直接传 `C:\...`。
- 贡献 branch 是本 Skill 用于恢复任务和复用 PR 的标识，不是主站契约。开始 GitHub 流程前确定一次 `<branch>`：默认使用 `contribute/<md5>`，其中 `<md5>` 是完整 32 位文件 MD5。使用其他名称时，必须先规范化并通过 `git check-ref-format --branch "<branch>"` 校验；不得把资料标题或其他未经规范化的用户输入直接拼入 branch。后续查询、checkout 和 push 始终复用同一个 `<branch>`。
- GitHub 阶段预定的 archive 路径如果已存在或不为空，不要清理或复用；改用另一个新的空目录。

## 从已有产物恢复

不要维护或相信 Agent 自报的流程状态。恢复中断任务时，从后往前检查以下持久化产物，找到最靠后的可信产物后继续；证据冲突时，以远端状态和文件实际内容为准：

1. **已有 open PR**：读取 PR 的 owner、head、base、draft 状态和 changed files。只在它确属当前用户、本次 MD5 且只包含本次 metadata 时复用。
2. **已有非空 metadata YAML**：先读取，再核对文件名、`id`、URL、MD5、扩展名和 `data.filetype`；一致时从补全事实或 validate/preview 继续，不运行 `meta init` 覆盖。
3. **已有可信 canonical file-ref**：只有 MD5、key、URL 和扩展名彼此一致时才用它继续精确查重和 metadata。对尚未正式发布的新贡献，它不能替代 PR 前对源文件执行的幂等 `upload` 确认可用性；`uploaded` 与 `exists` 不产生不同的后续流程。
4. **只有源文件**：从文件检查、语义查重和上传开始。

CLI 调用方式、登录能力、用户确认和 PR 授权属于执行门禁，不是可持久化恢复状态；到需要它们的步骤时重新只读验证。不要为“保险”覆盖 metadata 或重复创建 PR。

## 文件检查和类型判断

先读取 `references/upstream.md` 并解析 `file-rules`，再确认源文件存在、可读、扩展名与
实际类型一致，并收集可验证事实。文件分类、收录范围、质量和语义重复判断以该实时
文档为准；本流程不复制其类别定义。

- PDF：查看首页、封面、目录、试题题头和必要页面；不要因为文件名像“教材”或“期末”就直接定类。
- ZIP：只列出文件名，读取 README 和必要的少量纯文本；不要执行压缩包内脚本，不要打开可执行文件，也不要在不安全位置整体解压。

先形成“已证实事实、合理候选、未知必填、未知可选”四类清单。只有已证实事实可直接写入；合理候选需要继续查证或让用户确认。

## 语义查重

执行查重步骤时，必须再按主 Skill 的搜索入口解析 `search-contract`。使用 MCP/HTTP 主路径，按资料类型组合标题、课程、老师、ISBN、年份、学期等查询；不能只搜索 MD5。

- 疑似同一资料时，向用户展示关键相似字段和现有条目链接。
- 不同 MD5 但标题、课程、年份高度相似时，暂停上传或 PR，询问它是不同版本、更高质量版本、补充资料，还是重复上传。
- 用户确认重复且没有新增价值时，停止贡献，不上传、不创建 metadata PR。
- 用户确认是不同版本或有保留价值时，记录判断依据，供 metadata 和 PR body 使用。
- 查重结果是 wiki 项时，只将其作为语义线索；wiki 不是可上传/下载 file-ref。

## 服务、CLI 和认证能力门禁

只有文件检查和语义查重已经表明应继续贡献时，才准备主站 CLI、检查服务和认证。按主
`SKILL.md` 的“按需准备 CLI”“CLI JSON 契约”和“登录”执行，并在本次任务中始终使用
同一 argv 前缀。

根据下一步只验证实际需要的命令；上传和 metadata 流程可能依次需要 `auth status`、
`auth login`、`auth wait`、`upload`、`meta schema`、`meta init`、`meta validate` 和
`meta preview`。用当前 CLI 的 `help <command> --json` 和必要的 `doctor --json` 确认，
不为尚未进入的阶段批量探测能力，也不探测未实现的 `capabilities` 命令。

缺少 CLI、`gh` 或必要的文件检查工具时，不通过 npm、pip、系统包管理器或项目依赖安装
来暗中补齐；先使用已有等价能力，仍无法满足阶段门禁时说明缺口并询问用户。命令缺失、
JSON schema 不兼容或所需服务不可达时停止并提示修复。

上传前 `auth status --json` 必须同时显示 `logged_in: true` 和 `can_upload: true`。不满足、
等待超时或实际上传返回 401 时，完整回到主 Skill 的“登录”流程；本文件不重复
login/wait/poll 细节。

## 上传、复用与精确 MD5 查重

语义查重通过后才能上传：

```bash
byrdocs upload <absolute-file.pdf|absolute-file.zip> --json
```

示例中的 `byrdocs` 代表本任务已固定的 CLI argv 前缀。命令成功后只把 `data.md5`、`data.key`、`data.url` 和扩展名作为后续 canonical file-ref；确认它们彼此一致，不要从原文件名重新猜测。

`data.status: "uploaded"` 和 `"exists"` 都进入同一个 metadata 流程。`exists` 表示服务端已有相同 MD5 的二进制，CLI 已把它作为幂等成功返回；不要把它当错误，也不要查询主站内部的 Uploaded/Published 状态。

`file-rules` 只决定收录和去重政策，不定义 CLI 响应。当前 CLI 的 `ok: true`、
`status: "exists"` 是可继续的幂等结果；不要把 Publish UI 的提示或接口语义套到 CLI
流程。

metadata 合并到 archive `master` 后，上游 `upload-metadata` workflow 负责发布 metadata 并衔接主站内部文件状态；这不是贡献 Agent 的步骤。Agent 只跟踪 metadata、PR 和公开 CI/review 结果。

恢复任务可以先使用可信 canonical file-ref 继续整理 metadata。对尚未正式发布的新贡献，在创建或更新 PR 前，本轮必须对同一源文件成功执行一次 `upload`。文件仍存在时只返回 `exists`，不会重复传输；已被清理时才重新上传。这是幂等的可用性确保，不是“检查上传状态”，也不需要内部状态查询。

源文件不可用，或用户明确禁止任何可能发生的重新上传时，不得运行 `upload`；如果该资料尚未正式发布，应暂停并说明无法保证二进制可用。已经通过公开搜索和 upstream metadata 证实正式发布、且本次只更新现有 metadata 时，不需要重新上传二进制。

得到 canonical file-ref 后：

1. 使用 MD5 在 BYRDocs 搜索中做精确搜索。已能搜索到同一条目时，先比较并判断是否应停止或更新。
2. 在 GitHub 身份可用后，用远端 API 检查 archive 的 `metadata/<md5>.yml`，不需要本地源码目录或提前 clone：

```bash
gh api --method GET repos/byrdocs/byrdocs-archive/contents/metadata/<md5>.yml \
  -f ref=master
```

返回现有文件时先读取和比较；明确返回 404 才表示 upstream 当前没有该路径。网络、权限或其他错误不等于不存在，必须在创建 PR 前重新确认。

分支处理：

- 二进制已存在、metadata 不存在：继续创建 metadata；这是正常的“复用文件并补 metadata”路径。
- metadata 已存在：先读取并比较。内容已完整时停止并返回现有条目；确需更新时必须获得用户明确授权，走“更新现有 metadata”而不是新增流程。
- metadata 已经在 workspace 中填写：保留文件，核对 MD5/URL/type 和字段来源；不要重跑 `meta init` 覆盖。
- 相同 head 已有 PR：后续复用该 PR，不要创建第二个 PR。

## Metadata 初始化、填写与确认

### 加载实时规则

读取 `references/upstream.md`，解析 `metadata-rules` 解释字段语义，再通过 CLI 解析
`metadata-schema` 的当前机器契约：

```bash
byrdocs meta schema --type <book|test|doc> --json
```

检查 JSON 的 schema 来源和 URL。实时 schema 决定当前结构、必填项和枚举；文档与
schema 冲突时保留校验结果并报告上游漂移，不为通过校验编造事实。权威来源不可用时
不得凭旧记忆继续。

字段语义仍不清楚时，可以通过 GitHub 远端 API 读取同类型或同课程的 `metadata/*.yml` 示例；不得假设本机已有 archive checkout。

### 安全初始化

只有目标 YAML 不存在或已确认是空的新文件时才能初始化：

```bash
byrdocs meta init <md5.ext-or-direct-url> \
  --type <book|test|doc> \
  --out <absolute-workspace>/generated/metadata/<md5>.yml \
  --json
```

- PDF 可以使用 `<md5>.pdf`、直接 URL，或兼容性的裸 MD5；默认优先带扩展名 key/URL。
- ZIP 必须使用 `<md5>.zip` 或直接 `.zip` URL，不得把裸 MD5 交给 `meta init`，否则当前 CLI 会按 PDF 解释。
- 目标 YAML 已存在时先读取。非空文件不要覆盖；核对内容后从补全事实或 validate/preview 继续。
- 初始化后核对文件名、顶层 `id`、文件 URL、MD5 和 `data.filetype` 一致。

### 填写与事实确认

只填写有来源的字段。对每一项记录来源属于文件内容、实时文档/schema、搜索/可靠查询或用户确认中的哪一种。

对最终 YAML 保留字段来源说明，并向用户呈现会影响事实正确性或收录判断的未知项、冲突
和 warning。未知必填项形成清晰问题；允许省略的未知可选项保留为空缺，不要猜。用户已
明确要求端到端完成贡献、所有事实均有依据且风险与范围没有变化时，不必为已展示过的
常规字段重复索要授权；仍需用户决定的事实必须先询问并暂停。

最终进入仓库的文件必须是 `metadata/<md5>.yml`；文件名 MD5、`id`、URL 中 MD5、扩展名和 `data.filetype` 必须一致。PR body 应区分文件推断、外部查询和用户确认的事实。

### 校验、预览和 PR 授权

```bash
byrdocs meta validate <absolute-workspace>/generated/metadata/<md5>.yml --json
byrdocs meta preview <absolute-workspace>/generated/metadata/<md5>.yml --json
```

- 有 error diagnostics 时，按 `path` 和 `message` 修正事实或格式；不要绕过校验。
- 只有 warning 时也要向用户解释风险。
- `ready_for_pr: true` 只说明机器校验允许进入 PR，不代表用户已经确认事实，也不代表版权、收录政策或内容质量获批。
- GitHub 写入不在用户当前请求内时，必须把最终 YAML、字段来源、未填项、validate/preview
  摘要和 warning 给用户，并获得创建或更新 PR 的授权。写入已明确授权时，仅在事实、范围
  或风险发生变化时重新确认。

## GitHub、PR、CI 和 Review

目标仓库是 `byrdocs/byrdocs-archive`，base 是 `master`。所有 GitHub 写操作都在专用 absolute workspace 的干净 `archive/` checkout 中进行。

进入本节前再次检查：源文件内容和类型已经检查；语义与精确查重结论已解决；canonical
MD5、key、扩展名和 metadata `id` 一致；字段事实与 warning 已处理；实际变更只包含目标
metadata；任何外部写入都在用户授权范围内。任一项不成立时不得用 draft PR 或 CI 代替。

### 身份、fork 和 base

先确认 GitHub CLI 存在，再执行只读检查，例如：

```bash
gh --version
gh auth status
gh api user --jq .login
gh repo view byrdocs/byrdocs-archive --json defaultBranchRef,nameWithOwner
```

没有安装 `gh` 时，停止 GitHub 写操作，让用户选择自行安装 GitHub CLI 后继续，或自行
贡献 metadata；Agent 不代为安装。GitHub 未登录时，引导用户完成 `gh auth login`。没有
fork 时，询问用户是否允许创建：

```bash
gh repo fork byrdocs/byrdocs-archive --clone=false
```

不需要同步或重置用户 fork 的 `master`。后续新贡献分支直接基于本次 fetch 的 `upstream/master` 创建，只向用户 fork push 贡献分支。普通 metadata 贡献也不修改 workflow 文件，不应要求额外的 workflow scope。

### 先查询已有 PR

必须在创建本地分支、commit 或 push 前查询已有 open PR。

恢复任务如果没有可信的原 branch 记录，先列出当前用户在目标仓库的 open PR：

```bash
gh pr list --repo byrdocs/byrdocs-archive \
  --author "@me" --state open --limit 100 \
  --json number,url,isDraft,headRepositoryOwner,headRefName,baseRefName
```

对候选逐一用后面的 `gh pr view` 读取 `files`；只有 changed files 精确包含本次 `metadata/<md5>.yml`，再结合 owner/head/base/draft 门禁，才能恢复其真实 `<head-ref>`。不要靠 PR 标题猜测，也不要在原 branch 未知时只查默认 branch。如果有多个候选都通过文件路径匹配，暂停并把候选 URL、head 和 changed files 交给用户消歧，不得自行选择一个写入。

新任务或已经有可信 `<branch>` 时，再按目标 head 精确查询：

```bash
gh pr list --repo byrdocs/byrdocs-archive \
  --head <branch> --state open \
  --json number,url,isDraft,headRepositoryOwner,headRefName,baseRefName
```

`gh pr list --head` 不支持 `<owner>:<branch>` 语法，因此必须读取 `headRepositoryOwner.login`，只把 owner 是当前 GitHub 用户且 `headRefName` 匹配的项认作可更新的已有 PR。

- 找到当前用户的同 head open PR：记录 number、URL、真实 `<head-ref>`、base 和 draft 状态；后续 fetch 并更新它，不创建新 branch/PR。
- 只找到其他用户的同名 head：不要 push；把它作为可能重复的贡献告知用户，再决定是否继续自己的分支。
- 没有匹配 PR：后续从最新 `upstream/master` 创建新 branch，并在 push 后创建 draft PR。

找到当前用户的已有 PR 时，在任何 checkout、commit、push 或 PR body 更新前先读取完整 PR 信息：

```bash
gh pr view <number> --repo byrdocs/byrdocs-archive \
  --json headRepositoryOwner,headRefName,baseRefName,isDraft,state,files,url
```

只有 owner/head 与查询一致、`state` 为 open、`baseRefName` 为 `master`，且 `files` 只包含本次 `metadata/<md5>.yml` 时才能继续。PR 已非 draft、base 错误或含无关文件时，先暂停并向用户说明；不要先 push 再验证。

### 准备或恢复干净分支

到此阶段才在新的空目录创建干净 checkout；不得假设用户原先已有 `byrdocs-archive` 源码目录。`archive/` 已存在时选择另一个专用绝对路径，不要清理或覆盖旧目录。`gh repo clone` 克隆 fork 时通常会自动配置 parent 为 `upstream`，所以不能无条件重复添加：

```bash
gh repo clone <github-user>/byrdocs-archive <absolute-workspace>/archive
git -C <absolute-workspace>/archive remote get-url origin
git -C <absolute-workspace>/archive remote get-url upstream
```

先把 remote URL 规范化后验证：`origin` 必须指向用户 fork；`upstream` 的 HTTPS `https://github.com/byrdocs/byrdocs-archive.git` 和 SSH `git@github.com:byrdocs/byrdocs-archive.git` 都是合法形式。其他 URL 或 owner/repo 不一致时停止，不要擅自覆盖。只有 `upstream` 不存在时才添加：

```bash
git -C <absolute-workspace>/archive remote add upstream https://github.com/byrdocs/byrdocs-archive.git
```

remote 验证通过后再 fetch：

```bash
git -C <absolute-workspace>/archive fetch origin
git -C <absolute-workspace>/archive fetch upstream master
```

如果前一步发现已有 PR，必须从它的真实远端 head 恢复，不能从 upstream 新建同名分支：

```bash
git -C <absolute-workspace>/archive fetch origin <head-ref>
git -C <absolute-workspace>/archive switch -c <head-ref> --track origin/<head-ref>
```

没有匹配 PR 时，仍要检查 `origin/<branch>` 是否已被旧的 closed/merged PR 或中断任务占用：

```bash
git -C <absolute-workspace>/archive show-ref --verify --quiet refs/remotes/origin/<branch>
gh pr list --repo byrdocs/byrdocs-archive \
  --head <branch> --state all \
  --json number,url,state,headRepositoryOwner,headRefName
```

如果没有匹配 PR 但存在 `origin/<branch>` 同名远端分支，暂停并让用户决定恢复旧分支，还是使用另一个经过规范化和校验的安全分支名；选新名字后必须更新 `<branch>`，并回到“先查询已有 PR”重新检查。只有远端同名分支也不存在时，才从 upstream 创建新分支：

```bash
git -C <absolute-workspace>/archive switch -c <branch> upstream/master
```

只复制本次 metadata，然后检查：

```bash
mkdir -p <absolute-workspace>/archive/metadata
cp <absolute-workspace>/generated/metadata/<md5>.yml <absolute-workspace>/archive/metadata/<md5>.yml
git -C <absolute-workspace>/archive status --porcelain
```

`git status --porcelain` 必须只显示本次 `metadata/<md5>.yml`。如果出现任何无关变更，停止提交，重新创建干净 checkout；不要顺手清理、提交或修改用户的旧文件。

检查 diff 后，只暂存、提交和推送这一文件：

```bash
git -C <absolute-workspace>/archive add metadata/<md5>.yml
git -C <absolute-workspace>/archive commit -m "Add metadata for <md5>"
```

如果文件与现有 head 完全相同，不制造空 commit 或重复 push。确有本次变化时：已有 PR push 到其真实 `<head-ref>`；新分支首次设置 upstream。

push 前再次 fetch 对应远端 head。已有 PR 的远端 head 若不再是本地 HEAD 的祖先，停止并先安全整合远端变化；新分支若在此期间被创建，重新执行 PR/branch 发现流程。不要用 force push 覆盖竞态。

```bash
git -C <absolute-workspace>/archive push origin <head-ref>
git -C <absolute-workspace>/archive push -u origin <branch>
```

### 创建或更新 draft PR

PR body 使用 `<absolute-workspace>/generated/pr-body.md`，包含：

- 本次资料和 `metadata/<md5>.yml`；
- metadata 字段来源和用户确认情况；
- validate/preview 摘要与 warning；
- 查重候选和处理决定；
- canonical file-ref；如果本次复用了已有二进制，可简要说明；
- “由 *[BYR Docs Skill](https://github.com/byrdocs/byrdocs-cli-envolved)* 自动生成”。

不得包含 token、cookie、本机绝对路径、JWT claims 或不必要个人标识。PR body 一律用 `--body-file`，不要把长文本或用户内容内联进 shell 命令。

已有 PR 时，保留同一个 PR；如果本次事实或校验摘要改变且用户已授权更新，用 body file 更新：

```bash
gh pr edit <number> --repo byrdocs/byrdocs-archive \
  --body-file <absolute-workspace>/generated/pr-body.md
```

只有前面已确认没有匹配 PR 时，才创建新的 draft：

```bash
gh pr create \
  --repo byrdocs/byrdocs-archive \
  --base master \
  --head <github-user>:<branch> \
  --draft \
  --title "<简洁标题>" \
  --body-file <absolute-workspace>/generated/pr-body.md
```

`--head` 的 owner 必须是当前个人账号，不要填组织名。

创建或复用后核对 URL、draft、base/head 和 changed files：

```bash
gh pr view <number> --repo byrdocs/byrdocs-archive \
  --json url,isDraft,state,headRefName,baseRefName,statusCheckRollup,reviews,files
```

默认保持 draft。只有用户明确要求提交正式 review，才运行 `gh pr ready <number> --repo byrdocs/byrdocs-archive`。

### CI 和 review

```bash
gh pr view <number> --repo byrdocs/byrdocs-archive --json statusCheckRollup,reviews,reviewDecision,comments,files
gh pr checks <number> --repo byrdocs/byrdocs-archive
gh pr diff <number> --repo byrdocs/byrdocs-archive
```

- `check-format` 或 metadata 校验失败时，读取 bot diagnostics，按本次文件的 `path` 和 `message` 修正。
- 只处理 actionable 且与本次贡献相关的 feedback。政策、版权风险和是否适合收录等需要维护者判断的内容，转述给用户，不要擅自争辩或规避。
- 如果报告包含无关的旧 metadata 错误，不要修改无关旧 metadata。先检查 PR diff；若贡献分支落后于 upstream，在同一贡献分支安全整合最新 `upstream/master`，或把本次文件移到基于最新 upstream 的新干净分支；不要同步或重置用户 fork 的 `master`。
- 检查通过后报告状态；是否 ready、继续修改或关闭 PR，由用户决定。

## 完成、暂停与错误恢复

完成或暂停时可以给用户摘要：

- 已存在的最靠后持久化产物；
- canonical MD5/key；
- metadata 仓库相对路径；
- 已确认和仍需确认的字段；
- validate/preview 结果和 warning；
- PR URL、draft/ready、CI/review 状态；
- 用户下一步动作或明确阻塞原因。

不要输出 token、本机绝对路径、完整 JWT claims、长 JSON dump 或无关命令日志。

错误恢复顺序：

1. CLI 失败先读主 Skill 定义的 JSON envelope，优先使用 `error.suggestions`、`error.diagnostics` 和 `error.details`，不要查硬编码错误码表。
2. upload 返回 `ok: true` 后使用 canonical MD5/key/URL 继续；`data.status: "exists"` 是幂等成功，不需要另走恢复分支。
3. stdout 不是合法 BYRDocs JSON 时，才按工具级故障处理：核对实际 CLI argv、Node/npm/npx、版本、网络和服务状态。
4. metadata 文件已存在时先读取并从该产物继续；不要覆盖或重跑 init。
5. GitHub 工作区脏时停止写入并换干净 workspace；已有 PR 时 push 更新同一 head，不要重复创建。
6. 缺少事实、用户确认或 PR 授权时暂停，并明确说明需要用户决定什么。
