import { Construct } from "constructs";
import {
  Stack,
  StackProps,
  Duration,
  CfnOutput,
  RemovalPolicy,
} from "aws-cdk-lib";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import {
  RestApi,
  DomainName,
  EndpointType,
  SecurityPolicy,
  LambdaIntegration,
  MockIntegration,
  CognitoUserPoolsAuthorizer,
  AuthorizationType,
  ResponseType,
} from "aws-cdk-lib/aws-apigateway";
import { UserPool } from "aws-cdk-lib/aws-cognito";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import {
  HostedZone,
  ARecord,
  AaaaRecord,
  RecordTarget,
} from "aws-cdk-lib/aws-route53";
import { ApiGatewayDomain } from "aws-cdk-lib/aws-route53-targets";
import {
  Certificate,
  CertificateValidation,
} from "aws-cdk-lib/aws-certificatemanager";

interface ImageApiStackProps extends StackProps {
  domainName?: string;
  hostedZoneId?: string;
  hostedZoneName?: string;
  apiSubdomain?: string;
  dbname: string;
  imagesS3BucketName: string;
  imagesCloudFrontDomain: string;
  userPool: UserPool;
}

export class ImageApiStack extends Stack {
  constructor(scope: Construct, id: string, props: ImageApiStackProps) {
    super(scope, id, props);

    const {
      domainName,
      hostedZoneId,
      hostedZoneName,
      apiSubdomain,
      dbname,
      imagesS3BucketName,
      imagesCloudFrontDomain,
    } = props;

    if (!hostedZoneName || !hostedZoneId || !domainName) {
      throw new Error(
        "Unexpected missing hostedZone || hostedZoneId || domainName"
      );
    }

    const apiDomainName = `${apiSubdomain}.${domainName}`;

    const zone = HostedZone.fromHostedZoneAttributes(
      this,
      "ImportedHostedZone",
      {
        hostedZoneId,
        zoneName: hostedZoneName,
      }
    );

    // Create certificate for API subdomain
    const certificate = new Certificate(this, "ApiCertificate", {
      domainName: apiDomainName,
      validation: CertificateValidation.fromDns(zone),
    });
    // Retain certificate on stack deletion to avoid deletion failures
    // when it's still attached to API Gateway domain
    certificate.applyRemovalPolicy(RemovalPolicy.RETAIN);

    const environment: Record<string, string> = {
      RDS_DB_NAME: dbname,
      S3_BUCKET_NAME: imagesS3BucketName,
      CLOUDFRONT_DOMAIN: imagesCloudFrontDomain,
      // S3 bucket is in us-east-1 (created by CloudFront stack)
      // Lambda runs in eu-west-2, so we need to explicitly set the S3 region
      S3_BUCKET_REGION: "us-east-1",
    };

    // Create Lambda function using NodejsFunction for automatic bundling
    const lambdaFunction = new NodejsFunction(this, "ImageServiceFunction", {
      entry: "../services/image/src/index.ts",
      handler: "handler",
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      bundling: {
        minify: true,
        sourceMap: false,
        target: "es2021",
        nodeModules: [
          "express",
          "cors",
          "@vendia/serverless-express",
          "pg",
          "@aws-sdk/client-s3",
          "@aws-sdk/s3-request-presigner",
          "@aws-sdk/client-secrets-manager",
          "@aws-sdk/client-ssm",
          "uuid",
        ],
      },
      environment,
    });

    // Grant Lambda access to SSM to read RDS secret ARN
    lambdaFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ["ssm:GetParameter"],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/rds/secret-arn`,
        ],
      })
    );

    // Grant Lambda access to Secrets Manager for RDS credentials
    lambdaFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:system-rds/rds-credentials*`,
        ],
      })
    );

    // Grant Lambda access to S3
    lambdaFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ["s3:PutObject"],
        resources: [`arn:aws:s3:::${imagesS3BucketName}/*`],
      })
    );

    // Create API Gateway
    const api = new RestApi(this, "ImageApi", {
      restApiName: "Image Service API",
      description: "API Gateway for Image Service",
      endpointConfiguration: {
        types: [EndpointType.REGIONAL],
      },
    });

    // Create custom domain
    const apiDomain = new DomainName(this, "ApiDomain", {
      domainName: apiDomainName,
      certificate: certificate,
      securityPolicy: SecurityPolicy.TLS_1_2,
      endpointType: EndpointType.REGIONAL,
    });

    // Create base path mapping
    apiDomain.addBasePathMapping(api, {
      basePath: "",
    });

    // Create Route53 records
    new ARecord(this, "ApiARecord", {
      zone,
      recordName: apiSubdomain,
      target: RecordTarget.fromAlias(new ApiGatewayDomain(apiDomain)),
    });

    new AaaaRecord(this, "ApiAaaaRecord", {
      zone,
      recordName: apiSubdomain,
      target: RecordTarget.fromAlias(new ApiGatewayDomain(apiDomain)),
    });

    // Create Cognito authorizer
    const authorizer = new CognitoUserPoolsAuthorizer(
      this,
      "CognitoAuthorizer",
      {
        cognitoUserPools: [props.userPool],
        identitySource: "method.request.header.Authorization",
      }
    );

    const lambdaIntegration = new LambdaIntegration(lambdaFunction, {
      proxy: true,
    });

    // Create a MockIntegration for OPTIONS requests (CORS preflight)
    const corsMockIntegration = new MockIntegration({
      integrationResponses: [
        {
          statusCode: "200",
          responseParameters: {
            "method.response.header.Access-Control-Allow-Origin": "'*'",
            "method.response.header.Access-Control-Allow-Headers":
              "'Content-Type,Authorization'",
            "method.response.header.Access-Control-Allow-Methods":
              "'GET,POST,PUT,DELETE,OPTIONS'",
          },
        },
      ],
      requestTemplates: {
        "application/json": '{"statusCode": 200}',
      },
    });

    const corsMethodOptions = {
      methodResponses: [
        {
          statusCode: "200",
          responseParameters: {
            "method.response.header.Access-Control-Allow-Origin": true,
            "method.response.header.Access-Control-Allow-Headers": true,
            "method.response.header.Access-Control-Allow-Methods": true,
          },
        },
      ],
    };

    // Health endpoint (public, no auth required)
    const healthResource = api.root.addResource("health");
    healthResource.addMethod("GET", lambdaIntegration, {
      authorizationType: AuthorizationType.NONE,
    });

    // V1 routes (require Cognito authentication)
    const v1Resource = api.root.addResource("v1");

    // SUBMIT
    const submitResource = v1Resource.addResource("submit");
    submitResource.addMethod("POST", lambdaIntegration, {
      authorizationType: AuthorizationType.COGNITO,
      authorizer: authorizer,
    });
    // Add OPTIONS method for CORS preflight (no auth required)
    submitResource.addMethod("OPTIONS", corsMockIntegration, {
      ...corsMethodOptions,
      authorizationType: AuthorizationType.NONE,
    });

    // GALLERY
    const galleryResource = v1Resource.addResource("gallery");
    galleryResource.addMethod("GET", lambdaIntegration, {
      authorizationType: AuthorizationType.COGNITO,
      authorizer: authorizer,
    });
    // Add OPTIONS method for CORS preflight (no auth required)
    galleryResource.addMethod("OPTIONS", corsMockIntegration, {
      ...corsMethodOptions,
      authorizationType: AuthorizationType.NONE,
    });

    // Add gateway responses for authorizer errors
    api.addGatewayResponse("UnauthorizedGatewayResponse", {
      type: ResponseType.UNAUTHORIZED,
      statusCode: "401",
    });

    api.addGatewayResponse("AccessDeniedGatewayResponse", {
      type: ResponseType.ACCESS_DENIED,
      statusCode: "403",
    });

    new CfnOutput(this, "ApiUrl", {
      value: `https://${apiDomainName}`,
    });

    new CfnOutput(this, "ApiGatewayUrl", {
      value: api.url,
    });

    new CfnOutput(this, "UserPoolArn", {
      value: props.userPool.userPoolArn,
      description: "User Pool ARN used by the authorizer",
    });

    new CfnOutput(this, "UserPoolId", {
      value: props.userPool.userPoolId,
      description: "User Pool ID used by the authorizer",
    });
  }
}
