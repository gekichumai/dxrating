#!/bin/sh
set -e
echo "Running database migrations..."
node --enable-source-maps dist/migrate.js
echo "Starting server..."
exec node --enable-source-maps dist/index.js
