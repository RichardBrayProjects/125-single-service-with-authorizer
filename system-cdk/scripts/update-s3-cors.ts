#!/usr/bin/env node
/**
 * Script to update S3 bucket CORS configuration
 * Run this after deploying the images CloudFront stack if CORS isn't working
 * 
 * Usage: tsx scripts/update-s3-cors.ts
 */

import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";

const BUCKET_NAME = process.env.CDK_UPTICK_IMAGES_S3_BUCKET_NAME || "uptickart-images-bucket";
// CloudFront stack creates bucket in us-east-1, so try that first
// If presigned URLs show eu-west-2, the Lambda might be using wrong region for S3 client
const BUCKET_REGION = process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION || "us-east-1";

// Note: CloudFront stack creates bucket in us-east-1, but Lambda might generate presigned URLs with wrong region

const corsConfiguration = {
  CORSRules: [
    {
      AllowedMethods: ["GET", "PUT", "HEAD", "POST"],
      AllowedOrigins: [
        "http://localhost:3000",
        "http://localhost:5173",
        "https://www.uptickart.com",
        "https://uptickart.com",
      ],
      AllowedHeaders: [
        "Content-Type",
        "Content-Length",
        "x-amz-content-sha256",
        "x-amz-date",
        "x-amz-security-token",
        "x-amz-checksum-crc32",
        "x-amz-sdk-checksum-algorithm",
      ],
      ExposedHeaders: ["ETag", "x-amz-request-id"],
      MaxAgeSeconds: 3000,
    },
  ],
};

async function updateCors() {
  // Try common regions - CloudFront stack is in us-east-1, but Lambda might be in eu-west-2
  const regionsToTry = [BUCKET_REGION, "us-east-1", "eu-west-2", "us-west-2", "eu-west-1"];
  const uniqueRegions = [...new Set(regionsToTry)]; // Remove duplicates
  
  for (const region of uniqueRegions) {
    console.log(`\nTrying region: ${region}...`);
    const client = new S3Client({ region });

    try {
      const command = new PutBucketCorsCommand({
        Bucket: BUCKET_NAME,
        CORSConfiguration: corsConfiguration,
      });
      await client.send(command);
      console.log(`✅ CORS configuration updated successfully in region: ${region}!`);
      console.log(`\nYou can now test the upload from https://www.uptickart.com`);
      return;
    } catch (error: any) {
      if (error?.Code === "PermanentRedirect" || error?.name === "PermanentRedirect") {
        console.log(`  ❌ PermanentRedirect - bucket not in ${region}, trying next region...`);
        continue; // Try next region
      } else {
        // Other error - might be permissions or bucket doesn't exist
        console.error(`❌ Error in region ${region}:`, error?.message || error);
        if (error?.name !== "NoSuchBucket") {
          // If it's not a "bucket doesn't exist" error, this might be the right region but with wrong permissions
          console.error(`\nThis might be the correct region but there's a permissions issue.`);
          console.error(`Please check your AWS credentials and bucket permissions.`);
        }
        continue;
      }
    }
  }
  
  // If we get here, all regions failed
  console.error(`\n❌ Failed to update CORS in any region.`);
  console.error(`Please check:`);
  console.error(`  1. The bucket name is correct: ${BUCKET_NAME}`);
  console.error(`  2. Your AWS credentials have permission to update bucket CORS`);
  console.error(`  3. The bucket exists and is accessible`);
  console.error(`\nYou can also manually set the region:`);
  console.error(`  export AWS_REGION=<actual-region>`);
  console.error(`  pnpm -C system-cdk run update-s3-cors`);
  process.exit(1);
}

updateCors();
