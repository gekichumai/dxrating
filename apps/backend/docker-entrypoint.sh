#!/bin/sh
set -eu

exec node --enable-source-maps --experimental-transform-types dist/index.js
