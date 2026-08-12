---
id: vnmueh
title: Can the editor render the compiled SVG live at interactive rates?
state: done
assignee: claude
labels:
    - roadmap:v1xa7j
    - session:prototype
parent: v1xa7j
created: 2026-08-12T02:57:42Z
updated: 2026-08-12T03:57:57Z
---

Prototype (prototype skill, disposable code) the editing surface that the core spec (issue 1qoccb) already commits the editor to.

The commitment: "the editor renders the compiled SVG inline as its preview; editor-authored state lives only in the Design Document. Anything the editor can show that the compiler cannot express is a bug in the editor, not a feature." The compiler is deterministic and does its own text layout — greedy line breaking over opentype.js advance widths, emitting fixed `<tspan>` lines — precisely so wrapping cannot drift between editor and worker.

The risk: that compiler was designed for a batch renderer, where one compile per asset is free. An editor calls it on every frame of a drag, every keystroke in a text box, every slider tick. If a full `resolve` + `compile` cannot hold a 60 fps interaction budget on a realistic document, the editor needs a different preview strategy — and any such strategy reopens the parity guarantee the core spec was built to provide.

Answer: how long does `compile` take on a realistic document (30-60 elements, several text elements, images, groups, gradients) on the user's hardware? Does a full recompile-per-frame hold an interactive budget, or is the text-layout pass the bottleneck? If it is too slow, which of these holds parity — memoizing per-element compile output and recompiling only the dirty subtree; splitting layout (expensive, opentype.js) from emission (cheap) and recomputing layout only on text-affecting changes; or rendering a cheap approximate surface during the gesture and the true compiled SVG on release (and what visible snap does that cost)? Is inline `<svg>` in the DOM even the right editing surface for hit-testing, selection handles, and rotation, or do handles belong in an HTML overlay layered over the SVG?

Input: the core spec 1qoccb (schema v1, compiler rules, seam signatures), and the render-fidelity prototype on branch `prototype/render-fidelity`.

Output: a measured verdict with numbers, and a named preview strategy that the editor spec can build on. This node blocks the canvas interaction and tool set node, because what is affordable shapes what the tool set can offer.

## Notes

**claude** — 2026-08-12T03:57:38Z

