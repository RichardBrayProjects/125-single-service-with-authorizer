import { Construct } from "constructs";
import {
  Stack,
  StackProps,
  CfnOutput,
  Duration,
  RemovalPolicy,
} from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import { StringParameter } from "aws-cdk-lib/aws-ssm";

export class RdsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // --------------------------
    // VPC Configuration
    // --------------------------
    // Aurora (like RDS) needs subnets in at least 2 AZs, so keep maxAzs: 2.
    const vpc = new ec2.Vpc(this, "RdsVpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: "PublicSubnet", subnetType: ec2.SubnetType.PUBLIC },
      ],
    });

    // --------------------------
    // Security Group (dev-only)
    // --------------------------
    const rdsSecurityGroup = new ec2.SecurityGroup(this, "RdsSecurityGroup", {
      vpc,
      allowAllOutbound: true,
      description:
        "Security group for publicly accessible Aurora cluster (development only)",
    });

    rdsSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5432),
      "Allow PostgreSQL access from anywhere (development only)"
    );

    // --------------------------
    // Credentials (Secrets Manager)
    // --------------------------
    const dbUsername = "uptick_admin";
    const dbCredentials = rds.Credentials.fromGeneratedSecret(dbUsername, {
      secretName: `${this.stackName}/rds-credentials`,
      excludeCharacters: " %+~`#$&*()|[]{}:;<>?!'/@\"\\",
    });

    // --------------------------
    // Aurora PostgreSQL Engine
    // --------------------------
    const engine = rds.DatabaseClusterEngine.auroraPostgres({
      version: rds.AuroraPostgresEngineVersion.VER_17_4,
    });

    // --------------------------
    // Aurora Serverless v2 Cluster
    // --------------------------
    const cluster = new rds.DatabaseCluster(this, "AuroraPgServerlessV2", {
      engine,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [rdsSecurityGroup],

      credentials: dbCredentials,

      writer: rds.ClusterInstance.serverlessV2("writer", {
        availabilityZone: vpc.availabilityZones[0], // pin writer AZ
        publiclyAccessible: true,
        enablePerformanceInsights: false,
      }),

      // Scale-to-zero + auto-pause (what you saw in the console)
      serverlessV2MinCapacity: 0,
      serverlessV2MaxCapacity: 1,
      serverlessV2AutoPauseDuration: Duration.minutes(5),

      // Backups: Aurora generally expects at least 1 day; keep it minimal.
      backup: {
        retention: Duration.days(1),
      },

      // Dev-only lifecycle settings
      deletionProtection: false,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // --------------------------
    // SSM Parameter for External Tools
    // --------------------------
    const secretArn = cluster.secret!.secretArn;

    new StringParameter(this, "DbSecretArnParam", {
      parameterName: "/rds/secret-arn",
      stringValue: secretArn,
      description: "ARN of the Aurora credentials secret in Secrets Manager",
    });

    // --------------------------
    // Outputs
    // --------------------------
    new CfnOutput(this, "AuroraClusterEndpoint", {
      value: cluster.clusterEndpoint.hostname,
      description: "Aurora cluster endpoint hostname",
    });

    new CfnOutput(this, "AuroraPort", {
      value: cluster.clusterEndpoint.port.toString(),
      description: "Aurora cluster port",
    });

    new CfnOutput(this, "DbSecretArn", {
      value: secretArn,
      description: "ARN of the DB credentials secret in Secrets Manager",
    });

    new CfnOutput(this, "RdsSecurityGroupId", {
      value: rdsSecurityGroup.securityGroupId,
      description: "DB security group ID",
    });

    new CfnOutput(this, "VpcId", {
      value: vpc.vpcId,
      description: "VPC ID",
    });
  }
}
