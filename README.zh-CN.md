# Swift Transfer

| 语言 | 部署文档 |
| --- | --- |
| [English](./README.md) · **简体中文** | [Docker](./docs/docker-deployment.zh-CN.md) · [Vercel](./docs/vercel-deployment.zh-CN.md) |

Swift Transfer 是一个可自托管的文件传输控制台，适合需要私有上传、
管理和分享文件的小团队使用。文件存储在 S3 兼容对象存储中，应用本身只
负责认证、预签名链接、取件码和元数据管理。

应用不会把文件内容落到服务器本地。浏览器通过预签名 URL 直接上传到对象
存储，Postgres 只保存分享元数据、取件码和限速记录。

## 功能特性

- 浏览器直传到 AWS S3、Cloudflare R2、MinIO 或其他 S3 兼容存储桶。
- 登录后的文件管理页面，可浏览、删除和刷新对象列表。
- 为单个文件生成有过期时间的预签名下载链接。
- 为一个或多个文件创建取件码，接收方无需登录即可下载。
- 使用 scrypt hash 的用户名/密码认证，以及签名的 HTTP-only 会话。
- 使用 Postgres 保存元数据和限速数据，无需 Redis 或额外队列服务。
- 支持 Docker 和 Vercel 两种部署方式。

## 技术架构

```text
Browser
  ├─ 管理端 UI：上传、管理文件、创建链接/取件码
  ├─ 公开取件页：解析取件码并下载文件
  │
Next.js App Router 应用
  ├─ API Routes 生成 S3 预签名上传/下载 URL
  ├─ 认证路由校验 scrypt 密码 hash 和签名会话
  ├─ 元数据服务把下载链接和取件码写入 Postgres
  └─ 限速模块把登录/取件失败记录写入 Postgres
  │
外部服务
  ├─ S3 兼容对象存储：文件本体
  └─ Postgres 或 Neon：元数据和限速记录
```

## 技术栈

- Next.js 16 App Router 和 React 19
- TypeScript
- Tailwind CSS 4
- Radix UI、shadcn 风格基础组件、Lucide icons、Sonner toast
- AWS SDK v3，用于 S3 兼容对象存储
- Neon serverless Postgres client
- pnpm 和 Node.js 24.x

## 配置说明

复制示例环境变量文件，并填写对象存储、数据库和认证配置：

```bash
cp sample.env .env.local
```

必填变量：

```env
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_ENDPOINT_URL_S3=
AWS_REGION=
S3_BUCKET_NAME=

POSTGRES_URL=

AUTH_SECRET=
AUTH_USERS=
```

可选上传限制：

```env
UPLOAD_MAX_FILES=5
UPLOAD_MAX_FILE_SIZE_MB=100
```

创建允许登录的用户 hash：

```bash
pnpm auth:hash <username> <password>
```

把输出写入 `AUTH_USERS`：

```env
AUTH_USERS=alice:scrypt:v1:...
```

多个用户使用英文逗号分隔。`AUTH_SECRET` 至少 32 个字符，建议使用强随机
字符串。

完整部署配置请参考：

- [Docker 部署指南](./docs/docker-deployment.zh-CN.md)
- [Vercel 部署指南](./docs/vercel-deployment.zh-CN.md)

## 本地开发

安装依赖并启动开发服务器：

```bash
pnpm install
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。

常用脚本：

```bash
pnpm build
pnpm start
pnpm lint
pnpm auth:hash <username> <password>
```

## 协议

Swift Transfer 使用 [MIT License](./LICENSE)。
