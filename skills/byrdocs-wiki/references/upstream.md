# BYRDocs Wiki 上游来源索引

本文件只登记权威来源和读取条件，不保存上游正文。引用其他 reference 的流程必须使用
下表中的文档 ID，不得凭 Skill 内旧副本或 Agent 记忆补全当前规则。

## 解析规则

1. 已有 Neowiki checkout 时，确认 remote 后读取表中的仓库路径，并记录当前 commit。
2. 没有 checkout 时，读取网页入口或 GitHub 当前默认分支；不把表中示例分支当作永久
   契约。
3. 完整贡献准备并同步 checkout 后，以本次 base commit 重新确认依赖的文档。
4. 路径不存在时，只在声明的权威仓库中定位移动后的文件，并报告本索引需要更新。
5. 权威来源和有效 checkout 都不可用时，可以整理来源材料，但不能录入、修改或声称
   页面符合当前 Neowiki 规范。

## 来源

| 文档 ID | 权威来源 | Checkout 路径 | 读取条件 |
| --- | --- | --- | --- |
| `editing-guide` | <https://wiki.byrdocs.org/guide/>；源码仓库 [`byrdocs/byrdocs-neowiki`](https://github.com/byrdocs/byrdocs-neowiki) | `src/guide/index.mdx` | 录入或修改试题正文前 |
| `project-readme` | 仓库 [`byrdocs/byrdocs-neowiki`](https://github.com/byrdocs/byrdocs-neowiki) | `README.md` | 环境准备、本地预览或解释普通人工贡献流程时 |
| `review-guide` | 仓库 [`byrdocs/byrdocs-neowiki`](https://github.com/byrdocs/byrdocs-neowiki) | `.github/prompts/review.md` | 提交前内容检查或处理 PR review 时 |
| `blog-tutorial` | <https://blog.byrdocs.org/blog/posts/how-to-contribute-to-neowiki/post>；源码仓库 [`byrdocs/byrdocs-blog`](https://github.com/byrdocs/byrdocs-blog) | `docs/blog/posts/how-to-contribute-to-neowiki/post.md` | 需要面向新贡献者的背景、截图或网页操作说明时；不是编辑规范 |

`editing-guide` 是内容编辑规范。README 和博客只解释环境或人工操作，不能覆盖编辑指南；
schema、组件实现、模板和 CI 属于目标 checkout 的任务对象或文档缺项时的兜底参考。
