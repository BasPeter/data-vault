# Tasks: add-claude-cowork-plugin

## 1. Format validation and bounded design

- [x] 1.1 Confirm the target Claude Desktop custom-plugin file contract using
      current official documentation and a minimal manual upload experiment.
- [x] 1.2 Record the accepted archive root/layout, observed same-name replacement
      behavior, manual update procedure, and minimum supported Claude Desktop
      version in implementation documentation.
- [x] 1.3 Inspect available archive libraries; obtain user confirmation before
      adding any production dependency.

## 2. Canonical plugin generation

- [x] 2.1 Expose a pure canonical rendering result for the existing
      `vault-guide` and `document-reviewer` skills without duplicating templates.
- [x] 2.2 Add a main-process Claude plugin exporter with fixed identity,
      allowlisted entries, format semantic version, deterministic content
      fingerprint, and English README; exclude export timestamps from archive
      content and normalize entry order, timestamps, permissions, and compression.
- [x] 2.3 Create archives through a temporary file and clean up on cancellation
      or error; normalize the final extension and prevent unintended overwrite.
- [x] 2.4 Before atomic completion, reopen the temporary archive and verify it
      contains exactly the allowed regular files and no absolute, traversal,
      symlink, secret, or vault-document content.
- [x] 2.5 Add focused unit tests for manifest/schema output, archive layout,
      canonical skill equivalence, hostile metadata, determinism, and cleanup.

## 3. Trusted application integration

- [x] 3.1 Add a trusted IPC handler that opens a native save dialog and invokes
      the exporter without accepting renderer-supplied content or archive paths.
- [x] 3.2 Expose the narrow export result through preload and TypeScript types.
- [x] 3.3 Extend the agent skills UI with “Export Claude plugin”, progress/error
      states, snapshot/update guidance, and supported installation steps.
- [x] 3.4 Clearly explain possible duplicate capabilities when standalone Claude
      skills and the plugin are both installed; do not delete either automatically.
- [x] 3.5 Update README/help documentation with export, installation, update, and
      uninstall instructions.
- [x] 3.6 Add IPC and UI tests, including cancellation and sanitized errors.

## 4. Verification and review

- [x] 4.1 Run the narrow exporter and skill tests and fix failures.
- [x] 4.2 Run `npm run test`, `npm run typecheck`, `npm run lint`,
      `npm run format:check`, and `npm run build`.
- [x] 4.3 Manually upload the exported plugin in Claude Desktop and verify both
      skills in Chat and a Cowork task using a non-personal test vault.
- [x] 4.4 Run OpenSpec verification and resolve every mismatch.
- [x] 4.5 Obtain independent Reviewer approval for security, archive handling,
      architecture, privacy, and whether tests prove intent.

## 5. Claude plugin freshness assistance

- [x] 5.1 Persist successful export and canonical skill fingerprints in userData
      without storing vault metadata, prompt input, or archive paths.
- [x] 5.2 Expose typed `not-exported`, `current`, and `stale` status through
      trusted IPC and refresh it after export, skill installation, and vault changes.
- [x] 5.3 Add a collapsed, accessible Claude plugin explainer and stale-only
      “Copy Cowork update prompt” interaction with success/error feedback.
- [x] 5.4 Generate the fixed portable update prompt in trusted code with exact
      skill-path allowlisting and explicit document/credential prohibitions.
- [x] 5.5 Add focused persistence, fingerprint-transition, prompt-boundary, IPC,
      collapsible accessibility, status-state, and clipboard tests.
- [x] 5.6 Obtain independent Reviewer approval for fingerprint persistence,
      installed-skill integrity checks, prompt boundaries, and clipboard UX.
