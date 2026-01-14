import { AaaaRecord, ARecord, RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";
import { BlockPublicAccess, Bucket, CorsRule, HttpMethods } from "aws-cdk-lib/aws-s3";
import {
  CachePolicy,
  Distribution,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import {
  Certificate,
  CertificateValidation,
} from "aws-cdk-lib/aws-certificatemanager";
import {
  CfnOutput,
  RemovalPolicy,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { HostedZone } from "aws-cdk-lib/aws-route53";

interface ImagesCloudFrontStackProps extends StackProps {
  domainName: string;
  hostedZoneId: string;
  hostedZoneName: string;
  bucketName: string;
}

export class ImagesCloudFrontStack extends Stack {
  public readonly distribution: Distribution;
  public readonly cloudfrontDomain: string;

  constructor(scope: Construct, id: string, props: ImagesCloudFrontStackProps) {
    super(scope, id, props);

    const { domainName, hostedZoneId, hostedZoneName, bucketName } = props;

    // Create S3 bucket for images with CORS configuration
    // For presigned URL uploads, we need to allow Content-Type and common x-amz-* headers
    // Note: Bucket is created in eu-west-2 to match Lambda region, even though CloudFront stack is in us-east-1
    const imagesBucket = new Bucket(this, "ImagesBucket", {
      bucketName,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      // CORS configuration for presigned URL uploads from browser
      // Bucket is created in us-east-1 (CloudFront stack region)
      // CloudFront can access buckets in any region
      cors: [
        {
          allowedMethods: [HttpMethods.GET, HttpMethods.PUT, HttpMethods.HEAD, HttpMethods.POST],
          allowedOrigins: [
            "http://localhost:3000",
            "http://localhost:5173",
            "https://www.uptickart.com",
            "https://uptickart.com",
          ],
          allowedHeaders: [
            "Content-Type",
            "Content-Length",
            "x-amz-content-sha256",
            "x-amz-date",
            "x-amz-security-token",
            "x-amz-checksum-crc32",
            "x-amz-sdk-checksum-algorithm",
          ],
          exposedHeaders: ["ETag", "x-amz-request-id"],
          maxAge: 3000,
        },
      ],
    });

    const imageSubdomain = `images.${domainName}`;
    this.cloudfrontDomain = imageSubdomain;

    const zone = HostedZone.fromHostedZoneAttributes(
      this,
      "ImportedHostedZone",
      {
        hostedZoneId,
        zoneName: hostedZoneName,
      }
    );

    const cert = new Certificate(this, "ImageUsEastCert", {
      domainName: imageSubdomain,
      validation: CertificateValidation.fromDns(zone),
    });
    cert.applyRemovalPolicy(RemovalPolicy.RETAIN);

    this.distribution = new Distribution(this, "images-distribution", {
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(imagesBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
      },
      domainNames: [imageSubdomain],
      certificate: cert,
    });

    // Create Route53 records for images subdomain
    new ARecord(this, "ImagesARecord", {
      zone,
      recordName: "images",
      target: RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
    });

    new AaaaRecord(this, "ImagesAaaaRecord", {
      zone,
      recordName: "images",
      target: RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
    });

    new CfnOutput(this, "ImagesCloudFrontDomainOutput", {
      value: this.cloudfrontDomain,
    });

    new CfnOutput(this, "ImagesCloudFrontDistributionIdOutput", {
      value: this.distribution.distributionId,
    });

    new CfnOutput(this, "ImagesBucketNameOutput", {
      value: imagesBucket.bucketName,
    });

    new CfnOutput(this, "ImagesBucketArnOutput", {
      value: imagesBucket.bucketArn,
    });
  }
}
