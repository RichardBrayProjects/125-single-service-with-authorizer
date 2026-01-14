#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { CognitoPostConfirmationStack } from "../lib/cognitoPostConfirmationStack";
import { CognitoStack } from "../lib/cognitoStack";
import { UserApiStack } from "../lib/userApiStack";
import { ImageApiStack } from "../lib/imageApiStack";

const app = new cdk.App();

const domainName: string | undefined = process.env.CDK_UPTICK_DOMAIN_NAME;
const hostedZoneName = process.env.CDK_UPTICK_ZONE_NAME;
const hostedZoneId = process.env.CDK_UPTICK_ZONE_ID;
const dbname = process.env.CDK_UPTICK_DB_NAME;
const imagesS3BucketName = process.env.CDK_UPTICK_IMAGES_S3_BUCKET_NAME;

if (
  !hostedZoneId ||
  !hostedZoneName ||
  !domainName ||
  !dbname ||
  !imagesS3BucketName
) {
  throw new Error(
    "Missing environment variable(s): CDK_UPTICK_ZONE_ID CDK_UPTICK_ZONE_NAME CDK_UPTICK_DOMAIN_NAME CDK_UPTICK_DB_NAME CDK_UPTICK_IMAGES_S3_BUCKET_NAME must be set."
  );
}

// Derive frontend URL from domain name (UI CloudFront is on www.uptickart.com)
const cloudfrontUrl = `https://www.${domainName}`;
const userApiUrl = `https://user-api.${domainName}`;
const imagesCloudFrontDomain = `images.${domainName}`;

const systemName = "uptickart";

// Create Cognito PostConfirmation stack
// This stack will automatically look up RDS secret ARN from SSM parameter /rds/secret-arn
const postConfirmationStack = new CognitoPostConfirmationStack(
  app,
  "user-cognito-post-confirmation-stack",
  {
    systemName,
    dbname,
  }
);

// Create Cognito stack
const cognitoStack = new CognitoStack(app, "user-cognito-stack", {
  systemName,
  postConfirmationLambda: postConfirmationStack.postConfirmationLambda,
  apiUrl: userApiUrl,
  cloudfrontUrl,
});

// Create User API stack (depends on Cognito stack)
const userApiStack = new UserApiStack(app, "user-api", {
  domainName,
  hostedZoneName,
  hostedZoneId,
  apiSubdomain: "user-api",
  userPool: cognitoStack.userPool,
});

// Create Image API stack (depends on Cognito stack)
new ImageApiStack(app, "image-api", {
  domainName,
  hostedZoneName,
  hostedZoneId,
  apiSubdomain: "image-api",
  dbname,
  imagesS3BucketName,
  imagesCloudFrontDomain,
  userPool: cognitoStack.userPool,
});
