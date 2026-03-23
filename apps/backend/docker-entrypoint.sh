#!/bin/sh
set -e
echo "Running database migrations..."
node --enable-source-maps --experimental-transform-types dist/migrate.js
echo "Starting server..."
exec node --enable-source-maps --experimental-transform-types dist/index.js
