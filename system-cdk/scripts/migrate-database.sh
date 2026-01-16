#!/bin/bash

set -euo pipefail

# --------------------------
# Mode selection
# --------------------------
FLYWAY_COMMAND="migrate"

if [ "${1:-}" = "--repair" ]; then
  FLYWAY_COMMAND="repair"
fi

# Configuration
RETRIES=2
SLEEP_SECONDS=3
DB_PORT=5432
SQL_SCRIPTS_DIR="${SQL_SCRIPTS_DIR:-../migrations}"
RDS_DB_NAME="${RDS_DB_NAME:-uptickart}"

# --- Pre-requisite checks ---
command -v jq >/dev/null 2>&1 || { echo >&2 "Error: 'jq' is required."; exit 1; }
command -v flyway >/dev/null 2>&1 || { echo >&2 "Error: 'flyway' CLI is required."; exit 1; }
command -v aws >/dev/null 2>&1 || { echo >&2 "Error: 'aws' CLI is required."; exit 1; }
command -v psql >/dev/null 2>&1 || { echo >&2 "Error: 'psql' is required."; exit 1; }

# --- Retrieve secret ARN from SSM Parameter Store ---
echo "Retrieving secret ARN from SSM Parameter Store..."
SECRET_ARN=$(aws ssm get-parameter \
  --name "/rds/secret-arn" \
  --query "Parameter.Value" \
  --output text)

# --- Retrieve all credentials from Secrets Manager ---
echo "Retrieving RDS credentials from Secrets Manager..."
SECRET_JSON=$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ARN" \
  --query "SecretString" \
  --output text)

# Parse credentials from JSON (using jq)
RDS_ENDPOINT=$(printf '%s' "$SECRET_JSON" | jq -r '.host')
RDS_USERNAME=$(printf '%s' "$SECRET_JSON" | jq -r '.username')
RDS_PASSWORD=$(printf '%s' "$SECRET_JSON" | jq -r '.password')

# Set PGPASSWORD environment variable so psql doesn't prompt for password
export PGPASSWORD="$RDS_PASSWORD"

# Create database if it doesn't exist
echo "Connecting to RDS instance and creating $RDS_DB_NAME database..."

# Check if database exists
DB_EXISTS=$(psql -h "$RDS_ENDPOINT" -U "$RDS_USERNAME" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$RDS_DB_NAME'" 2>/dev/null || echo "")

if [ "$DB_EXISTS" = "1" ]; then
    echo "Database $RDS_DB_NAME already exists"
else
    echo "Creating database $RDS_DB_NAME..."
    psql -h "$RDS_ENDPOINT" -U "$RDS_USERNAME" -d postgres -c "CREATE DATABASE $RDS_DB_NAME" || {
        echo "Error: Failed to create database"
        exit 1
    }
fi

# Unset password for security
unset PGPASSWORD

echo ""
echo "✅ $RDS_DB_NAME database exists !"
echo ""

JDBC_URL="jdbc:postgresql://${RDS_ENDPOINT}:${DB_PORT}/$RDS_DB_NAME"

echo "Preparing to $FLYWAY_COMMAND remote database"
echo "Username: $RDS_USERNAME"
echo "JDBC URL: $JDBC_URL"

# --- Run Flyway command directly ---
flyway \
  -connectRetries=$RETRIES \
  -url="$JDBC_URL" \
  -user="$RDS_USERNAME" \
  -password="$RDS_PASSWORD" \
  -locations="filesystem:$SQL_SCRIPTS_DIR" \
  "$FLYWAY_COMMAND"

echo "✅ Flyway $FLYWAY_COMMAND complete"
