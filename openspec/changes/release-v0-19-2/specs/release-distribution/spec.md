## ADDED Requirements

### Requirement: Recovery patch release metadata

The release process SHALL set the application and lockfile versions to `0.19.2`, SHALL resolve `electron-builder` to at least `26.16.1`, and SHALL regenerate the tracked application changelog using the repository-provided generator.

#### Scenario: Recovery release metadata is prepared

- **WHEN** the `0.19.2` recovery patch release is prepared
- **THEN** `package.json`, `package-lock.json`, and the generated application changelog identify `0.19.2` consistently and the lockfile resolves `electron-builder` to at least `26.16.1`

### Requirement: Immutable failed-release record

The recovery release process SHALL retain the existing `v0.19.1` tag unchanged and SHALL publish any recovery candidate through a distinct `v0.19.2` tag.

#### Scenario: Recovery tag is prepared

- **WHEN** the validated recovery release commit is ready for publication
- **THEN** the release process leaves `v0.19.1` unchanged and uses only the exact `v0.19.2` tag for the recovery workflow

### Requirement: Cross-platform recovery publication

The release process SHALL publish the approved recovery commit by pushing the exact `v0.19.2` tag to the configured GitHub Actions workflow and SHALL verify a GitHub Release containing Windows and Linux installers, updater metadata, and signed and notarized macOS artifacts.

#### Scenario: Recovery tagged release succeeds

- **WHEN** the validated recovery release commit is tagged `v0.19.2` and the tag is pushed
- **THEN** the configured workflow creates a GitHub Release containing the expected Windows, Linux, macOS, and updater assets
- **AND** the macOS workflow evidence confirms signing and notarization completed

### Requirement: Recovery release verification gate

The release process SHALL not publish the `v0.19.2` release tag until applicable checks and required review are complete, and SHALL surface unavailable or failed verification.

#### Scenario: New tag starts recovery workflow

- **WHEN** the approved `v0.19.2` tag is pushed
- **THEN** the configured tag trigger starts a new recovery workflow without requiring a rerun of the historical `v0.19.1` workflow
