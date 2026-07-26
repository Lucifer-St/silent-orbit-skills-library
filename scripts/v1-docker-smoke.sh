#!/bin/sh
set -eu

: "${SILENT_ORBIT_TARBALL:=/input/release.tgz}"
: "${SILENT_ORBIT_CONFIG:=/fixture/codex-global.config.json}"
: "${SILENT_ORBIT_SCENARIO:=docker}"

consumer_root=/tmp/silent-orbit-consumer
project_root=/tmp/silent-orbit-project

mkdir -p "$consumer_root" "$project_root" "${HOME:?HOME must be set}"
cd "$consumer_root"

printf 'SCENARIO=%s\n' "$SILENT_ORBIT_SCENARIO"
printf 'NODE_VERSION=%s\n' "$(node --version)"
printf 'NPM_VERSION=%s\n' "$(npm --version)"

npm install --ignore-scripts --no-save "$SILENT_ORBIT_TARBALL" skills@1.5.20

bin_cli=./node_modules/.bin/silent-orbit
package_cli=./node_modules/silent-orbit-skills-library/scripts/silent-orbit.mjs
bin_version=$("$bin_cli" --version)
printf 'CLI_BIN_VERSION=%s\n' "$bin_version"

if [ -n "$bin_version" ]; then
  run_cli() {
    "$bin_cli" "$@"
  }
elif [ "${SILENT_ORBIT_ALLOW_DIRECT_FALLBACK:-0}" = "1" ]; then
  printf 'CLI_ENTRYPOINT=direct-node-fallback\n'
  run_cli() {
    node "$package_cli" "$@"
  }
else
  printf 'CLI_ENTRYPOINT=failed\n' >&2
  exit 1
fi

run_cli init "$project_root" \
  --title "Silent Orbit Docker smoke" \
  --project-id v1-docker-codex-global \
  --json
cp "$SILENT_ORBIT_CONFIG" "$project_root/silent-orbit.config.json"

run_cli doctor --project "$project_root" --json

set +e
run_cli scan --project "$project_root" --generated-at "2026-07-26T00:00:00.000Z" --json > "$consumer_root/scan.json"
scan_exit=$?
set -e

printf 'SCAN_EXIT=%s\n' "$scan_exit"
if [ "$scan_exit" -ne 0 ]; then
  printf 'SCAN_RESULT=failed\n' >&2
  exit "$scan_exit"
fi

node - "$consumer_root/scan.json" "$SILENT_ORBIT_SCENARIO" <<'NODE'
const fs = require("node:fs");
const [filePath, scenario] = process.argv.slice(2);
const result = JSON.parse(fs.readFileSync(filePath, "utf8"));
const summary = result.snapshot?.summary ?? {};
const diagnostics = result.snapshot?.diagnostics ?? [];
if (summary.errors !== 0) throw new Error(`Docker scan reported ${summary.errors} errors.`);
if (scenario === "unmounted") {
  if (summary.items !== 0) throw new Error(`Unmounted scan expected 0 items, received ${summary.items}.`);
  if (summary.warnings < 1) throw new Error("Unmounted scan must report an actionable warning.");
  if (!diagnostics.some((entry) => entry.code === "no-global-skills-found"
      && /mount/i.test(entry.message)
      && /\.agents\/skills/.test(entry.message))) {
    throw new Error("Unmounted scan is missing the Docker mount diagnostic.");
  }
  if (!result.snapshot.sources?.some((entry) => entry.scanState === "partial")) {
    throw new Error("Unmounted source must be partial, not silently complete.");
  }
} else if (scenario === "mounted") {
  if (summary.items < 1) throw new Error("Mounted scan did not discover the controlled Skill.");
  if (summary.warnings !== 0) throw new Error(`Mounted scan reported ${summary.warnings} warnings.`);
} else {
  throw new Error(`Unknown Docker smoke scenario: ${scenario}`);
}
process.stdout.write(`SCAN_ITEMS=${summary.items}\nSCAN_WARNINGS=${summary.warnings}\nSCAN_ERRORS=${summary.errors}\n`);
NODE

printf 'DOCKER_SMOKE=pass\n'
