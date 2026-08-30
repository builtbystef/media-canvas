import { bakeBaselines } from "./goldens/bake.ts";

const written = await bakeBaselines();
for (const path of written) console.log(path);
