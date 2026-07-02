# Repository Working Rules

Specs are leading. Domain and implementation details live in
`openspec/specs/`. This file states working agreements, operating rules,
routing policy, and verification rules.

## Repository Profile

- Language(s) / stack: TypeScript / Node, Electron
- Package/dependency manager: npm
- Build tool / task runner: electron-vite (invoke via npm scripts)
- Build command: `npm run build`
- Test command (narrow, per file): `npx vitest run <path/to/file.test.ts>`
- Test command (broad): `npm run test`
- End-to-end test command: `npm run test:e2e` (builds, then runs Playwright)
- Lint/analyzer command: `npm run lint`
- Format command: `npm run format` (check-only: `npm run format:check`)
- Type/compile check command: `npm run typecheck`
- Default branch: `main`
- Shell environment: zsh on macOS
- Production dependencies: ask for confirmation before adding.
- CLI flags: never guess unfamiliar tool flags. Check the tool's help/docs first.

## Repository-Specific Specs

| Area         | Spec                                  |
| ------------ | ------------------------------------- |
| Architecture | `openspec/specs/architecture/spec.md` |
| Vault format | `openspec/specs/vault-format/spec.md` |
| Security     | `openspec/specs/security/spec.md`     |

Use the relevant area spec for any work touching that area. Security
requirements are hard constraints: treat any change that would touch a
requirement in `openspec/specs/security/spec.md` as at least `risky`,
regardless of how small it looks.

## Repository-Specific Notes

- Do not copy personal vault documents into this repository. Treat every
  external vault repository and every HTML fragment as untrusted input
  (see `openspec/specs/security/spec.md`).
- Add tests alongside new parsing, path-security, repository-state, or IPC
  logic.
- Keep commits atomic; do not mix formatting-only changes with behavior.
- Source code, API names, user-facing product copy, and commit messages
  are English unless a product requirement explicitly says otherwise.

## Project Operating Rules

Bias: caution over speed on non-trivial work.

### Rule 1 — Think Before Coding

State assumptions explicitly. Ask rather than guess.
Push back when a simpler approach exists. Stop when confused.

### Rule 2 — Simplicity First

Minimum code that solves the problem. Nothing speculative.
No abstractions for single-use code.

### Rule 3 — Surgical Changes

Touch only what you must. Do not improve adjacent code.
Match existing style. Do not refactor what is not broken.

### Rule 4 — Goal-Driven Execution

Define success criteria. Loop until verified.
Strong success criteria let agents loop independently.

### Rule 5 — Use the Model Only for Judgment Calls

Use the model for classification, drafting, summarization, extraction, judgment, and architectural tradeoffs.
Do not use the model for deterministic transforms, routing logic code can perform, retries scripts can handle, or mechanical validation commands can perform.
If code can answer, code answers.

### Rule 6 — Effort Is Proportional to Classification

Effort scales with task classification: trivial < normal < risky/architectural.
If work grows beyond its classification, stop expanding scope, summarize state, list completed work, list remaining work, and surface the pressure.

### Rule 7 — Surface Conflicts, Do Not Average Them

If two patterns contradict, pick one.
Prefer the pattern that is more recent, more tested, more local to the affected area, and more aligned with project rules.
Explain why. Flag the other pattern for cleanup.

### Rule 8 — Read Before You Write

Before adding code, read exports, immediate callers, shared utilities, nearby tests, and existing conventions.
If unsure why existing code is structured a certain way, stop and escalate.

### Rule 9 — Tests Verify Intent, Not Just Behavior

Tests must encode why behavior matters, not just what it does.
A test that cannot fail when business logic changes is weak.

### Rule 10 — Checkpoint After Every Significant Step

Summarize what was done, what was verified, what remains, and what is uncertain.
Do not continue from a state that cannot be described clearly.

### Rule 11 — Match the Codebase's Conventions, Even If You Disagree

Conformance is more important than taste inside an existing codebase.
If a convention is harmful, surface it. Do not silently fork the style.

### Rule 12 — Fail Loud

"Completed" is wrong if anything was skipped silently.
"Tests pass" is wrong if tests were skipped.
Default to surfacing uncertainty, skipped checks, and risk.

## OpenSpec Policy

OpenSpec is the source of truth for non-trivial work.

Classify every task before execution:

- `trivial`: small, local, low-risk, easily reversible. OpenSpec may be skipped.
- `normal`: requires OpenSpec.
- `risky`: requires OpenSpec and Reviewer.
- `architectural`: requires OpenSpec and Reviewer.

Default flow:

```text
Explore if unclear
  → Propose change
  → Create or continue artifacts
  → Apply bounded tasks
  → Verify change
  → Review if risky or architectural
  → Sync specs
  → Archive change
  → Commit only when requested
```

Do not implement first and write OpenSpec afterward for non-trivial work.

## Multi-Agent System

The primary agent is an orchestrator, not a repository worker.

Primary agent responsibilities:

