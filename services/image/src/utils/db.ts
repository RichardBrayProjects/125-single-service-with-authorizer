import { Client } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const RDS_DB_NAME = process.env.RDS_DB_NAME;
const RDS_SECRET_ARN_PARAMETER = '/rds/secret-arn';
const secretsClient = new SecretsManagerClient({});
const ssmClient = new SSMClient({});

async function getRdsSecretArn(): Promise<string> {
  const ssmResponse = await ssmClient.send(
    new GetParameterCommand({ Name: RDS_SECRET_ARN_PARAMETER })
  );
  
  if (!ssmResponse.Parameter?.Value) {
    throw new Error(`SSM parameter ${RDS_SECRET_ARN_PARAMETER} not found or has no value`);
  }
  
  return ssmResponse.Parameter.Value;
}

async function getRdsCredentials() {
  const rdsSecretArn = await getRdsSecretArn();
  const secretResponse = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: rdsSecretArn })
  );
  
  const secret = JSON.parse(secretResponse.SecretString || '{}');
  return {
    host: secret.host,
    port: secret.port || 5432,
    username: secret.username,
    password: secret.password,
  };
}

export async function queryDatabase<T = any>(
  query: string,
  params?: any[]
): Promise<{ rows: T[] }> {
  if (!RDS_DB_NAME) {
    throw new Error('RDS_DB_NAME environment variable is required');
  }

  const credentials = await getRdsCredentials();
  const client = new Client({
    host: credentials.host,
    port: credentials.port,
    user: credentials.username,
    password: credentials.password,
    database: RDS_DB_NAME,
  });

  try {
    await client.connect();
    const result = await client.query(query, params);
    return { rows: result.rows };
  } finally {
    await client.end();
  }
}
