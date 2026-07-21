#!/usr/bin/env node

import {
  analyzeSilentOrbitProject,
  diffSilentOrbitProject,
  doctorSilentOrbitProject,
  generateSilentOrbitProject,
  importSilentOrbitSource,
  initSilentOrbitProject,
  scanSilentOrbitProject,
} from "./lib/silent-orbit-project.mjs";
import { pathToFileURL } from "node:url";

export const silentOrbitVersion = "0.1.0";

function parseArguments(argv) {
  const [command = "help", ...rest] = argv;
  const options = { _: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value.startsWith("--")) {
      options._.push(value);
      continue;
    }
    const key = value.slice(2);
    if (["json"].includes(key)) options[key] = true;
    else {
      const next = rest[index + 1];
      if (next === undefined || next.startsWith("--")) throw new Error(`Missing value for --${key}.`);
      options[key] = next;
      index += 1;
    }
  }
  return { command, options };
}

function projectDirectory(options) {
  return options.project ?? ".";
}

export function silentOrbitHelpText() {
  return [
    `Silent Orbit CLI ${silentOrbitVersion}`,
    "",
    "Usage:",
    "  silent-orbit init [directory] [--title <title>] [--project-id <id>]",
    "  silent-orbit import --file <source-import.json> [--project <directory>]",
    "  silent-orbit scan [--project <directory>] [--generated-at <ISO timestamp>]",
    "  silent-orbit analyze [--project <directory>]",
    "  silent-orbit diff [--project <directory>]",
    "  silent-orbit generate [--project <directory>]",
    "  silent-orbit doctor [--project <directory>]",
    "",
    "Add --json to emit machine-readable output. The CLI never writes outside the selected project directory.",
  ].join("\n");
}

function summaryFor(command, result) {
  if (command === "init") return `Initialized ${result.projectId} at ${result.projectRoot}.`;
  if (command === "import") return `Imported ${result.sourceKey}; configured sources=${result.sourceCount}.`;
  if (command === "scan") return `Scanned sources=${result.report.scannedSources}, observed=${result.report.observedItems}, inventory=${result.report.inventoryItems}, review-required=${result.report.reviewRequired}, warnings=${result.report.warnings}, errors=${result.report.errors}.`;
  if (command === "analyze") return `Analyzed included=${result.analysisReport.summary.included}, review-required=${result.analysisReport.summary.reviewRequired}, categories=${result.librarySnapshot.categories.length}.`;
  if (command === "diff") return `Diff added=${result.summary.added}, changed=${result.summary.changed}, removed=${result.summary.removed}.`;
  if (command === "generate") return `Generated ${result.summary.skills} Skills in ${result.outputDirectory}; files=${result.receipt.files.length}.`;
  if (command === "doctor") return `Doctor status=${result.status}; checks=${result.checks.length}.`;
  return JSON.stringify(result);
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (["help", "--help", "-h"].includes(command)) {
    process.stdout.write(`${silentOrbitHelpText()}\n`);
    return;
  }
  if (["version", "--version", "-v"].includes(command)) {
    process.stdout.write(`${silentOrbitVersion}\n`);
    return;
  }

  let result;
  if (command === "init") result = initSilentOrbitProject({ projectDirectory: options._[0] ?? projectDirectory(options), title: options.title, projectId: options["project-id"] });
  else if (command === "import") result = importSilentOrbitSource({ projectDirectory: projectDirectory(options), inputFile: options.file });
  else if (command === "scan") result = scanSilentOrbitProject({ projectDirectory: projectDirectory(options), generatedAt: options["generated-at"] });
  else if (command === "analyze") result = analyzeSilentOrbitProject({ projectDirectory: projectDirectory(options) });
  else if (command === "diff") result = diffSilentOrbitProject({ projectDirectory: projectDirectory(options) });
  else if (command === "generate") result = generateSilentOrbitProject({ projectDirectory: projectDirectory(options) });
  else if (command === "doctor") result = doctorSilentOrbitProject({ projectDirectory: projectDirectory(options) });
  else throw new Error(`Unknown command ${command}. Run silent-orbit help.`);

  if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(`${summaryFor(command, result)}\n`);
  if (command === "doctor" && result.status === "error") process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
