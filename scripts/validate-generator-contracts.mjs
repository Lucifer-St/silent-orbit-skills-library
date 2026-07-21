import fs from "node:fs";
import path from "node:path";
import { createLegacyGeneratorModel } from "./lib/generator-contracts.mjs";
import { buildPublicData } from "./public-data.mjs";
import { projectDir, resolveDataDir } from "./project-layout.mjs";

const schemaFiles = [
  "project-config.v1.schema.json",
  "inventory-snapshot.v1.schema.json",
  "library-snapshot.v1.schema.json",
  "site-manifest.v1.schema.json",
  "source-import.v1.schema.json",
  "silent-orbit-config.v1.schema.json",
  "analysis-overrides.v1.schema.json",
  "analysis-report.v1.schema.json",
  "phase1e-alpha-receipt.v1.schema.json",
];
for (const fileName of schemaFiles) {
  const schema = JSON.parse(fs.readFileSync(path.join(projectDir, "schemas", fileName), "utf8"));
  if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
    throw new Error(`${fileName} must declare JSON Schema 2020-12.`);
  }
}

const sourceDir = resolveDataDir(projectDir);
const read = (fileName) => JSON.parse(fs.readFileSync(path.join(sourceDir, fileName), "utf8"));
const input = {
  skills: read("skills.json"),
  libraries: read("libraries.json"),
  categoryUnits: read("category-units.json"),
  personalSkills: read("personal-skills.json"),
  changes: read("changes.json"),
  starredSkills: read("starred-skills.json"),
  relations: read("relations.json"),
  skillDetails: read("skill-details.json"),
  maintenanceStatus: read("maintenance-status.json"),
};
const data = buildPublicData(input);
const generatedAt = `${data.maintenanceStatus.snapshotDate}T12:00:00.000Z`;
const model = createLegacyGeneratorModel({ data, generatedAt, sourceDir: "outputs/data" });
const categoryCounts = model.appData.categoryUnits.map((category) => category.skill_count).join(",");

console.log([
  "Generator contracts passed.",
  `skills=${model.librarySnapshot.skills.length}`,
  `libraries=${model.librarySnapshot.libraries.length}`,
  `categories=${model.librarySnapshot.categories.length}`,
  `memberships=${model.librarySnapshot.categoryMemberships.length}`,
  `categoryCounts=${categoryCounts}`,
].join(" "));
