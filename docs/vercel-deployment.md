# Vercel 部署指南

本文档说明如何将 Swift Transfer 部署到 Vercel。项目仍保留 Docker 部署配置；`Dockerfile`、`.github/workflows/docker-image.yml` 和 `output: "standalone"` 不需要为 Vercel 修改。

## 当前适配

- `vercel.json` 指定 Vercel 使用 Next.js 框架、`pnpm install --frozen-lockfile` 和 `pnpm build`。
- `package.json` 声明 `node: 24.x`，与 Docker 镜像一致。
- 应用通过 `POSTGRES_URL` 连接 Neon/Postgres 保存已生成下载链接等元数据，避免依赖 Vercel 临时磁盘。

注意：本项目的文件本体存放在 S3 兼容对象存储中；Postgres 只记录已生成的下载链接元数据。若同时使用多个部署环境，建议为 Preview 使用独立 bucket、对象前缀或独立数据库，避免测试数据混入生产环境。

## 前置条件

- 一个 Vercel 账号。
- 一个可用的 S3 兼容对象存储桶，例如 AWS S3、Cloudflare R2、MinIO 公网实例等。
- 本项目代码已经推送到 GitHub，或本地已安装 Vercel CLI。
- 本地 Node.js 建议使用 24.x，包管理器使用 pnpm。

## 环境变量

在 Vercel 的 Production、Preview、Development 环境中配置以下变量：

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

- `AUTH_SECRET` 至少 32 个字符，用于签名登录 Cookie。
- `AUTH_USERS` 为允许登录的用户列表，格式为 `username:scrypt:v1:...`，多个用户用英文逗号分隔。
- `POSTGRES_URL` 为 Neon/Postgres 连接字符串，用于保存已生成下载链接等元数据。
- 登录接口和公开取件码接口会使用同一个 Postgres 连接进行后端限速，并自动创建 `rate_limit_buckets` 表，无需额外配置 Redis、Turnstile 或其它服务。
- `UPLOAD_MAX_FILES` 和 `UPLOAD_MAX_FILE_SIZE_MB` 可按环境调整。

## 创建登录用户

在本地项目目录运行：

```bash
pnpm auth:hash <username> <password>
```

将输出写入 Vercel 环境变量 `AUTH_USERS`：

```env
AUTH_USERS=alice:scrypt:v1:...
```

生成强随机 `AUTH_SECRET`：

```bash
openssl rand -base64 32
```

## 对象存储 CORS

浏览器会直接向预签名 URL 发起上传请求，因此对象存储桶必须允许 Vercel 域名跨域访问。生产域名和预览域名都要考虑。

示例配置：

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

如果使用 Cloudflare R2、MinIO 或其他 S3 兼容服务，请在对应控制台中配置等价 CORS 规则。`AWS_ENDPOINT_URL_S3` 必须是浏览器也能访问的公网地址。

## 方式一：本地 Vercel CLI 部署

安装并登录：

```bash
pnpm i -g vercel
vercel login
```

首次关联项目：

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
vercel env add AUTH_SECRET production
vercel env add AUTH_USERS production
vercel env add UPLOAD_MAX_FILES production
vercel env add UPLOAD_MAX_FILE_SIZE_MB production
```

如果需要 Preview 或 Development 环境，也重复上述命令，将 `production` 替换为 `preview` 或 `development`。例如：

```bash
vercel env add AWS_ACCESS_KEY_ID preview
vercel env add AWS_SECRET_ACCESS_KEY preview
vercel env add AWS_ENDPOINT_URL_S3 preview
vercel env add AWS_REGION preview
vercel env add S3_BUCKET_NAME preview
vercel env add AUTH_SECRET preview
vercel env add AUTH_USERS preview
vercel env add UPLOAD_MAX_FILES preview
vercel env add UPLOAD_MAX_FILE_SIZE_MB preview
```

拉取环境变量用于本地验证：

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

查看部署详情和日志：

```bash
vercel inspect <deployment-url>
vercel logs <deployment-url>
```

## 方式二：Vercel 关联 GitHub Repo 部署

1. 在 Vercel Dashboard 中选择 Add New Project。
2. 导入本项目所在的 GitHub repository。
3. Framework Preset 选择 Next.js。
4. Root Directory 保持仓库根目录。
5. Build and Output Settings 通常保持默认；仓库中的 `vercel.json` 已指定：
   - Install Command: `pnpm install --frozen-lockfile`
   - Build Command: `pnpm build`
   - Development Command: `pnpm dev`
6. 在 Environment Variables 中添加本文档列出的变量。Production 和 Preview 至少都应配置 S3 与认证变量。
7. 创建项目后，Vercel 会自动为默认分支创建 Production Deployment，并为 Pull Request 或非生产分支创建 Preview Deployment。

如果首次部署失败，优先检查：

- Node.js 版本是否读取到 `package.json` 中的 `24.x`。
- 所有必填环境变量是否已配置到对应环境。
- S3 CORS 是否包含当前 Vercel 部署域名。
- 对象存储 endpoint 是否可从公网和浏览器访问。

## 与 Docker 部署并存

Vercel 部署不会使用 Docker 镜像，也不会触发 `.github/workflows/docker-image.yml`。Docker 部署继续使用：

- `Dockerfile`
- `next.config.ts` 中的 `output: "standalone"`
- `POSTGRES_URL` 指向同一个或另一个 Neon/Postgres 数据库

因此两种部署方式都不依赖本地数据库文件，元数据持久化由外部 Postgres 提供。

文件本体始终在 S3 兼容对象存储中，两种部署方式可以共用同一个桶。若同时使用 Docker 生产环境和 Vercel 预览环境，建议为 Preview 使用独立 bucket 或对象前缀，避免测试文件混入生产文件列表。

## 部署后验证

完成部署后打开站点并验证：

1. 访问 `/login`，使用 `AUTH_USERS` 中的账号登录。
2. 上传一个小文件，确认浏览器上传成功。
3. 在 `/files` 中刷新列表，确认文件可见。
4. 为文件生成下载链接，并在无登录窗口中打开链接确认可下载。
5. 删除测试文件，确认对象存储中同步删除。

若上传失败但登录正常，通常是 S3 CORS 或 endpoint 配置问题；若 `/files` 返回 500，优先检查 Vercel Function Logs 中的环境变量和对象存储权限错误。
