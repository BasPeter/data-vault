# Data Vault

Data Vault is a desktop viewer for private or public Git-backed knowledge
repositories. A vault stores content-only HTML fragments under `documents/`;
the application clones or opens the repository locally and renders its folder
tree, metadata, Mermaid diagrams, and document graph.

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
  "documentsDirectory": "documents"
}
```

Documents are HTML fragments rather than complete pages. Metadata is optional:

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

The quick-notes button opens a scratchpad for the active vault. Its HTML is
stored as `quick-notes.html` at the documents root and is intentionally omitted
from the document tree and graph. The application does not commit this file.

## Application updates

Installed builds can check GitHub Releases for updates from the toolbar or the
onboarding screen. A newer release downloads in the background; click the same
button again to install it and restart Data Vault. Update checks are unavailable
in the unpackaged development build. macOS updates require signed release builds.

## Security model

The renderer is sandboxed and has no Node.js integration. Filesystem and Git
operations run in Electron's main process behind a narrow typed IPC bridge.
Vault HTML is sanitized before rendering and Mermaid runs in strict mode.

See [AGENTS.md](./AGENTS.md) for architecture and contribution rules.
