# Swift Transfer

| Language | Deployment guides |
| --- | --- |
| **English** · [简体中文](./README.zh-CN.md) | [Docker](./docs/docker-deployment.md) · [Vercel](./docs/vercel-deployment.md) |

Swift Transfer is a self-hostable file transfer console for teams that need a
small, private way to upload files into S3-compatible object storage and share
them through temporary download links or pickup codes.

It is designed to keep file data out of the application server. Browsers upload
directly to object storage through presigned URLs, while the app stores only
share metadata, pickup codes, and rate-limit buckets in Postgres.

## Features

- Direct browser uploads to AWS S3, Cloudflare R2, MinIO, or another
  S3-compatible bucket.
- Authenticated file manager for browsing, deleting, and refreshing bucket
  objects.
- Time-limited presigned download links for individual files.
- Pickup codes for sharing one or more files with recipients who do not need an
  account.
- Scrypt-hashed username/password authentication with signed HTTP-only sessions.
- Postgres-backed metadata and rate limiting, with no Redis or extra queue
  service required.
- Docker and Vercel deployment paths.

## Architecture

```text
Browser
  ├─ authenticated admin UI: upload, manage files, create links/codes
  ├─ public pickup portal: resolve pickup codes and download files
  │
Next.js App Router application
  ├─ API routes issue S3 presigned upload/download URLs
  ├─ auth routes verify scrypt password hashes and signed sessions
  ├─ metadata services store download links and pickup codes in Postgres
  └─ rate limiter records failed login/pickup attempts in Postgres
  │
External services
  ├─ S3-compatible object storage: file bodies
  └─ Postgres or Neon: metadata and rate-limit buckets
```

## Tech Stack

- Next.js 16 App Router and React 19
- TypeScript
- Tailwind CSS 4
- Radix UI, shadcn-style primitives, Lucide icons, and Sonner toasts
- AWS SDK v3 for S3-compatible storage
- Neon serverless Postgres client
- pnpm and Node.js 24.x

## Configuration

Copy the sample environment file and fill in the values for your storage,
database, and authentication setup:

```bash
cp sample.env .env.local
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

Create an authorized user hash:

```bash
pnpm auth:hash <username> <password>
```

Add the output to `AUTH_USERS`:

```env
AUTH_USERS=alice:scrypt:v1:...
```

Multiple users can be separated with commas. `AUTH_SECRET` must be at least 32
characters and should be generated with a strong random source.

For full deployment configuration, see:

- [Docker deployment guide](./docs/docker-deployment.md)
- [Vercel deployment guide](./docs/vercel-deployment.md)

## Local Development

Install dependencies and start the development server:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Useful scripts:

```bash
pnpm build
pnpm start
pnpm lint
pnpm auth:hash <username> <password>
```

## License

Swift Transfer is released under the [MIT License](./LICENSE).
