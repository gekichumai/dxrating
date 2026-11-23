#!/bin/sh
# Usage: formal/tlc.sh formal/<model>/<Spec>.tla [extra TLC arguments]
# Runs TLC with the spec's same-named .cfg. Needs Java 11 or later.
set -eu

version=1.7.4
sha256=936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88
cache="${XDG_CACHE_HOME:-$HOME/.cache}/dxrating-tlc"
jar="$cache/tla2tools-$version.jar"

if [ ! -f "$jar" ]; then
  mkdir -p "$cache"
  curl -fsSL -o "$jar.tmp" "https://github.com/tlaplus/tlaplus/releases/download/v$version/tla2tools.jar"
  mv "$jar.tmp" "$jar"
fi
if command -v sha256sum >/dev/null; then actual=$(sha256sum "$jar" | cut -d' ' -f1); else actual=$(shasum -a 256 "$jar" | cut -d' ' -f1); fi
if [ "$actual" != "$sha256" ]; then
  rm -f "$jar"
  echo "tla2tools.jar checksum mismatch: $actual" >&2
  exit 1
fi

spec="$1"
shift
dir=$(dirname "$spec")
name=$(basename "$spec" .tla)
cd "$dir"
exec java -XX:+UseParallelGC -cp "$jar" tlc2.TLC -workers auto -cleanup -metadir "${TMPDIR:-/tmp}/tlc-$name-$$" -config "$name.cfg" "$name.tla" "$@"
