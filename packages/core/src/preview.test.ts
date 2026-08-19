import { bundledFontBytes, bundledFonts } from "@media-canvas/fonts";
import { expect, test } from "vitest";

import type {
  AssetResolver,
  DesignDocument,
  Element,
  GroupElement,
  RectElement,
  TextElement,
} from "./index.ts";
import { compile, createPreview, referencedAssets } from "./index.ts";

/** The bundled faces the text elements here are measured with. */
const oswaldBold = bundledFonts.find(
  (font) => font.family === "Oswald" && font.weight === 700 && font.style === "normal",
)!;

const inter = bundledFonts.find(
  (font) => font.family === "Inter" && font.weight === 400 && font.style === "normal",
)!;

function assets(): AssetResolver {
  return {
    fontBytes(fontAssetId) {
      const font = bundledFonts.find((candidate) => candidate.id === fontAssetId);
      if (!font) throw new Error(`no bundled font ${fontAssetId}`);
      return bundledFontBytes(font);
    },
    imageUrl(src) {
      return `https://assets.test/${src}`;
    },
    imageSize() {
      return { width: 800, height: 600 };
    },
  };
}

function rect(overrides: Partial<RectElement> = {}): RectElement {
  return {
    id: "r",
    type: "rect",
    x: 0,
    y: 0,
    width: 40,
    height: 20,
    rotation: 0,
    opacity: 1,
    visible: true,
    fill: "#FF0000",
    ...overrides,
  };
}

function text(overrides: Partial<TextElement> = {}): TextElement {
  return {
    id: "t",
    type: "text",
    x: 0,
    y: 0,
    width: 290,
    rotation: 0,
    opacity: 1,
    visible: true,
    content: "LIMITED OFFER",
    fontAssetId: oswaldBold.id,
    fontSize: 30,
    lineHeight: 1.2,
    letterSpacing: 0,
    align: "left",
    anchor: "top",
    color: "#000000",
    ...overrides,
  };
}

function group(children: Element[], overrides: Partial<GroupElement> = {}): GroupElement {
  return {
    id: "g",
    type: "group",
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    visible: true,
    children,
    ...overrides,
  };
}

function document(elements: Element[]): DesignDocument {
  return {
    schemaVersion: 1,
    canvas: { width: 200, height: 100, background: "#FFFFFF" },
    elements,
  };
}

/** The document with one element replaced, as a pure operation on the store
 *  leaves it: a new document, a new element, and every other element the same
 *  object it already was. */
function replacing(doc: DesignDocument, index: number, element: Element): DesignDocument {
  const elements = [...doc.elements];
  elements[index] = element;
  return { ...doc, elements };
}

/** The ids of the elements an update patches, in the order it patches them. */
function patched(update: { kind: string; patches?: { elementId: string }[] }): string[] {
  return (update.patches ?? []).map((patch) => patch.elementId);
}

test("a document opened for the first time is compiled whole, into the compiler's own markup", () => {
  const doc = document([rect(), text()]);
  const preview = createPreview(assets());

  const update = preview.update(doc);

  expect(update).toEqual({ kind: "compiled", svg: compile(doc, assets()) });
});

test("the same document again asks for no work at all", () => {
  const doc = document([rect()]);
  const preview = createPreview(assets());
  preview.update(doc);

  expect(preview.update(doc)).toEqual({ kind: "unchanged" });
  expect(preview.update({ ...doc })).toEqual({ kind: "unchanged" });
});

test("changing one element patches that element's node, and nothing else's", () => {
  const doc = document([rect({ id: "left" }), rect({ id: "right", x: 100 })]);
  const preview = createPreview(assets());
  preview.update(doc);

  const update = preview.update(replacing(doc, 1, rect({ id: "right", x: 120 })));

  expect(update).toEqual({
    kind: "patched",
    patches: [
      {
        elementId: "right",
        markup: '<rect data-element="right" x="120" y="0" width="40" height="20" fill="#FF0000"/>',
        definitions: [],
        droppedDefinitions: [],
      },
    ],
  });
});

test("an element that is the same object is never compiled again", () => {
  const kept = text();
  const doc = document([kept]);
  const preview = createPreview(assets());
  preview.update(doc);

  // A lie the memo is expected to keep: the element is mutated in place, which
  // the editor's own operations never do, precisely because the caches key on
  // the object (ADR-0006). Even a full compile draws the markup it already has
  // for that object, while a preview meeting the element for the first time
  // draws what the element now says.
  kept.content = "SOLD";
  const resized = { ...doc, canvas: { ...doc.canvas, width: 400 } };
  const again = preview.update(resized);
  const fresh = createPreview(assets()).update(resized);

  expect(again.kind === "compiled" && again.svg).toContain("LIMITED OFFER");
  expect(fresh.kind === "compiled" && fresh.svg).toContain("SOLD");
});

test("a change to what the document holds compiles the whole document again", () => {
  const doc = document([rect({ id: "one" })]);
  const preview = createPreview(assets());
  preview.update(doc);

  const grown = { ...doc, elements: [...doc.elements, rect({ id: "two", x: 60 })] };

  expect(preview.update(grown)).toEqual({ kind: "compiled", svg: compile(grown, assets()) });
});

