# Documentation

Project documentation lives in this directory. Repository entry points and
files discovered by hosting or package tooling remain at the repository root:
`README.md`, `README.zh-CN.md`, `CONTRIBUTING.md`, `SECURITY.md`, licenses,
notices, and public release control artifacts. Component-owned instructions and
references under `skills/`, generated handoff files, and third-party font
licenses remain beside the components or assets they describe.

## Structure

- [`guides/`](./guides/) — installation, first use, upgrade, and recovery
- [`policies/`](./policies/) — privacy, compatibility, migration, and
  deprecation contracts
- [`testing/`](./testing/) — beta tasks, feedback, and release-candidate
  acceptance
- [`releases/`](./releases/) — versioned release notes
- [`audits/`](./audits/) — focused review and audit records
- [`notes/`](./notes/) — historical design and implementation notes

## Naming

Current guides, policies, testing documents, and audits use lowercase
kebab-case names. Translations add a locale before the extension, for example
`generator-quickstart.zh-CN.md`. Release notes use the released version as the
file name.

Historical notes use:

```text
<YYYYMMDD-HHMMSS>-<brief>.md
```

The timestamp is the note's first Public Git commit time normalized to UTC. The
brief is a stable lowercase kebab-case summary. Once published, a note's
timestamp does not change when the note is edited.

## Guides

- [Generator quickstart](./guides/generator-quickstart.md)
- [Generator quickstart (简体中文)](./guides/generator-quickstart.zh-CN.md)
- [Installation and upgrade](./guides/installation-and-upgrade.md)
- [Installation and upgrade (简体中文)](./guides/installation-and-upgrade.zh-CN.md)
- [Recovery and rollback](./guides/recovery.md)
- [Recovery and rollback (简体中文)](./guides/recovery.zh-CN.md)

## Policies

- [Privacy policy and data boundary](./policies/privacy.md)
- [Privacy policy and data boundary (简体中文)](./policies/privacy.zh-CN.md)
- [Versioning, compatibility, migrations, and deprecation](./policies/versioning-and-migrations.md)
- [Versioning, compatibility, migrations, and deprecation (简体中文)](./policies/versioning-and-migrations.zh-CN.md)

## Testing and releases

- [Public beta testing](./testing/beta-testing.md)
- [Beta feedback template](./testing/beta-feedback-template.md)
- [V1 RC independent acceptance](./testing/v1-rc-acceptance.md)
- [V1 RC acceptance (简体中文傻瓜版)](./testing/v1-rc-acceptance.zh-CN.md)
- [V1 RC 单文件真人验收交接包（简体中文）](./testing/v1-rc-one-file-handoff.zh-CN.md)
- [个性化审美定制独立用户验收清单（未激活）](./testing/customization-rc-acceptance.zh-CN.md)
- [v0.11.0-beta.5 release notes](./releases/v0.11.0-beta.5.md)
- [v0.11.0-beta.6 release notes](./releases/v0.11.0-beta.6.md)
- [v0.11.0-beta.7 release notes](./releases/v0.11.0-beta.7.md)
- [v0.11.0-beta.8 release notes](./releases/v0.11.0-beta.8.md)
- [v0.11.0-beta.9 release notes](./releases/v0.11.0-beta.9.md)
- [v0.12.0-beta.1 release notes](./releases/v0.12.0-beta.1.md)
- [Privacy audit](./audits/privacy-audit.md)

## Historical notes

- [Generator Phase 1A — contract and compatibility boundary](./notes/20260721-181423-generator-phase-1a-contract-compatibility-boundary.md)
- [Generator Phase 1B — portable read-only source adapters](./notes/20260721-181423-generator-phase-1b-portable-read-only-source-adapters.md)
- [Generator Phase 1C — CLI Generator MVP](./notes/20260721-181423-generator-phase-1c-cli-generator-mvp.md)
- [Generator Phase 1D — universal Agent Skill](./notes/20260721-181423-generator-phase-1d-universal-agent-skill.md)
- [Generator Phase 1E — independent Alpha and reference preview](./notes/20260721-181423-generator-phase-1e-independent-alpha-reference-preview.md)
- [Generator Phase 2B — dogfooding and source-of-truth boundary](./notes/20260722-100249-generator-phase-2b-dogfooding-source-of-truth-boundary.md)
- [Generator Phase 4 — read-only Skill health](./notes/20260722-100249-generator-phase-4-read-only-skill-health.md)
- [Generator Phase 5A — guarded Skill Management foundation](./notes/20260724-141941-generator-phase-5a-guarded-skill-management-foundation.md)
- [Generator Phase 5B — single-provider evaluation](./notes/20260724-141941-generator-phase-5b-single-provider-evaluation.md)
- [Generator Phase 5C — trusted-source maintenance](./notes/20260724-141941-generator-phase-5c-trusted-source-maintenance.md)