ANSWER (measured 2026-08-11; prototype on branch prototype/editor-preview, verdict delegated by the user to the measurements after the prototype's hand-driven interactions proved too rough to judge by feel).

VERDICT: yes, the editor renders the compiled SVG live — but not by recompiling the document per frame. The preview strategy is **memoize per element, patch the dirty DOM node**. Inline <svg> is the right editing surface; selection handles go in an HTML overlay above it.

MEASUREMENTS (user's machine, Chrome, live requestAnimationFrame during real gestures; 1080x1080 canvas, Lato regular + bold, JS ms per frame, p50):

  document (top-level / total / text) | svg   | full  | memo | split | patch | transform
  15 / 26 / 9                         | 5 KB  |  3.6  | 1.7  |  -    | 0.9   |  -
  30 / 56 / 19                        | 11 KB |  5.9  | 2.5  |  -    | 0.8   |  -
  48 / 92 / 31                        | 17 KB |  9.3  | 3.4  | 3.4   | 0.9   | 0.5
  60 / 116 / 39                       | 22 KB | 11.4  | 5.2* | 6.1*  | 0.5*  |  -
  120 / 236 / 79                      | 44 KB | 28.9* | 9.2* | 9.1*  | 0.4*  |  -

  * driven by microtask (a backgrounded tab gets no rAF); ~1.6x the rAF figure at the one size measured both ways, so read them as upper bounds.

  Resize of a text element (rewraps every frame, the compiler's worst case), 48 elements, rAF: full 9.1, memo 3.0, patch 0.8.
  Typing into a text element, 48 elements, rAF: full 9.1, memo 3.1, patch 1.0.

FINDINGS:

1. The bottleneck is text layout and only text layout. opentype.js line breaking is 6.4 ms of the 9.3 ms full compile at 48 elements, and 20.7 of 28.9 at 120 — it scales linearly with the count of text elements, not with total elements. SVG string emission is ~1% of the frame (0.2-0.9 ms). Re-parsing the whole 17 KB SVG through innerHTML costs 0.8 ms, and 2.3 ms at 44 KB — the DOM is not the problem.

2. Full recompile per frame does hold 60 fps up to ~60 top-level elements (11.4 ms of a 16.7 ms budget) and breaks past it. It already misses a 144 Hz budget at 48 elements. It is viable but has no headroom, and headroom is what an editor spends on everything else in the frame.

3. Memoizing per element removes the layout cost entirely: 6.4 ms -> 0.3 ms at 48 elements. A gesture dirties one element, so one element re-lays-out. The cache key is the element object itself (a WeakMap), which an immutable editor store provides for free — this is a hard constraint the editor's state model must honour, and it belongs in node 73rm0x.

4. Patching only the dirty element's DOM node — rather than re-assigning innerHTML for the whole document — keeps every gesture under 1 ms at every size tested, including 236 elements. The frame cost stops scaling with document size altogether.

5. Patching is exact, not approximate. __bench.verifyPatch drags an element for 120 patched frames, then compares every element's bounding box against a from-scratch recompile of the same document: worst delta 0.0000 px across 92 elements, and 0.0000 px across 236. The same compiler emits the markup either way, so the core spec's parity guarantee is untouched. No approximate gesture surface is needed, which is the important architectural result: the third option in this node's brief (cheap surface during the gesture, true SVG on release) can be rejected outright rather than traded against.

6. Cold full compile — document load, font change, canvas resize, undo of a multi-element edit — is 11-19 ms at 48 elements and ~27 ms at 120. Acceptable: these are transitions, not gesture frames. Every strategy pays it, and it is the floor for any change that dirties everything.

7. Selection handles cost 2.0-5.5 ms per frame under any innerHTML strategy, purely from the forced reflow when getBoundingClientRect runs against freshly re-parsed markup. Under patching this drops to 0.1-0.4 ms. This is the second-largest cost in the frame after text layout, and it disappears with the same fix.

8. Handles in an HTML overlay and handles inside the <svg> measured the same in JS (2.3 vs 2.4 ms under memo+innerHTML). The choice is behavioural, and the overlay wins: innerHTML re-render destroys and recreates in-SVG handles every frame, losing DOM identity, pointer capture and focus mid-gesture, while the overlay survives untouched. Hit-testing works from either: document.elementFromPoint on the inline SVG, walked up to the nearest [data-el], cost under 0.1 ms.

STRATEGY FOR THE EDITOR SPEC (node 9eooei):
  - The editing surface is the compiled SVG, inline in the DOM, produced by the shared core compiler — unchanged from the core spec's commitment.
  - Editor document state is immutable per element; an edit replaces the changed element and its ancestor groups, and nothing else.
  - Compilation memoizes per element on object identity, in two caches: line breaking (text) and emitted markup (all types).
  - A gesture frame patches only the changed element's DOM node; a change that dirties the document (load, font change, canvas resize) does a full compile and accepts ~11-30 ms.
  - Selection handles, rotation handles, guides, and marquee live in an HTML overlay layered over the SVG, positioned from getBoundingClientRect. Hit-testing goes through elementFromPoint against the SVG.
  - Budget for the editor spec's tool set: a gesture frame has ~16 ms and this preview costs under 1 ms of it. What the tool set can afford is not constrained by the preview (node ep90f3).

NOT ESTABLISHED: the prototype's hand-driven gestures were too rough for a subjective read, so nobody judged feel, and the transform-during-gesture snap was never judged by eye. Neither gap affects the verdict — the strategy chosen needs no approximation, so there is no snap to judge, and every figure above is machine-measured rather than felt.
