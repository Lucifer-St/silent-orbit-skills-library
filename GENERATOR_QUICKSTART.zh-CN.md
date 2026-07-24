# Silent Orbit Public Generator 快速开始

本指南从 GitHub Pre-release 安装 `v0.11.0-beta.4` 产物，并生成一个经过公开边界复核的最小 Skill Library。本包不发布到 npm registry。

## 1. 下载并校验产物

环境要求：Node.js 24 和 npm。

从 [`v0.11.0-beta.4` Pre-release](https://github.com/Lucifer-St/silent-orbit-skills-library/releases/tag/v0.11.0-beta.4) 下载：

- `silent-orbit-skills-library-0.11.0-beta.4.tgz`
- `SHA256SUMS.txt`

把两个文件放在同一目录，使用 PowerShell 在安装前校验 tarball：

```powershell
$expected = (Get-Content -LiteralPath .\SHA256SUMS.txt | Where-Object { $_ -match 'silent-orbit-skills-library-0\.11\.0-beta\.4\.tgz$' }).Split()[0]
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath .\silent-orbit-skills-library-0.11.0-beta.4.tgz).Hash.ToLowerInvariant()
if ($actual -ne $expected.ToLowerInvariant()) { throw 'Silent Orbit tarball checksum mismatch.' }
```

## 2. 安装 CLI

优先选择项目级安装：

```powershell
npm install --save-dev .\silent-orbit-skills-library-0.11.0-beta.4.tgz
npx silent-orbit --version
```

只有确实需要把 `silent-orbit` 放进用户 PATH 时才使用全局安装：

```powershell
npm install --global .\silent-orbit-skills-library-0.11.0-beta.4.tgz
silent-orbit --version
```

package / repository release version 是 `0.11.0-beta.4`；当前 source 报告独立的 CLI interface version `0.4.0`，属于 `0.4.x` compatibility family。package 的 patch 更新不会自动改变 CLI version；只有命令、参数或 JSON contract 变化时才调整 CLI version。

## 3. 可选 Agent Skills

先阅读再安装随包提供的 Skill。`build-skill-cosmos` 是生成与公开边界复核层；
`audit-skill-cosmos` 只解释 read-only health report；`manage-skill-cosmos` 解释
guarded management plan。这些项目级 Skills 不会自行发现或修改真实 global profile，
也不会执行部署。

```powershell
$skillSource = (Resolve-Path -LiteralPath .\node_modules\silent-orbit-skills-library).Path
Get-Content -LiteralPath (Join-Path $skillSource 'skills\build-skill-cosmos\SKILL.md')
npx skills add $skillSource --skill build-skill-cosmos --agent codex --copy -y
Get-Content -LiteralPath (Join-Path $skillSource 'skills\audit-skill-cosmos\SKILL.md')
npx skills add $skillSource --skill audit-skill-cosmos --agent codex --copy -y
Get-Content -LiteralPath (Join-Path $skillSource 'skills\manage-skill-cosmos\SKILL.md')
npx skills add $skillSource --skill manage-skill-cosmos --agent codex --copy -y
```

Windows 上必须先用 `Resolve-Path` 得到绝对本地来源路径，否则 Skills installer 会把相对路径误判为 Git 仓库。只安装当前项目需要的 Skills；只使用 CLI 时可以跳过。

Release 还包含 `skills-library-maintenance` host。全局交接会替换现有同名 copy，
因此必须先与已验证 Release 比较并保存完整 folder backup。若现有差异不能追溯到
已知 Release 或已复核 source commit，立即停止。

```powershell
Get-Content -LiteralPath (Join-Path $skillSource 'skills\skills-library-maintenance\SKILL.md')
npx skills add $skillSource --skill skills-library-maintenance --agent codex --global --copy -y
npx skills add $skillSource --skill manage-skill-cosmos --agent codex --global --copy -y
```

安装不授权执行 `npx skills check`、`update` 或 `upgrade`；固定 manager 的这些入口
可能更新匹配的 trusted source。完整交接见 `INSTALLATION_AND_UPGRADE.zh-CN.md` 与
`RECOVERY.zh-CN.md`。

## 4. 首次生成

新建 `starter.source-import.json`：

```json
{
  "schemaVersion": 1,
  "source": {
    "key": "starter",
    "label": "Starter Skills",
    "providerKind": "json-import",
    "updateChannel": "unknown"
  },
  "skills": [
    {
      "name": "research-compass",
      "description": "Research public sources and preserve citations.",
      "trigger": "$research-compass",
      "origin": "third-party",
      "visibility": "public"
    }
  ]
}
```

保留 `visibility: "public"` 就是在作出明确的公开决定，必须先复核元数据。尚未决定时使用 `review-required`；绝不能进入公开生成数据时使用 `local-only`。

执行完整的首次使用顺序。若选择了全局安装，把 `npx silent-orbit` 换成 `silent-orbit`：

```powershell
npx silent-orbit init .\my-skill-cosmos --title "My Skill Cosmos" --project-id my-skill-cosmos --json
npx silent-orbit import --project .\my-skill-cosmos --file .\starter.source-import.json --json
npx silent-orbit scan --project .\my-skill-cosmos --json
npx silent-orbit analyze --project .\my-skill-cosmos --json
npx silent-orbit diff --project .\my-skill-cosmos --json
npx silent-orbit generate --project .\my-skill-cosmos --json
npx silent-orbit doctor --project .\my-skill-cosmos --json
npx silent-orbit audit --project .\my-skill-cosmos --json
```

最终必须确认 `doctor.status` 为 `ok`。生成的 Reference Site 与 `frontend-handoff.md` 位于 `my-skill-cosmos/dist/`；私有 import、analysis、receipt 与运行时状态留在 `my-skill-cosmos/.silent-orbit/`，不得发布。

## Phase 5C trusted-source maintenance 边界

`silent-orbit manage plan --request <management-request.json> --json` 只生成确定性计划。`silent-orbit manage apply --plan <management-plan.json> --dry-run --json` 只验证计划，不创建事务、备份、回执，也不写入目标。

Phase 5C 支持 host 注入的 `skills@1.5.20` check-and-update，一次批准覆盖一个经过复核的 GitHub source-managed global Skill 批次。host 必须保存私有可恢复内容，执行 rescan/diff，同步 Library/Obsidian，并验证收敛；只有 manager 或验证失败时才恢复。Plugin、System、删除与未知来源安装仍需单独门禁。standalone CLI 没有 host，不能发现或连接真实全局 Skill root。

原生 update 是受信任外部管理器的直接写入路径。计划和回执必须明确记录：不经过 Core writer、没有独立 staging、没有原生事务回滚，并且 `nativeTransactionGuarantee: false`。Silent Orbit 的 selected-Skill snapshot、rescan、verification 与 failure-only restore 不能被描述为原生 manager 保证。install、freeze、remove 与 restore 不属于本批次支持范围。运行时计划、root、lock、backup 和 receipt 都属于私有数据，绝不能进入 Public Export。

## 发布边界

Public repository 保留 44-Skill NVIDIA Alpha 作为历史固定验收夹具，但它不属于 installable Generator package，也不是 Production 内容。Git-connected Netlify Deploy Preview 通过 `npm run build:alpha-preview` 构建该夹具；Production 继续通过 `npm run build` 使用经复核的 142-Skill projection，可编辑的个人 inventory 与 curation 只保留在 Private。

旧的 Phase 4A/4B 名称属于 **Website Release Track**，不是 Generator phase。Website Release Phase 4A 是 public beta launch；Website Release Phase 4B 仍需要外部真人证据。Generator 使用独立的 Phase 1A-1E、Phase 2A 与 Phase 2B 序列。
