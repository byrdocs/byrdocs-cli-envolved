---
name: byrdocs-contribute
description: 帮助普通用户通过 Agent 向 BYRDocs 贡献资料。适用于用户想上传 BYRDocs 文件、安装或临时运行 BYRDocs CLI、登录 BYRDocs、填写和校验 metadata、创建或更新 byrdocs/byrdocs-archive 的 GitHub PR、处理 BYRDocs 贡献 CI 或 review 反馈的场景。
---

# BYRDocs 贡献流程

用这个 skill 帮普通用户完成一次 BYRDocs 资料贡献。CLI 负责登录、上传、metadata 模板、校验、预览等确定性动作；搜索按包内 `references/search.md` 使用；Agent 负责理解资料、询问用户、编辑 YAML、使用 GitHub 创建 PR。

## 基本原则

- BYRDocs 相关动作优先使用新 BYRDocs CLI。不要使用 `byrdocs-publish`、旧上传工具、旧 token 路径、浏览器 cookie 或网页抓取状态。
- 搜索资料时优先读取包内 `references/search.md`，使用其中说明的 MCP 或 HTTP API。`byrdocs search` 只是简单 fallback，不应该优先使用。线上 `https://search.byrdocs.org/llms.txt` 只作为上游来源和刷新参考。
- Agent 调 CLI 时，只要命令支持，就必须加 `--json`。只解析 stdout 里的 JSON object；stderr 只当日志和进度看。
- 不要索要、接触或保存校园网密码。只能展示 `byrdocs auth login --json` 返回的登录链接，让用户自己在浏览器完成登录。
- 不要把 token、cookie、本地隐私路径、JWT claims、学号、GitHub access token 等敏感信息写进 metadata、commit、PR body、评论或最终回复。
- metadata 里的事实必须来自文件内容、BYRDocs 当前文档/schema、搜索结果或用户确认。不要为了通过校验编造课程、老师、年份、学期、学院、来源、ISBN、授权状态等信息。
- 不确定的必填信息要问用户；如果上游 schema/文档允许省略未知的可选字段，就省略，不要猜。
- 执行 shell 命令时，用户可控的文件路径、标题、课程名、PR body 路径等必须作为独立参数或正确引用的参数传入；不要拼接未转义的 shell 字符串。branch 名、临时文件名等命令语义字段只使用 MD5 派生的安全值。

## Skill 和 CLI 的安装

处理用户请求时，先选择一个 BYRDocs CLI 调用方式，并在本次任务里保持一致：

```bash
byrdocs
```

如果系统里没有 `byrdocs`，优先临时使用 npm 包：

```bash
npx -y @byrdocs/cli@latest
```

如果用户希望长期使用，再建议安装：

```bash
npm install -g @byrdocs/cli
```

如果用户不想全局安装，也可以在某个项目里安装为开发依赖：

```bash
npm install --save-dev @byrdocs/cli
npx byrdocs help --json
```

安装或选择调用方式后，做最小验证：

```bash
byrdocs help --json
byrdocs doctor --json
```

如果使用 `npx -y @byrdocs/cli@latest`，下面所有命令都把 `byrdocs` 替换成这个前缀。

## CLI 调用契约

在执行流程前，先在内部确定一个命令前缀，例如：

```bash
BYRDOCS="byrdocs"
BYRDOCS="npx -y @byrdocs/cli@latest"
```

后续命令都用这个前缀，不要一会儿用全局安装、一会儿用 `npx`。在真实 shell 里运行时按当前环境展开即可。

JSON 模式约定：

- 成功时 exit code 为 0，stdout 是一个 JSON object，通常包含 `ok: true` 和 `data`。
- 失败时 exit code 非 0，stdout 仍是一个 JSON object，包含 `ok: false` 和 `error`。
- Agent 的流程判断优先依赖 exit code、`ok`、`data` 和稳定结构字段；`error.code` 只作为分类标签，不要把它当成需要查表的唯一信息。
- 失败恢复优先读取并转述 CLI 返回的 `error.message`、`error.details`、`error.diagnostics` 和 `error.suggestions`。如果这些字段已经给出下一步，直接按它们执行或转述给用户，不要去 skill 里另查错误码。
- `message` 是给人看的中文说明，可以转述给用户，但不能用它做机器判断。
- 默认文本输出不是稳定接口，不要解析。
- 下载等文件内容不会写到 stdout；必须使用 `--output <path>`。
- 如果命令失败且 stdout 不是合法 BYRDocs JSON，不要臆测 `error.code`。把它当作工具执行失败，优先检查 CLI 是否安装、Node/npm/npx 是否可用、网络是否可达、命令路径是否正确、CLI 版本是否过旧。
- Agent 调 CLI 不得依赖交互式 prompt；需要用户动作时，应由 CLI 返回 JSON 中的用户动作状态，Agent 再转述给用户。

