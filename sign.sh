#!/bin/bash

source .env

VERSION=$(cat package.json | jq -r '.version')
NAME=$(cat package.json | jq -r '.name')
echo "Signing $NAME v$VERSION"
pnpm zip:firefox
pnpm amo-upload sign \
    --api-key $AMO_KEY \
    --api-secret $AMO_SECRET \
    --addon-id $AMO_ADDON_ID \
    --addon-version $VERSION \
    --channel unlisted \
    --dist-file $(realpath ".output/$NAME-$VERSION-firefox.zip") \
    --source-file $(realpath ".output/$NAME-$VERSION-sources.zip") \
    --output "web-ext-artifacts/$NAME-$VERSION-signed.xpi"
