import { S3Client } from "@aws-sdk/client-s3";

let client: S3Client | undefined;

export function getS3Client() {
  if (client) {
    return client;
  }

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY");
  }

  client = new S3Client({
    region: process.env.AWS_REGION,
    endpoint: process.env.AWS_ENDPOINT_URL_S3,
    // forcePathStyle: false,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return client;
}
