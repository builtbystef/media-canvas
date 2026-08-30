# @media-canvas/fonts

The bundled font set: nine families vendored in the repository, with one
manifest that names them. Every renderer, fixture, and Workspace seed reads
`manifest.json` rather than guessing at file names.

## The manifest

`manifest.json` holds one entry per vendored file:

| Field            | Meaning                                                            |
| ---------------- | ------------------------------------------------------------------ |
| `id`             | The Font Asset id — the SHA-256 of the file's bytes, lowercase hex |
| `file`           | The file's path under `files/`                                     |
| `family`         | Display metadata for the font picker; the id is the identity       |
| `weight`         | 400 regular, 700 bold, 900 black                                   |
| `style`          | `normal` or `italic`                                               |
| `subfamily`      | The font file's subfamily name                                     |
| `postScriptName` | The font file's PostScript name                                    |

The id is the identity, so the manifest never renames what a file is: change
the bytes and the id changes with them. `src/index.ts` exposes the manifest to
Node consumers; the file itself is plain JSON, which is how FastAPI reads it
when it seeds a new Workspace. Browsers never load from this package — the
editor receives fonts as Font Assets served by the api.

## What is vendored

Every file is a static instance downloaded from Google Fonts
(`https://fonts.google.com/download/list?family={family}`), together with that
family's `OFL.txt`:

| Family           | Files                                                                       |
| ---------------- | --------------------------------------------------------------------------- |
| Inter            | `Inter_18pt-Regular`, `-Italic`, `-Bold`, `-BoldItalic` (the 18pt text cut) |
| Montserrat       | `Regular`, `Bold`, `Black`                                                  |
| Lora             | `Regular`, `Italic`, `Bold`                                                 |
| Playfair Display | `Regular`, `Bold`, `Black`                                                  |
| Oswald           | `Regular`, `Bold`                                                           |
| Bebas Neue       | `Regular`                                                                   |
| Pacifico         | `Regular`                                                                   |
| Dancing Script   | `Regular`, `Bold`                                                           |
| JetBrains Mono   | `Regular`, `Bold`                                                           |

Static instances, never the variable font: opentype.js metrics off a variable
font's default instance are not trustworthy, and text measured differently on
the two sides is the drift this whole contract exists to prevent. TTF and OTF
only — the compiler cannot read WOFF2. `src/manifest.test.ts` holds every one
of those rules, so a file that breaks one fails the suite rather than the
renders.

Each font draws its own `.notdef` for a character it has no glyph for; no other
face is ever substituted. Pacifico's `.notdef` is a blank advance rather than a
box, which is that font's own answer and appears as such in the goldens.

## Changing the set

Download the file, put it under `files/{family}/`, and add it to the manifest.
Use `sha256sum` for the id. Copy `subfamily` and `postScriptName` from the font's
metadata. Then run the tests.

When adding a family, put its `OFL.txt` beside the font files and update the
roster in `src/manifest.test.ts`. The tests fail if a font is missing, extra,
changed, variable, or does not match its manifest metadata.

## Licensing

Every bundled family is licensed under the SIL Open Font License 1.1; each
family directory carries the license text it shipped with. Fonts uploaded to a
Workspace are the uploader's responsibility — the app does not check the rights
to them.
