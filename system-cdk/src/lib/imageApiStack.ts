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
  CognitoUserPoolsAuthorizer,
  AuthorizationType,
  ResponseType,
  Cors,
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

    if (!hostedZoneName || !hostedZoneId || !domainName || !apiSubdomain) {
      throw new Error(
        "Unexpected missing hostedZoneName || hostedZoneId || domainName || apiSubdomain"
      );
    }

    const apiDomainName = `${apiSubdomain}.${domainName}`;

    const zone = HostedZone.fromHostedZoneAttributes(
      this,
      "ImportedHostedZone",
      { hostedZoneId, zoneName: hostedZoneName }
    );

    const certificate = new Certificate(this, "ApiCertificate", {
      domainName: apiDomainName,
      validation: CertificateValidation.fromDns(zone),
    });
    certificate.applyRemovalPolicy(RemovalPolicy.RETAIN);

    const environment: Record<string, string> = {
      RDS_DB_NAME: dbname,
      S3_BUCKET_NAME: imagesS3BucketName,
      CLOUDFRONT_DOMAIN: imagesCloudFrontDomain,
      S3_BUCKET_REGION: "us-east-1",
    };

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

    lambdaFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ["ssm:GetParameter"],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/rds/secret-arn`,
        ],
      })
    );

    lambdaFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:system-rds/rds-credentials*`,
        ],
      })
    );

    lambdaFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ["s3:PutObject"],
        resources: [`arn:aws:s3:::${imagesS3BucketName}/*`],
      })
    );

    const api = new RestApi(this, "ImageApi", {
      restApiName: "Image Service API",
      description: "API Gateway for Image Service",
      endpointConfiguration: { types: [EndpointType.REGIONAL] },

      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });

    const apiDomain = new DomainName(this, "ApiDomain", {
      domainName: apiDomainName,
      certificate,
      securityPolicy: SecurityPolicy.TLS_1_2,
      endpointType: EndpointType.REGIONAL,
    });

    apiDomain.addBasePathMapping(api, { basePath: "" });

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

    const healthResource = api.root.addResource("health");
    healthResource.addMethod("GET", lambdaIntegration, {
      authorizationType: AuthorizationType.NONE,
    });

    const v1Resource = api.root.addResource("v1");

    const submitResource = v1Resource.addResource("submit");
    submitResource.addMethod("POST", lambdaIntegration, {
      authorizationType: AuthorizationType.COGNITO,
      authorizer,
    });

    const galleryResource = v1Resource.addResource("gallery");
    galleryResource.addMethod("GET", lambdaIntegration, {
      authorizationType: AuthorizationType.COGNITO,
      authorizer,
    });

    api.addGatewayResponse("UnauthorizedGatewayResponse", {
      type: ResponseType.UNAUTHORIZED,
      statusCode: "401",
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Headers": "'Content-Type,Authorization'",
        "Access-Control-Allow-Methods": "'GET,POST,PUT,DELETE,OPTIONS'",
      },
    });

    api.addGatewayResponse("AccessDeniedGatewayResponse", {
      type: ResponseType.ACCESS_DENIED,
      statusCode: "403",
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Headers": "'Content-Type,Authorization'",
        "Access-Control-Allow-Methods": "'GET,POST,PUT,DELETE,OPTIONS'",
      },
    });

    new CfnOutput(this, "ApiUrl", { value: `https://${apiDomainName}` });
    new CfnOutput(this, "ApiGatewayUrl", { value: api.url });
    new CfnOutput(this, "UserPoolArn", { value: props.userPool.userPoolArn });
    new CfnOutput(this, "UserPoolId", { value: props.userPool.userPoolId });
  }
}
