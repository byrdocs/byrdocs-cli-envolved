# BYRDocs 上游来源索引

本文件只登记权威来源和读取条件，不保存上游正文。引用其他 reference 的流程必须使用
下表中的文档 ID，不得凭 Skill 内旧副本或 Agent 记忆补全当前规则。

## 解析规则

1. 已有对应仓库 checkout 时，确认 remote 后读取表中的仓库路径，并记录当前 commit。
2. 没有 checkout 时，读取线上来源；仓库文件应从当前默认分支获取，不把表中示例分支
   当作永久契约。
3. 完整贡献随后准备了 checkout 时，以同步后的 base commit 重新确认本次依赖的来源。
4. 路径不存在时，只在声明的权威仓库中定位移动后的文件，并报告本索引需要更新。
5. 权威来源和有效 checkout 都不可用时，暂停依赖该文档的步骤；可以整理已有事实，但
   不能声称符合当前搜索、收录或 metadata 规则。

## 来源

| 文档 ID | 权威来源 | Checkout 路径 | 读取条件 |
| --- | --- | --- | --- |
| `search-contract` | <https://search.byrdocs.org/llms.txt>；源码仓库 [`byrdocs/byrdocs`](https://github.com/byrdocs/byrdocs) | `search/public/llms.txt` | 构造搜索 MCP/HTTP 请求前 |
| `file-rules` | 仓库 [`byrdocs/byrdocs-archive`](https://github.com/byrdocs/byrdocs-archive) | `docs/文件规则.md` | 判断文件类型、收录范围、质量和语义重复前 |
| `metadata-rules` | 仓库 [`byrdocs/byrdocs-archive`](https://github.com/byrdocs/byrdocs-archive) | `docs/元信息规则.md` | 解释 metadata 字段语义前 |
| `metadata-schema` | `https://byrdocs.org/schema/<type>.yaml`；仓库 `byrdocs/byrdocs-archive` | `schema/<type>.yaml` | 初始化、填写或校验 `book`、`test`、`doc` metadata 时；优先使用当前 CLI 的 `meta schema`、`meta validate` 和 `meta preview` |

实时 schema 是机器结构契约；`metadata-rules` 解释字段语义。二者冲突时保留实际校验
结果并报告上游漂移，不为通过校验编造事实。
