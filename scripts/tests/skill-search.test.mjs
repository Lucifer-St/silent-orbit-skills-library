import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

async function loadSearch() {
  const server = await createServer({ configFile: false, logLevel: "silent", root: process.cwd(), server: { middlewareMode: true } });
  try {
    return await server.ssrLoadModule("/src/lib/skillSearch.ts");
  } finally {
    await server.close();
  }
}

async function loadIndexes() {
  const server = await createServer({ configFile: false, logLevel: "silent", root: process.cwd(), server: { middlewareMode: true } });
  try {
    return await server.ssrLoadModule("/src/data/indexes.ts");
  } finally {
    await server.close();
  }
}

test("normalizes mixed Chinese and English request text", async () => {
  const { normalizeSearchText, tokenizeSearchText } = await loadSearch();
  assert.equal(normalizeSearchText("  帮我找：AI  新闻！ "), "帮我找 ai 新闻");
  assert.equal(normalizeSearchText("消息和工作区内容"), "消息和工作区内容");
  assert.deepEqual(tokenizeSearchText("帮我找过去一周 AI 新闻"), ["过去", "去一", "一周", "ai", "新闻"]);
});

test("keeps messaging queries separate from AI news aliases", async () => {
  const { rankSkillRecords } = await loadSearch();
  const skills = [
    { name: "teams-messages", trigger: "$teams-messages", description: "发送 Teams 消息和回复", category: "协作", library_key: "teams", library_title: "Teams" },
    { name: "teams-news", trigger: "$teams-news", description: "整理 Teams 新闻", category: "研究", library_key: "teams", library_title: "Teams" },
    { name: "aihot", trigger: "$aihot", description: "一周 AI 新闻", category: "研究", library_key: "private", library_title: "私人工具箱" },
  ];
  const ranked = rankSkillRecords(skills, new Map(), { text: "Teams 消息", category: "all", sourceKind: "all", starredOnly: false });
  assert.equal(ranked[0]?.skill.name, "teams-messages");
  assert.ok(!ranked.some((result) => result.skill.name === "aihot"));
});

test("weights name and trigger above description and category", async () => {
  const { rankSkillRecords } = await loadSearch();
  const skills = [
    { name: "aihot", trigger: "$aihot", description: "一周 AI 新闻", category: "个人工具", library_key: "private", library_title: "私人工具箱" },
    { name: "news-helper", trigger: "$news-helper", description: "AI 新闻", category: "研究", library_key: "research", library_title: "研究" },
  ];
  const results = rankSkillRecords(skills, new Map(), { text: "aihot AI 新闻", category: "all", sourceKind: "all", starredOnly: false });
  assert.equal(results[0].skill.name, "aihot");
});

test("ranks real catalog fixtures within the top three", async () => {
  const { rankSkills } = await loadIndexes();
  const fixtures = [
    ["过去一周 AI 新闻", "aihot"],
    ["过去一周内值得关注的 AI 消息", "aihot"],
    ["Obsidian vault 知识库维护", "obsidian-vault"],
    ["frontend app builder 界面", "frontend-app-builder"],
    ["web design guidelines 视觉交互检查", "web-design-guidelines"],
    ["imagegen 设计概念图", "imagegen"],
    ["安装 Codex skills", "skill-installer"],
    ["当前任务该用哪个 skill", "find-skills"],
    ["中文润色 humanizer", "humanizer-zh"],
    ["transcribe 音频转录", "transcribe"],
    ["screenshot 页面证据", "screenshot"],
    ["windows 工作站维护", "windows-workstation-baseline"],
    ["security best practices", "security-best-practices"],
    ["jupyter notebook 实验", "jupyter-notebook"],
    ["HTML PPT 演示", "html-ppt"],
    ["interview prep 面试", "interview-prep"],
    ["Fengxue AI weekly", "fengxue-ai-weekly"],
    ["obsidian markdown 笔记", "obsidian-markdown"],
    ["浏览器 control chrome", "control-chrome"],
  ];
  const firstPlaceSkills = new Set(["aihot", "skill-installer", "find-skills"]);

  for (const [text, expectedSkill] of fixtures) {
    const topThree = rankSkills(text, "all", "all", false).slice(0, 3).map((result) => result.skill.name);
    assert.ok(topThree.includes(expectedSkill), `${expectedSkill} should rank in the top three for ${text}; received ${topThree.join(", ")}`);
    if (firstPlaceSkills.has(expectedSkill)) assert.equal(topThree[0], expectedSkill, `${expectedSkill} should rank first for ${text}`);
  }
});

test("curates visual UI audit intent into trustworthy top results", async () => {
  const { rankSkills } = await loadIndexes();
  const topThree = rankSkills("检查网站 UI 审美与交互", "all", "all", false)
    .slice(0, 3)
    .map((result) => result.skill.name);

  assert.equal(topThree.length, 3);
  assert.deepEqual(new Set(topThree), new Set([
    "audit",
    "frontend-testing-debugging",
    "web-design-guidelines",
  ]));
});
