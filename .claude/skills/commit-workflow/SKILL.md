---
name: commit-workflow
description: Commit completed work with pre-commit checks, OpenSpec verification, and a single-line conventional commit message. Use when the user asks to commit, finalize, or save with a commit.
---

# Commit Workflow

Use when the user asks to commit, finalize, save the work, or when an Architect task explicitly includes committing.

Do not create branches or pull requests unless the user explicitly asks.

## Preconditions

- The current task is complete or intentionally being committed as a checkpoint.
- OpenSpec artifacts are updated or explicitly unnecessary.
- Delta specs have been synced or archival has been handled when finalizing OpenSpec changes.
- Implementation scope is bounded and reviewed according to risk.
- The working tree does not contain unrelated changes.

## Steps

1. Inspect repository state:

   ```bash
   git status --short
   git branch --show-current
   git diff --stat
   git diff
   ```

2. Confirm branch policy:
   - Commit on the default branch defined in the Repository Profile in `AGENTS.md`.
   - If already on the default branch, continue.
   - If not on the default branch, stop unless the user confirms switching is safe.
   - Do not create a branch.
   - Do not open a pull request.

3. Confirm OpenSpec state:
   - If this was an OpenSpec change, run `openspec-verify-change` through Verifier.
   - If finalizing a completed OpenSpec change, sync and archive using `openspec-sync-specs` and `openspec-archive-change` unless explicitly told not to.
   - If OpenSpec is unnecessary, state why.

4. Run checks using the commands defined in the Repository Profile in `AGENTS.md`:
   - the test command (narrow first, broad/affected when the change spans projects)
   - the lint/analyzer command
   - the format command

   Do not substitute a different toolchain. If a Repository Profile command is missing, surface it instead of guessing.

5. Use Verifier for commit-readiness evidence.

6. Use Reviewer before committing when the change is non-trivial, risky, architectural, infrastructure, persistence, public API, security, or data-loss related.

7. Stage intended files only:

   ```bash
   git add <intended-files>
   ```

8. Commit with a single-line conventional commit message:

   ```bash
   git commit -m "type(scope): concise summary"
   ```

## Commit message rules

- One line only.
- Conventional commit format: `type(scope): description`
- Lowercase type and description.
- Imperative, specific summary.

Common types: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`, `build`, `ci`

## Failure handling

- If checks fail because of the current change, send the task back to Implementer.
- If failures are unclear, send the task to Debugger.
- If failures appear unrelated, document evidence and let Architect decide whether committing is acceptable.
- Never hide skipped or failed checks.

## Final report

```markdown
# Commit Report

## Commit

- Hash:
- Message:

## Files committed

- `path/to/file`

## OpenSpec

- Skill used:
- Status:

## Checks run

- `<command>`
  - Result:

## Verification

- Verifier verdict:
- Reviewer verdict, if used:

## Skipped checks

- Check:
  - Reason:

## Risks

- ...
```
