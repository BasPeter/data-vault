# Design: add-claude-cowork-plugin

## Context

Claude plugins bundle skills and other capabilities under a directory whose
required manifest is `.claude-plugin/plugin.json`. Claude Desktop lets paid-plan
users upload a custom plugin and stores it locally. Skills work in Chat and
Cowork; hooks and sub-agents are Cowork-only. Organization distribution can use
a marketplace repository, but Data Vault's generated skills contain local,
user-specific vault paths and metadata.

The application already generates and verifies `vault-guide` and
`document-reviewer` skills in `electron/skills.ts`. That service sanitizes
untrusted vault metadata, fingerprints exact generated content, uses fixed
installation roots, and is covered by injection and tamper tests.

## Goals and Non-Goals

### Goals

- Produce one plugin file a user can upload through Claude Desktop's supported
  Plugins UI and use in Cowork.
- Preserve the behavior and security properties of the existing generated
  skills.
- Keep all path, manifest, and archive decisions in trusted main-process code.
- Make snapshot/update semantics explicit to the user.

### Non-Goals

- Silently modifying Claude Desktop's local data directory.
- Publishing a public or organization marketplace.
- Giving Claude an MCP server or direct Data Vault application control.
- Embedding vault documents, Git credentials, tokens, or repository contents.
- Replacing the existing standalone Claude and Codex skill installers.

## Decisions

### 1. Export through the supported upload flow

The application exports a `.zip` plugin archive to a user-selected destination;
the user installs it from Claude Desktop's Customize → Plugins flow. The
implementation must validate the archive against the then-current Claude plugin
format and complete a manual Claude Desktop/Cowork smoke test before release.
If Claude Desktop requires a different custom-plugin file wrapper, only the
archive adapter changes; generated plugin contents remain the same.

This avoids depending on Claude's private local-data layout and makes the
security-sensitive external write explicit.

### 2. Generate a per-user snapshot

The archive contains the same two generated `SKILL.md` documents as the existing
installer, rendered from the current registered-vault snapshot. It contains no
HTML documents and no live connector. When vault registration, paths, names, or
structure change, the user exports and installs a new version.

The export result shown by the UI includes an export timestamp and a
deterministic content fingerprint. The timestamp is UI-only: it is excluded from
the archive and fingerprint. Archive entry order, entry timestamps, permissions,
and compression settings are normalized so identical inputs produce identical
plugin files.
The manifest's semantic version is the plugin-format version and changes only
when the packaged contract changes. The content fingerprint is included in the
README for support/diagnostics but is not assumed to drive Claude Desktop update
detection. Until task 1.1 confirms replacement behavior, the documented update
flow is manual removal/replacement of the previously uploaded plugin.

### 3. Fixed archive structure and identity

Trusted code owns a constant allowlist of archive entries:

```text
.claude-plugin/plugin.json
README.md
skills/vault-guide/SKILL.md
skills/document-reviewer/SKILL.md
```

The manifest uses a stable lowercase plugin name such as `data-vault`, an
English description, the application/plugin format version, author/repository
metadata, and no installation preference. Skills therefore appear under the
plugin namespace in surfaces that expose namespaced commands.

The ZIP root is the plugin root; no additional wrapper directory is included.
No archive name or internal path is derived from renderer input or vault data.
Entries use forward-slash relative paths, reject absolute paths and `..`, and
must not be symlinks.

### 4. Reuse generation; separate packaging

Refactor only enough to expose the existing pure skill rendering result to a
new `ClaudePluginExporter`. The exporter builds the manifest, README, and fixed
archive. It must not duplicate skill templates or sanitization rules.

The main process owns generation and disk writes. A narrow preload API returns
success metadata (destination filename, plugin version/fingerprint) or a
sanitized error. The renderer triggers the operation and presents instructions;
it never supplies archive entries, manifest JSON, skill content, or arbitrary
output paths. A native save dialog may provide the final user-selected file path
to main-process code, subject to extension normalization and overwrite consent.

### 5. Preserve standalone skills

Existing automatic installation to `~/.claude/skills` and `~/.codex/skills`
continues unchanged. The plugin is an additional distribution surface. The UI
warns that installing both standalone Claude skills and the plugin may show
duplicate capabilities; users who primarily use Cowork can keep the plugin and
disable/remove standalone Claude copies manually if needed. Automatic deletion
or migration is out of scope.

