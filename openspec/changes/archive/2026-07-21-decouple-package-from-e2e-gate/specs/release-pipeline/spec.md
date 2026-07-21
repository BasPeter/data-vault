## ADDED Requirements

### Requirement: Platform installers are not gated by platform-specific test environments

Packaging and publishing SHALL NOT be blocked by a test job that exercises only a subset of target platforms. A test-environment failure specific to one platform SHALL NOT withhold installers for the others. Jobs that no longer gate a release SHALL still run and SHALL still mark the workflow failed, so the signal is preserved rather than discarded.

Any relaxation of a release gate SHALL record, in the workflow itself, that it is temporary and the condition under which it is restored.

#### Scenario: Linux-only test environment fails on a tagged push

- **WHEN** the Linux end-to-end job fails on a tag push while lint, unit tests, and build pass
- **THEN** installers are still packaged and published for Linux, macOS, and Windows, and the workflow is still reported as failed

#### Scenario: A release gate is relaxed

- **WHEN** a job is removed from the dependency chain that gates publishing
- **THEN** the workflow states that the relaxation is temporary and names the condition under which the gate is restored

### Requirement: Release publication is observable

A tagged push that does not produce a published release SHALL be detectable without inspecting workflow run history. Release verification SHALL confirm that artifacts were published, not merely that a tag was created and pushed.

#### Scenario: A tag is pushed but publishing is skipped

- **WHEN** a version tag is pushed and the publish job is skipped or fails
- **THEN** the discrepancy between the existing tag and the absent release is surfaced rather than being inferable only from run history