开始贡献前确认 CLI 支持当前流程需要的能力。优先运行 `byrdocs doctor --json`；如果当前 CLI 支持 `byrdocs capabilities --json`，用它检查命令能力。若 `schema_version` 不是 `byrdocs.cli.v1`，或缺少 `auth login`、`auth wait`、`auth status`、`upload`、`meta schema`、`meta init`、`meta validate`、`meta preview`，停止并提示用户升级 CLI。

常用命令入口：

```bash
byrdocs help --json
byrdocs doctor --json
byrdocs auth status --json
byrdocs upload <file> --json
byrdocs download <file-ref> --output <path> --json
byrdocs meta schema --json
byrdocs meta init <file-ref> --type <type> --out metadata/<md5>.yml --json
byrdocs meta validate metadata/<md5>.yml --json
byrdocs meta preview metadata/<md5>.yml --json
```

## 背景与假设

- BYRDocs CLI 身份和 GitHub PR 身份是两套东西。`byrdocs auth ...` 只用于 BYRDocs 上传/下载；`gh ...` 只用于 GitHub fork、commit、push、PR。
- 上传成功只表示二进制文件进入 BYRDocs 存储。只有 metadata PR 合并后，资料才会进入正式展示/搜索流程。
- BYRDocs 文件以 MD5 和扩展名命名，例如 `<md5>.pdf` 或 `<md5>.zip`；metadata 也以同一个 MD5 命名。
- 当前工作目录不一定是 `byrdocs-archive` checkout。需要做 GitHub PR 时，可以临时 clone/fork/branch，但不要污染用户无关仓库。
- 不要直接调用主站内部 API；除非维护 CLI 本身，普通贡献流程只通过 BYRDocs CLI 和 `gh`。
- 不要处理删除或修改旧文件，除非用户明确提出。普通新增贡献只新增或修改本次相关的 `metadata/<md5>.yml`。
- 不要把完整 schema 复制进 skill；schema 和字段细节以当前 CLI、上游 docs/schema、CI 反馈为准。
- 普通用户贡献默认创建 draft PR；只有用户确认后才标记 ready for review。

## 工作区和路径安全

每次贡献先创建或选择独立 workspace，不要在用户当前无关项目里创建 `metadata/`、Git branch、commit 或 PR body。推荐结构：

```text
workspace/
  generated/
    metadata/<md5>.yml
    pr-body.md
  archive/
```

源文件可以留在用户原路径；如果要复制，只复制到 workspace 下的普通数据目录。PR 前把 `workspace/generated/metadata/<md5>.yml` 复制到 `workspace/archive/metadata/<md5>.yml`。

路径规则：

- PR body 和最终回复可以写仓库相对路径 `metadata/<md5>.yml`，不要写用户本机绝对路径。
- 运行 CLI 前确认 shell 环境和文件路径一致。Windows PowerShell 使用 Windows 路径；WSL 使用 `/mnt/c/...`，不要在 WSL 命令里直接传 `C:\...`。
- PR branch 使用 `contribute/<md5-short>` 或类似 MD5 派生名称，不使用资料标题或用户输入。

## 贡献状态

恢复中断任务时，先判断当前状态，不要从头重复上传或重复创建 PR：

```text
cli_ready
byrdocs_authenticated
duplicate_checked
file_uploaded_or_exists
schema_loaded
metadata_initialized
metadata_filled
metadata_validated
metadata_preview_confirmed
github_ready
pr_created
ci_review_checked
```

根据已有 upload JSON、metadata 文件、workspace、branch 和 PR URL 恢复流程。

## 登录

先检查本地状态：

```bash
byrdocs auth status --json
```

未登录时：

```bash
byrdocs auth login --json
byrdocs auth wait <session-id> --json
```

登录规则：

