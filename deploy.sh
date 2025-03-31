#!/bin/bash

# Deployment Script for eBay Listing Software

# Exit on any error
set -e

# Define environment
ENV=${1:-staging}

# Check if environment is valid
if [[ ! "$ENV" =~ ^(staging|production)$ ]]; then
  echo "Invalid environment. Use 'staging' or 'production'"
  exit 1
fi

# Set environment-specific variables
if [ "$ENV" == "staging" ]; then
  BRANCH="staging"
  SERVER_PATH="/path/to/staging/deployment"
  ENV_FILE=".env.staging"
elif [ "$ENV" == "production" ]; then
  BRANCH="production"
  SERVER_PATH="/path/to/production/deployment"
  ENV_FILE=".env.production"
fi

# Backup current deployment
echo "Creating backup of current deployment..."
cp -R "$SERVER_PATH" "$SERVER_PATH.backup.$(date +%Y%m%d_%H%M%S)"

# Fetch latest code
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

# Install dependencies for all parts of the project
npm ci
cd client && npm ci
cd ../public && npm ci
cd ..

# Build client and public applications
npm run build
cd client && npm run build
cd ../public && npm run build
cd ..

# Copy environment file
cp "$ENV_FILE" "$SERVER_PATH/.env"

# Run any migrations or setup
npm run migrate

# Restart application
pm2 restart ecosystem.config.js --env "$ENV"

# Run health checks
npm run health-check

echo "Deployment to $ENV environment completed successfully!"

# Optional: Cleanup old backups (keep last 3)
cd "$SERVER_PATH/.."
ls -t | grep backup | tail -n +4 | xargs rm -rf