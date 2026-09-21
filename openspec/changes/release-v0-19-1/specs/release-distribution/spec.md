# Release distribution

## ADDED Requirements

### Requirement: Patch release metadata

The release process SHALL set the application version and lockfile version to the approved patch version and SHALL regenerate the tracked application changelog using the repository-provided generator.

#### Scenario: Release metadata is prepared

- **WHEN** the `0.19.1` patch release is prepared
- **THEN** `package.json`, `package-lock.json`, and the generated application changelog identify the release consistently

### Requirement: GitHub installer publication

The release process SHALL publish the approved release commit by pushing an exact `v<version>` tag to the configured GitHub Actions workflow and SHALL verify that the corresponding GitHub Release contains the produced installer and updater assets.

#### Scenario: Tagged release succeeds

- **WHEN** the validated release commit is tagged `v0.19.1` and the tag is pushed
- **THEN** the configured workflow creates a GitHub Release containing the release installers and updater metadata

### Requirement: Release verification gate

The release process SHALL not publish a release tag until the applicable checks and required review are complete, and it SHALL surface any unavailable or failed verification.

#### Scenario: Verification failure

- **WHEN** a required check or review is missing or fails
- **THEN** the release tag is not published and the failure is reported
