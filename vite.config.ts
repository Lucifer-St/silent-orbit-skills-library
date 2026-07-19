import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
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

function copySocialPreview(): Plugin {
  return {
    name: "copy-social-preview",
    closeBundle() {
      const sourcePath = flatPublicLayout
        ? path.join(projectDir, "assets", "readme", "social-preview.png")
        : path.join(projectDir, "docs", "public-release", "assets", "social-preview.png");
      const outputPath = path.join(path.resolve(projectDir, outDir), "social-preview.png");
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.copyFileSync(sourcePath, outputPath);
    },
  };
}

export default defineConfig({
  base: "/",
  plugins: [react(), copySocialPreview()],
  build: {
    outDir,
    emptyOutDir: true,
  },
});
