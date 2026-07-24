# 安装与升级

Silent Orbit `v0.11.0-beta.4` 只通过 GitHub Pre-release 分发，不得按 package
名称从 npm registry 安装。

## 要求

- Node.js 24 与 npm；
- 下方 Windows 命令使用 PowerShell；
- 已下载并通过 `SHA256SUMS.txt` 校验的 tarball；
- 已复核的安装目标。CLI 默认使用项目级安装。

SHA-256 校验与首次生成请按 `GENERATOR_QUICKSTART.zh-CN.md` 执行。

## 安装或升级 CLI

项目级安装：

```powershell
npm install --save-dev .\silent-orbit-skills-library-0.11.0-beta.4.tgz
npx silent-orbit --version
```

已有全局文件安装：

```powershell
npm install --global .\silent-orbit-skills-library-0.11.0-beta.4.tgz
silent-orbit --version
```

预期 CLI interface version 为 `0.4.0`。升级真实项目之前备份
`.silent-orbit/`，升级后运行 `doctor` 与 `audit`；这两个命令都不授权 mutation。

## 安装或更新全局 Agent Skills

tarball 包含 `skills-library-maintenance` 与 `manage-skill-cosmos`。写入前必须审阅
Release 内和现有安装中的 `SKILL.md`。如果现有差异不能追溯到已知 Release 或已复核
source commit，停止并处理冲突。

在临时 consumer project 安装 tarball 后：

```powershell
$skillSource = (Resolve-Path -LiteralPath .\node_modules\silent-orbit-skills-library).Path
Get-Content -LiteralPath (Join-Path $skillSource 'skills\skills-library-maintenance\SKILL.md')
Get-Content -LiteralPath (Join-Path $skillSource 'skills\manage-skill-cosmos\SKILL.md')
npx skills add $skillSource --skill skills-library-maintenance --agent codex --global --copy -y
npx skills add $skillSource --skill manage-skill-cosmos --agent codex --global --copy -y
npx skills list --global --agent codex --json
```

Windows 必须使用绝对路径。把写入前 folder backup 和 Release checksum 保存在私有
handoff receipt 中。安装命令可能替换同名 Skill，因此先审阅和备份。

本步骤不授权 `npx skills check`、`update` 或 `upgrade`。在 `skills@1.5.20`
中，这些名称可能进入 direct-write check-and-update。

## 升级后检查

1. 重新读取两个已安装 `SKILL.md`；
2. 比较安装目录和已验证 Release 的 folder hashes；
3. 运行 `skills-library-maintenance scan` 与 `plan`；
4. 完成项目 `doctor`、`audit` 与一次确定性 sample generation；
5. 继续阻止删除、freeze、Plugin/System mutation 与未知来源 mutation。

真实 maintenance 之前阅读 `RECOVERY.zh-CN.md`、`PRIVACY.zh-CN.md` 与
`VERSIONING_AND_MIGRATIONS.zh-CN.md`。
