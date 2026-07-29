import fs from "node:fs";
import path from "node:path";

function localTargets(markdown, relativePath) {
  const withoutCode = markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "")
    .replace(/`[^`\r\n]*`/g, "");
  const targets = [];
  const definitions = new Map();

  for (const match of withoutCode.matchAll(/^\s{0,3}\[([^\]]+)]:\s*(?:<([^>]+)>|(\S+))/gm)) {
    const label = match[1].trim().toLowerCase();
    const target = match[2] ?? match[3];
    definitions.set(label, target);
    targets.push(target);
  }
  for (const match of withoutCode.matchAll(/!?\[[^\]]*]\(\s*(?:<([^>]+)>|([^)\s]+))(?:\s+["'][^"']*["'])?\s*\)/g)) {
    targets.push(match[1] ?? match[2]);
  }
  for (const match of withoutCode.matchAll(/!?\[([^\]]+)]\[([^\]]*)]/g)) {
    const label = (match[2] || match[1]).trim().toLowerCase();
    if (!definitions.has(label)) {
      throw new Error(`${relativePath} uses a missing Markdown link definition: ${label}`);
    }
  }
  for (const match of withoutCode.matchAll(/<(?:a|img|source|video|audio|script|link)\b[^>]*?\b(?:href|src)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)) {
    targets.push(match[1] ?? match[2] ?? match[3]);
  }
  return targets;
}

export function assertLocalMarkdownLinks({ rootDir, filePaths, context }) {
  for (const filePath of filePaths) {
    const relativePath = path.relative(rootDir, filePath).split(path.sep).join("/");
    const markdown = fs.readFileSync(filePath, "utf8");
    for (const rawTarget of localTargets(markdown, relativePath)) {
      if (/^(?:https?:|mailto:|tel:|data:|#|\/\/)/i.test(rawTarget)) continue;
      const targetWithoutFragment = rawTarget.split(/[?#]/, 1)[0];
      if (!targetWithoutFragment) continue;
      let decodedTarget;
      try {
        decodedTarget = decodeURIComponent(targetWithoutFragment);
      } catch {
        throw new Error(`${relativePath} has a malformed local link target: ${rawTarget}`);
      }
      const resolvedTarget = path.resolve(path.dirname(filePath), decodedTarget);
      const relativeTarget = path.relative(rootDir, resolvedTarget);
      if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) {
        throw new Error(`${relativePath} links outside the ${context}: ${rawTarget}`);
      }
      if (!fs.existsSync(resolvedTarget)) {
        throw new Error(`${relativePath} has a missing ${context} Markdown target: ${rawTarget}`);
      }
    }
  }
}
