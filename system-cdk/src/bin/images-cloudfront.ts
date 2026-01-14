#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { ImagesCloudFrontStack } from "../lib/imagesCloudFrontStack";

const app = new cdk.App();

const region = "us-east-1";

const domainName: string | undefined = process.env.CDK_UPTICK_DOMAIN_NAME;
const hostedZoneName = process.env.CDK_UPTICK_ZONE_NAME;
const hostedZoneId = process.env.CDK_UPTICK_ZONE_ID;
const imagesBucketName = process.env.CDK_UPTICK_IMAGES_S3_BUCKET_NAME;

if (!hostedZoneId || !hostedZoneName || !domainName || !imagesBucketName) {
  throw new Error(
    "Missing environment variable(s): CDK_UPTICK_ZONE_ID CDK_UPTICK_ZONE_NAME CDK_UPTICK_DOMAIN_NAME CDK_UPTICK_IMAGES_S3_BUCKET_NAME must be set."
  );
}

// Create Images CloudFront stack (creates its own S3 bucket)
new ImagesCloudFrontStack(app, "system-images-cloudfront", {
  env: {
    region,
  },
  domainName,
  hostedZoneName,
  hostedZoneId,
  bucketName: imagesBucketName,
});
