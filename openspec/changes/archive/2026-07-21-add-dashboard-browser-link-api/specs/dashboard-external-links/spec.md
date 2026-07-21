## ADDED Requirements

### Requirement: Dashboard can request a confirmed external HTTPS link

The application SHALL expose a fixed `dashboardApi.openExternalLink` method that accepts exactly one URL string and SHALL open it only through trusted main-process code after explicit per-request confirmation in host-owned UI. The URL string and its parser-serialized canonical form SHALL each be at most 8,192 UTF-16 code units; the input SHALL contain no whitespace or control characters; every percent sign SHALL begin a two-hex-digit escape; and the input SHALL exactly equal the parser-serialized canonical absolute URL. The canonical URL SHALL use `https:`, have a non-empty host, and have empty username and password. The method SHALL not accept browser options, shell commands, paths, credentials, or arbitrary protocol values, and SHALL return a bounded result that distinguishes user cancellation from a successful launch without revealing privileged context. The confirmation UI SHALL show the complete canonical URL without truncation or dashboard-controlled rendering.

#### Scenario: User confirms a dashboard link

- **WHEN** an active authenticated dashboard invokes `dashboardApi.openExternalLink` with a valid HTTPS URL and the user confirms the trusted destination prompt
- **THEN** the application opens only the validated URL in the user's external browser and returns the specified success result

#### Scenario: User declines a dashboard link

- **WHEN** an active authenticated dashboard invokes the method with a valid HTTPS URL and the user cancels the trusted destination prompt
- **THEN** the application does not open an external browser and returns the specified bounded cancellation result

#### Scenario: Runtime ends while confirmation is pending

- **WHEN** the dashboard runtime is torn down, changes generation, crashes, or is switched with another dashboard or vault while its external-link confirmation is pending
- **THEN** the application cancels the request and does not open an external browser

#### Scenario: Runtime changes before launch

- **WHEN** the user confirms a dashboard link but main can no longer authenticate the same sender, frame, runtime, and generation immediately before launch
- **THEN** the application does not open an external browser and returns a bounded cancellation result

#### Scenario: Dashboard supplies an unsafe link

- **WHEN** a dashboard invokes the method with a malformed, oversized, non-canonical, non-HTTPS, credential-bearing, hostless, whitespace-containing, control-character-containing, or invalid-percent-encoded URL
- **THEN** the application rejects the request without showing a confirmation prompt or opening an external browser

#### Scenario: Stale or forged runtime requests a link

- **WHEN** the request originates from a non-dashboard sender, another frame, another dashboard, or a destroyed runtime
- **THEN** the application rejects the request without prompting or opening an external browser
