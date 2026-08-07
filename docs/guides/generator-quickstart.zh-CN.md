# Silent Orbit Public Generator 快速开始

本指南从 GitHub Pre-release 安装 `v0.13.1-beta.1` 产物，并生成一个经过公开边界复核的最小 Skill Library。本包不发布到 npm registry。

独立新手测试只需发送该 Release 的 `SILENT_ORBIT_NOVICE_HUMAN_TEST_PACK.zh-CN.md`。Agent 会主持只读 preflight、同意门、逐题访谈、两方向比较、首选视图保持、真实结构重做，并生成隐私安全的 Issue Form 等价回执。

## 1. 下载并校验产物

环境要求：Node.js 24 和 npm。v1 的 Native 支持目标为 Windows、Linux 与
macOS。

Docker 使用独立 Home，默认看不到宿主 Skills。在执行 `codex-global` scan
前，必须把宿主 `.agents/skills` 目录挂载到容器 profile，并把 `HOME`（或
`USERPROFILE`）指向该 profile。scan/generate/audit 应使用只读挂载。未挂载
时返回零 Skills，不能当作宿主确实没有 Skills 的证据。

Hosted Silent Orbit 站点只用于浏览，不能检查或修改访客本地 Skill 环境。

从 [`v0.13.1-beta.1` Pre-release](https://github.com/Lucifer-St/silent-orbit-skills-library/releases/tag/v0.13.1-beta.1) 下载：

- `silent-orbit-skills-library-0.13.1-beta.1.tgz`
- `SHA256SUMS.txt`

把两个文件放在同一目录。只校验文件名精确匹配 beta.9 tarball 且唯一的一行；
缺行、重复行或旧版本行都不能代替它。

Windows PowerShell：

```powershell
$tarball = 'silent-orbit-skills-library-0.13.1-beta.1.tgz'
$matches = @(Get-Content -LiteralPath .\SHA256SUMS.txt | Where-Object { $_ -match '^(?<hash>[0-9A-Fa-f]{64})\s+\*?silent-orbit-skills-library-0\.13\.1-beta\.1\.tgz$' })
if ($matches.Count -ne 1) { throw "必须且只能找到一条 $tarball 校验记录。" }
$expected = ([regex]::Match($matches[0], '^[0-9A-Fa-f]{64}').Value).ToLowerInvariant()
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath ".\$tarball").Hash.ToLowerInvariant()
if ($actual -ne $expected) { throw 'Silent Orbit tarball 校验失败。' }
```

Linux：

```sh
tarball='silent-orbit-skills-library-0.13.1-beta.1.tgz'
checksum_line="$(awk -v name="$tarball" '$2 == name || $2 == "*" name { print }' SHA256SUMS.txt)"
match_count="$(printf '%s\n' "$checksum_line" | awk 'NF { count += 1 } END { print count + 0 }')"
[ "$match_count" -eq 1 ] || { echo "必须且只能找到一条 $tarball 校验记录。" >&2; exit 1; }
printf '%s\n' "$checksum_line" | sha256sum --check -
```

macOS：

```sh
tarball='silent-orbit-skills-library-0.13.1-beta.1.tgz'
checksum_line="$(awk -v name="$tarball" '$2 == name || $2 == "*" name { print }' SHA256SUMS.txt)"
match_count="$(printf '%s\n' "$checksum_line" | awk 'NF { count += 1 } END { print count + 0 }')"
[ "$match_count" -eq 1 ] || { echo "必须且只能找到一条 $tarball 校验记录。" >&2; exit 1; }
expected="$(printf '%s\n' "$checksum_line" | awk '{ print tolower($1) }')"
actual="$(shasum -a 256 "$tarball" | awk '{ print tolower($1) }')"
[ "$actual" = "$expected" ] || { echo 'Silent Orbit tarball 校验失败。' >&2; exit 1; }
printf '校验通过：%s\n' "$actual"
```

## 2. 安装 CLI

优先选择项目级安装：

```powershell
npm install --save-dev .\silent-orbit-skills-library-0.13.1-beta.1.tgz
npx silent-orbit --version
```

只有确实需要把 `silent-orbit` 放进用户 PATH 时才使用全局安装：

```powershell
npm install --global .\silent-orbit-skills-library-0.13.1-beta.1.tgz
silent-orbit --version
```

package / repository release version 是 `0.13.1-beta.1`；当前 source 报告独立的 CLI interface version `0.6.0`，属于 `0.6.x` compatibility family。package 的 patch 更新不会自动改变 CLI version；只有命令、参数或 JSON contract 变化时才调整 CLI version。

## 3. 可选 Agent Skills

先阅读再安装随包提供的 Skill。`build-skill-cosmos` 是生成与公开边界复核层；`customize-skill-cosmos` 负责私有审美定制流程；
`audit-skill-cosmos` 只解释 read-only health report；`manage-skill-cosmos` 解释
guarded management plan。这些项目级 Skills 不会自行发现或修改真实 global profile，
也不会执行部署。

```powershell
$skillSource = (Resolve-Path -LiteralPath .\node_modules\silent-orbit-skills-library).Path
Get-Content -LiteralPath (Join-Path $skillSource 'skills\build-skill-cosmos\SKILL.md')
npx skills@1.5.20 add $skillSource --skill build-skill-cosmos --agent codex --copy -y
Get-Content -LiteralPath (Join-Path $skillSource 'skills\customize-skill-cosmos\SKILL.md')
npx skills@1.5.20 add $skillSource --skill customize-skill-cosmos --agent codex --copy -y
Get-Content -LiteralPath (Join-Path $skillSource 'skills\audit-skill-cosmos\SKILL.md')
npx skills@1.5.20 add $skillSource --skill audit-skill-cosmos --agent codex --copy -y
Get-Content -LiteralPath (Join-Path $skillSource 'skills\manage-skill-cosmos\SKILL.md')
npx skills@1.5.20 add $skillSource --skill manage-skill-cosmos --agent codex --copy -y
```

Windows 上必须先用 `Resolve-Path` 得到绝对本地来源路径，否则 Skills installer 会把相对路径误判为 Git 仓库。只安装当前项目需要的 Skills；只使用 CLI 时可以跳过。

Release 还包含 `skills-library-maintenance` host。全局交接会替换现有同名 copy，
因此必须先与已验证 Release 比较并保存完整 folder backup。若现有差异不能追溯到
已知 Release 或已复核 source commit，立即停止。
必须使用 beta.6 或更高版本；beta.5 仅保留为 Phase 6A package 候选证据。

```powershell
Get-Content -LiteralPath (Join-Path $skillSource 'skills\skills-library-maintenance\SKILL.md')
npx skills@1.5.20 add $skillSource --skill skills-library-maintenance --agent codex --global --copy -y
npx skills@1.5.20 add $skillSource --skill manage-skill-cosmos --agent codex --global --copy -y
$installedMaintenance = Join-Path $HOME '.agents\skills\skills-library-maintenance'
node (Join-Path $installedMaintenance 'scripts\skills-library.mjs') --help
```

安装不授权执行 `npx skills check`、`update` 或 `upgrade`；固定 manager 的这些入口
可能更新匹配的 trusted source。完整交接见 `installation-and-upgrade.zh-CN.md` 与
`recovery.zh-CN.md`。

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

最终必须确认 `doctor.status` 为 `ok`。生成的 Reference Site、`frontend-handoff.md` 与机器可读的 `frontend-handoff.v2.json` 位于 `my-skill-cosmos/dist/`；私有 import、analysis、receipt 与运行时状态留在 `my-skill-cosmos/.silent-orbit/`，不得发布。

## 5. 可选的个性化审美定制

> `v0.13.1-beta.1` 已通过 CLI `0.6.x` 发布新增式逐题新手流程；它不改写历史
> beta.1 的 tag 或资产，也不能把内部演练当成独立真人验收。

定制以前述有效 v2 handoff 为前提。正式访谈前先运行只读预检：它只解释已有条件、
缺少条件、为什么需要、会写哪个项目文件，以及不会改动的全局/系统范围。需要项目内
设置时，必须先得到用户给出的精确确认 token；拒绝或环境仍不满足时不写入。

```powershell
npx silent-orbit capabilities --contract v3 --json
npx silent-orbit customize preflight --project .\my-skill-cosmos --json
# 只有用户理解说明并明确同意后：
npx silent-orbit customize setup --project .\my-skill-cosmos --confirm '<preflight 给出的精确 token>' --json
npx silent-orbit customize interview start --project .\my-skill-cosmos --json
```

最简单的从零演练入口是把生成好的项目交给 Agent 并说：

> 使用 `$customize-skill-cosmos` 带我从只读预检开始；一次只问一个生活化问题，
> 我可以说不知道、跳过或返回修改。先让我确认“你理解的是”，再给我恰好两个方向。

Agent 会依次调用 `interview answer/back/review/confirm`，不会要求新手填写 layout、
density、typography、motion 或 shape。确认后运行：

```powershell
npx silent-orbit customize prepare --project .\my-skill-cosmos --from-interview --json
```

两套方向必须真正可操作，并分别绑定首选默认入口和不同的结构 digest。`目录优先`
首次打开、刷新、移动端和 keep 后都应先显示目录；用户主动切换则保留当次运行时选择。
反馈会区分换皮、当前结构调整和重新设计；“重做地图/节点太挤/连线没意义”必须改变
节点、分组、连线或布局策略，只有 CSS 变化属于失败。选中的结果写入
`customization/current/`，不会覆盖 `dist/`。未来重新生成公开数据后执行：

```powershell
npx silent-orbit customize refresh --project .\my-skill-cosmos --json
npx silent-orbit customize doctor --project .\my-skill-cosmos --json
```

只有 v2 数据 allowlist 正确更新、v3 公共安全结构重新派生、首选入口保持且样式 digest
不变时才算通过。命令、JSON、schema 与 digest 属于高级诊断信息，不应成为新手的
默认界面。这个流程不会安装、更新或删除真实 Skills，也不会发布或部署。

## Phase 5C trusted-source maintenance 边界

`silent-orbit manage plan --request <management-request.json> --json` 只生成确定性计划。`silent-orbit manage apply --plan <management-plan.json> --dry-run --json` 只验证计划，不创建事务、备份、回执，也不写入目标。

Phase 5C 支持 host 注入的 `skills@1.5.20` check-and-update，一次批准覆盖一个经过复核的 GitHub source-managed global Skill 批次。host 必须保存私有可恢复内容，执行 rescan/diff，同步 Library/Obsidian，并验证收敛；只有 manager 或验证失败时才恢复。Plugin、System、删除与未知来源安装仍需单独门禁。standalone CLI 没有 host，不能发现或连接真实全局 Skill root。

原生 update 是受信任外部管理器的直接写入路径。计划和回执必须明确记录：不经过 Core writer、没有独立 staging、没有原生事务回滚，并且 `nativeTransactionGuarantee: false`。Silent Orbit 的 selected-Skill snapshot、rescan、verification 与 failure-only restore 不能被描述为原生 manager 保证。install、freeze、remove 与 restore 不属于本批次支持范围。运行时计划、root、lock、backup 和 receipt 都属于私有数据，绝不能进入 Public Export。

## 发布边界

Public repository 保留 44-Skill NVIDIA Alpha 作为历史固定验收夹具，但它不属于 installable Generator package、当前 PR Preview 或 Production 内容。Git-connected Netlify Deploy Preview 与 Production 都通过 `npm run build` 使用经复核的 153-Skill projection；可编辑的个人 inventory 与 curation 只保留在 Private。

旧的 Phase 4A/4B 名称属于 **Website Release Track**，不是 Generator phase。Website Release Phase 4A 是 public beta launch；Website Release Phase 4B 仍需要外部真人证据。Generator 使用独立的 Phase 1A-1E、Phase 2A 与 Phase 2B 序列。
