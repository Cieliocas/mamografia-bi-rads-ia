#!/bin/sh
set -e
cd "$(dirname "$0")"
/usr/local/bin/npm run build
rm -rf ../desktop/dist
cp -R dist ../desktop/dist
touch ../desktop/dist/.gitkeep