test("a change to the canvas itself compiles the whole document again", () => {
  const doc = document([rect()]);
  const preview = createPreview(assets());
  preview.update(doc);

  const resized = { ...doc, canvas: { ...doc.canvas, width: 400 } };

  expect(preview.update(resized).kind).toBe("compiled");
});

test("an element that stops drawing compiles the whole document again, having no node to patch", () => {
  const doc = document([rect(), rect({ id: "other", x: 60 })]);
  const preview = createPreview(assets());
  preview.update(doc);

  expect(preview.update(replacing(doc, 0, rect({ visible: false }))).kind).toBe("compiled");
});

test("a patch drops the definitions its element no longer owns", () => {
  const shaded = rect({
    fill: { type: "linear", angle: 0, stops: [{ offset: 0, color: "#FF0000" }] },
  });
  const doc = document([shaded]);
  const preview = createPreview(assets());
  preview.update(doc);

  const update = preview.update(replacing(doc, 0, rect({ fill: "#00FF00" })));

  expect(update).toEqual({
    kind: "patched",
    patches: [
      {
        elementId: "r",
        markup: '<rect data-element="r" x="0" y="0" width="40" height="20" fill="#00FF00"/>',
        definitions: [],
        droppedDefinitions: ["fill-r"],
      },
    ],
  });
});

test("a patched element's own definition travels with it", () => {
  const doc = document([rect()]);
  const preview = createPreview(assets());
  preview.update(doc);

  const shaded = rect({ fill: { type: "radial", stops: [{ offset: 0, color: "#00FF00" }] } });
  const update = preview.update(replacing(doc, 0, shaded));

  expect(update.kind === "patched" && update.patches[0]?.definitions).toEqual([
    {
      id: "fill-r",
      markup:
        '<radialGradient id="fill-r"><stop offset="0" stop-color="#00FF00"/></radialGradient>',
    },
  ]);
});

test("a patch never carries the block of font faces, however much text it changes", () => {
  const doc = document([text()]);
  const preview = createPreview(assets());
  preview.update(doc);

  const update = preview.update(replacing(doc, 0, text({ content: "OFFER OVER" })));

  expect(update.kind).toBe("patched");
  expect(JSON.stringify(update)).not.toContain("@font-face");
});

test("a change to the set of Font Assets the document draws with compiles it whole again", () => {
  const doc = document([text()]);
  const preview = createPreview(assets());
  preview.update(doc);

  const update = preview.update(replacing(doc, 0, text({ fontAssetId: inter.id })));

  expect(update.kind).toBe("compiled");
  expect(update.kind === "compiled" && update.svg).toContain(`font-family:"font-${inter.id}"`);
});

test("a change inside a group patches the child that changed, not the group around it", () => {
  const sibling = rect({ id: "sibling", x: 60 });
  const doc = document([group([rect({ id: "child" }), sibling])]);
  const preview = createPreview(assets());
  preview.update(doc);

  const update = preview.update(replacing(doc, 0, group([rect({ id: "child", x: 10 }), sibling])));

  expect(patched(update)).toEqual(["child"]);
});

test("inside a turned group the group's own node is what changes, because its children decide its center", () => {
  const second = rect({ id: "second", x: 60 });
  const doc = document([group([rect({ id: "first" }), second], { rotation: 30 })]);
  const preview = createPreview(assets());
  preview.update(doc);

  const update = preview.update(
    replacing(doc, 0, group([rect({ id: "first", x: 20 }), second], { rotation: 30 })),
  );

  expect(patched(update)).toEqual(["g"]);
});

test("what a patch puts in place is what compiling the whole document again would draw", () => {
  const doc = document([rect({ id: "left" }), text({ id: "words" })]);
  const preview = createPreview(assets());
  preview.update(doc);

  const edited = replacing(doc, 1, text({ id: "words", content: "SOLD OUT", x: 20 }));
  const update = preview.update(edited);

  expect(update.kind).toBe("patched");
  expect(compile(edited, assets())).toContain(
    update.kind === "patched" ? update.patches[0]!.markup : "",
  );
});

test("the assets a document references are named before anything is compiled", () => {
  const doc = document([
    text(),
    group([
      text({ id: "second", fontAssetId: inter.id }),
      text({ id: "third", fontAssetId: inter.id }),
    ]),
  ]);

  expect(referencedAssets(doc)).toEqual({ fonts: [oswaldBold.id, inter.id], images: [] });
});

test("an image inside a group is an asset the document references, and a bound one is not", () => {
  const doc = document([
    group([
      {
        id: "photo",
        type: "image",
        x: 0,
        y: 0,
        width: 40,
        height: 40,
        rotation: 0,
        opacity: 1,
        visible: true,
        src: "abc",
        naturalWidth: 80,
        naturalHeight: 60,
        fitMode: "cover",
        clip: "none",
      },
      {
        id: "bound",
        type: "image",
        x: 0,
        y: 0,
        width: 40,
        height: 40,
        rotation: 0,
        opacity: 1,
        visible: true,
        src: { $var: "hero" },
        naturalWidth: 80,
        naturalHeight: 60,
        fitMode: "cover",
        clip: "none",
      },
    ]),
  ]);

  expect(referencedAssets(doc)).toEqual({ fonts: [], images: ["abc"] });
});
