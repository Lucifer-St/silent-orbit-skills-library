# Silent Orbit v1 RC 单文件真人验收交接包

> 版本：`v0.11.0-beta.8`<br>
> 唯一可信入口：https://github.com/Lucifer-St/silent-orbit-skills-library/releases/tag/v0.11.0-beta.8<br>
> 预计用时：核心验收 15–25 分钟；Docker 和真实维护另算<br>
> 最终产物：一份可以原样发回给 Matthew 的简短隐私安全报告

## 你不需要输入命令

Matthew 应只把上面的**唯一 GitHub Release 链接**发给你，不应再发本地压缩包、
PowerShell 脚本、作者电脑路径或另一份清单。你只做三步：

1. 从该 Release 的 Assets 下载 `V1_RC_ONE_FILE_HANDOFF.zh-CN.md`。
2. 把下载的整个文件上传给本机 Codex、Claude Code、Kimi Code 或其他能使用
   本地终端和浏览器的 Agent，只说一句：`开始验收`。
3. Agent 打开网页时，你亲自回答四个“是 / 否”；最后把它生成的短报告原样发回。

不要自己替换任何 PUBLIC_RELEASE 模板占位词，也不要让 Agent 猜版本或改用
`latest`。如果下载后的版本、URL 或 tarball 文件名仍像占位词，立即停止。

本文件使用带 BOM 的 UTF-8，便于 Windows 直接识别中文。Agent 在 Windows 上
必须显式按 UTF-8 读取（例如 Windows PowerShell 使用 `Get-Content -Raw -Encoding UTF8`），
不得使用系统默认代码页后再猜测乱码内容。

---

## 给验收者看的说明

### 你将允许什么

当你主动把这个文件交给 Agent 并要求执行时，表示你同意 Agent：

- 在一个**新建的临时空目录**中，从上面的唯一 GitHub Release 下载公开附件；
- 校验 Release tarball 的 SHA256；
- 仅从已下载 tarball 安装 Silent Orbit 测试项目；
- 使用 Release 自带的受控测试数据完成扫描、分析、生成和审计；
- 在 `127.0.0.1` 启动临时本地预览，供你本人查看；
- 生成不包含私人路径、Skill 名称、提示词或原始日志的验收回执和短报告；
- 在你确认收到报告后，删除本次验收创建的临时目录。

你还需要如实告诉 Agent：你是否是项目作者、维护者，或正在复制其他人的验收结果。
只有真实独立用户基于自己的操作和观察形成的原始报告，才算独立真人验收。

### 默认不允许什么

这次核心验收**不授权** Agent：

- 修改、安装、更新、删除或冻结你现有的任何 Skills；
- 扫描无关目录、私人知识库、聊天记录、账号或浏览器数据；
- 使用作者发送的本地文件、其他 Release、旧压缩包或 npm 上的同名包替代本 Release；
- 自动安装或升级 Node.js、Docker、系统软件或浏览器；
- 把原始日志、绝对路径、Skill 名称、提示词、账号信息或本地记录上传到任何地方；
- 代替你宣称“真人看过了”，或替你提交 GitHub Issue。

`npm install ./silent-orbit-skills-library-0.11.0-beta.8.tgz` 可以按包声明解析正常的公开依赖，
但 Silent Orbit 本体必须来自已校验的本地 tarball，不能改成从 npm registry
获取同名包。

### 你本人只需要做两件事

1. Agent 打开生成网页后，你亲自看一眼，并回答四个“是 / 否”：
   默认中文、能切英文、搜索筛选可用、详情可打开。
2. 最后检查 Agent 给出的短报告，然后把报告全文原样发回给 Matthew。

Docker 只有在你的日常环境本来就使用 Docker 时才测。不要为了验收安装 Docker。

### 关于会真实修改 Skills 的维护步骤

完整 Phase 6B 还包含一次受控可信来源维护。它会真实修改本机 Skills，
**不属于上面的默认授权**。

Agent 走到这里必须停下，展示精确命令、可信来源范围、恢复办法和隐私边界。
只有你在 Agent 对话里明确回复：

```text
我同意执行这一批可信来源维护。
```

Agent 才能执行这一批。没有这句确认，就记录为 `not-run`，不得尝试。
`not-run` 仍可形成有效的核心验收报告，但不算完整 Phase 6B 验收。

---

## 给 Agent 的强制执行协议

你正在协助一位真实独立用户验收 Silent Orbit v1 RC。这个文件是完整任务合同，
不要向用户索要另一份清单，也不要从旧聊天中补齐步骤。

### A. 验收身份和总原则

- 用户主动上传或粘贴本文件并要求执行，只授权“核心验收”中的临时目录操作。
- 你是执行助手，不是独立验收者。网页体验结论必须询问真人。
- 只认 `https://github.com/Lucifer-St/silent-orbit-skills-library/releases/tag/v0.11.0-beta.8`。禁止使用 `latest`、其他 tag、本地作者路径、
  其他压缩包或未发布构建。
