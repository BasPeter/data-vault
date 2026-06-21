# Proposal: auto-installed document reviewer agent

Status: implemented (the `autoInstallSkills` opt-out toggle is deferred)
Author: Data Vault maintainers
Date: 2026-06-21

## Summary

Add a second generated agent skill — `document-reviewer` — that teaches Claude
and Codex how to review the HTML documents in a user's registered vaults
(structure, metadata, links, language, and placement against the declared
directory `structure`). The skill is rendered, versioned, and installed by the
existing `SkillService`, and is **installed automatically** when the app
launches or the vault list changes, rather than only behind a manual button.

This reuses the proven `vault-guide` pipeline (`electron/skills.ts`,
`skill:status` / `skill:install` IPC, `SkillButton`) and respects every
security invariant in `AGENTS.md`.

## Motivation

Today the app helps agents *write* vault documents via the `vault-guide` skill.
There is no companion guidance for *reviewing* existing documents, so review
prompts have to re-describe the vault format and conventions every time. A
dedicated, version-controlled reviewer skill gives Claude and Codex a stable,
vault-aware checklist:

- Documents are content-only HTML fragments — flag stray `<html>`/`<body>`
  wrappers and unsanitized constructs.
- The optional `<!--vault ... -->` block should carry a sensible `title`,
  `date`, and `tags`.
- Internal links are `#<document-id>` hashes — flag links whose target ID does
  not exist in the documents directory.
- New content should match `vault.json`'s `defaultLanguage` and belong in the
  directory its `structure` entry describes.
- Mermaid lives in `<pre class="mermaid">` blocks.

Making it install automatically removes the "did you click the button?" gap, so
a freshly opened vault is review-ready without manual setup.

## What the agent does

The skill is read-only guidance plus a review rubric. It does **not** execute
anything; it documents how an agent should inspect documents already on disk and
report findings (or propose edits the user can accept through normal tooling).
Scope per review request:

1. Resolve the active/named vault from the skill's vault list.
2. Read the target document(s) from that vault's documents directory.
3. Check format, metadata, link integrity, language, and structural placement.
4. Report issues with file path + document ID, and suggest concrete fixes.

It explicitly inherits the `vault-guide` boundary: never write vault content
into the Data Vault application repository, and treat every fragment as
untrusted input.

## Design

### Generalize `SkillService` to multiple skills

`electron/skills.ts` is currently single-skill (`SKILL_NAME = "vault-guide"`).
Refactor it around a small descriptor so both skills share rendering,
fingerprinting, marker writes, and status logic:

```ts
type SkillId = "vault-guide" | "document-reviewer";

interface SkillDefinition {
  name: SkillId;
  version: string;                       // bump to mark installed copies outdated
  render(vaults: VaultSummary[]): string;
}
```

- `install()` iterates every definition, writing `SKILL.md` + marker into both
  `~/.claude/skills/<name>` and `~/.codex/skills/<name>` via the existing
  `atomicWrite` (0o644 for the skill, 0o600 for the marker).
- `status()` returns the **aggregate** state (`not-installed` if any skill is
  missing, `outdated` if any marker fingerprint differs, else `current`) so the
  current `SkillStatus` shape and `SkillButton` keep working unchanged. A later
  iteration can return per-skill detail if the UI wants it.
- `fingerprint()` already keys on skill version + vault data; per-skill versions
  feed into each definition's fingerprint so the two skills can be revised
  independently.

The reviewer's `render()` reuses `vaultEntry()` / `structureOutline()` for the
"available vaults" section, then appends the review rubric described above.

### Automatic installation

Two complementary triggers, both idempotent because `status()` already detects
`outdated`/`not-installed`:

1. **On launch / vault-list change (main process).** After `service.list()` is
   available, call `skills.status(...)`; if not `current`, call
   `skills.install(...)`. This is where "automatically install" is realized —
   no renderer interaction required.
2. **Keep the manual control (renderer).** `SkillButton` stays as a visible
   status indicator and manual re-install/refresh, and as the fallback if an
   automatic install fails (e.g., read-only home directory).

Auto-install should be best-effort and non-fatal: log and surface the existing
stale indicator on failure rather than blocking app start.

### Opt-out

Add a single boolean setting (default on), e.g. `autoInstallSkills`, so users
who manage `~/.claude` / `~/.codex` themselves can disable silent writes. When
off, behavior reverts to today's button-only flow.

## Security considerations

The proposal stays within the `AGENTS.md` invariants:

- The installer keeps writing **only** to the fixed paths
  `~/.claude/skills/document-reviewer` and `~/.codex/skills/document-reviewer`
  (no renderer-supplied paths), mirroring the `vault-guide` rule.
- The reviewer skill embeds **no** Data Vault app-repo content — only the
  rendered vault list and static rubric text, same as `vault-guide`.
- Vault names, paths, structure titles, and descriptions are interpolated into
  Markdown; continue treating them as untrusted and avoid emitting anything that
  could be read as executable instructions beyond plain guidance.
- IPC handlers remain sender-validated (`assertTrusted`); auto-install runs in
  the main process from app state, not from renderer-supplied arguments.
- Update `AGENTS.md`'s skill-installer invariant to name both skills and both
  fixed path roots.

## UX

- No new required UI. `SkillButton` keeps showing aggregate status; after an
  automatic install on launch it simply reads `current`.
- Optionally extend the popover copy to mention both capabilities ("read/edit"
  and "review") and add the auto-install toggle to the settings dialog.

## Versioning

- Introduce `DOCUMENT_REVIEWER_VERSION` alongside the existing `SKILL_VERSION`
  (rename to `VAULT_GUIDE_VERSION` for clarity). Bumping either marks just that
  skill outdated, which (via aggregate status) re-triggers auto-install.

## Implementation plan

1. Refactor `electron/skills.ts` to the multi-definition model; keep
   `vault-guide` output byte-identical (covered by existing tests/snapshots).
2. Add the `document-reviewer` definition and rubric; add unit tests for its
   render output, link-integrity guidance, and the aggregate `status()` logic.
3. Add main-process auto-install on launch and on vault-list change, guarded by
   the `autoInstallSkills` setting; make failures non-fatal.
4. Update `SkillButton` copy and add the settings toggle (optional in v1).
5. Update `AGENTS.md` and `README.md` to document the second skill and the
   automatic-install behavior.

## Open questions

- Should reviewer findings ever be auto-applied, or always proposal-only?
  (Recommend proposal-only to preserve the read-only review boundary.)
- Should auto-install run silently on first launch, or prompt once for consent
  before writing into `~/.claude` / `~/.codex`?
- Do we want per-skill status in `SkillStatus`, or is aggregate enough for v1?
