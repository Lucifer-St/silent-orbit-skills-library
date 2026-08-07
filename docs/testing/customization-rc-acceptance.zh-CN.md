# 个性化审美定制独立用户验收清单

> `v0.12.0-beta.1` 的历史材料保持不变。本清单绑定 `v0.13.1-beta.1` 与 CLI `0.6.x`。
> 当前作者模拟和自动化证据不算独立真人验收。

这是一项 20–30 分钟的真实独立用户验收。作者自测、CI、fixture、纯自动 Agent
运行、下载量或他人转交的报告都不能替代独立用户本人完成并提交的原始结果。

## 1. 安装并确认候选版本

只使用公开 GitHub Pre-release 的 tarball 与 `SHA256SUMS.txt`。按
`generator-quickstart.zh-CN.md` 校验并安装，确认：

- package 与 Release operator 公布的新候选版本一致（不能填写 beta.1 冒充新流程）；
- `silent-orbit --version` 输出 operator 公布的 `0.6.x`；
- `silent-orbit capabilities --contract v3 --json` 中 customization 为 `supported`、
  contract family 为 `v2-sidecar+experience-v3`、direction count 为 `2`。

## 2. 生成公开安全的测试项目

使用自己创建、可公开的 5–15 条虚拟 Skill 元数据完成
`init -> import -> scan -> analyze -> diff -> generate -> doctor`。
不要使用真实私人 Skill 名称、完整 Skill 内容、路径、提示词、聊天、记忆或使用记录。

确认 `dist/frontend-handoff.v2.json` 存在，并且普通 `doctor.status` 为 `ok`。

## 3. 从只读预检开始

让 Agent 使用随包提供的 `customize-skill-cosmos`。在第一个访谈问题出现前，确认它：

- 用白话说明已有条件、缺少什么、为什么需要、会改哪里和不会改哪里；
- preflight 没有写文件；
- 缺项目设置时先问你是否同意，并只接受说明中给出的精确确认 token；
- 你拒绝时没有写入，也没有全局安装、系统配置或扫描无关目录。

## 4. 完成生活化逐题访谈

一次只看到一个生活化问题、2–3 个例子、进度和“不确定/跳过也可以”。用自己的话
回答；至少试一次“不知道/跳过”，再返回上一题修改一次。新手界面不应要求你选择
layout、density、typography、motion 或 shape。

六题会自然地了解：

- 哪些日常页面用起来舒服，哪些让人疲惫；
- 希望长期使用时是什么感觉；
- 通常是直接查找，还是喜欢探索；
- 文字、颜色、动效、手机与电脑怎样才舒服。

确认看到白话版“我理解的是……”并可修改；专业参数只在主动展开高级信息后出现。
最终记录的是简短偏好摘要和可解释推断，不是逐字对话。

## 5. 比较恰好两套可操作方向与默认入口

两套方向必须都能实际打开并完成：

- 地图 / 目录切换；
- 搜索与筛选；
- Skill 详情打开与关闭；
- 中文 / 英文切换；
- 桌面与手机宽度浏览。

选择“目录优先”的用户必须在首次打开、刷新、约 390px 手机宽度和最终 keep 后先
看到目录；“地图优先”则先看到地图。主动切换一次后，不应被首选默认值立即强制跳回。
只有配色变化、同一拓扑换皮，或只有静态截图，均记为失败。

## 6. 记录真实选择与重做过程

至少执行一次 `调整 / adjust` 或 `拒绝 / reject`，再对可用方向执行
`保留 / keep`。确认旧方向与决定仍在历史中，且
`customization/current/` 只在 keep 后出现。

另执行一次“重做地图/节点太挤/连线没意义/换组织方式”。新一轮仍必须恰好两套并
继承白话反馈，而且节点位置、分组、边集合或布局策略存在实质变化。只改 CSS 记为失败。
只改变内部 `layoutPhase` 或 digest、但节点坐标、分组、边和布局策略都未变化，也记为失败。

## 7. 验证刷新、恢复与失败提示

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

同时检查：刷新或退出后能恢复进度、错误信息说明下一步而不是只让你看技术文档、
键盘可完成主要操作、等待时有反馈、中文与英文不泄露访谈原文或本地路径。

## 8. 提交隐私安全的原始结果

独立用户可通过 `Customization RC 独立验收` Issue Form 提交结果，也可把测试包自动生成且通过 validator 的单文件报告直接发回 Matthew。完整、release 绑定正确且声明 `independent: true` 的报告是 Issue Form 等价回执；除非外部系统返回真实 URL/编号，不得声称已经创建 GitHub Issue。
只报告环境、PASS/FAIL、最高严重度、本人观察与最小复现步骤。不得提交原始日志、
绝对路径、Skill 名称、提示词、审美访谈原文、private state、receipt、账号或可识别信息。

由作者代填、缺少 release 绑定或 validator 校验、没有独立性声明，或只有自动化结果，都不算独立用户验收；由独立受试者完成并直接回传的合格单文件报告则按上面的等价回执规则处理。
