#!/bin/sh
# Model-checks every formal/<model>/<Model>.tla with its .cfg. Each must pass.
set -eu
cd "$(dirname "$0")/.."
status=0
for dir in formal/*/; do
  model=$(basename "$dir")
  for spec in "$dir"*.tla; do
    [ -f "${spec%.tla}.cfg" ] || continue
    echo "== $spec"
    formal/tlc.sh "$spec" || status=1
  done
done
exit $status
