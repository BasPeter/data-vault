## 1. Mermaid Interaction Layer

- [x] 1.1 Add a renderer-owned post-render enhancer that gives every successful Mermaid SVG independent `{ x, y, scale }` state without changing sanitize-before-render ordering or `securityLevel: "strict"`.
- [x] 1.2 Add accessible zoom-in, zoom-out, and reset buttons using existing UI/icon conventions, with centered stepped zoom, scale limits, and reset-to-fit behavior.
- [x] 1.3 Implement primary-pointer drag panning with local pointer capture, cancellation handling, and grab/grabbing feedback, plus a focusable viewport with accessible arrow-key panning.
- [x] 1.4 Implement pointer-centered Control/Command-wheel zoom while leaving unmodified wheel events available to the document scroller.
- [x] 1.5 Serialize Mermaid's global initialize/run operations, isolate each queued failure so later renders still run, and add generation ownership checks so interleaved document or theme renders cannot enhance, configure, or clean up a successor's nodes.

## 2. Presentation

- [x] 2.1 Add Mermaid viewport and control styling that matches existing document and icon-button conventions and provides a clipped screen navigation area.
- [x] 2.2 Add print rules that hide navigation controls and print the diagram without its temporary screen transform while preserving existing Mermaid print styling.

## 3. Automated Coverage

- [x] 3.1 Extend or add a synthetic Mermaid fixture large enough to demonstrate zoom and pan without introducing personal vault content.
- [x] 3.2 Extend renderer end-to-end coverage to verify labeled controls, independent button zoom, pointer and keyboard panning, reset, and state reset after rerender.
- [x] 3.3 Add end-to-end assertions that modifier-wheel zoom is handled, unmodified wheel input preserves document scrolling, and print presentation excludes interactive controls/transforms.
- [x] 3.4 Add a deliberately interleaved document/theme render test that proves only the current generation is enhanced and receives the current Mermaid theme.
- [x] 3.5 Add focused HTML and Markdown security cases, including adversarial sanitized look-alike control markup, that prove only application-created nodes are enhanced and Mermaid remains initialized with `securityLevel: "strict"`.
- [x] 3.6 Add coverage proving a malformed Mermaid render failure is handled without blocking a subsequent valid render generation.

## 4. Verification

- [x] 4.1 Run the relevant Mermaid end-to-end scenario, then run `npm run test` and `npm run test:e2e`.
- [x] 4.2 Run `npm run lint`, `npm run format:check`, `npm run typecheck`, and `npm run build`.
- [x] 4.3 Verify the final diff against the Mermaid navigation spec and the architecture, vault-format, and security constraints, then obtain independent Reviewer approval because the change touches a hard security requirement.
