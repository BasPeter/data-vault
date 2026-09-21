## Context

Data Vault generates three canonical skills and installs them only for explicit selections in a main-process-owned fixed provider registry. Pi discovers global skills from `~/.pi/agent/skills`; the application must add that one fixed destination without treating Pi project-local paths or its alternate shared skill root as installer targets.

## Goals / Non-Goals

**Goals:**

- Let users explicitly select Pi and receive all three canonical generated skills.
- Keep provider IDs, roots, skill names, rendering, persistence, and writes trusted and main-process-owned.
- Preserve existing per-provider freshness, failure isolation, and non-destructive deselection behavior.

**Non-Goals:**

- Installing into `.pi/skills`, `.agents/skills`, `~/.agents/skills`, package skill paths, or user-configured paths.
- Duplicating Pi installs across more than one discovery root.
- Changing skill contents, the Claude plugin, or existing providers’ installation semantics.

## Decisions

### Use `~/.pi/agent/skills` as Pi’s sole fixed root

Add a `pi` registry entry whose root is derived from the user home directory and resolves only to `~/.pi/agent/skills`. Pi documents this as a global discovery root. The alternative `~/.agents/skills` is intentionally not also used because the existing provider model is one root per provider; duplicate roots would create ambiguous status, freshness, and partial-failure behavior.

### Extend the existing provider registry end-to-end

Add `pi` to the shared provider ID union and fixed main-process registry. Reuse the existing validated selection persistence, generated-skill loop, private marker/fingerprint behavior, and status response. The renderer continues to submit IDs only and derives display from returned provider status.

### Enforce symlink-safe containment for every provider root

Use `@openclaw/fs-safe` in native-required mode for generated skill and marker writes. Create each fixed provider root through a root handle pinned to the trusted home directory, then write relative paths through a provider-root handle with symlink mutation rejection. Apply the same helper to Claude, Codex, OpenCode, and Pi rather than adding a Pi-only exception. The helper documents Windows containment as best-effort against concurrent local mutation; this limitation is an explicit accepted security trade-off. A rejected provider is reported through its existing provider-specific installation error state while other selected providers continue.

### Test Pi and containment through the shared provider contract

Add installer tests that assert Pi’s root, selected-only write behavior, failure/status isolation, freshness/tamper detection, all three generated skills, and symlink-escape rejection for each provider root. Update panel fixtures and E2E assertions so Pi is covered as another provider rather than creating Pi-specific UI logic.

## Risks / Trade-offs

- [Global filesystem write allowlist expansion] → Limit Pi to the single documented fixed root, validate only the fixed `pi` ID, and retain main-process ownership and existing atomic/fingerprint checks.
- [Pi discovery precedence or alternate roots could surprise users] → Document the chosen root and do not write duplicate copies.
- [Existing global skill directories can contain untrusted files] → Reject symlinks and canonical-path escapes in the fixed root and generated skill directories; write only the three trusted canonical skill directories and do not execute or consume neighboring skill content.

## Migration Plan

Existing saved selections remain valid because `pi` is additive. Users must explicitly select Pi before it receives files. Deselecting Pi later stops refreshes but does not delete files. Rollback removes Pi from the selection/registry and stops future Pi writes; existing Pi skill files remain manually removable.

## Open Questions

None.
