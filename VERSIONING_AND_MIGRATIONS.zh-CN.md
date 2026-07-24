# 版本、兼容、迁移与弃用政策

本政策适用于 Silent Orbit Public Generator、JSON contracts、`silent-orbit`
CLI 与随包提供的 Agent Skills。

## Phase 6A 候选版本

| Surface | 候选版本 | 兼容承诺 |
|---|---:|---|
| Repository / package | `0.11.0-beta.4` | `0.11.x` beta 系列 |
| CLI interface | `0.4.0` | `0.4.x` 命令与 JSON 系列 |
| JSON Schemas | `v1` | 以 `schemas/schema-lock.v1.json` 为准 |
| Runtime | Node.js 24 | 发布门禁验证版本 |
| Trusted manager | `skills@1.5.20` | Phase 5C 固定内容身份 |

这是 Pre-release，不是 `v1.0.0`，也不会发布到 npm registry。

## SemVer 规则

Package 版本与 CLI interface 版本相互独立：

- package patch 不得故意破坏已有 package、Agent Skill、Schema 或网站契约；
- 在 `1.0.0` 之前，package minor 只有在 release notes 明确说明、提供迁移或
  替代路径并满足弃用窗口后，才可包含 breaking change；
- CLI major 表示命令、参数、退出状态或 JSON contract 的 breaking change；
  minor 只增加兼容能力；patch 保持已记录的 interface；
- 仅网站修复不要求调整 CLI version。

## 固定的 v1 Schema

`schemas/schema-lock.v1.json` 记录全部 `*.v1.schema.json` 在统一 LF 换行后的
SHA-256。release gate 会在 Windows、macOS 与 Linux 上重新计算，并拒绝缺失、
新增或发生变化的 v1 Schema。

发布 `v0.11.0-beta.4` 后，v1 Schema 内容固定。字段含义、required fields、
校验行为或允许值如需变化，必须新增 `*.v2.schema.json` 和
`schemaVersion: 2`，同时提供兼容决策、可 dry-run 的确定性迁移、写入前备份、
写入后 receipt，以及 v1/v2 fixtures。

示例与说明文字可以修正，但不能改变 Schema digest。Schema lock 自身独立版本化。

## 当前迁移基线

v1 系列内部无需迁移。`0.11.0-beta.4` 读写固定的 v1 contracts。遇到不支持的
新 schema 时必须停止，不能静默转换。

未来 v2 迁移必须由用户显式启动并在本地完成；不得覆盖唯一副本，不得发布私有
runtime state，也不得在新文件通过校验前报告成功。不支持后台自动迁移。

## 弃用窗口

- 在 CLI help、Schema 或文档以及 release notes 中标记弃用项；
- 至少保留一个后续 package minor 系列且不少于 30 天，以较长者为准；
- 删除前先发布替代方案与迁移说明；
- 安全或隐私紧急事件可以缩短窗口，但 release notes 必须说明原因和恢复路径。

`check-and-update` 是 `0.11.x` 的 canonical 名称。`check-updates` 与
source-managed `update` 只是同一 guarded Core 的兼容入口，目前没有删除日期。

## 能力边界

唯一 supported mutation 是 host 注入、经过复核的 GitHub source-managed
check-and-update 批次。standalone real-profile mutation、未知来源安装、freeze、
删除、Plugin mutation 和 System mutation 仍为 `unknown`、`unsupported` 或单独门禁。