- 当前输入必须来自该 Release 的 `V1_RC_ONE_FILE_HANDOFF.zh-CN.md` 附件。
- 如果 URL 不存在、不是精确 tag 页面、Release 不是公开且 immutable 的 Pre-release、
  附件不完整或文件仍含未解析的 PUBLIC_RELEASE 模板标记，立即停止。
- 不得把一次失败从最终报告中抹去，即使后来成功绕过。
- 不得为了得到绿色结果降低校验、跳步或修改用户现有环境。
- 除本次临时目录外，核心验收必须是只读的。

### B. 开始前检查

先用中文告诉用户：

```text
我将只在新临时目录中执行核心验收，不会修改你现有的 Skills。
真实维护步骤需要你稍后二次明确同意。
```

然后检查：

1. 操作系统家族和架构；
2. `node --version` 是否为 Node.js 24；
3. 能否访问唯一 Release；
4. 当前是否有 Docker。只记录，不安装；
5. 选择一个全新的临时空目录，记录在 Agent 内部，不在返回报告中暴露绝对路径。
6. 询问用户是否为项目作者或维护者、是否正在复制他人结果，并记录其回答。

Node 不是 24、Release 不可访问或无法建立独立临时目录时，停止并输出最终短报告，
状态写 `BLOCKED`。用户不是独立验收者时可以协助自测，但报告必须写
`independentHuman: NO`，不得冒充独立验收。

### C. 下载和 SHA256 校验

只从唯一 Release 下载：

- `V1_RC_ONE_FILE_HANDOFF.zh-CN.md`
- `silent-orbit-skills-library-0.11.0-beta.8.tgz`
- `SHA256SUMS.txt`
- `silent-orbit-v1-starter.source-import.json`
- 仅在本来就使用 Docker 时，再下载 `v1-docker-smoke.sh`
  和 `codex-global.config.json`

必须先把 Release 下载的 `V1_RC_ONE_FILE_HANDOFF.zh-CN.md` 与用户交给你的输入
合同进行规范化比较：两边都按 UTF-8 解码、移除最多一个开头的 U+FEFF BOM，并把
CRLF / CR 统一成 LF 后逐字比较。缺失、不一致或仍有未解析模板标记时立即停止并记录
`handoffContract: FAIL`。

然后对本次实际下载的每个附件，都从 `SHA256SUMS.txt` 中找到**文件名完全一致且
唯一**的那一行，计算本地 SHA256 并逐字符比较。至少必须覆盖本交接文件、
`silent-orbit-skills-library-0.11.0-beta.8.tgz` 和 starter；实际执行 Docker 时也必须覆盖两个 Docker
附件。不得假设第一行就是 tarball，不得凭下载成功推断校验通过。

不一致、缺行、重复冲突或无法计算时立即停止，报告 `checksum: FAIL`。

### D. 核心验收

以下命令必须在临时验收目录中按顺序执行。可以使用当前操作系统的等价路径语法，
但不得改变命令含义。

```sh
npm init -y
npm install ./silent-orbit-skills-library-0.11.0-beta.8.tgz
npx silent-orbit --version

npx silent-orbit init ./my-skill-cosmos --title "我的 Skill 图书馆" --project-id my-skill-cosmos --json
npx silent-orbit doctor --project ./my-skill-cosmos --json

npx silent-orbit import --project ./my-skill-cosmos --file ./silent-orbit-v1-starter.source-import.json --json
npx silent-orbit scan --project ./my-skill-cosmos --json
npx silent-orbit analyze --project ./my-skill-cosmos --json
npx silent-orbit diff --project ./my-skill-cosmos --json
npx silent-orbit generate --project ./my-skill-cosmos --json
npx silent-orbit doctor --project ./my-skill-cosmos --json
npx silent-orbit audit --project ./my-skill-cosmos --json
```

安装后，必须确认包内存在：

```text
node_modules/silent-orbit-skills-library/docs/testing/v1-rc-one-file-handoff.zh-CN.md
```

将包内文件、Release 下载的 `V1_RC_ONE_FILE_HANDOFF.zh-CN.md` 和用户交给你的
输入合同使用上一节同一规则规范化后逐字比较。三者任一缺失、不一致或仍含模板
标记，说明“交接文档和 Release 不是同一个候选版本”，立即停止并记录
`handoffContract: FAIL`。这一步专门防止未渲染模板、新版清单误测旧 tarball，
或 Release 忘记上传交接附件。

预期：

- CLI 输出 `0.4.0`；
- 初次 `doctor` 可以因尚未生成而为 `attention`，但必须给出可行动解释；
- 找到 1 个受控测试 Skill；
- `generate` 成功；
- 最终 `doctor` 为 `ok`；
- `audit` 的 source failures 为 0；
- 测试来源的新鲜度证据故意未知，因此对应 `attention` 可以接受。

任何崩溃、私有作者路径、无解释空结果、数据外泄或跳步都算失败。

### E. 真人网页检查

从临时验收目录启动：

```sh
npx vite preview ./my-skill-cosmos --host 127.0.0.1
```

只绑定 `127.0.0.1`。打开终端显示的本地地址，请真人依次回答：

