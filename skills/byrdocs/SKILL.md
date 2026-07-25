---
name: byrdocs
description: Use when 用户想搜索或下载 BYRDocs 主站教材/资料/试题、登录主站、上传 PDF/ZIP、填写或校验 archive metadata、创建或更新 byrdocs/byrdocs-archive PR，或处理该仓库的 CI 和 review。
---

# BYRDocs 资料库搜索、下载和贡献

用这个 Skill 搜索或下载 BYRDocs 主站资料，或向 `byrdocs/byrdocs-archive` 完成一次
原始文件和 metadata 贡献。搜索使用打包的公开搜索契约；CLI 负责登录、下载、上传、
metadata 模板、校验和预览；Agent 负责结构化筛选、理解资料、询问用户、编辑 YAML
和使用 GitHub 创建 PR。

## 先区分两种“贡献”

| 用户目标 | 使用入口 |
| --- | --- |
| 搜索/下载主站资料、上传 PDF/ZIP、填写 archive metadata | 本 Skill |
| 录入题目、修改维基页面、补答案、处理 MDX/题图、贡献 Neowiki PR | `byrdocs-wiki` |

用户只说“贡献试题”且上下文不能判断时，只问类似：

> 你希望把原始试卷文件上传到 BYR Docs 资料库，还是把试题整理成可阅读的维基真题页面？

发现用户实际要编辑 `wiki.byrdocs.org` 页面、`exams/<试卷>/index.mdx`、答案或题图时，
停止 archive 流程并转到 `byrdocs-wiki`。如果维基贡献只需要本 Skill 搜索、下载或确认
来源 MD5，仍然由 `byrdocs-wiki` 负责总流程，本 Skill 只完成 archive 的子步骤。

## 基本原则

- 本 Skill 的 Agent/CLI 贡献流程不依赖 BYR Docs Publish。执行本流程时，不要混用 `byrdocs-publish` 的 token、内部 API 或中间状态；用户选择官方网页贡献流程时，按其当前指南执行，不把网页状态推断为 CLI 状态。
- 调用 BYRDocs CLI 时，只要命令支持就必须加 `--json`。只解析 stdout 中的 JSON object；stderr 只作为日志和进度。
- 不要索要、接触或保存校园网密码。只展示 `auth login --json` 返回的登录链接，让用户自行在浏览器完成认证。
- 不要读取或泄露 token、cookie、登录轮询凭证、本机隐私路径、JWT claims、学号或 GitHub access token。
- metadata 事实只能来自资料内容、当前 BYRDocs 文档/schema、可靠查询、搜索结果或用户确认。未知必填信息询问用户；允许省略的未知可选字段省略，不要猜。
- 不假设用户机器上存在任何 BYRDocs 源码目录。贡献所需的收录和元信息规则随本 Skill 分发；只有真正准备 GitHub PR 时，才按 contribution reference 在专用 workspace 中创建临时 archive checkout。
- 用户可控的路径、标题、课程名和 PR body 路径必须作为独立 shell 参数或正确引用的参数传入。branch 不得直接拼入未经规范化的标题或其他用户输入；贡献流程按 reference 确定并校验一次 `<branch>`，后续命令始终复用该值。
- 不直接调用主站内部 API；搜索使用公开 MCP/HTTP API，其他动作使用 BYRDocs CLI 和 `gh`。

## 任务路由

### 搜索资料

**必须读取：** 在构造搜索请求前，读取 `references/search.md`。优先使用该文件定义的 MCP 或 HTTP API。只有当前环境不能直接调用 MCP/HTTP 时，才使用 CLI fallback。

搜索任务不需要 CLI 时，必须跳过 CLI 的安装、`help`、`doctor` 和登录。

### 下载资料

用户已有有效 file-ref 时直接进入“下载流程”；否则先走“搜索资料”入口，再从结果中提取直接文件 URL/key。下载必须使用 BYRDocs CLI，不能自行拼接认证下载请求。

### 贡献资料

**必须完整读取：** 在上传文件、编辑 metadata、执行任何 git/gh 写操作、恢复中断贡献或处理 CI/review 前，完整读取 `references/contribution.md`。

本节只负责路由，不能根据本节摘要自行推断贡献流程。执行到查重步骤时，还必须按搜索入口读取 `references/search.md`。

## 按需准备 CLI

