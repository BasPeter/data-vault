## ADDED Requirements

### Requirement: Main process owns the OpenCode API and session-grant boundary

The main process SHALL exclusively validate OpenCode setup, persist verified encrypted credentials, check authenticated health and compatibility, construct and execute fixed OpenCode API requests, and own renderer/session authorization. The preload SHALL expose only typed setup, remove-setup, status, list-owned-sessions, create-session, list-messages, send-prompt, and abort-prompt operations. `status` SHALL validate the requested owned ID before main alone calls documented `GET /session/status`, then return only that ID's projected state. Data Vault SHALL NOT install, launch, stop, supervise, embed, enumerate, or adopt OpenCode sessions.

#### Scenario: Renderer performs an allowed operation

- **WHEN** the exact trusted renderer main frame invokes one of the typed OpenCode methods with valid bounded input
- **THEN** main performs the corresponding fixed operation and returns only its bounded structured DTO
- **AND** the renderer cannot supply a URL, HTTP method, header, credential, arbitrary API route, or unowned session ID

#### Scenario: Renderer creates a session

- **WHEN** the exact trusted renderer main frame successfully creates a session under the current configuration
- **THEN** main records only that session's bounded metadata in memory for that frame and configuration generation
- **AND** no other server session becomes visible or authorized

#### Scenario: Ownership context ends

- **WHEN** configuration changes or is removed, the main frame navigates, or the main window is destroyed
- **THEN** main invalidates every associated session grant and current-lifetime metadata entry before a later operation can use it

#### Scenario: OpenCode is externally managed

- **WHEN** OpenCode is not running, incompatible, or becomes unavailable
- **THEN** main returns a bounded status or error result without starting, stopping, or otherwise controlling the OpenCode process
