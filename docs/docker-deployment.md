# Docker 部署指南

本文档说明如何使用 Docker 部署 Swift Transfer。当前已发布镜像：

```bash
shanmengqi/swift_transfer:latest
```

镜像建议发布为多架构 manifest，至少包含：

```text
linux/amd64
linux/arm64
```

其中 `linux/arm64` 用于 Apple Silicon Mac、ARM 服务器等环境。

## 前置条件

- 一台已安装 Docker 的服务器。
- 一个可用的 S3 兼容对象存储桶，例如 AWS S3、Cloudflare R2、MinIO 等。
- 一个可通过 HTTPS 访问的域名或反向代理。生产镜像会以 `NODE_ENV=production` 运行，登录 Cookie 会带 `Secure` 标记，因此正式访问建议放在 HTTPS 后面。

如果浏览器需要直接通过预签名 URL 上传文件，对象存储的 endpoint 必须能被用户浏览器访问。不要只配置容器内部可访问的内网地址，除非浏览器也能访问该地址。

## 环境变量

可以基于 `sample.env` 创建生产环境配置文件：

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

上传限制，可运行时调整，无需重新构建镜像：

```env
UPLOAD_MAX_FILES=5
UPLOAD_MAX_FILE_SIZE_MB=100
```

说明：

- `AUTH_SECRET` 至少 32 个字符，用于签名登录会话。
- `AUTH_USERS` 为允许登录的用户列表。
- `POSTGRES_URL` 为 Neon/Postgres 连接字符串，用于保存已生成下载链接等元数据。
- 登录接口和公开取件码接口会使用同一个 Postgres 连接进行后端限速，并自动创建 `rate_limit_buckets` 表，无需额外配置 Redis、Turnstile 或其它服务。
- `UPLOAD_MAX_FILES` 是单次拖拽/选择允许上传的最大文件数。
- `UPLOAD_MAX_FILE_SIZE_MB` 是单个文件大小上限，单位 MB。

## 创建登录用户

如果已经有项目代码，可以在项目目录中生成用户密码 hash：

```bash
pnpm auth:hash <username> <password>
```

如果只使用 Docker 镜像部署，不想拉取 repo 或单独下载脚本文件，也可以直接用镜像生成同样格式的用户信息：

```bash
docker run --rm shanmengqi/swift_transfer:latest node scripts/hash-password.mjs <username> <password>
```

命令会输出类似：

```env
alice:scrypt:v1:...
```

将结果写入 `AUTH_USERS`：

```env
AUTH_USERS=alice:scrypt:v1:...
```

多个用户用英文逗号分隔：

```env
AUTH_USERS=alice:scrypt:v1:...,bob:scrypt:v1:...
```

## 对象存储 CORS

浏览器会直接向预签名 URL 发起 `PUT` 上传请求，因此 S3 兼容存储需要允许前端站点跨域上传。

示例 CORS 配置，请按实际域名调整：

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

## 使用 Docker Run

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

正式环境建议使用 Nginx、Caddy、Traefik 等反向代理提供 HTTPS，再转发到容器的 `3000` 端口。

## 使用 Docker Compose

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

### Apple Silicon Mac 平台说明

如果在 Apple Silicon Mac 上看到类似错误：

```text
no matching manifest for linux/arm64/v8 in the manifest list entries
```

说明当前 Docker Hub 镜像没有发布 `linux/arm64` 架构。推荐做法是重新运行 GitHub Action，推送包含 `linux/amd64,linux/arm64` 的多架构镜像。

临时绕过方案是在 `compose.yml` 中指定使用 `linux/amd64` 镜像：

```yaml
services:
  swift-transfer:
    image: shanmengqi/swift_transfer:latest
    platform: linux/amd64
    container_name: swift-transfer
    restart: unless-stopped
    env_file:
      - .env.production
    ports:
      - "3000:3000"
```

这个方式可以在 Mac 上通过模拟运行，但性能和启动速度通常不如原生 `linux/arm64` 镜像。正式解决后可删除 `platform: linux/amd64`。

查看日志：

```bash
docker compose logs -f swift-transfer
```

停止：

```bash
docker compose down
```

更新到最新镜像：

```bash
docker compose pull
docker compose up -d
```

## 数据持久化

应用通过 `POSTGRES_URL` 连接 Neon/Postgres 保存已生成下载链接等元数据，文件本体仍保存在 S3 兼容对象存储中。Docker 容器本地不再需要挂载数据库 volume。

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

生产环境请在 Nginx 或前置网关上启用 HTTPS。

## 常用运维命令

查看容器状态：

```bash
docker ps --filter name=swift-transfer
```

查看日志：

```bash
docker logs -f swift-transfer
```

重启：

```bash
docker restart swift-transfer
```

进入容器：

```bash
docker exec -it swift-transfer sh
```

查看镜像：

```bash
docker images shanmengqi/swift_transfer
```

## 故障排查

### 登录后仍停留在登录页

生产镜像中的登录 Cookie 使用 `Secure`。请确认访问地址是 HTTPS，或者确认反向代理正确透传请求。

### 上传失败或浏览器 CORS 报错

检查对象存储桶 CORS 是否允许当前站点的 origin，并确认允许 `PUT` 方法。

### 预签名 URL 无法访问

确认 `AWS_ENDPOINT_URL_S3` 对用户浏览器可访问。浏览器会直接请求该地址进行上传或下载。

### 容器启动后接口报 S3 配置错误

检查这些变量是否已注入容器：

```env
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_ENDPOINT_URL_S3
AWS_REGION
S3_BUCKET_NAME
```

### 上传限制没有变化

确认修改的是运行时环境变量：

```env
UPLOAD_MAX_FILES
UPLOAD_MAX_FILE_SIZE_MB
```

修改 `.env.production` 后需要重启容器：

```bash
docker compose up -d
```

或：

```bash
docker restart swift-transfer
```
