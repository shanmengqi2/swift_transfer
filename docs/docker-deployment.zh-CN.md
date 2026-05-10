# Docker 部署指南

| 语言 | 项目文档 |
| --- | --- |
| [English](./docker-deployment.md) · **简体中文** | [README](../README.zh-CN.md) · [Vercel 部署指南](./vercel-deployment.zh-CN.md) |

本文档说明如何使用 Docker 运行 Swift Transfer。已发布镜像：

```bash
shanmengqi/swift_transfer:latest
```

## 前置条件

- 目标服务器已安装 Docker。
- 一个 S3 兼容对象存储桶，例如 AWS S3、Cloudflare R2 或 MinIO。
- 一个 Postgres 数据库连接字符串，例如 Neon 或托管 Postgres。
- 生产环境需要 HTTPS 域名或反向代理。

生产容器会以 `NODE_ENV=production` 运行，登录 Cookie 会带 `Secure`
标记。正式对外访问前，请把应用放在 HTTPS 后面。

`AWS_ENDPOINT_URL_S3` 对应的对象存储 endpoint 必须能被用户浏览器访问，
因为上传和下载都会通过浏览器直接访问预签名 URL。

## 环境变量

创建容器使用的环境变量文件：

```bash
cp sample.env .env.production
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

说明：

- `AUTH_SECRET` 至少 32 个字符。
- `AUTH_USERS` 为允许登录的用户列表，格式为
  `username:scrypt:v1:...`，多个用户用英文逗号分隔。
- `POSTGRES_URL` 用于保存下载链接元数据、取件码和限速记录。
- `UPLOAD_MAX_FILES` 控制单次上传可选择的最大文件数。
- `UPLOAD_MAX_FILE_SIZE_MB` 控制单个文件大小上限，单位 MB。

## 创建登录用户

如果本地已有项目代码：

```bash
pnpm auth:hash <username> <password>
```

如果只使用 Docker 镜像：

```bash
docker run --rm shanmengqi/swift_transfer:latest node scripts/hash-password.mjs <username> <password>
```

命令会输出类似：

```env
alice:scrypt:v1:...
```

写入 `AUTH_USERS`：

```env
AUTH_USERS=alice:scrypt:v1:...
```

多个用户用英文逗号分隔：

```env
AUTH_USERS=alice:scrypt:v1:...,bob:scrypt:v1:...
```

生成强随机会话密钥：

```bash
openssl rand -base64 32
```

## 对象存储 CORS

浏览器会直接向对象存储预签名 URL 上传文件。需要在存储桶上配置 CORS，
允许站点发起 `PUT` 请求并读取下载响应。

示例 CORS 规则：

```json
[
  {
    "AllowedOrigins": ["https://transfer.example.com"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

本地测试时可临时加入：

```json
"http://localhost:3000"
```

## 使用 Docker 运行

拉取镜像：

```bash
docker pull shanmengqi/swift_transfer:latest
```

启动容器：

```bash
docker run -d \
  --name swift-transfer \
  --restart unless-stopped \
  --env-file .env.production \
  -p 3000:3000 \
  shanmengqi/swift_transfer:latest
```

访问：

```text
http://<server-ip>:3000
```

生产环境建议使用 Nginx、Caddy、Traefik 或其他反向代理提供 HTTPS，再转发
到容器的 `3000` 端口。

## 使用 Docker Compose 运行

创建 `compose.yml`：

```yaml
services:
  swift-transfer:
    image: shanmengqi/swift_transfer:latest
    container_name: swift-transfer
    restart: unless-stopped
    env_file:
      - .env.production
    ports:
      - "3000:3000"
```

启动：

```bash
docker compose up -d
```

查看日志：

```bash
docker compose logs -f swift-transfer
```

更新到最新镜像：

```bash
docker compose pull
docker compose up -d
```

停止：

```bash
docker compose down
```

## 反向代理示例

Nginx 示例：

```nginx
server {
  listen 80;
  server_name transfer.example.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

生产使用前请在反向代理或上游网关启用 HTTPS。

## 数据持久化

容器不需要本地数据库 volume。Swift Transfer 会把：

- 文件本体保存在配置的 S3 兼容对象存储桶中。
- 下载链接元数据、取件码和限速记录保存在 Postgres 中。

请根据你的基础设施策略备份和监控外部 Postgres 数据库与对象存储桶。

## 部署后检查

容器启动后：

1. 打开 `/login`，使用 `AUTH_USERS` 中的账号登录。
2. 上传一个小测试文件。
3. 打开 `/files`，确认文件出现在列表中。
4. 生成下载链接，并在无登录窗口中验证链接可用。
5. 创建取件码，并验证公开 `/pickup` 流程。
6. 删除测试文件，确认对象存储中已同步删除。

常用命令：

```bash
docker ps --filter name=swift-transfer
docker logs -f swift-transfer
docker restart swift-transfer
```
