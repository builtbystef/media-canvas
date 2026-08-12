# PROTOTYPE — editor preview strategy (disposable, wipe me)

Answers roadmap node `vnmueh`: can the editor render the compiled SVG live at
interactive rates, and is inline `<svg>` the right editing surface?

The core spec (issue `1qoccb`) commits the editor to rendering the compiled SVG
inline. That compiler was designed for a batch renderer — one compile per asset —
and it does its own text layout with opentype.js. This bench asks what that costs
when an editor calls it on every frame of a gesture.

Not production code. No tests, no error handling. Delete after the verdict.

## Run

    npm install
    node server.mjs      # → http://localhost:4321

Fonts are served from the system Lato install (`/usr/share/fonts/truetype/lato/`),
so no font binaries live on this branch.

## What it does

`compile-browser.mjs` is the compiler from `prototype/render-fidelity`, ported to
the browser and instrumented: text layout and SVG emission are timed separately, and
two memo caches (line breaking, per-element markup) are keyed on the element object
itself — an immutable editor store hands out a new object only for what changed.

`doc.mjs` grows the hard-case sample document to any size, mixing cards (group of
rect + text + ellipse), captions, and vector decorations.

Five preview strategies, switchable live in the header:

| strategy | what it does per gesture frame |
| --- | --- |
| `full` | recompile the whole document, `innerHTML` the result |
| `memo` | recompile only the dirty element, `innerHTML` the joined document |
| `patch` | recompile only the dirty element, replace only its DOM node |
| `split` | cache line breaking, re-emit everything, `innerHTML` |
| `transform` | no compile — transform the painted node; compile on release |

Scripted 300-frame gestures (drag, resize width, type) report JS per frame split
into layout / emission / DOM / handles, plus frame interval and effective fps. A
backgrounded tab gets no `requestAnimationFrame`, so the runner falls back to a
microtask driver and reports `fps: null` — those JS figures run ~1.6× the `rAF`
ones and are upper bounds.

`__bench.verifyPatch()` checks the strategy that wins: it drags an element with
patching, then compares every element's bounding box against a from-scratch
recompile of the same document.

Selection handles render either as an HTML overlay or inside the `<svg>` itself,
and both are draggable, so the editing-surface question can be judged by hand.
