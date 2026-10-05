## MODIFIED Requirements

### Requirement: Recovery patch release metadata

The release process SHALL set the application and lockfile versions to `0.19.3`, SHALL retain the validated packaging toolchain, and SHALL regenerate the tracked application changelog using the repository-provided generator.

#### Scenario: Recovery release metadata is prepared

- **WHEN** the `0.19.3` patch release is prepared
- **THEN** `package.json`, `package-lock.json`, and the generated application changelog identify `0.19.3` consistently
- **AND** the generated changelog includes the changes committed since `v0.19.2`

### Requirement: Immutable failed-release record

The release process SHALL retain all existing release tags unchanged and SHALL publish the new candidate only through a distinct `v0.19.3` tag.

#### Scenario: Recovery tag is prepared

- **WHEN** the validated patch release commit is ready for publication
- **THEN** the release process leaves existing tags unchanged and uses only the exact `v0.19.3` tag for the new workflow

### Requirement: Cross-platform recovery publication

The release process SHALL publish the approved patch commit by pushing the exact `v0.19.3` tag to the configured GitHub Actions workflow and SHALL verify a GitHub Release containing Windows and Linux installers, updater metadata, and signed and notarized macOS artifacts.

#### Scenario: Recovery tagged release succeeds

- **WHEN** the validated patch release commit is tagged `v0.19.3` and the tag is pushed
- **THEN** the configured workflow creates a GitHub Release containing the expected Windows, Linux, macOS, and updater assets
- **AND** the macOS workflow evidence confirms signing and notarization completed

### Requirement: Recovery release verification gate

The release process SHALL not publish the `v0.19.3` release tag until applicable checks and required review are complete, and SHALL surface unavailable or failed verification.

#### Scenario: New tag starts recovery workflow

- **WHEN** the approved `v0.19.3` tag is pushed
- **THEN** the configured tag trigger starts a new release workflow for the exact reviewed commit