1. 首次打开是否默认中文？
2. 是否可以切换到 English，再切回中文？
3. 地图、目录、搜索和筛选是否可用？
4. 是否能打开 Skill 详情，且页面没有可见的绝对路径、账号或私人数据？

你可以帮助操作浏览器，但不能替真人回答。四项全部由真人确认才记 `ui: PASS`。

### F. 第二次稳定性检查

关闭详情或预览不影响本步骤。继续运行：

```sh
npx silent-orbit scan --project ./my-skill-cosmos --json
npx silent-orbit analyze --project ./my-skill-cosmos --json
npx silent-orbit diff --project ./my-skill-cosmos --json
```

最终必须同时为：

```text
added: 0
changed: 0
removed: 0
```

缺少任意一项或数值非 0，记录 `stability: FAIL`。

### G. Docker（条件执行）

- 用户环境本来没有 Docker：记录 `docker: NOT_APPLICABLE`，不要安装。
- 用户本来有 Docker：按 Release 提供的未挂载和只读挂载两个场景执行。
- 未挂载场景必须找到 0 个 Skills，并明确解释需要挂载宿主 `.agents/skills`。
- 只读挂载场景必须找到至少 1 个 Skill，errors 为 0。
- 静默的“0 来源成功”属于 P1。

Docker 不得获得未声明的宿主目录访问权限。

### H. 真实维护的二次确认

只有核心步骤全部完成后，才可以询问用户是否做受控可信来源维护。

在询问前必须展示：

- 即将运行的精确 `skills@1.5.20` check-and-update 命令；
- 本次允许的可信 GitHub source-managed 范围；
- 轻量恢复快照的位置和恢复办法；
- 明确排除删除、冻结、未知来源、Plugin Skill 和 System Skill；
- 提醒原生更新没有 transaction guarantee。

只有收到完全一致的明确同意：

```text
我同意执行这一批可信来源维护。
```

才能执行一次 reviewed batch，随后 rescan 并私下核对前后名称、来源、hash 和恢复引用。
这些私人明细不得进入返回报告。

没有同意时，记录 `trustedMaintenance: NOT_RUN`。不得反复劝说。

### I. 生成 privacy-safe receipt

根据实际 Docker 和维护结果设置参数：

```sh
node ./node_modules/silent-orbit-skills-library/scripts/create-v1-acceptance-summary.mjs \
  --project ./my-skill-cosmos \
  --docker-unmounted not-tested \
  --docker-mounted not-tested \
  --trusted-maintenance not-run \
  --out ./silent-orbit-v1-acceptance-receipt.json
```

完成的项目使用 `pass`；未测 Docker 使用 `not-tested`；未获维护同意使用 `not-run`。

先检查回执，只允许：

- OS family、architecture、Node major；
- 公开 Release / CLI 版本；
- 检查状态；
- 汇总数量。

发现绝对路径、Skill 名称、提示词、原始日志、账号、记忆或本地记录时，
不得返回该回执；先生成安全版本，并将此事至少记为 P1。

### J. 严重度

- `P0`：数据破坏、隐私泄露、供应链或安全边界失守。
- `P1`：核心命令失败、校验错误、错误成功、稳定性非零、关键页面不可用。
- `P2`：可绕过但明显困惑、文案或非阻塞体验问题。
- `NONE`：未观察到问题。

### K. 最终只返回这一份短报告

创建 `silent-orbit-return-report.md`，同时在对话中完整输出。不得附加原始日志。
严格使用下面格式；方括号内容替换为实际值：

```text
SILENT_ORBIT_RETURN_REPORT_V1
release: v0.11.0-beta.8
independentHuman: [YES/NO]
environment: [Windows/macOS/Linux] [x64/arm64] / Node 24
checksum: [PASS/FAIL/NOT_RUN]
handoffContract: [PASS/FAIL/NOT_RUN]
coreFlow: [PASS/FAIL/NOT_RUN]
uiHumanCheck: [PASS/FAIL/NOT_RUN]
stability: [PASS/FAIL/NOT_RUN] (added [n], changed [n], removed [n])
docker: [PASS/NOT_APPLICABLE/FAIL/NOT_RUN]
trustedMaintenance: [PASS/NOT_RUN/FAIL]
highestSeverity: [NONE/P2/P1/P0]
blockingIssue: [NONE 或一句不含私人信息的说明]
workedAroundIssue: [NONE 或一句不含私人信息的说明]
receiptReviewedByHuman: [YES/NO]
receipt: [粘贴压缩后的 privacy-safe receipt JSON；未安全生成则写 NOT_AVAILABLE]
humanVerdict: [PASS/FAIL/INCOMPLETE]
END_SILENT_ORBIT_RETURN_REPORT_V1
```

在报告后只对用户说：

```text
请检查上面的报告；确认无私人信息后，将从
SILENT_ORBIT_RETURN_REPORT_V1 到 END_SILENT_ORBIT_RETURN_REPORT_V1
的全部内容原样发回给 Matthew。无需附加日志或解释。
```

用户确认报告后，可以删除本次验收创建的临时目录；不得删除其他目录。
