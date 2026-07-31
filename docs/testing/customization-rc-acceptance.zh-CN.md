# 个性化审美定制独立用户验收清单

> 候选材料，当前未启动。只有 Release operator 明确激活
> `v0.12.0-beta.1` 的独立验收后才使用本清单。

这是一项 20–30 分钟的真实独立用户验收。作者自测、CI、fixture、纯自动 Agent
运行、下载量或他人转交的报告都不能替代独立用户本人完成并提交的原始结果。

## 1. 安装并确认候选版本

只使用公开 GitHub Pre-release 的 tarball 与 `SHA256SUMS.txt`。按
`generator-quickstart.zh-CN.md` 校验并安装，确认：

- package 为 `0.12.0-beta.1`；
- `silent-orbit --version` 输出 `0.5.0`；
- `silent-orbit capabilities --json` 中 customization 为 `supported`、
  contract family 为 `v2-sidecar`、direction count 为 `2`。

## 2. 生成公开安全的测试项目

使用自己创建、可公开的 5–15 条虚拟 Skill 元数据完成
`init -> import -> scan -> analyze -> diff -> generate -> doctor`。
不要使用真实私人 Skill 名称、完整 Skill 内容、路径、提示词、聊天、记忆或使用记录。

确认 `dist/frontend-handoff.v2.json` 存在，并且普通 `doctor.status` 为 `ok`。

## 3. 完成短审美访谈

让 Agent 使用随包提供的 `customize-skill-cosmos`。用自己的话回答六个简短问题：

- 喜欢与不喜欢的视觉参照；
- 希望界面呈现的三个气质；
- 信息密度与导航偏好；
- 字体、颜色与动效倾向；
- 对比度、减少动效和移动端优先级。

确认最终记录的是偏好摘要，不是逐字对话。公开反馈中不要粘贴 request、私有状态或回执原文。

## 4. 比较恰好两套可操作方向

两套方向必须都能实际打开并完成：

- 地图 / 目录切换；
- 搜索与筛选；
- Skill 详情打开与关闭；
- 中文 / 英文切换；
- 桌面与手机宽度浏览。

它们必须至少在 layout、density、typography、motion、shape 中两个结构维度上不同。
只有配色变化，或只有静态截图，均记为失败。

## 5. 记录真实选择过程

至少执行一次 `调整 / adjust` 或 `拒绝 / reject`，再对可用方向执行
`保留 / keep`。确认旧方向与决定仍在历史中，且
`customization/current/` 只在 keep 后出现。

如两套方向都不合适，可执行 `重做 / redo`；新一轮仍必须恰好两套，并继承简短反馈。

## 6. 验证刷新不破坏审美

给测试项目新增一条虚拟公开 Skill，重新运行正常生成，再执行：

```powershell
npx silent-orbit customize refresh --project .\my-skill-cosmos --json
npx silent-orbit customize doctor --project .\my-skill-cosmos --json
```

必须同时满足：

- `stylePreserved: true`；
- customization doctor 为 `ok`；
- 新 Skill 出现在 selected frontend；
- 只有 `site-data.json` 与 `frontend-handoff.v2.json` 被刷新；
- layout、字体、颜色、动效与自定义样式没有复位或漂移。

## 7. 提交隐私安全的原始结果

独立用户本人通过 `Customization RC 独立验收` Issue Form 提交结果。
只报告环境、PASS/FAIL、最高严重度、本人观察与最小复现步骤。不得提交原始日志、
绝对路径、Skill 名称、提示词、审美访谈原文、private state、receipt、账号或可识别信息。

在 Issue Form 出现之前、由作者代填、私下回传或只有自动化结果，都不算独立用户验收。
