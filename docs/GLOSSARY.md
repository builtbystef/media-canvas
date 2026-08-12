# Glossary

The project's shared language. The rules: use one term for each concept — the rejected synonyms go under _Avoid_. A definition is one or two sentences that say what the term IS, not what it does. Only terms specific to this project belong here — general concepts from programming do not. No implementation details. Group the terms under subheadings when clusters appear.

The entry format:

```
**{{Term}}**:
{{Definition.}}
_Avoid_: {{rejected synonyms}}
```

## Language

**Design Document**:
The JSON document that fully describes one design: schema version, canvas, background, and the element tree. It is the single source of truth — the editor edits it, and the renderer renders it.
_Avoid_: design file, scene, canvas file

**Element**:
One node in a Design Document's tree. The v1 set is closed: text, image, rect, ellipse, vector (imported or preset SVG), and group.
_Avoid_: layer, object, node

**Template**:
A Design Document with declared Variables, created by promoting a design (a copy — the original design and the template evolve independently afterward). Generation produces assets from a Template plus one value per Variable.
_Avoid_: master, model design

**Variable**:
A named, typed slot declared at the top level of a Template, referenced by element properties. Supplying one value per Variable is what generation consumes.
_Avoid_: slot, placeholder, merge field

**Fit Mode**:
The per-image-element rule — cover, contain, or stretch — that places a Variable-supplied image inside the element's frame, replacing the crop that was authored for the placeholder image.
_Avoid_: object-fit, scaling mode

**Canvas Preset**:
A named canvas size offered as a convenience when creating a design (e.g. Instagram post 1080×1080). Any design may instead use arbitrary width×height; a preset carries no behavior beyond its dimensions and name.
_Avoid_: asset kind, format preset

**Image Asset**:
One image file held by the app, identified by the hash of its stored bytes and served from the app's own storage at an immutable URL. Image elements and image Variable values reference it by that id.
_Avoid_: media file, upload, picture file

**Font Asset**:
One font file (TTF or OTF), bundled or user-uploaded, identified by the hash of its bytes. Text elements reference a Font Asset by that id; the family name is display metadata only.
_Avoid_: font family (as an identifier), typeface file

**Generation Job**:
One submitted batch: a set of Rows rendered against one Template with one output format, tracked from submission through per-Row results. Single renders are synchronous and never create one.
_Avoid_: batch job, render task

**Row**:
One mapping of Variable names to values within a Generation Job, producing exactly one output asset.
_Avoid_: record, entry, data row

**Generation Channel**:
A way of producing assets from a template: one-off from the UI, the REST API (single render or a batch of rows), or CSV/data-file upload in the UI. All channels are clients of the same generation contract.
_Avoid_: export channel, output mode

## Editor

**Preset Shape**:
A shipped vector element — star, arrow, triangle, line — offered from a panel and placed like an image. It is an ordinary vector Element, not an Element type of its own, and it is unrelated to a Canvas Preset.
_Avoid_: built-in shape, shape library item

**Resize**:
The editor operation that changes an Element's width and height and nothing else — stroke width, corner radius, and shadow lengths keep the values they had.
_Avoid_: stretch, scale (when resize is meant)

**Scale**:
The editor operation that multiplies every length an Element owns — dimensions, font size, letter spacing, stroke width, corner radius, shadow offset and blur — by one factor. It is the only operation a text Element or a group offers at its corners.
_Avoid_: resize (when scale is meant), zoom

**Crop Mode**:
The editor state, entered by double-clicking an image Element, in which the frame and the bitmap inside it move and size independently of each other. Outside it, the two always change together.
_Avoid_: crop tool, image edit mode
