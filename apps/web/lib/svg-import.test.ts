import type { DesignDocument, GroupElement, VectorElement } from "@media-canvas/core";
import { describe, expect, it } from "vitest";
import { createEditorStore } from "./editor-store";
import { importSvg, importedSvgGroup } from "./svg-import";

const ids = sequence("el");

describe("SVG import", () => {
  it("flattens each path into one vector element and carries solid fill and stroke", () => {
    const result = importSvg(
      `<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
         <path d="M 0 0 H 80 V 40 H 0 Z" fill="#FF0000" stroke="#000000" stroke-width="3"/>
         <path d="M 100 10 H 180 V 50 H 100 Z" fill="#00AA00"/>
       </svg>`,
      ids(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.natural).toEqual({ width: 200, height: 100 });
    expect(result.children).toHaveLength(2);
    expect(result.children[0]).toMatchObject({
      type: "vector",
      path: "M 0 0 H 80 V 40 H 0 Z",
      viewBox: { width: 200, height: 100 },
      fill: "#FF0000",
      border: { color: "#000000", width: 3 },
    });
    expect(result.children[1]).toMatchObject({
      type: "vector",
      fill: "#00AA00",
    });
    expect(result.children[1]?.border).toBeUndefined();
  });

  it("refuses a file that contains text, and places nothing of what it also contained", () => {
    const result = importSvg(
      `<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
         <text x="0" y="10">Hello</text>
         <path d="M 0 0 H 10 V 10 H 0 Z" fill="#000000"/>
       </svg>`,
      ids(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/text/i);
    expect(result.message).toMatch(/flatten|outline/i);
    expect(result.found).toEqual(["text"]);
  });

  it("refuses gradients, patterns, filters, masks, and clip paths by name", () => {
    const cases: Array<{ markup: string; found: string }> = [
      {
        markup: `<svg><linearGradient id="g"><stop offset="0" stop-color="#000"/></linearGradient><path d="M0 0H1"/></svg>`,
        found: "gradients",
      },
      {
        markup: `<svg><pattern id="p" width="1" height="1"><path d="M0 0H1"/></pattern><path d="M0 0H1"/></svg>`,
        found: "patterns",
      },
      {
        markup: `<svg><filter id="f"><feGaussianBlur stdDeviation="1"/></filter><path d="M0 0H1"/></svg>`,
        found: "filters",
      },
      {
        markup: `<svg><mask id="m"><path d="M0 0H1"/></mask><path d="M0 0H1"/></svg>`,
        found: "masks",
      },
      {
        markup: `<svg><clipPath id="c"><path d="M0 0H1"/></clipPath><path d="M0 0H1"/></svg>`,
        found: "clip paths",
      },
    ];
    for (const item of cases) {
      const result = importSvg(item.markup, ids());
      expect(result.ok, item.found).toBe(false);
      if (result.ok) continue;
      expect(result.message.toLowerCase(), item.found).toContain(item.found);
      expect(result.message, item.found).toMatch(/flatten|outline/i);
    }
  });

  it("flattens basic shapes and group transforms into single-path vector elements", () => {
    const result = importSvg(
      `<svg viewBox="0 0 40 20" xmlns="http://www.w3.org/2000/svg">
         <rect x="0" y="0" width="10" height="8" fill="#111111"/>
         <g transform="translate(20,2)">
           <path d="M 0 0 H 8 V 6 H 0 Z" fill="#222222"/>
         </g>
       </svg>`,
      ids(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.children).toHaveLength(2);
    expect(result.children[0]).toMatchObject({
      type: "vector",
      path: "M 0 0 H 10 V 8 H 0 Z",
      fill: "#111111",
    });
    expect(result.children[1]).toMatchObject({
      type: "vector",
      path: "M 20 2 L 28 2 L 28 8 L 20 8 Z",
      fill: "#222222",
    });
  });

  it("places the import as a group centred on the drop, scaled down to fit the canvas", () => {
    const imported = importSvg(
      `<svg viewBox="0 0 200 100"><path d="M 0 0 H 200 V 100 H 0 Z" fill="#112233"/></svg>`,
      ids(),
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    const group = importedSvgGroup("g1", imported, { x: 40, y: 30 }, { width: 80, height: 80 });
    expect(group).toMatchObject({
      id: "g1",
      type: "group",
      x: 0,
      y: 10,
      rotation: 0,
      opacity: 1,
      visible: true,
    });
    expect(group.children).toHaveLength(1);
    expect(group.children[0]).toMatchObject({
      type: "vector",
      x: 0,
      y: 0,
      width: 80,
      height: 40,
      viewBox: { width: 200, height: 100 },
      fill: "#112233",
    });
  });

  it("commits a placed import as one store transition and selects the group", () => {
    const document: DesignDocument = {
      schemaVersion: 1,
      canvas: { width: 400, height: 400, background: "#FFFFFF" },
      elements: [],
    };
    const imported = importSvg(
      `<svg viewBox="0 0 20 20"><path d="M 0 0 H 20 V 20 H 0 Z" fill="#000000"/></svg>`,
      ids(),
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    const group: GroupElement = importedSvgGroup("g1", imported, { x: 10, y: 10 }, document.canvas);
    const store = createEditorStore(document);
    let transitions = 0;
    store.subscribe((state, previous) => {
      if (state.document !== previous.document) transitions += 1;
    });
    store.getState().createElement(group);

    expect(store.getState().document?.elements).toEqual([group]);
    expect(store.getState().selected).toEqual(["g1"]);
    expect(group.children[0]).toMatchObject({ type: "vector" } satisfies Pick<
      VectorElement,
      "type"
    >);
    expect(transitions).toBe(1);
    store.getState().undo();
    expect(store.getState().document).toBe(document);
  });
});

function sequence(prefix: string): () => () => string {
  return () => {
    let n = 0;
    return () => `${prefix}-${(n += 1)}`;
  };
}