只有 CLI fallback 搜索、下载或贡献需要准备 CLI。先选择一种调用形式，并在整个任务中保持同一 argv 前缀：

```bash
byrdocs
```

系统没有全局命令时使用：

```bash
npx -y @byrdocs/cli@latest
```

如果使用 `npx -y @byrdocs/cli@latest`，后续示例中的 `byrdocs` 都替换为这三个 argv 片段。多词命令是 argv 序列；不要把它存进单个 shell 字符串变量后直接执行，也不要在同一任务中混用全局 CLI、项目内 CLI 和 `npx`。

如果用户需要长期安装，可建议：

```bash
npm install -g @byrdocs/cli
```

按任务最小验证实际命令能力：

```bash
byrdocs help --json
byrdocs help <command> --json
byrdocs doctor --json
```

每个 CLI JSON envelope 的 `schema_version` 必须等于 `byrdocs.cli.v1`；不一致时停止并提示升级 CLI。不要探测当前 CLI 未实现的 `capabilities` 命令。

必须读取顶层 `warnings`，不能因为 `ok: true` 就忽略警告。`doctor` 的 `ok: true` 只表示检查命令执行完成，不表示服务健康；还要按任务核对 `data.api.reachable`、`data.search.reachable` 和相应 warning。所需命令缺失或所需服务不可达时，停止并提示用户修复 CLI、网络或服务。

## CLI JSON 契约

- 成功时 exit code 为 0，stdout 是 JSON object，通常包含 `ok: true` 和 `data`。
- 失败时 exit code 非 0，stdout 仍应是 JSON object，包含 `ok: false` 和 `error`。
- 成功和失败 envelope 都可能包含顶层 `warnings`；必须逐条读取其 `message`、`details` 和 `suggestions`。
- 流程判断依赖 exit code、`ok`、`data` 和稳定结构字段。`message` 是人类可读文本；`error.code` 只作分类标签，不作为需要查表的唯一依据。
- 恢复时优先读取 `error.message`、`error.details`、`error.diagnostics` 和 `error.suggestions`。按 suggestions 执行或转述用户动作；按 diagnostics 的 `path`/`message` 修正输入；用 details 的结构字段定位失败。
- 默认文本输出不是稳定接口，不要解析。文件内容不会写到 stdout；下载必须显式使用 `--output <path>`。
- Agent 不依赖交互式 prompt。需要用户动作时，让 CLI 返回结构化状态，再转述给用户。
- 命令失败且 stdout 不是合法 BYRDocs JSON 时，不要臆测错误码；按工具级故障检查实际 argv、安装、Node/npm/npx、版本、网络和服务状态。

## 登录

需要下载或上传时先检查：

```bash
byrdocs auth status --json
```

`auth status` 的能力字段来自本地 JWT claims，不是主站对具体请求的预授权。上传前必须同时满足 `logged_in: true` 和 `can_upload: true`；下载前必须满足 `logged_in: true`。`can_download` 表示 token 的全局下载能力，具体文件是否可下载仍由主站判断。

未登录，或上传任务的 `can_upload` 不满足时：

```bash
byrdocs auth login --json
byrdocs auth wait <session-id> --json
```

- `auth login --json` 是非阻塞 Agent 入口。只展示 `login_url`，不展示本地轮询凭证。
- 从 `data.session_id` 取 ID，并使用同一 CLI argv 前缀运行 `auth wait`；不要盲目执行可能硬编码了其他 CLI 前缀的 `poll_command`。
- `auth wait` 超时时可对同一 session 使用更长的 `--timeout-seconds`；会话过期才重新 login。
- BUPT 统一认证通常具有全局下载权限。GitHub 登录的 `can_download` 可能为 `false`，但下载自己上传的文件时仍可下载；CLI 应实际请求目标文件，让主站按 token 和文件所有权判定。主站对其他文件返回 401 时，再引导用户改用 BUPT 统一认证，不要无限重试。
- 不得读取、展示或复制 token 文件。只有排错时才能提示用户检查 CLI 配置目录是否可写。

## 搜索流程

