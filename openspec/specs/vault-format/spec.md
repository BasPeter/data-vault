# Vault Format Spec

## Purpose

Defines the on-disk contract for a vault repository that Data Vault reads,
indexes, and renders.

## Requirements

### Requirement: Vault Root Contract

A vault SHALL be a local Git repository, or a repository cloned by the
app. Content SHALL default to the `documents/` directory unless
overridden.

#### Scenario: vault.json overrides the content directory

- **WHEN** `vault.json` sets `documentsDirectory`
- **THEN** the app SHALL index documents from that directory instead of
  `documents/`

### Requirement: vault.json Optional Configuration

`vault.json` SHALL support optional `name`, `documentsDirectory`,
`format`, `defaultLanguage`, and `structure` fields. `defaultLanguage`
SHALL be a language tag suggested to the agents when writing documents.
`structure` SHALL be a nested map keyed by directory segment, each entry
optionally naming a title, description, and children, describing each
directory's purpose.

#### Scenario: Structure and language are edited from the app

- **WHEN** a user edits `defaultLanguage` or `structure` from the vault
  switcher's settings dialog
- **THEN** the values SHALL be surfaced in the sidebar and injected into
  the generated agent skills
- **AND** the change SHALL mark installed skills outdated

### Requirement: Document Format Selection

The vault format SHALL be `html` unless `vault.json` sets `format` to
`markdown`; a missing value SHALL default to `html` for backwards
compatibility.

#### Scenario: HTML vault

- **WHEN** `format` is `html` or unset
- **THEN** the app SHALL index `.html` documents

#### Scenario: Markdown vault

- **WHEN** `format` is `markdown`
- **THEN** the app SHALL index `.md` documents

### Requirement: HTML Document Structure

HTML documents SHALL be content-only `.html` fragments with an optional
`<!--vault ...-->` metadata block containing `title`, `date`, and
comma-separated `tags`.

#### Scenario: Metadata block is present

- **WHEN** an HTML document includes a `<!--vault ...-->` block
- **THEN** the app SHALL read `title`, `date`, and comma-separated `tags`
  from it

### Requirement: Markdown Document Structure

Markdown documents SHALL be `.md` files with optional leading `---`
frontmatter containing `title`, `date`, and `tags`.

#### Scenario: Frontmatter is present

- **WHEN** a Markdown document includes leading `---` frontmatter
- **THEN** the app SHALL read `title`, `date`, and `tags` from it

### Requirement: quick-notes.html Reserved Scratchpad

`quick-notes.html` at the documents root SHALL be excluded from the
manifest and graph and MAY remain uncommitted.

#### Scenario: Manifest and graph are built

- **WHEN** the app builds the document manifest or link graph
- **THEN** it SHALL exclude `quick-notes.html` from both

### Requirement: Internal Links

HTML internal links SHALL be hashes whose value is another document ID.
Markdown internal links SHALL be relative `.md` links resolved from the
source document.

#### Scenario: Link resolution differs by format

- **WHEN** the app resolves an internal link
- **THEN** it SHALL treat an HTML link's hash value as a document ID and a
  Markdown link as a relative `.md` path from the source document

### Requirement: Mermaid Diagram Storage

HTML Mermaid source SHALL be stored in `<pre class="mermaid">` blocks.
Markdown Mermaid source SHALL be stored in fenced `mermaid` code blocks.

#### Scenario: Rendering a diagram

- **WHEN** the app renders a document containing a Mermaid diagram
- **THEN** it SHALL read the diagram source from the format-appropriate
  location

### Requirement: No Personal Vault Data In This Repository

This repository (the Data Vault application) SHALL NOT contain real vault
documents, credentials, repository URLs, or generated clones. Every
external vault repository and every HTML fragment it contains MUST be
treated as untrusted input.

#### Scenario: A contributor considers adding sample vault content

- **WHEN** a change would add example documents, cloned vault data, or a
  real repository URL to this repository
- **THEN** the change SHALL be rejected or replaced with synthetic,
  non-identifying fixtures
