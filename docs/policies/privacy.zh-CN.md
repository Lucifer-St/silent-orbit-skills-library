# 隐私政策与数据边界

Silent Orbit 是 local-first 工具。托管网站是静态站点，不能检查、安装、更新或删除
访客电脑上的文件。

## Public Release 可以包含

- `public` 与 `creator-showcase` catalog metadata；
- 可复用 Core、Schemas、CLI 和经过清理的 Agent Skill instructions；
- synthetic / disposable fixtures 与确定性发布证据；
- 公开 source URL、license notices 与项目策展的短摘要。

Public Export 禁止包含私有路径、installed folder hash、lock、backup、可恢复 Skill
内容、raw manager output、真实运行 receipt、prompt、session、usage evidence、
Obsidian 内容、credential、account、personal outcome 或 `local-only` 记录。

## 浏览器数据

网站只在浏览器 `localStorage` 中保存可选 Outcome。项目没有 backend、account、
analytics、advertising、behavior tracking 或跨设备同步。清除该站点 storage 会删除
这个浏览器 origin 的副本。

## 本地 CLI 与 maintenance 数据

Generator import、analysis、receipt、backup 与 runtime state 留在本地 project 或私有
maintenance root。用户通过 `public`、`creator-showcase`、`review-required` 和
`local-only` 显式决定是否发布。

Trusted source-managed check-and-update 会通过固定的外部 manager 访问 npm 和已批准
GitHub source。选中的 name、source、hash、contents、lock 与 recovery receipt 保持
私有；Plugin 和 System channel 保持独立。

GitHub 承载 source、CI 与 Release assets；Netlify 从已连接的 Public `main` 构建并
提供静态站点。它们各自的服务政策适用，Silent Orbit 不向它们发送私有 maintenance
state。

贡献者不得把真实 runtime evidence 附到 issue 或 PR。使用最小 synthetic fixture
替代路径、名称、identifier、log 与 source contents，并在发布前运行 privacy validator。
