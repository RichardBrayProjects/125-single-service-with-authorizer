import {
  CfnManagedLoginBranding,
  OAuthScope,
  UserPool,
  CfnUserPoolGroup,
} from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";
import { CfnOutput, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

interface CognitoStackProps extends StackProps {
  systemName: string;
  postConfirmationLambda: NodejsFunction;
  apiUrl: string; // The user API URL for callback URLs
  cloudfrontUrl: string; // The frontend URL for redirects
}

export class CognitoStack extends Stack {
  public readonly userPool: UserPool;

  constructor(scope: Construct, id: string, props: CognitoStackProps) {
    super(scope, id, props);

    const { systemName, postConfirmationLambda, cloudfrontUrl } = props;
    const uniquePrefix = `${systemName}`.replaceAll(".", "-");

    this.userPool = new UserPool(this, "uptick-userpool", {
      userPoolName: "uptick-userpool",
      removalPolicy: RemovalPolicy.DESTROY,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        phoneNumber: {
          required: false,
          mutable: true,
        },
      },
      selfSignUpEnabled: true,
      lambdaTriggers: {
        postConfirmation: postConfirmationLambda,
      },
    });

    this.userPool.addDomain(`${uniquePrefix}-domain`, {
      cognitoDomain: {
        domainPrefix: uniquePrefix,
      },
      managedLoginVersion: 2,
    });

    const callbackUrls = [
      `${cloudfrontUrl}/callback`,
      `http://localhost:3000/callback`,
    ];
    const logoutUrls = [cloudfrontUrl, `http://localhost:3000`];

    const webServerClient = this.userPool.addClient(
      "uptick-web-server-client",
      {
        userPoolClientName: "uptick-web-server-client",
        oAuth: {
          flows: { authorizationCodeGrant: true },
          scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PHONE],
          callbackUrls,
          logoutUrls,
        },
        // Public client for PKCE - no secret needed
        // PKCE provides security through code_verifier instead
        generateSecret: false,
      }
    );

    new CfnManagedLoginBranding(
      this,
      "uptick-web-server-managed-login-branding",
      {
        userPoolId: this.userPool.userPoolId,
        clientId: webServerClient.userPoolClientId,
        returnMergedResources: true,
        settings: {
          components: {
            primaryButton: {
              lightMode: {
                defaults: {
                  backgroundColor: "0972d3ff",
                  textColor: "ffffffff",
                },
                hover: {
                  backgroundColor: "033160ff",
                  textColor: "ffffffff",
                },
                active: {
                  backgroundColor: "033160ff",
                  textColor: "ffffffff",
                },
              },
              darkMode: {
                defaults: {
                  backgroundColor: "539fe5ff",
                  textColor: "000716ff",
                },
                hover: {
                  backgroundColor: "89bdeeff",
                  textColor: "000716ff",
                },
                active: {
                  backgroundColor: "539fe5ff",
                  textColor: "000716ff",
                },
              },
            },
            pageBackground: {
              lightMode: {
                color: "ffffffff",
              },
              darkMode: {
                color: "044444ff",
              },
              image: {
                enabled: false,
              },
            },
          },
          categories: {
            auth: {
              authMethodOrder: [
                [
                  {
                    display: "BUTTON",
                    type: "FEDERATED",
                  },
                  {
                    display: "INPUT",
                    type: "USERNAME_PASSWORD",
                  },
                ],
              ],
              federation: {
                interfaceStyle: "BUTTON_LIST",
                order: [],
              },
            },
            global: {
              colorSchemeMode: "DARK",
              pageHeader: {
                enabled: false,
              },
              pageFooter: {
                enabled: false,
              },
            },
          },
        },
      }
    );

    // The cognito domain and client-id are printed out by the CDK stack and must be stored in the UI .env file like this ...
    // VITE_COGNITO_DOMAIN='https://uptickart.auth.eu-west-2.amazoncognito.com'
    // VITE_COGNITO_CLIENT_ID='7idroa0j5v6o4bgfjlm21tfv00'
    // This is because the UI connects to Cognito directly.

    const cognitoDomain = `https://${uniquePrefix}.auth.${this.region}.amazoncognito.com`;
    new CfnOutput(this, "cognito-domain-output", { value: cognitoDomain });

    const clientId = webServerClient.userPoolClientId;
    new CfnOutput(this, "cognito-client-id-output", { value: clientId });

    // Create administrators group
    new CfnUserPoolGroup(this, "AdministratorsGroup", {
      userPoolId: this.userPool.userPoolId,
      groupName: "administrators",
      description: "Administrator users with elevated permissions",
    });

    // Note: UserPool is now passed directly to API stacks as a prop, no SSM parameter needed

    // Output User Pool information for verification
    new CfnOutput(this, "UserPoolId", {
      value: this.userPool.userPoolId,
      description: "Cognito User Pool ID",
    });

    new CfnOutput(this, "UserPoolArn", {
      value: this.userPool.userPoolArn,
      description: "Cognito User Pool ARN",
    });
  }
}