- token 和登录会话位置以当前 BYRDocs CLI 文档、`doctor` 或 `auth status` 输出为准；不要读取、展示或复制 token 文件。只有排错时才提示用户检查配置目录是否可写。
- `auth login --json` 是给 Agent 用的非阻塞登录入口，会返回 `login_url`、`session_id` 和 `poll_command`。只把登录链接和下一步命令展示给用户，不要输出或解释本地保存的轮询凭证。不要省略 `--json`：普通文本模式的 `auth login` 会默认等待用户网页登录完成。
- BUPT 统一认证 token 可以上传，也可以下载。BYRDocs 的 GitHub 登录 token 通常可以上传，但校外下载可能没有权限。
- 如果下载返回 `BUPT_LOGIN_REQUIRED`，引导用户改用 BUPT 统一认证登录，不要反复重试 GitHub 登录。
- 如果 `auth wait` 超时，而用户还在浏览器登录，可以用更长超时重试：`byrdocs auth wait <session-id> --timeout-seconds <n> --json`。如果会话过期，重新 `auth login`。

## 贡献主流程

1. 先创建或选择独立 workspace，并确认用户提供的文件路径能在当前 shell 中访问。

2. 检查服务、登录和 schema。先读取当前可用 type 和 schema，再判断资料类型；如果当前 schema 类型变化，以当前 schema 为准，不要强行使用旧类型，不要使用 fallback 的 schema：

```bash
byrdocs doctor --json
byrdocs auth status --json
byrdocs meta schema --json
```

3. 了解用户要贡献的文件。根据文件内容、文件名、当前 schema 和用户说明判断类型是 `book`、`test` 还是 `doc`；信息不足时先问用户。可以读取 PDF 首页、封面、目录页、文件名和说明文字来辅助判断。对 ZIP，只查看文件列表、README 和必要的少量文本文件；不要执行压缩包内脚本或打开可执行文件。

4. 搜索可能重复的资料。先读取并遵循包内搜索说明：

```text
references/search.md
```

如果当前 agent 支持 MCP，优先连接 `https://search.byrdocs.org/mcp` 并调用 `search_files`。没有 MCP 时，直接 `POST https://search.byrdocs.org/api/search`，必要时使用 `type`、`jmespath`、`limit` 做结构化筛选。只有怀疑包内说明过期或服务行为变化时，才打开 `https://search.byrdocs.org/llms.txt` 确认最新契约。

只有在不能直接使用 MCP 或 HTTP API 时，才退回 CLI 的简单搜索封装：

```bash
byrdocs search "<书名/课程/ISBN/年份等关键词>" --limit 5 --json
```

如果有疑似重复，向用户说明。相同 MD5 的去重由上传接口处理，但语义重复仍需要人工判断。

5. 上传文件：

```bash
byrdocs upload <file.pdf|file.zip> --json
```

`status: "uploaded"` 和 `status: "exists"` 都是可继续的成功结果。`exists` 表示同 MD5 文件已存在，继续写 metadata。

重复资料决策：

- 同 MD5：继续 metadata，并在 PR body 说明文件已存在，本次补充 metadata。
- 不同 MD5 但标题、课程、年份高度相似：暂停 PR，询问用户这是不同版本、质量更好版本、补充资料，还是重复上传。
- 用户确认重复且无新增价值：不要创建 PR。

6. 读取当前 metadata 规则：

```bash
byrdocs meta schema --type <book|test|doc> --json
```

如果字段语义不清楚，读取上游当前文档和示例，而不是凭记忆填写：

- `byrdocs/byrdocs-archive` 的 `docs/元信息规则.md`
- `byrdocs/byrdocs-archive` 的 `docs/文件规则.md`
- 同类型或同课程的 `metadata/*.yml` 示例

7. 生成模板到 workspace：

```bash
byrdocs meta init <md5-or-key-or-url> --type <book|test|doc> --out workspace/generated/metadata/<md5>.yml --json
```

8. 填写 YAML。

- 填写的 YAML 必须展示并解释给用户，解释所有填写了的字段和来源，展示所有未填写的字段和原因，向用户确认已经正确填写了所有能填写的字段。
- 最终进入仓库的文件必须是 `metadata/<md5>.yml`；文件名 md5、`id`、`url` 里的 md5、`data.filetype` 必须一致。从文件推断的信息和用户确认的信息要在 PR body 中区分说明。

