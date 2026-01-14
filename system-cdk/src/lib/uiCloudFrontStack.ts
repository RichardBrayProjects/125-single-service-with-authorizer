import { AaaaRecord, ARecord, RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";
import { BlockPublicAccess, Bucket } from "aws-cdk-lib/aws-s3";
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
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { HostedZone } from "aws-cdk-lib/aws-route53";

interface UiCloudFrontStackProps extends StackProps {
  domainName: string;
  hostedZoneId: string;
  hostedZoneName: string;
  bucketName: string;
}

export class UiCloudFrontStack extends Stack {
  public readonly distribution: Distribution;
  public readonly cloudfrontUrl: string;

  constructor(scope: Construct, id: string, props: UiCloudFrontStackProps) {
    super(scope, id, props);

    const { domainName, hostedZoneId, hostedZoneName, bucketName } = props;

    // Create S3 bucket for UI
    const uiBucket = new Bucket(this, "UiBucket", {
      bucketName,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });

    const wwwSubdomain = `www.${domainName}`;
    this.cloudfrontUrl = `https://${wwwSubdomain}`;

    const zone = HostedZone.fromHostedZoneAttributes(
      this,
      "ImportedHostedZone",
      {
        hostedZoneId,
        zoneName: hostedZoneName,
      }
    );

    const cert = new Certificate(this, "UsEastCert", {
      domainName,
      subjectAlternativeNames: [wwwSubdomain],
      validation: CertificateValidation.fromDns(zone),
    });
    cert.applyRemovalPolicy(RemovalPolicy.RETAIN);

    this.distribution = new Distribution(this, "ui-distribution", {
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(uiBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_DISABLED,
      },
      defaultRootObject: "/uptickart/index.html",
      domainNames: [domainName, wwwSubdomain],
      certificate: cert,
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/uptickart/index.html",
          ttl: Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/uptickart/index.html",
          ttl: Duration.seconds(0),
        },
      ],
    });

    // Apex domain -> CloudFront
    // When zone name matches domain name, use empty string for apex
    const apexRecordName = domainName === hostedZoneName ? "" : domainName;
    new ARecord(this, "ApexARecord", {
      zone,
      recordName: apexRecordName,
      target: RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
    });

    new AaaaRecord(this, "ApexAaaaRecord", {
      zone,
      recordName: apexRecordName,
      target: RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
    });

    new ARecord(this, "WwwA", {
      zone,
      recordName: "www",
      target: RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
    });

    new AaaaRecord(this, "WwwAAAA", {
      zone,
      recordName: "www",
      target: RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
    });

    new CfnOutput(this, "UiCloudFrontUrlOutput", {
      value: this.cloudfrontUrl,
    });

    new CfnOutput(this, "UiCloudFrontDistributionIdOutput", {
      value: this.distribution.distributionId,
    });

    new CfnOutput(this, "UiBucketNameOutput", {
      value: uiBucket.bucketName,
    });

    new CfnOutput(this, "UiBucketArnOutput", {
      value: uiBucket.bucketArn,
    });
  }
}
