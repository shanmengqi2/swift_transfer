# Vercel 部署指南

| 语言 | 项目文档 |
| --- | --- |
| [English](./vercel-deployment.md) · **简体中文** | [README](../README.zh-CN.md) · [Docker 部署指南](./docker-deployment.zh-CN.md) |

本文档说明如何把 Swift Transfer 作为 Next.js 应用部署到 Vercel。

## 前置条件

- 一个 Vercel 账号。
- 项目代码已推送到 Git 仓库，或本地已安装 Vercel CLI。
- 一个 S3 兼容对象存储桶，例如 AWS S3、Cloudflare R2，或带公网
  endpoint 的 MinIO。
- 一个 Postgres 数据库连接字符串，例如 Neon 或托管 Postgres。
- 本地验证建议使用 Node.js 24.x 和 pnpm。

`AWS_ENDPOINT_URL_S3` 对应的对象存储 endpoint 必须能被用户浏览器访问，
因为上传和下载都会通过浏览器直接访问预签名 URL。

## Vercel 项目设置

仓库中的 `vercel.json` 已包含所需 Next.js 设置：

```json
{
  "framework": "nextjs",
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "pnpm build",
  "devCommand": "pnpm dev"
}
```

`package.json` 通过 `engines` 字段声明了 Node.js `24.x`。

## 环境变量

在 Vercel 中为需要使用的环境配置以下变量：

```env
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_ENDPOINT_URL_S3=
AWS_REGION=
S3_BUCKET_NAME=

POSTGRES_URL=

AUTH_SECRET=
AUTH_USERS=

UPLOAD_MAX_FILES=5
UPLOAD_MAX_FILE_SIZE_MB=100
```

说明：

- 至少应在 Production 和 Preview 环境中配置，避免 Pull Request 预览不可用。
- `AUTH_SECRET` 至少 32 个字符。
- `AUTH_USERS` 为允许登录的用户列表，格式为
  `username:scrypt:v1:...`，多个用户用英文逗号分隔。
- `POSTGRES_URL` 用于保存下载链接元数据、取件码和限速记录。
- `UPLOAD_MAX_FILES` 和 `UPLOAD_MAX_FILE_SIZE_MB` 可按环境调整。

如果 Production 和 Preview 共用同一个 bucket 或数据库，测试上传和取件码
可能会进入生产数据。需要隔离时，请使用独立 bucket、对象前缀或数据库。

## 创建登录用户

在项目目录中运行：

```bash
pnpm auth:hash <username> <password>
```

将输出作为 `AUTH_USERS` 写入 Vercel：

```env
AUTH_USERS=alice:scrypt:v1:...
```

生成强随机会话密钥：

```bash
openssl rand -base64 32
```

将其写入 `AUTH_SECRET`。

## 对象存储 CORS

浏览器会直接向对象存储预签名 URL 上传文件。需要为所有会访问应用的
Vercel 域名配置 CORS。

示例 CORS 规则：

```json
[
  {
    "AllowedOrigins": [
      "https://your-production-domain.com",
      "https://your-project.vercel.app",
      "https://your-preview-domain.vercel.app"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

Cloudflare R2、MinIO 和其他 S3 兼容服务都可以在各自控制台或配置文件中
设置等价 CORS 规则。

## 通过 Vercel Dashboard 部署

1. 打开 Vercel Dashboard，选择 **Add New Project**。
2. 导入本项目仓库。
3. Framework Preset 保持 **Next.js**。
4. Root Directory 保持仓库根目录。
5. 添加上文列出的环境变量。
6. 创建部署。

完成设置后，Vercel 会为生产分支创建 Production Deployment，并为 Pull
Request 或非生产分支创建 Preview Deployment。

## 通过 Vercel CLI 部署

安装并登录：

```bash
pnpm i -g vercel
vercel login
```

关联本地目录：

```bash
vercel link
```

添加环境变量：

```bash
vercel env add AWS_ACCESS_KEY_ID production
vercel env add AWS_SECRET_ACCESS_KEY production
vercel env add AWS_ENDPOINT_URL_S3 production
vercel env add AWS_REGION production
vercel env add S3_BUCKET_NAME production
vercel env add POSTGRES_URL production
vercel env add AUTH_SECRET production
vercel env add AUTH_USERS production
vercel env add UPLOAD_MAX_FILES production
vercel env add UPLOAD_MAX_FILE_SIZE_MB production
```

如需配置 `preview` 或 `development` 环境，请替换命令中的环境名称并重复执行。

拉取环境变量并在本地验证构建：

```bash
vercel env pull .env.local
pnpm build
```

创建预览部署：

```bash
vercel deploy
```

部署到生产：

```bash
vercel deploy --prod
```

查看部署信息：

```bash
vercel inspect <deployment-url>
vercel logs <deployment-url>
```

## 部署后检查

部署完成后：

1. 打开 `/login`，使用 `AUTH_USERS` 中的账号登录。
2. 上传一个小测试文件。
3. 打开 `/files`，确认文件出现在列表中。
4. 生成下载链接，并在无登录窗口中验证链接可用。
5. 创建取件码，并验证公开 `/pickup` 流程。
6. 删除测试文件，确认对象存储中已同步删除。

如果登录正常但上传失败，优先检查存储桶 CORS 和公网 endpoint。如果
`/files` 返回错误，请在 Vercel Function Logs 中检查环境变量、数据库连接
和对象存储权限。
