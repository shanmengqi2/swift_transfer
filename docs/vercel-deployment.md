# Vercel Deployment Guide

| Language | Project docs |
| --- | --- |
| **English** · [简体中文](./vercel-deployment.zh-CN.md) | [README](../README.md) · [Docker guide](./docker-deployment.md) |

This guide explains how to deploy Swift Transfer to Vercel as a Next.js
application.

## Prerequisites

- A Vercel account.
- The project pushed to a Git repository, or the Vercel CLI installed locally.
- An S3-compatible bucket, such as AWS S3, Cloudflare R2, or MinIO with a public
  endpoint.
- A Postgres database URL, such as Neon or a managed Postgres instance.
- Node.js 24.x and pnpm for local validation.

The object storage endpoint used by `AWS_ENDPOINT_URL_S3` must be reachable by
the user browser, because uploads and downloads use presigned URLs directly from
the client.

## Vercel Project Settings

The repository includes `vercel.json` with the expected Next.js settings:

```json
{
  "framework": "nextjs",
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "pnpm build",
  "devCommand": "pnpm dev"
}
```

`package.json` declares Node.js `24.x` through the `engines` field.

## Environment Variables

Configure these variables in Vercel for each environment you use:

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

Notes:

- Configure at least Production and Preview before relying on pull-request
  previews.
- `AUTH_SECRET` must be at least 32 characters.
- `AUTH_USERS` contains allowed login users in
  `username:scrypt:v1:...` format, separated by commas.
- `POSTGRES_URL` stores download-link metadata, pickup codes, and rate-limit
  buckets.
- `UPLOAD_MAX_FILES` and `UPLOAD_MAX_FILE_SIZE_MB` can be adjusted per
  environment.

If Production and Preview share the same bucket or database, test uploads and
pickup codes can appear in production data. Use separate buckets, object
prefixes, or databases when isolation matters.

## Create Login Users

From the project directory:

```bash
pnpm auth:hash <username> <password>
```

Add the output to Vercel as `AUTH_USERS`:

```env
AUTH_USERS=alice:scrypt:v1:...
```

Generate a strong session secret:

```bash
openssl rand -base64 32
```

Add it as `AUTH_SECRET`.

## Object Storage CORS

Browsers upload files directly to presigned object storage URLs. Configure CORS
on the bucket for every Vercel domain that will use the app.

Example CORS rule:

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

Cloudflare R2, MinIO, and other S3-compatible services expose equivalent CORS
settings in their own consoles or configuration files.

## Deploy from the Vercel Dashboard

1. Open the Vercel dashboard and choose **Add New Project**.
2. Import the repository.
3. Keep the framework preset as **Next.js**.
4. Keep the root directory at the repository root.
5. Add the environment variables listed above.
6. Deploy the project.

After setup, Vercel creates Production deployments for the production branch and
Preview deployments for pull requests or non-production branches.

## Deploy with the Vercel CLI

Install and log in:

```bash
pnpm i -g vercel
vercel login
```

Link the local directory:

```bash
vercel link
```

Add environment variables:

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

Repeat with `preview` or `development` for those environments.

Pull variables and validate the build locally:

```bash
vercel env pull .env.local
pnpm build
```

Create a preview deployment:

```bash
vercel deploy
```

Promote to production:

```bash
vercel deploy --prod
```

Inspect a deployment:

```bash
vercel inspect <deployment-url>
vercel logs <deployment-url>
```

## Deployment Check

After deployment:

1. Open `/login` and sign in with a user from `AUTH_USERS`.
2. Upload a small test file.
3. Open `/files` and confirm the file appears.
4. Generate a download link and verify it in a private browser window.
5. Create a pickup code and verify the public `/pickup` flow.
6. Delete the test file and confirm it is removed from object storage.

If login works but uploads fail, check the bucket CORS rule and public endpoint.
If `/files` returns an error, check Vercel Function Logs for missing environment
variables, database connectivity, or object storage permission failures.
