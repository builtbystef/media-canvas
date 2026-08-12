---
id: ep90f3
title: What are the editor's canvas interactions and tool set?
state: done
assignee: claude
labels:
    - roadmap:v1xa7j
    - session:grill
depends_on:
    - vnmueh
parent: v1xa7j
created: 2026-08-12T02:58:09Z
updated: 2026-08-12T05:13:46Z
---

Interview the user (grill-me skill, limited to this question) to settle what the editor lets a designer do on the canvas.

Node ylg1wr already cut the capability list: text, images with crop-within-frame and clip-to-shape, rectangles and ellipses, SVG import plus a preset shape library, solid and gradient fills, borders, drop shadow, per-element opacity, groups, move/resize/rotate, z-order via a layer list, arbitrary canvas dimensions plus named Canvas Presets. That is *what* exists. This node settles *how it is operated* — the part the Frontier still lists as open: "canvas interactions, tool set, selection/alignment model".

The document schema constrains the answers. Elements carry absolute `x`/`y`, a `rotation` in degrees about the element center, and `opacity`; groups have no own width or height and derive bounds from their children; a text element has a wrap `width` with height computed from content and an `anchor` for vertical growth. Any interaction the tool set offers has to be expressible as an edit to those fields — there is no auto-layout and no anchoring in v1.

