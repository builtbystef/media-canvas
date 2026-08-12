---
id: ep90f3
title: What are the editor's canvas interactions and tool set?
state: todo
labels:
    - roadmap:v1xa7j
    - session:grill
depends_on:
    - vnmueh
parent: v1xa7j
created: 2026-08-12T02:58:09Z
updated: 2026-08-12T02:58:09Z
---

Interview the user (grill-me skill, limited to this question) to settle what the editor lets a designer do on the canvas.

Node ylg1wr already cut the capability list: text, images with crop-within-frame and clip-to-shape, rectangles and ellipses, SVG import plus a preset shape library, solid and gradient fills, borders, drop shadow, per-element opacity, groups, move/resize/rotate, z-order via a layer list, arbitrary canvas dimensions plus named Canvas Presets. That is *what* exists. This node settles *how it is operated* — the part the Frontier still lists as open: "canvas interactions, tool set, selection/alignment model".

The document schema constrains the answers. Elements carry absolute `x`/`y`, a `rotation` in degrees about the element center, and `opacity`; groups have no own width or height and derive bounds from their children; a text element has a wrap `width` with height computed from content and an `anchor` for vertical growth. Any interaction the tool set offers has to be expressible as an edit to those fields — there is no auto-layout and no anchoring in v1.

Settle: the tool palette and how a tool is entered and left; the selection model (click, marquee, multi-select, select-through into a group, group vs. child editing); which handles a selection shows and what resize does to each element type (a text element's height is not directly settable — what does its bottom handle do?); rotation interaction and whether it snaps; the alignment and distribution set, and whether snapping is to other elements, to canvas guides, to a grid, or all three; pan and zoom, and whether zoom level affects anything the document stores; keyboard shortcuts and nudge; how gradient stops and the drop shadow are edited; how SVG import behaves on drop, given that the importer flattens a file into a group of single-path vector elements; and where element properties are edited — an inspector panel, on-canvas controls, or both.

Input: node ylg1wr (the MVP capability cut), node 53lwlc (layout model and element types), the core spec 1qoccb (schema v1), and the measured verdict from node vnmueh — what the preview surface can afford per frame bounds what the tool set may promise.
