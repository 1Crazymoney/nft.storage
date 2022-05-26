#!/usr/bin/env bash


# Introduced these variables mostly to debug the env templating in a container vs the host.

THIS_DIR="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"
API_DIR="$THIS_DIR/../.."
pushd $API_DIR

# Variables for use in docker.
# ESBUILD_CMD="node_modules/esbuild/bin/esbuild"
ENTRYPOINT="./src/index.js"
OUT_DIR="./dist/"

# variables for use in the host for debugging, etc.
ESBUILD_CMD="npx esbuild"
# ENTRYPOINT="./src/constants.js"
# OUT_DIR="./tmp"

# End host debug section

mkdir -p $OUT_DIR && \
$ESBUILD_CMD \
  --bundle \
  --sourcemap \
  --define:ENV="\"$ENV\"" \
  --define:PRIVATE_KEY="\"$PRIVATE_KEY\"" \
  --define:DATABASE_CONNECTION="\"$DATABASE_CONNECTION\"" \
  --define:DATABASE_TOKEN="\"$DATABASE_TOKEN\"" \
  --define:DATABASE_URL="\"$DATABASE_URL\"" \
  --define:LOGTAIL_TOKEN="\"$LOGTAIL_TOKEN\"" \
  --define:MAGIC_SECRET_KEY="\"$MAGIC_SECRET_KEY\"" \
  --define:SALT="\"$SALT\"" \
  --define:SENTRY_DSN="\"$SENTRY_DSN\"" \
  --define:MAILCHIMP_API_KEY="\"$MAILCHIMP_API_KEY\"" \
  --define:CLUSTER_API_URL="\"$CLUSTER_API_URL\"" \
  --define:CLUSTER_BASIC_AUTH_TOKEN="\"$CLUSTER_BASIC_AUTH_TOKEN\"" \
  --define:DEBUG="\"$DEBUG\"" \
  --define:VERSION="\"$VERSION\"" \
  --define:COMMITHASH="\"$COMMITHASH\"" \
  --define:BRANCH="\"$BRANCH\"" \
  --define:METAPLEX_AUTH_TOKEN="\"$METAPLEX_AUTH_TOKEN\"" \
  --define:S3_ACCESS_KEY_ID="\"$S3_ACCESS_KEY_ID\"" \
  --define:S3_BUCKET_NAME="\"$S3_BUCKET_NAME\"" \
  --define:S3_ENDPOINT="\"$S3_ENDPOINT\"" \
  --define:S3_REGION="\"$S3_REGION\"" \
  --define:S3_SECRET_ACCESS_KEY="\"$S3_SECRET_ACCESS_KEY\"" \
 $ENTRYPOINT > $OUT_DIR/worker.js