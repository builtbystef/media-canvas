# Golden-image baselines

A golden check renders a fixture inside the pinned worker image and compares
the PNG against a baseline committed here. The picture is only meaningful
against one environment tuple (`apps/worker/environment.json`).

## Commands

```sh
pnpm --filter worker run image:check    # resolve → compile → render → compare
pnpm --filter worker run goldens:bake   # write baselines, inside the image only
```

`goldens:bake` builds the pinned image, runs the bake command _inside_ it, and
writes lossless PNGs back into `baselines/`. The command refuses to run on a
laptop or against an environment tuple that does not match the committed file.
A failing check never bakes: there is no update flag, and the check does not
call the baker.

Baselines are ordinary Git objects — lossless PNGs, no LFS.

## Re-bake policy

The whole suite is re-baked only after a deliberate environment-tuple change
(Chromium / Playwright, the headless flavor, the image recipe, the bundled
fonts or fontconfig, the page settings, the compiler or the schema). Review
the visual diff and commit the new baselines together with the old and new tuples.

An intended rendering change — a compiler fix, a fixture edit — updates only the fixtures it affects, after review. Do not re-bake the rest of the suite
to make an unrelated failure go away.

Never auto-rebake on failure. Never bake from a host that is not the pinned
image.

## Fixtures in this issue

- `composite` — the render-fidelity prototype hard case (linear gradient,
  shadow, alpha, ellipse clip, image crop, rotation, group opacity, vector,
  wrapped text). Worker-output golden: ratio 0 at pixelmatch `threshold: 0.1`.
- `cross-flavor` — the same document, compared live between full Chromium and
  `chrome-headless-shell` inside the one pinned image. The single fixture with
  a nonzero allowance: differing-pixel ratio 0.006. That admits the measured
  0.534% glyph-edge AA drift and rejects a one-line layout shift or a changed
  fill.

Missing values, missing assets, and validation failures are not goldens.
They are functional tests on `validate` and `compile` in `@media-canvas/core`.
