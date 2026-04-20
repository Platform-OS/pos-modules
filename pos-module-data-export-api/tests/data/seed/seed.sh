#!/bin/bash
set -eu

DEFAULT_ENV=""
POS_ENV="${1:-$DEFAULT_ENV}"

if [ -z "$POS_ENV" ]; then
  echo "Usage: $0 <environment>"
  echo "Example: $0 staging"
  exit 1
fi

echo "=================================================="
echo "Seeding Data Export API test environment"
echo "Environment: $POS_ENV"
echo "=================================================="

# Clean instance data
echo "→ Cleaning instance data..."
pos-cli data clean $POS_ENV --auto-confirm --include-schema

# Deploy test application with modules
echo "→ Deploying test application..."
cd ./tests/post_import
env CONFIG_FILE_PATH=./../../.pos pos-cli deploy $POS_ENV

# The migration should have generated the API key
# Retrieve it and display for the user
echo ""
echo "=================================================="
echo "Deployment complete!"
echo "=================================================="
echo ""
echo "To get your API key, run this GraphQL query at:"
echo "https://your-instance/gui/graphql"
echo ""
echo "query {"
echo "  constants(name: \"_data_export_api_key\") {"
echo "    results {"
echo "      name"
echo "      value"
echo "    }"
echo "  }"
echo "}"
echo ""
echo "Or visit: https://your-instance/constant"
echo ""
echo "Then export it:"
echo "export DATA_EXPORT_API_KEY=\"your-key-here\""
echo "=================================================="
