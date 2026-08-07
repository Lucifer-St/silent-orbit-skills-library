# Silent Orbit 独立新手真人测试包

把这个文件完整交给一个能使用本机终端、文件、网络和浏览器的 Agent，然后只说：**开始测试**。新手不需要先读技术文档，也不用手抄命令。

- Pack：`silent-orbit-novice-human-test-pack/1.0.0`
- Release：`v0.13.1-beta.1`
- Release 页面：https://github.com/Lucifer-St/silent-orbit-skills-library/releases/tag/v0.13.1-beta.1
- 安装资产：`silent-orbit-skills-library-0.13.1-beta.1.tgz`
- 安装资产下载：{{PUBLIC_TARBALL_URL}}
- 安装资产 SHA256：`{{PUBLIC_TARBALL_SHA256}}`
- 支持：Windows / macOS / Linux，Node.js 24.x
- 回传 schema：`novice-human-test-report.v1`

测试包自身的 SHA256 位于同一 Release 的 `SHA256SUMS.txt`；包内的 SHA256 对应安装资产，从而避免文件自我哈希循环。不得改用 `latest`、其他 tag、npm registry 同名包或作者本地构建。

## 给受试者的白话说明

Agent 会先只读检查电脑是否具备测试条件，并告诉你已有、缺少、为什么需要、准备写到哪里、不会改什么。只读检查不会安装东西。任何写入都先问你一次、一次只问一个问题；默认只写新建的隔离测试目录，不全局安装 npm 包、不改系统设置、不扫描 home、不读取未授权目录、不收集令牌、Cookie、Skill 正文或逐字访谈。

若 Agent 没有终端、文件或网络能力，必须停止，并请你把同一个文件交给具备这些能力的 Agent；不得假装完成。拒绝写入时，Agent 应提供只读说明或体面停止，并在报告中记 `environmentBlocked`，不能把它算成你的失败。

## Agent 主持与执行协议

你是执行者，不是受试者。视觉、理解和偏好结论必须由真人回答。默认渐进披露：只展示下一步和白话解释；命令、JSON、schema、digest 仅在“高级/诊断信息”中提供。

### 1. 只读 preflight

只检查：OS/CPU 架构、shell、网络、可用磁盘、Git、Node 24/npm、浏览器/本地预览能力、目标父目录写权限，以及你是否具有终端/文件/网络能力。不得创建文件来“测试”写权限；使用系统元数据查询。不得扫描无关目录。

随后用白话逐项说明：已有条件、缺少什么、为什么需要、若同意将只在新测试目录写入什么、不会碰现有 Skills、用户主目录、全局 npm 或系统设置。若条件齐全，仍先问一个问题：

> 我可以在一个全新的隔离测试目录里下载并安装这次指定版本吗？所有改动都留在该目录，结束后可以整体删除；不确定也可以先说“不”。

只有明确同意才能创建目录。缺少 Node 24 时，先单独询问是否允许在测试目录建立可回滚的 portable/project-local Node 24，并校验官方来源；不得默认全局安装。只有项目内方案确实不可行，才解释系统安装的范围并另行取得明确同意。每次外部写入都同样先解释和征得同意。

### 2. 下载、校验与隔离安装

在新隔离目录中从精确 URL 下载 `silent-orbit-skills-library-0.13.1-beta.1.tgz` 和 `SHA256SUMS.txt`。计算本地 SHA256，必须同时等于本文件中的 `{{PUBLIC_TARBALL_SHA256}}`，并在 manifest 中找到文件名完全一致且唯一的一行；不一致立即停止。然后仅在隔离目录执行项目级 `npm init -y` 与 `npm install ./silent-orbit-skills-library-0.13.1-beta.1.tgz`。

### 3. 选择公开样例或自己的来源

一次只问一个生活化问题：

> 这次想用公开安全样例走完整流程，还是用你自己的 Skill 文件夹？例如“先用样例”“用我指定的一个项目”。不确定也可以先用样例。

选择自己的来源时，先说明只读取对方明确给出的项目/Skill 路径，不读无关文件、不扫描 home、不把 Skill 正文写进公开报告；再取得明确同意。选择样例时只使用 Release 自带公开 fixture。

### 4. 核心产品流程

由 Agent 操作并保留仅限临时目录的诊断证据：`init → import-or-configure → scan → analyze → diff → generate → doctor`。任何失败先自动诊断；项目级修复仍须先说明写入内容并征得同意，修复后回到原步骤。分类必须区分 `productIssue`、`executorIssue`、`environmentBlocked`。

随后执行 `silent-orbit customize preflight`。若显示同意 token，用白话解释后取得同意，再执行项目级 `customize setup`；不得替真人同意。正式访谈必须一次只问一个生活化问题，每题给 2–3 个例子和“不确定/跳过也可以”，接受自然语言和“我不知道”，允许返回上一题修改。Agent 负责调用 `customize interview start/status/answer/back/review/confirm`，不要求真人选择 layout、density、typography、motion、shape 等术语。

确认前展示白话“我理解的是……”，高级参数折叠。然后 `customize prepare --from-interview`，必须生成恰好两套可操作方向。

### 5. 真人观察任务

一次只安排一个任务并计时：比较 A/B；检查自然选择的“目录优先/地图优先”是否在首次打开兑现；主动切换后运行时状态不应被强拉回；在 keep 前用一句自然语言完成一次 adjust，或明确 reject 一个方向；keep 后刷新仍以首选默认视图恢复；中途退出一次再恢复访谈或当前方向；检查亮/暗配色的文字、节点、连线、按钮是否清楚；执行返回/修改、可见的等待反馈、失败恢复、键盘操作与双语切换。桌面必测；设备允许时再测约 390px，无法覆盖必须记 `NOT_TESTED`，不得自动判 PASS。

