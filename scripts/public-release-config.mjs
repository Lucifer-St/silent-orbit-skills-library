export const visualAssetPolicy = "Excluded from the MIT License. No permission for reuse is granted. Rights are reserved to the extent recognized by applicable law.";

export const dataFileMap = Object.freeze({
  "skills.json": "skills",
  "libraries.json": "libraries",
  "category-units.json": "categoryUnits",
  "personal-skills.json": "personalSkills",
  "changes.json": "changes",
  "starred-skills.json": "starredSkills",
  "relations.json": "relations",
  "skill-details.json": "skillDetails",
  "maintenance-status.json": "maintenanceStatus",
});

export const publicSourceFiles = Object.freeze([
  "docs/architecture/GENERATOR_PHASE1A.md",
  "docs/architecture/GENERATOR_PHASE1B.md",
  "docs/architecture/GENERATOR_PHASE1C.md",
  "docs/architecture/GENERATOR_PHASE1D.md",
  "docs/architecture/GENERATOR_PHASE1E.md",
  "index.html",
  "netlify.toml",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "templates/silent-orbit-v1/index.html",
  "templates/silent-orbit-v1/styles.css",
  "templates/silent-orbit-v1/app.js",
  "templates/reference-index-v1/index.html",
  "templates/reference-index-v1/styles.css",
  "templates/reference-index-v1/app.js",
  "alpha/phase1e/site-data.json",
  "alpha/phase1e/frontend-handoff.md",
  "alpha/phase1e/alpha-source-lock.json",
  "alpha/phase1e/alpha-receipt.json",
]);

export const publicScriptFiles = Object.freeze([
  "capture-visual-qa.mjs",
  "project-layout.mjs",
  "public-data.mjs",
  "public-release-config.mjs",
  "smoke-ui.mjs",
  "sync-data.mjs",
  "validate-generator-contracts.mjs",
  "validate-data.mjs",
  "validate-public-assets.mjs",
  "validate-public-release.mjs",
  "validate-readme.mjs",
  "tests/font-assets.test.mjs",
  "tests/generator-contracts.test.mjs",
  "tests/source-adapters.test.mjs",
  "tests/library-analyzer.test.mjs",
  "tests/silent-orbit-cli.test.mjs",
  "tests/build-skill-cosmos.test.mjs",
  "tests/phase1e-alpha.test.mjs",
  "tests/i18n-metadata.test.mjs",
  "tests/orbit-layout.test.mjs",
  "tests/outcome-policy.test.mjs",
  "tests/public-data.test.mjs",
  "tests/public-maintenance.test.mjs",
  "tests/skill-search.test.mjs",
  "tests/site-release.test.mjs",
  "tests/sync-data.test.mjs",
  "lib/generator-contracts.mjs",
  "lib/source-adapters.mjs",
  "lib/library-analyzer.mjs",
  "lib/silent-orbit-project.mjs",
  "lib/phase1e-alpha.mjs",
  "build-alpha-preview.mjs",
  "silent-orbit.mjs",
]);

export const publicSkillDirectories = Object.freeze([
  "build-skill-cosmos",
]);

export const extraVisualAssetProvenance = Object.freeze({
  "public/assets/branding/favicon.svg": {
    origin: "project-native-vector",
    source: "Project-native one-bit orbit mark created for the Phase 4A public website favicon.",
  },
  "public/assets/galaxy-horizon-drift-v3.png": {
    origin: "curated-project-visual",
    source: "Project-curated runtime horizon visual; retained under the project visual asset policy.",
  },
  "public/assets/system-ecliptic-a.png": {
    origin: "built-in-imagegen",
    source: "Project ImageGen generation, then manually cropped and thresholded to a one-bit 64px system marker.",
  },
  "public/assets/system-ecliptic-b.png": {
    origin: "built-in-imagegen",
    source: "Project ImageGen generation, then manually cropped and thresholded to a one-bit 64px system marker.",
  },
  "public/assets/system-ecliptic-c.png": {
    origin: "built-in-imagegen",
    source: "Project ImageGen generation, then manually cropped and thresholded to a one-bit 64px system marker.",
  },
});

export const fontProvenance = Object.freeze({
  "public/fonts/fusion-pixel/fusion-pixel-12px-proportional-subset.woff2": {
    origin: "Fusion Pixel Font 2026.07.01 web subset",
    source: "https://github.com/TakWolf/fusion-pixel-font/releases/tag/2026.07.01",
    license: "SIL Open Font License 1.1",
  },
  "public/fonts/fusion-pixel/OFL.txt": {
    origin: "Fusion Pixel Font 2026.07.01 license",
    source: "https://raw.githubusercontent.com/TakWolf/fusion-pixel-font/2026.07.01/LICENSE-OFL",
    license: "SIL Open Font License 1.1",
  },
  "public/fonts/sarasa-term-sc/sarasa-term-sc-regular-subset.woff2": {
    origin: "Sarasa Gothic v1.0.40 web subset",
    source: "https://github.com/be5invis/Sarasa-Gothic/releases/tag/v1.0.40",
    license: "SIL Open Font License 1.1",
  },
  "public/fonts/sarasa-term-sc/OFL.txt": {
    origin: "Sarasa Gothic v1.0.40 license",
    source: "https://raw.githubusercontent.com/be5invis/Sarasa-Gothic/v1.0.40/LICENSE",
    license: "SIL Open Font License 1.1",
  },
});
