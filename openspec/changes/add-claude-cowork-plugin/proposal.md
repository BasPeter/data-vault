# Proposal: add-claude-cowork-plugin

## Why

Data Vault currently installs two generated Agent Skills directly into
`~/.claude/skills` and `~/.codex/skills`. Claude Desktop now supports custom
plugins in Chat and Cowork, but Data Vault cannot produce a plugin that users
can upload through Claude Desktop's supported Plugins UI. Packaging the
existing vault-aware skills as a plugin gives Cowork the same durable guidance
without relying on undocumented Claude Desktop storage paths.

## What Changes

1. Add a user-initiated export that creates a Claude plugin archive containing:
   - `.claude-plugin/plugin.json` with stable plugin identity and version;
   - `skills/vault-guide/SKILL.md`;
   - `skills/document-reviewer/SKILL.md`;
   - a `README.md` with Claude Desktop/Cowork installation and update steps.
2. Reuse the existing generated skill content, sanitization, and vault snapshot
   logic so the plugin describes the user's currently registered vaults without
   copying vault documents into the application repository or archive.
3. Add a narrow main-process export service and IPC endpoint. The renderer may
   request an export but may not select archive entries or supply filesystem
   paths used inside the plugin.
4. Add product UI that explains the distinction between automatically installed
   standalone skills and the manually uploaded Claude plugin, including that a
   new export is required after vault configuration changes.
5. Validate archive structure, manifest fields, generated content, permissions,
   and hostile vault metadata with focused tests.
6. Document a future marketplace option, but do not include it in this change:
   marketplace plugins are static while this plugin contains a per-user snapshot
   of local vault paths.
7. Add a collapsible Claude plugin explainer and persist the last successful
   export fingerprint. When the standalone Claude skills no longer match that
   export, offer a fixed, copyable Cowork update prompt.

## Capabilities

### New Capabilities

- `claude-cowork-plugin`: Export a safe, installable Claude plugin snapshot that
  exposes Data Vault's generated skills in Claude Desktop and Cowork.

### Modified Capabilities

- `architecture`: Assign plugin generation and archive export to the Electron
  main process behind narrow IPC.
- `security`: Permit only explicit, user-initiated writes of a fixed plugin
  archive and constrain all archive entries and generated content.

## Impact

- Expected code: `electron/skills.ts` plus a small plugin archive/export module,
  `electron/main.ts`, `electron/preload.ts`, `src/types.ts`, the agent skills UI,
  focused tests, and README/help copy.
- Specs: adds `claude-cowork-plugin`; modifies architecture and security.
- Classification: **risky** because it expands the agent-extension export and
  filesystem-write boundary. OpenSpec verification and Reviewer approval are
  required before acceptance.
- No production dependency is assumed. Implementation must first determine
  whether an already-installed archive library is sufficient; adding a
  production dependency requires user confirmation.
- No automatic Claude Desktop installation, marketplace publication, connector,
  hook, sub-agent, or local MCP server is included.
