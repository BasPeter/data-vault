## Context

Generated agent skills are installed independently for user-selected Claude, Codex, and OpenCode providers, and are also exported as a fixed-entry Claude plugin. Dashboard authoring is more constrained than ordinary vault work: agents must edit only the bundle identified by trusted handoff, while dashboard code is untrusted and can use only a fixed typed host API. The existing general vault guide has a partial dashboard section that no longer reflects the complete contract.

## Goals / Non-Goals

**Goals:**

- Publish one versioned `vault-dashboard-guide` from the existing generated-skill registry.
- Teach safe dashboard inspection, creation, and update work, including the complete current API and capability model.
- Make standalone provider installation, status, freshness, and Claude plugin export treat the new guide like the existing generated skills.
- Avoid contradictory dashboard instructions by referring from the general vault guide to the dedicated guide.

**Non-Goals:**

- Add or modify a dashboard runtime API, permissions, or execution policy.
- Allow agents to edit registry, grants, trash, app-private permission stores, or arbitrary vault content.
- Add a new installer destination, provider, dependency, or runtime configuration surface.

## Decisions

### Register the guide as a first-class generated skill

Add `vault-dashboard-guide` to the existing `SKILLS` registry with its own version and marker. The current registry-driven installer, status, fingerprint, and freshness paths will therefore include it without a parallel installation system.

**Alternative considered:** place dashboard instructions only in the general `vault-guide`. Rejected because the dashboard contract is security-sensitive and changes independently; a focused guide can be complete and testable without bloating general vault work.

### Make the guide the single dashboard authoring contract

The guide will give an ordered workflow: consume trusted handoff, inspect only the named bundle, make local HTML/CSS/JavaScript/asset and manifest changes within the documented schema, and verify through the application. It will state which files and host-owned stores agents must never edit. The general guide will retain only a concise referral.

**Alternative considered:** duplicate the API in both guides. Rejected because the current partial duplication already creates drift risk.

### Document fixed APIs with security semantics, not just signatures

The guide will cover `getInfo`, state read/write, vault index/document reads, secret metadata and `secureFetch`, and `openExternalLink`. Every privileged operation will identify its capability/grant requirements and bounded errors. It will explain that external links are canonical HTTPS only, require host confirmation, and do not permit popups or navigation; secret values never enter dashboard or agent code.

**Alternative considered:** reference source types from the guide. Rejected because installed agents do not have a safe or stable source-code dependency, and a generated guide must be self-contained.

### Package the same canonical content in the Claude plugin

The fixed plugin entry allowlist will add `skills/vault-dashboard-guide/SKILL.md`; its content will be rendered from the same guide definition used for standalone installation. Existing exact-entry and freshness tests will prevent a partial export.

## Risks / Trade-offs

- [Guide drifts from the fixed API] → Generate it from the same trusted code path as the installer and test it for all API methods and critical safety language.
- [Guide could be mistaken for authority] → Clearly state that manifest requests do not grant access and host-owned permission UI controls grants.
- [Adding a skill changes provider status counts] → Extend registry-driven installation, currentness, tamper, and provider-status tests.
- [Plugin and standalone content diverge] → Render both from the canonical skill definition and assert fixed archive entries.

## Migration Plan

The change is additive for installed providers and plugin exports: the next selected-provider refresh installs the new skill; existing skills remain intact. The general vault guide's dashboard section is replaced with a referral. Rollback removes the guide definition and plugin entry; existing installed copies become stale but no dashboard authority changes.

## Open Questions

None.