必须再单独问：

> 请指出地图组织上最想重做的一点。例如“节点太挤”“连线没意义”“想换一种分组”；不确定也可以随便挑一个真实感受。

将这句话作为 redesign/redo 的白话反馈，不得降级成 restyle。新一轮必须仍有恰好两套方向并保留旧轮次；比较 structure digest 与公开结构数据，确认节点位置、边集合、分组、布局策略至少有实质变化。只有颜色/字体/CSS 改变必须记 `redoTopology: FAIL` 和 `productIssue P1`。

### 6. 自动生成单文件报告

最后只向真人确认：一段白话总结是否准确；其是否独立于项目作者/开发；是否允许项目所有者后续联系。不要保存逐字访谈。创建 `silent-orbit-novice-human-report.md`，正文简洁，并嵌入下面的 JSON 区块。`testerId` 必须随机生成且不含姓名、账号或机器标识。自动去除绝对路径、用户名、令牌、Cookie、原始 Skill 正文、逐字访谈和敏感命令输出。证据只写安全文件名和 SHA256。

内部作者/Agent 演练必须写 `independent: false`，且不能通过 independent gate。只有本人独立操作与观察才写 `true`。每个发现写成一个 `issues` 项：只含 `productIssue` / `executorIssue` / `environmentBlocked`、P0 / P1 / P2 和简短摘要，不附原始日志。完整、校验通过且 `independent: true` 的报告是 Customization Issue Form 等价回执；这不等于已经创建 GitHub Issue，除非外部系统真的返回 Issue URL/编号。

```text
<!-- SILENT_ORBIT_NOVICE_REPORT_JSON
{
  "schemaVersion": 1,
  "kind": "SilentOrbitNoviceHumanTestReport",
  "packVersion": "1.0.0",
  "release": "v0.13.1-beta.1",
  "releaseAsset": "silent-orbit-skills-library-0.13.1-beta.1.tgz",
  "releaseAssetSha256": "{{PUBLIC_TARBALL_SHA256}}",
  "testedAt": "2026-01-01T00:00:00.000Z",
  "testerId": "tester-random123",
  "independent": false,
  "environment": { "os": "Windows", "arch": "x64", "cpu": "x64 desktop CPU", "shell": "PowerShell", "node": "v24.0.0", "npm": "11.x", "git": "2.x", "browser": "Chromium", "network": "PASS", "disk": "PASS", "targetPermission": "PASS", "agentTerminal": "PASS", "agentFiles": "PASS", "agentNetwork": "PASS", "desktop": "NOT_TESTED", "mobile390": "NOT_TESTED" },
  "tasks": {
    "preflight": { "status": "NOT_TESTED", "minutes": 0, "note": "" }, "consentGate": { "status": "NOT_TESTED", "minutes": 0, "note": "" }, "install": { "status": "NOT_TESTED", "minutes": 0, "note": "" }, "sourceSelection": { "status": "NOT_TESTED", "minutes": 0, "note": "" }, "init": { "status": "NOT_TESTED", "minutes": 0, "note": "" }, "importOrConfigure": { "status": "NOT_TESTED", "minutes": 0, "note": "" }, "scan": { "status": "NOT_TESTED", "minutes": 0, "note": "" }, "analyze": { "status": "NOT_TESTED", "minutes": 0, "note": "" }, "diff": { "status": "NOT_TESTED", "minutes": 0, "note": "" }, "generate": { "status": "NOT_TESTED", "minutes": 0, "note": "" }, "doctor": { "status": "NOT_TESTED", "minutes": 0, "note": "" }, "interview": { "status": "NOT_TESTED", "minutes": 0, "note": "" }, "interviewBackEdit": { "status": "NOT_TESTED", "minutes": 0, "note": "" }, "compareTwoDirections": { "status": "NOT_TESTED", "minutes": 0, "note": "" }, "preferredView": { "status": "NOT_TESTED", "minutes": 0, "note": "" }, "runtimeSwitch": { "status": "NOT_TESTED", "minutes": 0, "note": "" }, "adjustOrReject": { "status": "NOT_TESTED", "minutes": 0, "note": "" }, "keep": { "status": "NOT_TESTED", "minutes": 0, "note": "" }, "refreshRecovery": { "status": "NOT_TESTED", "minutes": 0, "note": "" }, "failureRecovery": { "status": "NOT_TESTED", "minutes": 0, "note": "" }, "redoTopology": { "status": "NOT_TESTED", "minutes": 0, "note": "" }, "readability": { "status": "NOT_TESTED", "minutes": 0, "note": "" }, "keyboard": { "status": "NOT_TESTED", "minutes": 0, "note": "" }, "bilingual": { "status": "NOT_TESTED", "minutes": 0, "note": "" }, "privacyBoundary": { "status": "NOT_TESTED", "minutes": 0, "note": "" }
  },
  "issues": [],
  "humanSummary": "待真人确认的白话总结",
  "verdict": "INCOMPLETE",
  "contactAllowed": false,
  "evidence": []
}
END_SILENT_ORBIT_NOVICE_REPORT_JSON -->
```

用安装包内的 validator 对报告执行 release、asset、SHA256 和独立性校验；Agent 应自动运行下面的命令，不让新手手抄：

```sh
node ./node_modules/silent-orbit-skills-library/scripts/validate-novice-human-report.mjs --report ./silent-orbit-novice-human-report.md --expected-release v0.13.1-beta.1 --expected-asset silent-orbit-skills-library-0.13.1-beta.1.tgz --expected-sha256 {{PUBLIC_TARBALL_SHA256}} --require-independent
```

校验失败仍要把报告交回，verdict 设为 `FAIL` 或 `INCOMPLETE`，不可删掉问题。受试者最终只需把这一份报告文件发回 Matthew。