1. 读取 `references/search.md`，按其中当前 MCP/HTTP schema 构造请求。线上 `llms.txt` 只用于怀疑打包契约过期时刷新核对。
2. 优先使用 `https://search.byrdocs.org/mcp` 的 `search_files`；没有 MCP 时使用 `POST https://search.byrdocs.org/api/search`。
3. 把用户要求翻译成结构化条件。例如遇到“最新”“期末”“只要原题”等要求，必须先按类型、阶段等字段筛选，再按时间排序，再截断到用户要求的数量；不能先取相关度前几条再筛选，能结构化条件筛选的就不要自己去看。
4. 需要后续下载时，保留原始 `id`、直接 `/files/<md5>.<pdf|zip>` URL、`data.filetype` 和是否为 wiki；不要请求短链。
5. `wiki-N`/`filetype: wiki` 是查看项，不是 `byrdocs download` 可接受的 file-ref。

只有不能调用 MCP/HTTP 时才使用 CLI fallback，注意这仅仅是一个非常简单的搜索实现：

```bash
byrdocs search "<query>" --limit <n> --json
```

先用 `help search --json` 核对实际参数。当前 CLI fallback 可能没有 JMESPath 等结构化筛选能力：简单相关度搜索可以直接使用；结构化任务应扩大候选集后由 Agent 本地筛选和排序。候选不足以可靠满足条件时停止并说明能力限制，不要把相关度顺序伪装成“最新”。

最终只展示高信号字段：标题、资料类型、课程/时间等匹配依据、直接下载或查看链接。不要倾倒完整搜索 JSON。

## 下载流程

### 1. 解析候选

如果用户没有 file-ref，先执行“搜索流程”。只把以下结果传给 `byrdocs download`：

- `https://byrdocs.org/files/<md5>.<pdf|zip>` 直接 URL；
- `<md5>.pdf` 或 `<md5>.zip` key；
- 已经确认是 PDF 时，兼容当前 CLI 的裸 MD5 shorthand。

裸 MD5 会被当前 CLI 当作 PDF；ZIP 必须传直接 `.zip` URL 或带 `.zip` 的 key，不得传裸 MD5。wiki 页面、`wiki-N`、`go.byrdocs.org` 短链和其他站点 URL 不是可下载 file-ref，应返回查看链接或继续解析真实文件 URL，不能交给 download。

### 2. 检查权限和目标路径

按“登录”检查 `logged_in`；未登录时先认证。`can_download: true` 表示具有全局下载能力，`false` 不能单独证明目标文件不可下载：GitHub 用户可能仍能下载自己上传的文件。只要已登录就调用 CLI，让具体文件权限由主站判断；返回 `DOWNLOAD_UNAUTHORIZED`/401（旧 CLI 可能返回 `BUPT_LOGIN_REQUIRED`）时再改用 BUPT 登录。

下载前解析用户期望的输出路径并检查是否已经存在。当前 CLI 没有通用防覆盖门禁时，不得静默覆盖；选择新的明确路径，或先询问用户是否允许覆盖。

### 3. 下载并验证

```bash
byrdocs download <direct-url-or-key> --output <path> --json
```

成功后核对 JSON 中的 `data.key`、`data.output_path` 与请求一致，并确认实际文件存在、非空且类型符合 PDF/ZIP 预期。返回 HTML、登录页或 JSON 错误体不算下载成功。

最终回复包含保存位置、资料类型/标题和来源链接；不要泄露认证信息或倾倒完整 JSON。

## 贡献入口

贡献流程的所有操作、产物恢复、metadata 边界、GitHub 写入门禁、draft PR、CI 和 review 规则只在 `references/contribution.md` 中维护。必须先完整读取该文件，再按其中的持久化产物恢复阶梯判断下一步。

主文件中的 CLI、登录和搜索契约继续有效；发生冲突时，搜索请求结构以 `references/search.md` 为准，贡献顺序和安全门禁以 `references/contribution.md` 为准，CLI 实际参数以当前 `help <command> --json` 为准。

## 最终回复和通用恢复

- 搜索：给出匹配依据、关键字段和可操作链接，并说明任何结构化筛选限制。
- 下载：给出实际保存结果、文件类型和来源；失败时指出是 file-ref、权限、输出冲突还是工具故障。
- 贡献：按 contribution reference 报告 canonical file-ref、metadata/PR/CI 产物和用户下一步。
- 不要输出 token、本机绝对隐私路径、完整 JWT claims、长 JSON dump 或无关命令日志。
- CLI 失败优先使用 JSON 的 suggestions/diagnostics/details；只有 stdout 非 BYRDocs JSON 时才排查工具本身。
- 用户动作、事实确认或外部写授权缺失时暂停，并明确请求哪一项；不要自行越过门禁。