9. 校验并预览：

```bash
byrdocs meta validate workspace/generated/metadata/<md5>.yml --json
byrdocs meta preview workspace/generated/metadata/<md5>.yml --json
```

只有无 error 级 diagnostics 且 `ready_for_pr: true` 时，才进入 PR 流程。若只有 warning，先向用户解释风险。

10. 在创建 PR 前，把预览摘要给用户确认，除非用户明确要求 Agent 全权完成贡献。

## Metadata 边界

上游文档和 schema 是最终依据。下面是 Agent 必须记住的行为边界：

- metadata 文件统一放在 `metadata/`，文件名是 32 位 MD5：`metadata/<md5>.yml`。
- 文件 URL 格式是 `https://byrdocs.org/files/<md5>.<pdf|zip>`。
- `book` 是正式出版的教育类书籍，必须是 PDF。课件、讲义、笔记、未正式出版的资料不要归为 `book`。
- `test` 是北京邮电大学实际考过的期中/期末真题，必须是 PDF。模拟卷、题库、月考、作业、外校试题不要归为 `test`。
- `doc` 是不属于 `book` 或 `test` 的课程学习/复习资料，可以是 PDF 或 ZIP，但必须能对应至少一门课程。
- 课程名应尽量填写全称，不要用随意简称。
- 对 `test`，如果年份完全无法确认，通常不应作为试题收录；先问用户，或按上游文档判断是否应改为其他类型。
- 对 `doc`，`content` 必须使用 BYRDocs 允许的类别，例如 `思维导图`、`题库`、`答案`、`知识点`、`课件`。
- 对 `book`，ISBN 应为 ISBN13；不要编造 ISBN、版次、出版社、出版年份。

## GitHub PR 流程

PR 目标仓库是 `byrdocs/byrdocs-archive`，base branch 是 `master`。用户可能已经自己同步过 fork，也可能希望 Agent 代操作。先验证状态，必要时再询问或代为执行。

默认在 workspace 内完成 GitHub 操作，不在用户当前目录直接改仓库。先检查 GitHub CLI，如果没有对应依赖，应该引导用户安装或者自行贡献：

```bash
gh auth status
gh api user --jq .login
gh repo view byrdocs/byrdocs-archive --json defaultBranchRef,nameWithOwner
```

如果用户没有 fork，可以询问是否由 Agent 创建：

```bash
gh repo fork byrdocs/byrdocs-archive --clone=false
```

如果 fork 可能落后，先问用户是否已经同步；未同步且用户同意时再执行：

```bash
gh repo sync <github-user>/byrdocs-archive --source byrdocs/byrdocs-archive --branch master --force
```

`gh repo sync --force` 会 hard reset 目标分支，只能用于用户 fork 的 `master`，并且执行前要说明它会覆盖 fork master 上未合并的差异。

如果 GitHub 提示需要 workflow scope，引导用户授权：

```bash
gh auth refresh -h github.com -s workflow
```

默认安全路线：

```bash
gh repo clone <github-user>/byrdocs-archive workspace/archive
cd workspace/archive
git remote add upstream https://github.com/byrdocs/byrdocs-archive.git
git fetch upstream master
git switch -c contribute/<md5-short> upstream/master
```

只复制本次 metadata：

```bash
mkdir -p metadata
cp ../generated/metadata/<md5>.yml metadata/<md5>.yml
git status --porcelain
```

`git status --porcelain` 必须只显示本次应提交的 `metadata/<md5>.yml`。如果还有无关变更，停止并清理 workspace 或重新 clone。

提交和推送：

```bash
git add metadata/<md5>.yml
git commit -m "Add metadata for <md5-short>"
git push -u origin contribute/<md5-short>
```

创建 PR 前先查是否已有同 head branch 的 open PR，避免重复创建：

```bash
gh pr list --repo byrdocs/byrdocs-archive --head contribute/<md5-short> --state open --json number,url,isDraft,headRepositoryOwner,headRefName
```

如果已有 PR 且 `headRepositoryOwner.login` 是当前 GitHub 用户，直接 push 更新分支并返回已有 PR URL。

没有已有 PR 时创建 draft PR：

