# 0003 — One shared TypeScript core; render workers are Node

**Context.** The Design Document compiler must run in the browser editor and in the render worker, and it measures text with opentype.js — it is JavaScript by necessity. The stack constraint says FastAPI backend, and Variable validation must behave identically in editor preview and worker render.

**Decision.** One shared TypeScript package owns the Design Document schema types, document and value validation, value substitution, and the JSON→SVG compiler. The render worker is Node + Playwright, written in TypeScript (as is all Node code in this project). FastAPI orchestrates jobs and storage and never interprets document internals.

**Reason.** A Python re-implementation of validation or compilation would be a second implementation free to drift — exactly what the one-engine architecture (ADR-0002) exists to prevent. The accepted cost is a backend spanning two runtimes; the drift risk outweighs the operational simplicity of one.
