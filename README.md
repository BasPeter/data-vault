# Data Vault

Data Vault is a desktop viewer for private or public Git-backed knowledge
repositories. A vault stores HTML fragments or Markdown files under
`documents/`; the application clones or opens the repository locally and renders
its folder tree, metadata, Mermaid diagrams, and document graph.

## Development

Prerequisites: Node.js 22+ and Git.

```bash
npm install
npm run dev
```

Validation and packaging:

```bash
npm run typecheck
npm run build
npm run package
```

## Vault repository

A compatible repository contains a `documents/` directory. It may override its
display name or documents location through `vault.json`:

```json
{
  "schemaVersion": 1,
  "name": "Team knowledge",
  "documentsDirectory": "documents",
  "format": "html"
}
```

`format` may be `html` or `markdown`; when omitted, Data Vault treats the vault
as `html` for backwards compatibility.

HTML documents are fragments rather than complete pages. Metadata is optional:

```html
<!--vault
title: Example
date: 2026-06-19
tags: example, knowledge
-->
<h1>Example</h1>
<p>Document body.</p>
```

Internal links use document IDs: `<a href="#folder/document.html">Label</a>`.
Mermaid diagrams use `<pre class="mermaid">...</pre>`.

Markdown vaults use `.md` files with optional frontmatter:

```markdown
---
title: Example
date: 2026-06-26
tags:
  - example
  - knowledge
---

# Example

Document body with an [internal link](folder/document.md).
```

Mermaid diagrams in Markdown use fenced `mermaid` code blocks.

The quick-notes button opens a scratchpad for the active vault. Its HTML is
stored as `quick-notes.html` at the documents root and is intentionally omitted
from the document tree and graph. The application does not commit this file.

## Connecting to GitHub

**Connect to GitHub** signs you in with GitHub's OAuth device flow — no terminal,
SSH keys, or Git credential setup required. Enter the displayed code on GitHub,
approve access, and Data Vault can then:

- list your repositories and clone any of them as a vault, and
- create a brand-new repository on GitHub (public or private) and open it in one
  step.

You can connect **more than one account** at the same time — for example a
personal account and a work account — from the same dialog. Each vault remembers
the account it was cloned or created with and automatically uses that account's
token for its pushes and pulls; vaults added by raw URL are matched to a
connected account by repository owner. The repository picker lists repositories
across every connected account, and the create form lets you choose which
account to create under.

Each account's access token is stored locally, encrypted with the operating
system keychain through Electron `safeStorage` when available. Tokens never reach
the renderer and are supplied to Git per-operation (via a request header), so
they are never written into a repository's Git config or remote URL. When the documents directory is
missing — for example in a freshly created repository — it is created
automatically when the vault is opened.

The **Advanced** options still allow cloning by raw Git URL (using your system
Git credentials) or opening a local clone, which is what GitHub-connected sign-in
replaces for most users.

### Build configuration

GitHub sign-in requires a [GitHub OAuth App](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)
with **device flow enabled**. Supply its client ID at build time; the device-flow
client ID is public, not a secret:

```bash
DATA_VAULT_GITHUB_CLIENT_ID=Iv1xxxxxxxxxxxxx npm run build
```

When no client ID is configured, the GitHub sign-in button is disabled and only
the advanced Git-URL and local-folder options are available.

## Agent skills

Data Vault generates two agent skills for Claude and Codex from your registered
vault list:

- **vault-guide** — how to read, create, edit, and cross-link vault documents
  (including the rule that cross-vault links may only point from a less public
  vault to a more public one), and to run the reviewer after every change.
- **document-reviewer** — a structural check that documents conform to the
  vault's setup and rules: fragment shape, metadata, link integrity, naming,
  placement, language, and cross-vault privacy. It does not critique content.

The skills install automatically on launch and whenever your vault list changes,
writing only to `~/.claude/skills/<skill>` and `~/.codex/skills/<skill>`. The
sparkles button in the toolbar shows their status and lets you re-install
manually; a red dot means the installed copies are missing or out of date.

## Application updates

The installed version is shown in the top-right of the toolbar. Installed builds
check GitHub Releases automatically on launch (and periodically afterwards), and
a red dot appears on the version when a newer release is found. A newer release
downloads in the background; click the version to open the update prompt and
choose **Update and restart** once it is ready. You can also trigger a manual
check from the same prompt. Update checks are unavailable in the unpackaged
development build. macOS updates require signed release builds.

## Security model

The renderer is sandboxed and has no Node.js integration. Filesystem and Git
operations run in Electron's main process behind a narrow typed IPC bridge.
Vault HTML is sanitized before rendering and Mermaid runs in strict mode.

See [AGENTS.md](./AGENTS.md) for architecture and contribution rules.
