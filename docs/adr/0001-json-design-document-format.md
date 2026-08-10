# 0001 — The Design Document is our own JSON schema, compiled to render markup

**Context.** The editor (browser) and the render worker must produce identical pixels, and the engine verdict (Chromium vs resvg, node `gqr8bf`) was still open when the format had to be settled. The MVP element set maps almost 1:1 onto SVG 1.1, which made storing literal SVG tempting.

**Decision.** The Design Document is a project-owned JSON schema: absolute positioning only; a closed element set (text, image, rect, ellipse, vector, group); typed Variables declared at the top level and referenced by element properties; a required integer `schemaVersion` with forward-only migrations applied at load. Rendering compiles the document deterministically to the engine's markup (SVG or DOM); that compiler is the single place render fidelity is defined.

**Reason.** Literal SVG as the stored format would smuggle renderer concerns into the data model and push the semantic concepts — groups as editor objects, crop frames, Variables, template metadata — into `data-*` attributes. JSON is directly validatable (JSON Schema / Pydantic) and migratable, and the compile step keeps both engine candidates open instead of pre-deciding `gqr8bf`.
