# Silent Orbit v1 RC 中文傻瓜验收（15–25 分钟）

> **只认这一个入口：**
> [`v0.11.0-beta.8` GitHub Pre-release](https://github.com/Lucifer-St/silent-orbit-skills-library/releases/tag/v0.11.0-beta.8)
>
> 不要接收作者发来的本地路径、未发布压缩包或单独打包的 PowerShell 文件。
> 下载后只要校验值不一致，立刻停止，不要继续安装。

这份验收必须由一位真实、独立的用户完成。作者自己试用、测试夹具、CI、
自动化 Agent、下载次数以及之前没走完的聊天记录，都不算独立真人验收。

如果你要把验收完整交给另一位用户，请直接发送
[V1 RC 单文件真人验收交接包](./v1-rc-one-file-handoff.zh-CN.md)。
对方同意后只需把那一个文件交给自己的 Agent，最后把固定格式短报告原样发回。

## 最省事：把下面整段交给 Codex / Claude Code / Kimi Code

你可以让 Agent 替你执行命令，但最后的判断仍由你本人负责。复制下面整段，
连同上面的 GitHub Release 链接一起发给你的 Agent：

```text
请协助我完成 Silent Orbit v1 RC 的独立真人验收。

唯一可信来源是这个 GitHub Release：
https://github.com/Lucifer-St/silent-orbit-skills-library/releases/tag/v0.11.0-beta.8

规则：
1. 在一个新的空目录工作，只从这个 Release 下载所需附件，禁止改用 npm registry、
   作者本地路径、其他压缩包或旧文件。
2. 先下载 tarball、SHA256SUMS.txt 和 starter.source-import.json，核对 tarball 的
   SHA256。校验不一致就停止并用中文告诉我，不要绕过。
3. 检查 Node.js 24；不满足就停止并告诉我缺什么，不要擅自升级或修改系统。
4. 按本文“人工照抄版”的第 2–5 步依次执行。每一步用中文报告：
   执行了什么、预期是什么、实际是什么、通过/失败。任何失败都要保留在最终结论里，
   即使后来绕过了。
5. 生成网页后告诉我本地 index.html 的位置和安全的打开方法，提醒我亲自检查：
   默认是否为中文、能否切换中英文、搜索/筛选/详情是否可用。
6. Docker 只有在我的环境本来就使用 Docker 时才做；不要为了验收擅自安装 Docker。
7. “受控可信来源维护”会真实修改本机 Skills。执行到那里必须暂停，先向我展示：
   将运行的精确命令、拟更新的可信来源范围、恢复办法和隐私边界。只有我明确回复
   “同意执行这一批可信来源维护”后才能继续。不得删除 Skill，不得处理未知来源，
   不得修改 Plugin/System Skill。
8. 最后生成 privacy-safe receipt。先让我查看，只提交操作系统家族、架构、Node major、
   公开版本、检查状态和汇总数量。绝不上传绝对路径、Skill 名称、提示词、原始日志、
   账号、记忆或本地记录。
9. 不要替我冒充真人验收结论。请给我一份中文总结，再让我本人检查并提交 GitHub
   V1 RC External Acceptance Issue Form。
10. 如果你不能访问 Release 或浏览器，就让我手动下载/查看；绝对不要猜测文件内容、
    校验值或网页结果。
```

这已经接近“一步到位”，但不是无人值守的一键安装。校验失败、环境不满足、
网页体验判断和真实维护操作都必须停下来让人确认；否则只能算 Agent 自动化测试，
不能算独立真人验收。

## 开始前准备

- 一台 Windows、macOS 或 Linux 电脑。
- 已安装 Node.js 24。运行 `node --version`，结果应以 `v24.` 开头。
- 登录 GitHub，能打开上面的 Release 和 Issue Form。
- 新建一个空文件夹。所有下载和命令都在这里完成。
- Docker 不是必需项；只有你本来就在用 Docker 时才测。

遇到下面任意情况，先停下：

- Release 链接或版本不是 `v0.11.0-beta.8`；
- SHA256 不一致；
- Node 不是 24；
- 命令崩溃、输出空白或出现作者电脑的私有路径；
- Agent 想跳过步骤、改用 npm registry 或直接修改你的 Skills；
- 你看不懂即将发生的真实修改。

## 人工照抄版

### 1. 下载并验真（约 2 分钟）

从 Release 的 **Assets** 下载：

- `silent-orbit-skills-library-0.11.0-beta.8.tgz`
- `SHA256SUMS.txt`
- `silent-orbit-v1-starter.source-import.json`
- 如果要测 Docker，再下载 `v1-docker-smoke.sh` 和 `codex-global.config.json`

Windows PowerShell：

```powershell
$expected = ((Get-Content .\SHA256SUMS.txt) -split '\s+')[0]
$actual = (Get-FileHash .\silent-orbit-skills-library-0.11.0-beta.8.tgz -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expected) { throw "校验失败：请停止，不要安装" }
"校验通过：$actual"
```

macOS 或 Linux：

```sh
sha256sum -c SHA256SUMS.txt
```

看到 mismatch、FAILED 或报错：**停止**。只有明确通过才进入下一步。

### 2. 从本地附件安装（约 3 分钟）

在刚才的新空目录运行：

```sh
npm init -y
npm install ./silent-orbit-skills-library-0.11.0-beta.8.tgz
npx silent-orbit --version
```

预期 CLI 版本为 `0.4.0`。Release 包版本和 CLI 接口版本是两套版本号，
所以这里不是 `0.11.0-beta.8` 属于正常情况。这个包没有发布到 npm registry。

### 3. 先做一次空库体检（约 1 分钟）

```sh
npx silent-orbit init ./my-skill-cosmos --title "我的 Skill 图书馆" --project-id my-skill-cosmos --json
npx silent-orbit doctor --project ./my-skill-cosmos --json
```

第一次 `doctor` 提醒还没有生成文件是正常的。崩溃、无解释的空结果或私有作者路径
都算失败。

### 4. 导入、扫描并生成（约 5 分钟）

按顺序逐条运行，不要跳步：

```sh
npx silent-orbit import --project ./my-skill-cosmos --file ./silent-orbit-v1-starter.source-import.json --json
npx silent-orbit scan --project ./my-skill-cosmos --json
npx silent-orbit analyze --project ./my-skill-cosmos --json
npx silent-orbit diff --project ./my-skill-cosmos --json
npx silent-orbit generate --project ./my-skill-cosmos --json
npx silent-orbit doctor --project ./my-skill-cosmos --json
npx silent-orbit audit --project ./my-skill-cosmos --json
```

正确结果：

- 找到 1 个受控测试 Skill；
- `generate` 成功；
- 最后的 `doctor` 是 `ok`；
- `audit` 的 source failures 为 0；
- 测试来源的更新/新鲜度证据故意未知，因此相关 `attention` 可以接受。

在新终端从最外层验收目录启动本地预览：

```sh
npx vite preview ./my-skill-cosmos --host 127.0.0.1
```

打开命令显示的 `http://127.0.0.1:...` 地址，本人检查：

- [ ] 首次打开默认显示中文；
- [ ] 右上角可以切换中文和 English；
- [ ] 地图、目录、搜索、筛选、详情都能正常使用；
- [ ] 页面没有暴露本机绝对路径、账号或私人数据。

### 5. 再扫一次，确认结果稳定（约 2 分钟）

```sh
npx silent-orbit scan --project ./my-skill-cosmos --json
npx silent-orbit analyze --project ./my-skill-cosmos --json
npx silent-orbit diff --project ./my-skill-cosmos --json
```

最后必须是：

```text
added: 0
changed: 0
removed: 0
```

### 6. Docker 边界（可选，约 4 分钟）

只有你的日常环境本来就在使用 Docker 才做。完整的 macOS、Linux 和 Windows
两组命令见[英文原始清单](./v1-rc-acceptance.md#6-docker-boundary-when-docker-is-part-of-your-environment-4-minutes)。

你需要确认两个结果：

- 未挂载宿主机 `.agents/skills` 时找到 0 个 Skills，并明确解释必须挂载；
- 只读挂载后至少找到 1 个 Skill，errors 为 0。

容器不会自动读取宿主机 Skills。网页也只能浏览，不能修改电脑上的 Skills。

### 7. 生成隐私安全回执（约 1 分钟）

如果没测 Docker：

```sh
node ./node_modules/silent-orbit-skills-library/scripts/create-v1-acceptance-summary.mjs \
  --project ./my-skill-cosmos \
  --docker-unmounted not-tested \
  --docker-mounted not-tested \
  --trusted-maintenance not-run \
  --out ./silent-orbit-v1-acceptance-receipt.json
```

Windows PowerShell 可以把上面的反斜杠续行去掉，写成一整行。测过两个 Docker
场景时，把对应的 `not-tested` 改为 `pass`。

打开回执本人检查。它只能包含操作系统家族、架构、Node major、公开版本、
检查状态和汇总数量；不应出现绝对路径、Skill 名称、提示词、原始日志或本地记录。

### 8. 受控可信来源维护（约 3–7 分钟，会真实修改）

`npx skills@1.5.20 check` 是 **check-and-update**，不是只读检查。

只有在前面全部通过、你看过拟更新的可信 GitHub 来源批次、已有轻量恢复快照，
并明确同意这一批后才能运行。运行后重新扫描，并在私下核对前后 Skill 名称、
来源身份、hash 和恢复引用。

禁止删除、冻结、从未知来源安装、修改 Plugin/System Skill 或公开本地路径与原始 lock。
如果你不同意真实修改，就把这一项记为 `not-run`；这不算完整 Phase 6B 验收。
完成受控批次和重新扫描后，再生成一次回执，并把 `--trusted-maintenance` 改为 `pass`。

### 9. 由本人提交原始结果（约 2 分钟）

在仓库打开 **V1 RC 外部验收 / External Acceptance** Issue Form：

1. 粘贴本人检查过的 privacy-safe receipt；
2. 报告所有 P0/P1，包括后来成功绕过的问题；
3. 用自己的话写观察结果；
4. 不粘贴原始日志、机器路径、私人提示词、记忆、账号数据或 Skill 名称。

只有真实独立用户走完整条流程且没有未解决 P0/P1，`v1.0.0` 才能从 NO-GO
转为可继续评估。
