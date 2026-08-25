//   pnpm --filter worker run goldens:bake
//
// Builds the pinned image, runs this file inside it, and writes lossless
// PNG baselines back onto the host. Running this file on a laptop throws.

import { bakeBaselines } from "./goldens/bake.ts";

const written = await bakeBaselines();
for (const path of written) console.log(path);
