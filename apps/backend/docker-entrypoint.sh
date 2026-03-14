#!/bin/sh
set -e
echo "Running database migrations..."
node --experimental-transform-types dist/migrate.js
echo "Starting server..."
exec node --experimental-transform-types dist/index.js
