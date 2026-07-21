## MODIFIED Requirements

### Requirement: Secret values never cross the dashboard or agent boundary

The application SHALL keep decrypted secret values confined to transient use inside the main process, MAY transiently derive an encoded credential from a secret solely for host-side injection, and SHALL ensure no IPC payload, dashboard API result, agent-accessible channel, renderer surface, error message, or log line contains the raw secret value, its tracked URL-encoded form, or any complete credential representation derived and tracked by the host for injection.

#### Scenario: Dashboard code probes for secret values

- **WHEN** arbitrary dashboard JavaScript calls any dashboard API operation, inspects any API result or error, or exercises the secrets metadata and host-mediated request operations
- **THEN** it observes at most secret names and set/unset status and never the raw secret value, its tracked URL-encoded form, ciphertext, or any complete credential representation derived and tracked by the host for injection

#### Scenario: Host-mediated request fails

- **WHEN** a host-mediated secret-injected request fails at validation, resolution, network, or response stage
- **THEN** the returned error and any diagnostic logging exclude the secret value, every host-derived credential representation, and the injected header content

### Requirement: Host-mediated network egress requires explicit scoped consent

Host-mediated outbound requests on behalf of a dashboard SHALL require the granted privileged secrets capability, SHALL be validated against a fixed bounded request schema, SHALL send a secret only to an exact HTTPS origin declared for that secret name in the digest-bound manifest declaration, SHALL not follow redirects, SHALL prevent caller-supplied fields from setting or overriding authorization or another injected secret, MAY compose a credential only through a fixed host-side injection kind, and SHALL enforce fixed response size, time, and rate bounds.

#### Scenario: Dashboard attempts secret exfiltration through the host

- **WHEN** dashboard code requests a host-mediated call whose URL origin is not exactly declared for the referenced secret, including via redirect, non-HTTPS scheme, userinfo tricks, or header override of the injection point
- **THEN** the application rejects or bounds the request so the secret value is never transmitted to an undeclared origin

#### Scenario: Dashboard supplies authorization directly

- **WHEN** dashboard code supplies an `authorization` header, a raw credential, or a value-bearing authorization injection field
- **THEN** the application rejects the request without resolving a secret or performing network activity

#### Scenario: Ungranted dashboard requests egress

- **WHEN** a dashboard without the granted secrets capability requests a host-mediated call
- **THEN** the application rejects it with a bounded denial and performs no network activity
