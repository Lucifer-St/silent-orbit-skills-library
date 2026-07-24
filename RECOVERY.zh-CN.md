# 恢复与回滚

恢复必须 local、bounded、evidence-driven。成功命令不会自动回滚；在验证与交接完成前
保留精确 before state。

## CLI 或 project upgrade

升级前记录 tarball SHA-256 与 CLI version，备份 `.silent-orbit/` runtime state 和
source imports，记录 `doctor`、`audit` 与 generated-output digests，并保留上一份
已验证 tarball。

升级失败时停止写入，恢复私有 project backup，重新安装上一份已验证 tarball，再运行
`doctor` 并比较 digest。不得手工把不支持的新 Schema 改回 v1。

## Agent Skill 安装

替换全局 Agent Skill 之前复制完整 folder，并记录排序后的 SHA-256 manifest。安装后
比较完整安装目录与已验证 Release folder，并重新读取 `SKILL.md`。

若安装结果或后续验证出现意外差异，恢复精确 folder backup 并验证 manifest。source
冲突必须由人处理，不能把冲突当成删除或覆盖未知工作的授权。

## Trusted source-managed check-and-update

Phase 5C host 只备份已复核 Skill folders 与 manager lock。manager、rescan、sync 或
verification 失败会在当前执行内触发 restore 和 digest verification。
`rollback-failed` 是 terminal fault，绝不表示成功。

成功执行会保留私有 recovery evidence，不提供公开一键恢复。删除、freeze、
Plugin/System mutation、未知来源 mutation 与任意 manual restore 不属于该批次。

## Public release 与 Production

唯一 Production 链路是：

`Private source -> deterministic Public Export -> Public PR -> release-gate -> Public main -> Git-connected Netlify Production`

记录上一 Public main、上一 ready Production deploy、新 Public main、release digest
和 assets hashes。Production rollback 必须通过经过复核的 Public Git revert 或替代
PR，通过 `release-gate` 后由现有 Git connection 到达 Netlify。禁止 direct
Private-source 或 manual Netlify Production deploy。

若缺少授权、tag 已存在、Skill 有不可追溯差异，或 Production 不匹配 Public `main`，
就在精确步骤停止，并保留不含 secrets 或本机路径的必要证据。