Settle: the tool palette and how a tool is entered and left; the selection model (click, marquee, multi-select, select-through into a group, group vs. child editing); which handles a selection shows and what resize does to each element type (a text element's height is not directly settable — what does its bottom handle do?); rotation interaction and whether it snaps; the alignment and distribution set, and whether snapping is to other elements, to canvas guides, to a grid, or all three; pan and zoom, and whether zoom level affects anything the document stores; keyboard shortcuts and nudge; how gradient stops and the drop shadow are edited; how SVG import behaves on drop, given that the importer flattens a file into a group of single-path vector elements; and where element properties are edited — an inspector panel, on-canvas controls, or both.

Input: node ylg1wr (the MVP capability cut), node 53lwlc (layout model and element types), the core spec 1qoccb (schema v1), and the measured verdict from node vnmueh — what the preview surface can afford per frame bounds what the tool set may promise.

## Notes

**claude** — 2026-08-12T05:13:42Z

ANSWER (settled by interview, user confirmed 2026-08-12). ADR: docs/adr/0008-no-pasteboard-editor-clips-at-the-canvas.md. Glossary gained an Editor cluster: Preset Shape, Resize, Scale, Crop Mode.

GOVERNING CHOICE: Figma's interaction grammar, minus everything schema v1 cannot express (no auto-layout, no components, no constraints/anchoring, no boolean ops, no pen). Reason: the user is the primary user, Figma is the grammar a design tool is judged against, and copying it means near-zero invented conventions and no learning cost. The preview budget did not constrain any answer here — ADR-0006 leaves a gesture frame at under 1 ms, so only implementation effort was ever the limit.

TOOL PALETTE (5 tools): Select (V), Text (T), Rectangle (R), Ellipse (O), Hand (H). A draw tool is armed by key or button, draws ONE element, then returns to Select; Esc cancels back to Select. While drawing: Shift constrains to square/circle, Alt draws from center. Space held is a momentary Hand over any active tool. Images and Preset Shapes are NOT tools - they are dragged onto the canvas from side panels (the Assets panel of node 3ko2p7 for images; a Shapes panel for star/arrow/triangle/line, which are stored vector elements). Reason: one palette button per preset is a dozen buttons for something picked, not drawn.

SELECTION: click selects the topmost TOP-LEVEL element under the cursor (a click on a group child selects the group). Double-click enters the group and selects the child under the cursor; double-click again descends; Esc rises one level; a click outside exits entirely. Cmd/Ctrl-click selects the deepest element directly without entering. Shift-click adds/removes. Marquee from empty canvas selects every top-level element the rect INTERSECTS (not strictly contains); inside an entered group the marquee is confined to that group's children. A multi-selection shows an axis-aligned union box with move, rotate, and corner handles that scale UNIFORMLY ONLY - no side handles, because non-uniform scaling of a rotated child needs a skew the schema cannot store.

LAYER LIST: reorder by drag, rename, visibility toggle. The visibility toggle writes the document's `visible` field - the same field a boolean Variable binds to - so hiding in the editor hides in every render. No lock in v1: there is no schema field for it, and editor-only fields in the Design Document were not opened here.

HANDLES PER TYPE - resize and scale are two different operations (glossary):
- rect / ellipse / vector = RESIZE. Sides change one dimension, corners change both freely, Shift keeps aspect, Alt resizes about center. The drag is interpreted in the element's LOCAL (rotated) frame, so the opposite edge stays visually pinned and x/y are recomputed. border.width, cornerRadius and shadow are untouched: a 2 px stroke stays 2 px. A vector's path and viewBox are untouched - the compiler already scales the path into width x height, so non-uniform drags stretch it.
- text = SCALE. Left/right mid handles set the wrap `width` and the box reflows, growing from its `anchor` (a middle-anchored box grows both ways from its center line). Corner handles multiply width, fontSize, letterSpacing and shadow dx/dy/blur by one factor, so the block looks identical at a new size instead of rewrapping. NO top/bottom mid handles exist; vertical behaviour is the anchor control in the inspector. Reason: height is computed and unstorable, so any vertical handle would either lie about a settable height or clip silently, which node k77nv9 forbade.
- image = SCALE outside Crop Mode, CROP inside it. A plain frame resize scales content.scale and its offsets in step, keeping the same portion of the bitmap framed. Double-click enters Crop Mode, where handles move the frame while the bitmap stays fixed on canvas and dragging moves the bitmap under the frame. A mode split rather than a modifier, to stay consistent with the inspector/on-canvas division below.
- group = SCALE, uniform, recursive. A group has no own width/height, so corners are its only handles, and the drag multiplies every descendant's x, y, width, height, fontSize, letterSpacing, border.width, cornerRadius and shadow dx/dy/blur by a single factor. Anything less makes a scaled-up group visibly wrong at its strokes and corners.
KNOWN ASYMMETRY, ACCEPTED: text and groups scale their strokes and shadows; rect/ellipse/vector do not. Figma's Scale tool (K) would remove it and was rejected - Cmd is already taken by snap-suspend so no modifier is free, and a modal tool for a rare operation is poor value. Revisit if the asymmetry bites in practice.

ROTATION: the affordance is the zone just outside each corner handle. Always about the ELEMENT CENTER, because that is what the schema stores - there is no movable pivot. Shift snaps to 15 degrees. A multi-selection rotates about the union center: each member's rotation advances by the delta and its x/y orbits that center. Stored normalized to [0, 360), shown in the inspector to one decimal.

PROPERTY EDITING: the right-hand inspector is the SINGLE AUTHORITY for every property - fill (gradient bar for stops plus a numeric angle), border, shadow, opacity, cornerRadius, font/size/spacing/align/anchor, and numeric x/y/width/height/rotation. On-canvas controls are limited to geometry handles plus ONE exception, image Crop Mode, whose frame/content model has no sane panel equivalent and is only ever judged by eye. Reason: on-canvas gradient and shadow handles are a large share of the editor's interaction work for properties set once and rarely nudged.

SNAPPING: during move and resize, snap to canvas edges + canvas horizontal/vertical center, and to other elements' edges + centers, drawing a thin guide at each active snap. Threshold 6 px in SCREEN space, so feel is constant across zoom. Cmd/Ctrl held suspends snapping. Rotated elements snap by their axis-aligned bounding box. OUT for v1: grid, rulers and user-dragged guides, equal-spacing hint badges, dimension measurements - alignment guides carry ~90% of the value and the rest is a second interaction system to build and tune.

ALIGNMENT: six align actions (left/center-h/right, top/middle-v/bottom) and two distribute actions (horizontal spacing, vertical spacing), as a button row at the top of the inspector. One element selected aligns against THE CANVAS; two or more align against the SELECTION bounding box; distribute needs three or more. All computed on axis-aligned bounding boxes.

PAN AND ZOOM: scroll pans vertically, Shift-scroll pans horizontally, Cmd/Ctrl-scroll and trackpad pinch zoom AT THE CURSOR; Space-drag and middle-drag pan. Cmd-0 fits the canvas, Cmd-1 goes to 100%, Cmd-2 zooms to selection. Range 5%-1600%. Zoom is a CSS transform on a wrapper around the <svg>, NEVER a recompile at a different scale - this keeps compilation zoom-independent so the ADR-0006 memo caches survive every zoom change, and guarantees the editor shows the markup the worker will render. Nothing about the view enters the Design Document (no schema field exists); zoom and scroll offset persist per document in localStorage, and a document opened for the first time lands on zoom-to-fit.

KEYBOARD: arrows nudge 1 px, Shift-arrows 10 px. Cmd-D duplicates at +10/+10; Alt-drag duplicates. Cmd-C/X/V with paste centered at the cursor. Delete/Backspace deletes. Cmd-G groups, Cmd-Shift-G ungroups. Z-order: Cmd-] forward, Cmd-[ backward, Cmd-Alt-] to front, Cmd-Alt-[ to back. Cmd-A selects all at the current level (top level, or the entered group's children). Enter on a selected text element begins text editing, as does double-click. Esc unwinds one step at a time: cancel tool -> exit text editing -> exit group -> deselect. Cmd-Z / Cmd-Shift-Z are RESERVED for undo/redo; their semantics belong to node 73rm0x and were not settled here.

TEXT CREATION AND EDITING: T then click creates a text element with a default wrap width of 300 px, caret active, empty content; T then drag takes the wrap width from the drag and ignores its height. Defaults: the bundled default Font Asset, fontSize 48, lineHeight 1.2, letterSpacing 0, align left, anchor top, color #000000. Editing mode gives a caret and intra-text selection with usual word/line navigation; Enter inserts a hard break; Esc exits to element selection. Because there are no rich spans, ANY typographic change applies to the whole element whether or not a run is selected - the inspector shows element properties, not span properties. A {{token}} typed into content displays literally; it is ordinary text until a Template declares the Variable (node 8h50hu). A text element left empty on exit is DELETED, so no invisible zero-height ghosts accumulate.

NEW SHAPE DEFAULTS: R/O with a plain click (no drag) creates a 100 x 100 element at the click point; fill #D9D9D9, no border, no shadow, opacity 1, rotation 0, cornerRadius absent. Preset Shapes and images dragged from their panels land at natural size, scaled down proportionally to fit the canvas when larger.

CANVAS CHANGES: changing canvas.width/height or applying a Canvas Preset moves and scales NOTHING - absolute coordinates are untouched, as 53lwlc requires with no anchoring in v1. It triggers a full recompile, which ADR-0006 already budgets at ~11-30 ms. Canvas background (solid or gradient) is edited in the inspector when nothing is selected.

OFF-CANVAS (ADR-0008): elements outside the canvas are clipped in the editor exactly as in the exported asset. No pasteboard, no dimmed overflow, no second drawing surface. They stay reachable because selection handles live in the HTML overlay above the SVG (ADR-0006) and are positioned from element bounds regardless of visibility, so a fully off-canvas element still shows handles and its layer-list row and can be dragged back.

SVG IMPORT ON DROP: dropping an .svg places a GROUP centered at the drop point, at the file's natural viewBox size, scaled down to fit the canvas if larger; the importer flattens it into one single-path vector element per path. Solid fills carry over; a uniform stroke maps to the element's border. A file containing text, gradients, patterns, filters, masks or clip paths is REJECTED OUTRIGHT with a message naming what was found and suggesting the file be flattened/outlined first. Reason: the same fail-loudly rule the project took for fonts (oxcf2v) and images (3ko2p7); an SVG <text> would smuggle a second unpinned text-rendering surface into a render. Dropping a raster file instead runs the node 3ko2p7 upload pipeline and places the resulting Image Asset at the drop point.

CONSEQUENCE FOR DEPENDENT NODES: 73rm0x owns undo/redo granularity for every gesture named here (a drag is one entry, not one per frame) and inherits ADR-0006's hard constraint that element state is immutable per element. 8h50hu inherits the inspector as the place a Variable binding is attached to a property, and inherits that {{token}} text is authored inline in text content. 9eooei specs all of this in full detail alongside them.
