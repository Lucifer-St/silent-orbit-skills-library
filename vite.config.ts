import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const flatPublicLayout = fs.existsSync(path.join(projectDir, "data", "skills.json"));
const outDir = process.env.SKILLS_LIBRARY_BUILD_DIR
  ? path.resolve(projectDir, process.env.SKILLS_LIBRARY_BUILD_DIR)
  : flatPublicLayout
    ? "dist"
    : "../../outputs/skill-map-site";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir,
    emptyOutDir: true,
  },
});