```bash
gh pr create \
  --repo byrdocs/byrdocs-archive \
  --base master \
  --head <github-user>:<branch> \
  --draft \
  --title "<简洁标题>" \
  --body-file <body.md>
```

`--head` 使用 `<user>:<branch>` 语法，`<user>` 应是个人账号，不要填组织名。PR body 一律用 `--body-file`，不要把长文本直接内联进命令。

PR body 应包含：

- 本次贡献的资料和 metadata 文件。
- metadata 事实来源，例如文件内容推断、用户确认、ISBN 查询、搜索结果。
- `byrdocs meta validate` 和 `meta preview` 的结果摘要。
- 搜索到的疑似重复资料及处理说明。
- "由 [BYR Docs Skill](https://github.com/byrdocs/byrdocs-cli-envolved) 自动生成" 的说明。

PR body 可以写仓库相对路径 `metadata/<md5>.yml`；不应包含 token、cookie、本机绝对路径、JWT claims 或不必要的个人标识。

创建后验证：

```bash
gh pr view <number> --repo byrdocs/byrdocs-archive --json url,isDraft,state,headRefName,baseRefName,statusCheckRollup,reviews,files
```

普通用户贡献默认保持 draft，直到用户确认可以 ready for review。确认 changed files 只包含本次应提交的 `metadata/<md5>.yml` 文件。

只有用户明确说可以提交正式 review 时，才运行：

```bash
gh pr ready <number> --repo byrdocs/byrdocs-archive
```

## 处理 CI 和 Review

检查 PR 状态：

```bash
gh pr view <number> --repo byrdocs/byrdocs-archive --json statusCheckRollup,reviews,reviewDecision
gh pr checks <number> --repo byrdocs/byrdocs-archive
gh pr diff <number> --repo byrdocs/byrdocs-archive
```

如果 `check-format` 失败，读取 bot review/comment，按 diagnostics 修改 YAML 或文件位置。

如果需要更完整的 review/comment 信息，使用：

```bash
gh pr view <number> --repo byrdocs/byrdocs-archive --json comments,reviews,statusCheckRollup,files
```

处理 review 时，先判断评论是否针对本次新增或修改的 metadata 文件。只处理 actionable 且与本次贡献相关的反馈。涉及项目政策、版权风险、资料是否适合收录等需要维护者判断的问题，转述给用户，不要擅自争辩或规避。

如果 bot 报告很多和本次 diff 无关的旧 metadata 文件错误，不要直接修改那些文件。先确认 PR diff；如果错误来自 fork/branch 落后，询问用户后同步 fork，并把本次 metadata 变更移到新的干净分支或新 PR。

如果检查通过，告诉用户 PR URL、draft 状态和检查结果。是否改为 ready for review、关闭 PR 或继续修改，由用户决定。

## 最终回复

完成或暂停时，给用户高信号摘要：

- 上传状态：`uploaded` 或 `exists`。
- metadata 仓库相对路径：`metadata/<md5>.yml`。
- `validate` 和 `preview` 摘要，以及是否还有待用户确认的字段。
- PR URL、draft/ready 状态、CI/review 状态。
- 下一步需要用户做什么。

不要输出 token、本机绝对路径、完整 JWT claims、长 JSON dump 或无关命令日志。

## 常见恢复原则

CLI 失败时，不要让用户或 Agent 去查错误码表。先读取 JSON 里的 `error.message`、`error.details`、`error.diagnostics` 和 `error.suggestions`：

- 有 `error.suggestions` 时，优先按建议执行；需要用户动作时，把建议转述给用户。
- 有 `error.diagnostics` 时，按其中的 `path` 和 `message` 修改 YAML 或输入文件，不要绕过校验。
- 有 `error.details` 时，用其中的 `path`、`output_path`、`session_id`、`status`、`response`、`endpoint` 等字段定位具体失败点。
- 上传返回 `ok: true` 且 `data.status: "exists"` 时，这是可继续的成功状态，不是错误。
- 如果 stdout 不是合法 BYRDocs JSON，才按工具级故障处理：检查 CLI 是否安装、Node/npm/npx 是否可用、网络是否可达、CLI 版本是否过旧。

GitHub 相关故障仍按 `gh` 输出处理：未登录就引导用户运行 `gh auth login`；工作区脏就停止提交并清理 workspace 或重新 clone；已有 PR 就 push 更新已有 head branch，不要重复创建 PR。