### 6. No marketplace in the first release

A marketplace is appropriate for static, reusable plugin logic, but a public or
organization repository must not contain personal local paths. A later design
could split the package into a static marketplace plugin plus a safe local MCP
connector or user-maintained configuration. That would introduce a larger trust
boundary and needs its own proposal.

### 7. Persist export freshness, not plugin contents

Main-process code stores only the last successful plugin fingerprint and the
canonical standalone-skill fingerprint at export time in application userData.
It compares that skill fingerprint with the current generated/installed Claude
skills. No vault metadata, skill content, archive path, or Claude private plugin
state is persisted. Before any export the UI reports `not-exported`; matching
fingerprints report `current`; changed or non-current standalone Claude skills
report `stale`.

Persisted state is treated as untrusted application data: both fingerprints
must be lowercase 64-character SHA-256 hex strings or the state is treated as
`not-exported`.

The plugin explainer is collapsed by default. Its refresh signature includes
every canonical vault input, including format, language, and nested structure.
The signature preserves structure insertion order because the canonical skill
renderer and fingerprint do too; sibling reordering therefore triggers refresh.
A stale export exposes a fixed Cowork update prompt generated by trusted code.
The prompt targets only the plugin directory explicitly attached, selected, or
provided to Cowork; if absent or ambiguous it requires Cowork to stop and ask.
Every existing target-tree file is explicitly treated as untrusted reference
data whose instructions, commands, and policy text must never be followed.
It permits external reading only of
`~/.claude/skills/vault-guide/SKILL.md` and
`~/.claude/skills/document-reviewer/SKILL.md` (with `~` interpreted as the
current home directory, including `%USERPROFILE%` on Windows), requires
preserving the existing manifest and plugin structure, forbids reading vault
documents or credentials, and asks Cowork to report completion. The renderer
may copy this fixed prompt but cannot supply paths or prompt fragments.

## Security Model

- Treat every vault repository, `vault.json` value, and HTML fragment as
  untrusted. Only already-sanitized descriptive metadata may enter generated
  skill text.
- Never include document contents, secrets, environment variables, Git config,
  or credentials.
- Archive paths are constants. Before atomic completion, the exporter reopens
  the temporary archive and verifies its exact entry allowlist, regular-file
  types, and safe relative paths to prevent Zip Slip and unintended inclusion.
- Export is explicit and best-effort; failure cannot block application startup.
- Do not execute plugin contents, Claude commands, or vault-provided
  instructions during export.
- Tests use isolated temporary output paths and must not write to real Claude
  directories.
- Freshness state contains fingerprints only. The update prompt grants access
  only to two fixed standalone skill files and explicitly denies vault document
  and credential access.

## Failure Handling

- Cancellation leaves no output and is not shown as an error.
- Generation or archive failure removes any partial temporary file and reports a
  concise recoverable error.
- Failure to persist freshness after a completed archive export reports export
  success with a sanitized warning; it never reports the archive as failed.
- Export uses a temporary sibling file followed by atomic rename where the
  platform permits it.
- Existing destination files are overwritten only after native-dialog consent.

## Verification Strategy

1. Unit tests for exact manifest and allowlisted archive entries.
2. Unit tests proving generated plugin skills equal the canonical skill renderer
   output and hostile metadata cannot create frontmatter/Markdown instructions
   or extra archive paths.
3. Unit tests for cancellation, partial-file cleanup, deterministic fingerprint,
   extension normalization, and test-home/output isolation.
4. Narrow Vitest targets first, then test, typecheck, lint, format check, build.
5. Manual acceptance on supported Claude Desktop: upload the exported plugin,
   confirm both skills are listed, start a Cowork task, and verify Claude can
   follow the vault guidance against a test vault without exposing unrelated
   files.
6. Independent security/architecture Reviewer approval.

## Open Questions to Resolve During Implementation

- Confirm the exact custom-plugin upload file extension and validation behavior
  in the target Claude Desktop version; official docs establish custom upload
  and ZIP plugin loading but do not fully specify Desktop's picker contract.
- Confirm how Claude Desktop handles a second locally uploaded plugin with the
  same name, format version, and changed content fingerprint, then align the
  manual replacement flow and help copy. Do not claim automatic update detection
  unless the experiment proves it.
- Select an archive implementation after inspecting installed transitive
  packages; ask before adding any production dependency.