- classify work
- decide whether OpenSpec is required
- delegate repository discovery
- synthesize findings
- route implementation, debugging, verification, and review
- make final acceptance decisions from evidence
- invoke commit workflow only when requested

Primary agent non-responsibilities:

- broad repository scanning
- reading many files directly
- grep-heavy investigation
- large summarization work
- routine implementation
- reviewing its own work as final review

## Delegation Rules

Read directly, batching independent reads and commands in parallel, when the targets are already known and few (roughly five focused reads or fewer).
Delegate to Scout/Reader when discovery is open-ended: unknown file locations, repo-wide pattern search, large-file summarization, or when raw content would flood orchestrator context. Repository inspection — reading files, pattern search, directory traversal, schema discovery, module mapping, dependency inspection, and build-script inspection — routes the same way.

Use specialized agents:

```text
Missing context         → Scout / Reader
Straight implementation → Implementer / Coder
Unclear failure         → Debugger
Mechanical checks       → Verifier
Risk or architecture    → Reviewer
User-facing copy        → Copy Writer
```

This delegation model is deliberate: the repository's multi-agent workflow overrides default harness anti-spawn guidance where the two conflict.

## Agent Role Contract

### Architect

Owns workflow, classification, OpenSpec orchestration, delegation, scope control, final acceptance, and commit orchestration.

Must not perform broad search, large implementation, or final review of its own work.

### Scout / Reader

Read-only context agent for file discovery, pattern discovery, exports, callers, tests, build scripts, OpenSpec artifacts, and compact reports.

Must not edit, implement, decide architecture, or spawn other agents.

### Implementer / Coder

Bounded editing agent for accepted OpenSpec tasks or precise trivial tasks.

Must keep diffs small, preserve conventions, update tests, and stop when artifacts are wrong or incomplete.

### Debugger

Read-only root-cause agent for failing tests, runtime errors, unclear behavior, async/state issues, dependency injection, framework internals, persistence boundaries, and architectural ambiguity.

Must reproduce, hypothesize, isolate, and propose the smallest safe fix.
Must not edit files.

Debugger output must end with one of:

```text
ROOT_CAUSE_FOUND
LIKELY_CAUSE
INSUFFICIENT_EVIDENCE
```

Debugger output also states:

```text
Reviewer needed: Yes | No
```

### Verifier

Read-only mechanical verification agent.

Must inspect diffs, run relevant checks, compare implementation against OpenSpec, detect unrelated changes, and report evidence.

Verifier output must end with one of:

```text
PASS
PASS_WITH_WARNINGS
FAIL
```

Verifier output also states:

```text
Commit readiness: READY | NOT_READY | NOT_REQUESTED
Reviewer needed: Yes | No
```

### Reviewer

Read-only high-judgment review agent for architecture, public API impact, persistence, security, data loss, maintainability, and whether tests prove intent.

Reviewer output must end with one of:

```text
APPROVE
REQUEST_CHANGES
COMMENT_ONLY
```

Reviewer output also states:

```text
Commit readiness: READY | NOT_READY | NOT_REQUESTED
```

### Copy Writer

Bounded agent for user-facing product copy: headlines, subheadlines, CTA text, proof framing, objection handling, and UX microcopy.

Must not fabricate evidence, broaden product scope, change implementation logic outside explicit dispatch, or stage/commit.

Copy Writer output is a Copy Report. It does not gate acceptance and carries no verdict marker.

### Model-pin strategy

Judgment-heavy agents (Architect, Debugger, Reviewer, Copy Writer) use `model: inherit` so they run on the strongest available model.
Mechanical/bounded agents (Scout, Verifier, Implementer) pin a cheap model alias for cost discipline.
Generic aliases and `inherit` survive model migrations without edits; a named model pin would not.

## Build and Testing Rules

Use repository conventions and specs first.

Use only the commands defined in the Repository Profile. Do not substitute a different toolchain or invent flags.

Run the narrowest relevant check first.
Expand scope only after narrow checks pass.
Prefer the narrowest relevant test target for the changed file or module.

## Quality Gate

Before claiming completion:

- relevant tests ran or were explicitly skipped with reason
- lint/analyzers ran where relevant or were explicitly skipped with reason
- formatting ran where relevant or was explicitly skipped with reason
- type/build checks ran where relevant or were explicitly skipped with reason
- OpenSpec tasks match implementation
- no unrelated files changed
- risks are surfaced
- Verifier passed for non-trivial changes
- Reviewer approved risky or architectural changes

## Commit Policy

Agents may commit only when the user explicitly asks to commit, finalize with commit, or create a commit.
Confirm the current branch is the default branch from the Repository Profile before committing.

Use the `commit-workflow` skill at `.claude/skills/commit-workflow/SKILL.md`. Prepare
the commit message first and wait for explicit approval before committing.

Commit message format:

```text
type(scope): description
```

Single line only.
No body unless explicitly requested.
Stage only intended files.
Do not commit if required checks fail.
