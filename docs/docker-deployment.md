# Docker Deployment Guide

| Language | Project docs |
| --- | --- |
| **English** · [简体中文](./docker-deployment.zh-CN.md) | [README](../README.md) · [Vercel guide](./vercel-deployment.md) |

This guide explains how to run Swift Transfer with Docker using the published
image:

```bash
shanmengqi/swift_transfer:latest
```

## Prerequisites

- Docker installed on the target server.
- An S3-compatible bucket, such as AWS S3, Cloudflare R2, or MinIO.
- A Postgres database URL, such as Neon or a managed Postgres instance.
- An HTTPS domain or reverse proxy for production traffic.

Production containers run with `NODE_ENV=production`, and login cookies are
marked `Secure`. Put the app behind HTTPS before exposing it to users.

The object storage endpoint used by `AWS_ENDPOINT_URL_S3` must be reachable by
the user browser, because uploads and downloads use presigned URLs directly from
the client.

## Environment Variables

Create an environment file for the container:

```bash
cp sample.env .env.production
```

Required variables:

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

Optional upload limits:

```env
UPLOAD_MAX_FILES=5
UPLOAD_MAX_FILE_SIZE_MB=100
```

Notes:

- `AUTH_SECRET` must be at least 32 characters.
- `AUTH_USERS` contains allowed login users in
  `username:scrypt:v1:...` format, separated by commas.
- `POSTGRES_URL` stores download-link metadata, pickup codes, and rate-limit
  buckets.
- `UPLOAD_MAX_FILES` controls how many files can be selected in one upload
  batch.
- `UPLOAD_MAX_FILE_SIZE_MB` controls the per-file upload size limit.

## Create Login Users

If you have the project checked out locally:

```bash
pnpm auth:hash <username> <password>
```

If you only want to use the Docker image:

```bash
docker run --rm shanmengqi/swift_transfer:latest node scripts/hash-password.mjs <username> <password>
```

The command prints a value like:

```env
alice:scrypt:v1:...
```

Add it to `AUTH_USERS`:

```env
AUTH_USERS=alice:scrypt:v1:...
```

Multiple users can be separated with commas:

```env
AUTH_USERS=alice:scrypt:v1:...,bob:scrypt:v1:...
```

Generate a strong session secret:

```bash
openssl rand -base64 32
```

## Object Storage CORS

Browsers upload files directly to presigned object storage URLs. Configure CORS
on the bucket so your site can send `PUT` requests and read download responses.

Example CORS rule:

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

For local testing, temporarily add:

```json
"http://localhost:3000"
```

## Run with Docker

Pull the image:

```bash
docker pull shanmengqi/swift_transfer:latest
```

Start the container:

```bash
docker run -d \
  --name swift-transfer \
  --restart unless-stopped \
  --env-file .env.production \
  -p 3000:3000 \
  shanmengqi/swift_transfer:latest
```

Open:

```text
http://<server-ip>:3000
```

For production, place Nginx, Caddy, Traefik, or another reverse proxy in front
of the container and terminate HTTPS there.

## Run with Docker Compose

Create `compose.yml`:

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

Start:

```bash
docker compose up -d
```

View logs:

```bash
docker compose logs -f swift-transfer
```

Update to the latest image:

```bash
docker compose pull
docker compose up -d
```

Stop:

```bash
docker compose down
```

## Reverse Proxy Example

Nginx example:

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

Enable HTTPS at the proxy or upstream gateway before production use.

## Data Persistence

The container does not need a local database volume. Swift Transfer stores:

- File bodies in the configured S3-compatible bucket.
- Download-link metadata, pickup codes, and rate-limit buckets in Postgres.

Back up and monitor the external Postgres database and object storage bucket
according to your infrastructure policy.

## Deployment Check

After the container is running:

1. Open `/login` and sign in with a user from `AUTH_USERS`.
2. Upload a small test file.
3. Open `/files` and confirm the file appears.
4. Generate a download link and verify it in a private browser window.
5. Create a pickup code and verify the public `/pickup` flow.
6. Delete the test file and confirm it is removed from object storage.

Useful commands:

```bash
docker ps --filter name=swift-transfer
docker logs -f swift-transfer
docker restart swift-transfer
```
