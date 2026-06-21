# Data Vault — Engineering Instructions

Data Vault is a generic Electron desktop application for viewing Git-backed
HTML knowledge vaults. Application code and user data are separate: this
repository must never contain personal or coworker vault documents.

This file is the source of truth for architecture, security invariants, and
contribution workflow. `CLAUDE.md` points here.

## Architecture

```text
electron/main.ts       privileged application lifecycle and IPC handlers
electron/preload.ts    narrow typed context bridge
electron/vault.ts      repository, filesystem, manifest, graph, and Git logic
electron/skills.ts     renders and installs the versioned vault-guide and document-reviewer agent skills
src/                   sandboxed React renderer
skills/                repository-local agent workflows
```

The main process owns all filesystem, process, dialog, and Git access. The
renderer obtains data only through `window.vaultApi`; never import Node or
Electron modules into `src/`.

## Vault contract

- A vault is a local Git repository or a repository cloned by the app.
- Content defaults to `documents/`; `vault.json` may set
  `documentsDirectory` and a display `name`.
- `vault.json` may also set `defaultLanguage` (a language tag suggested to the
  agents when writing documents) and `structure`, a nested map keyed by
  directory segment (`{ title?, description?, children? }`) describing each
  directory's purpose. Both are editable from the vault
  switcher's settings dialog, surfaced in the sidebar, and injected into the
  generated agent skills; changing them marks the installed skills outdated.
- Documents are content-only `.html` fragments with an optional `<!--vault`
  metadata block containing `title`, `date`, and comma-separated `tags`.
- `quick-notes.html` at the documents root is a reserved local scratchpad. It
  is excluded from the manifest and graph and may remain uncommitted.
- Internal links are hashes whose value is another document ID.
- Mermaid source is stored in `<pre class="mermaid">` blocks.
- Never add real vault data, credentials, repository URLs, or generated clones
  to this application repository.

## Security invariants

- Keep `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`.
- Expose one validated preload method per operation; never expose raw
  `ipcRenderer`, filesystem, shell, or child-process APIs.
- Sanitize every vault HTML fragment before insertion into the DOM.
- Keep Mermaid at `securityLevel: "strict"`.
- Reject paths and symlinks that escape the configured documents directory.
- Permit repository URLs only through an explicit allowlist of Git transports.
- Validate IPC senders and arguments in the main process.
- Block renderer navigation and validate external URLs before opening them.
- Do not add a localhost HTTP server to the desktop runtime.
- The agent-skill installer writes only to the fixed paths
  `~/.claude/skills/<skill>` and `~/.codex/skills/<skill>` for the generated
  `vault-guide` and `document-reviewer` skills (no renderer-supplied paths) and
  never embeds Data Vault app-repo content. The skills install automatically on
  launch and after the vault list changes; auto-install is best-effort and must
  never fail app startup.

## Development workflow

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

Add tests alongside new parsing, path-security, repository-state, or IPC logic.
Keep commits atomic and do not mix formatting-only changes with behavior.

## Commit workflow

Use `skills/commit-workflow/SKILL.md` whenever the user requests a commit.
That workflow requires drafting the message and obtaining explicit approval
before committing. Never push without a separate explicit request.

## Language

Source code, API names, user-facing product copy, and commit messages are
English unless a product requirement explicitly says otherwise.
