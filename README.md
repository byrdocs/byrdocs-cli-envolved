# BYRDocs CLI

面向 Agent 的 BYRDocs 贡献命令行工具，用于把登录、上传、下载、
metadata 和搜索这些步骤做成稳定的脚本接口。

## 安装

临时运行：

```bash
npx -y @byrdocs/cli help
```

长期使用：

```bash
npm install -g @byrdocs/cli
byrdocs help
```

安装 Skill：

```bash
npx skills add byrdocs/byrdocs-cli-envolved
```

## 开发

```bash
npm install
npm run build
npm test
```

构建后可以直接运行本地 CLI：

```bash
node dist/cli.js help
node dist/cli.js doctor
node dist/cli.js auth login
node dist/cli.js upload ./file.pdf
node dist/cli.js download <file-ref> --output ./file.pdf
node dist/cli.js meta schema
node dist/cli.js search "keyword"
```

常用命令：

- `doctor`：检查本地环境和 BYRDocs 服务连通性。
- `auth login|wait|status|logout`：管理登录会话和本地 token。
- `upload <file.pdf|file.zip>`：上传文件并返回 md5/key。
- `download <file-ref> --output <path>`：下载文件到本地路径。
- `meta schema|init|validate|preview`：生成、校验和预览 metadata YAML。
- `search <query>`：调用 BYRDocs 搜索接口。

加 `--json` 可以得到机器可读输出。`--api-base` 和 `--search-url` 可用于
测试时覆盖默认 BYRDocs 接口地址。

## 包信息

npm 包会暴露 `byrdocs` 命令，需要 Node.js 20 或更高版本。

发布由 GitHub Actions 在 `v*.*.*` tag 上触发。发布前用 npm 更新版本，
再把版本提交和 tag 一起推送：

```bash
npm version patch
git push origin master --follow-tags
```
