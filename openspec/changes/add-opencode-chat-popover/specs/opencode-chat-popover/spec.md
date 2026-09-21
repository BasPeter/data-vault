## ADDED Requirements

### Requirement: Chat action is persistently available in the loaded shell

The application SHALL display a small round OpenCode chat action fixed to the bottom-right of the loaded application shell and SHALL NOT display it during loading or onboarding.

#### Scenario: Loaded vault shell is visible

- **WHEN** the application has loaded a vault and displays its main shell
- **THEN** an accessible OpenCode chat action is visible above the bottom-right edge without changing document layout

#### Scenario: Application is not ready

- **WHEN** the application is loading or displaying onboarding
- **THEN** the OpenCode chat action is not rendered

### Requirement: Chat popover is host-owned and accessible

The application SHALL open a host-owned React popover when the chat action is activated. It SHALL support keyboard activation, Escape and outside dismissal, focus restoration, and host-owned setup, status, owned-session list, transcript, composer, loading, and error UI. It SHALL NOT render an OpenCode webview, iframe, embedded official UI, server-wide session list, or existing-session adoption UI.

#### Scenario: User opens and dismisses chat

- **WHEN** the user activates the chat action with pointer or keyboard and then dismisses the popover with Escape or an outside activation
- **THEN** the popover opens above and aligned to the end of the action, the trigger exposes its expanded state, and dismissal restores focus to the chat action

#### Scenario: OpenCode is unavailable

- **WHEN** configuration is absent, unavailable, incompatible, or rejected by authentication
- **THEN** the popover displays a specific host-owned setup or recovery state with actionable retry guidance
- **AND** the rest of Data Vault remains usable

### Requirement: Native chat operates only current-lifetime owned sessions

The host-owned popover SHALL let the user create, select, and operate only session metadata created by the current trusted main frame after the current OpenCode configuration. It SHALL show at most 20 owned sessions, view a bounded escaped transcript, submit a bounded prompt, and abort an active prompt. It SHALL neither enumerate nor adopt other OpenCode sessions and SHALL NOT send vault paths, document bodies, selected-document state, application secrets, or other Data Vault context to OpenCode.

#### Scenario: User starts a conversation

- **WHEN** a compatible configured OpenCode instance is ready and the user creates then selects a session and submits a valid prompt
- **THEN** the popover displays host-owned loading state, requests the prompt through typed IPC, and refreshes the transcript through the typed message-list operation
- **AND** no vault context is included in the request

#### Scenario: Existing remote session was not created by this app context

- **WHEN** OpenCode contains a session that was not created by the current trusted main frame after the current configuration
- **THEN** the popover does not display, select, read, prompt, status-check, or abort that session

### Requirement: Message refresh and busy state use bounded polling

The application SHALL use typed status and message operations on a fixed one-second cadence for at most two minutes and three consecutive failures after an asynchronous prompt. It SHALL use only the projected `busy` or `idle` status to determine an owned session's state; a documented remote retry status SHALL project to `busy` without diagnostics. It SHALL NOT use streaming, SSE, WebSocket, or event subscriptions.

#### Scenario: Asynchronous prompt is accepted

- **WHEN** the main process accepts a prompt through the documented asynchronous endpoint
- **THEN** the renderer polls the bounded owned-session status and message-list operations until a terminal idle state, maximum duration, maximum consecutive failures, popover close, configuration change, navigation, window destruction, or abort

#### Scenario: OpenCode activity is external

- **WHEN** an owned session becomes busy through activity external to Data Vault
- **THEN** the next typed status result reports `busy` and the popover disables duplicate prompt work without granting access to any other session

### Requirement: External OpenCode authority is explicitly disclosed

Before setup can be saved, host UI SHALL explain that the separately run OpenCode process can execute commands, access local files and provider credentials, and use the network with the user's OS authority. It SHALL state that Data Vault does not start or control OpenCode and provides no vault context or application privilege.

#### Scenario: Disclosure is not accepted

- **WHEN** the user attempts to save setup without affirmative disclosure acceptance
- **THEN** setup is rejected and no OpenCode connection is used
