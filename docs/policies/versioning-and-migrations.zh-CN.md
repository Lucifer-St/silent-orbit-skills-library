# 版本、兼容、迁移与弃用政策

本政策适用于 Silent Orbit Public Generator、JSON contracts、`silent-orbit`
CLI 与随包提供的 Agent Skills。

## 候选版本

| Surface | 候选版本 | 兼容承诺 |
|---|---:|---|
| Repository / package | `0.13.0-beta.1` | `0.13.x` beta 系列 |
| CLI interface | `0.6.0` | 固定 generator v1 与 customization v2，加上 experience v3 |
| JSON Schemas | 固定 `v1` + 固定新增 `v2` + 新增 `v3` | 以三个 Schema lock 为准 |
| Runtime | Node.js 24 | 发布门禁验证版本 |
| Trusted manager | `skills@1.5.20` | Phase 5C 固定内容身份 |

这是 Pre-release，不是 `v1.0.0`，也不会发布到 npm registry。

### v0.13.0-beta.1 新增式修复候选版

本 prerelease 在已发布 beta.1 之上提供 CLI `0.6.0` 的兼容新增，不修改 beta.1 的 tag、
资产或历史说明。它保留全部 frozen v1 schema 和 v2 schema digest，新增明确版本化的
`CustomizationExperienceV3`、`CustomizationOnboardingV3`、
`CustomizationInterviewV3` companion 与带版本的独立新手真人报告 schema，
统一由独立 `schema-lock.v3.json` 固定。

CLI `0.6.0` 新增只读 preflight、明确同意后的项目级 setup、持久化逐题 interview、
`prepare --from-interview` 与自然语言 `respond`。旧 v2 request/状态/manifest/handoff
保持可读；v3 文件不塞入 v2 schema，也不静默迁移旧状态。旧项目在第一次使用新手
流程时先 preflight；只有用户同意才创建项目内 onboarding sidecar。拒绝时不迁移、
不写入。
原有 `capabilities` 默认响应继续保持固定的 `SilentOrbitCapabilitiesV2`；需要新增
能力的调用方显式使用 `capabilities --contract v3`，取得 additive
`SilentOrbitCapabilitiesV3`。

`0.12.0-beta.1` 在不改变固定 v1 generator contract 的前提下加入独立审美定制
流程。CLI `0.5.0` 新增 `capabilities` 和
`customize status|prepare|decide|refresh|doctor`。v2 sidecar 支持恰好两套
结构上真正不同的方向、keep/adjust/reject/redo 历史、私有的偏好摘要，以及
刷新时样式不漂移。旧 v1 项目仍可读取；重新运行 `generate` 后会增加
`frontend-handoff.v2.json`，之后才可开始定制。

## SemVer 规则

Package 版本与 CLI interface 版本相互独立：

- package patch 不得故意破坏已有 package、Agent Skill、Schema 或网站契约；
- 在 `1.0.0` 之前，package minor 只有在 release notes 明确说明、提供迁移或
  替代路径并满足弃用窗口后，才可包含 breaking change；
- CLI major 表示命令、参数、退出状态或 JSON contract 的 breaking change；
  minor 只增加兼容能力；patch 保持已记录的 interface；
- 仅网站修复不要求调整 CLI version。

## 固定的 v1 Schema 与新增 v2 sidecar

`schemas/schema-lock.v1.json` 记录全部 `*.v1.schema.json` 在统一 LF 换行后的
SHA-256。release gate 会在 Windows、macOS 与 Linux 上重新计算，并拒绝缺失、
新增或发生变化的 v1 Schema。

发布 `v0.11.0-beta.4` 后，v1 Schema 内容固定。字段含义、required fields、
校验行为或允许值如需变化，必须新增 `*.v2.schema.json` 和
`schemaVersion: 2`，同时提供兼容决策、可 dry-run 的确定性迁移、写入前备份、
写入后 receipt，以及 v1/v2 fixtures。

示例与说明文字可以修正，但不能改变 Schema digest。Schema lock 自身独立版本化。

`schemas/schema-lock.v2.json` 只固定审美定制与 frontend handoff sidecar，
不会重新定义或迁移 v1 project、inventory、library 或 site-manifest 字段。

`schemas/schema-lock.v3.json` 固定上述三个 additive newcomer companion 与
`novice-human-test-report.v1` schema。
它明确声明 `changesV1: false`、`changesV2: false`；任何未来不兼容变化必须新增
schema 版本和迁移策略，不能覆盖 v3 或偷改 v2。

## 当前迁移基线

v1 系列内部无需迁移。`0.13.0-beta.1` 继续读写固定的 v1 contracts。遇到不支持的
新 schema 时必须停止，不能静默转换。

customization v2 是 sidecar，不是 v1 migration。先显式运行 `generate` 生成
机器 handoff，再开始定制；不会执行后台迁移。

## 弃用窗口

- 在 CLI help、Schema 或文档以及 release notes 中标记弃用项；
- 至少保留一个后续 package minor 系列且不少于 30 天，以较长者为准；
- 删除前先发布替代方案与迁移说明；
- 安全或隐私紧急事件可以缩短窗口，但 release notes 必须说明原因和恢复路径。

`check-and-update` 仍是 canonical 名称。`check-updates` 与
source-managed `update` 只是同一 guarded Core 的兼容入口，目前没有删除日期。

## 能力边界

唯一 supported mutation 是 host 注入、经过复核的 GitHub source-managed
check-and-update 批次。standalone real-profile mutation、未知来源安装、freeze、
删除、Plugin mutation 和 System mutation 仍为 `unknown`、`unsupported` 或单独门禁。
