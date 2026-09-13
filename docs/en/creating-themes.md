# Creating and debugging a theme

This guide takes you from "I want my own colors" to "my theme is in the selector", and
tells you what to do when Vellum rejects the file. It is a walkthrough, not a reference:
every field, type and rule is defined in
[The `.vellumstyle` schema](vellumstyle-schema.md), and this guide links to the relevant
section instead of repeating it.

It describes the app as it behaves today: themes are read once at startup, so every
change needs a restart of Vellum.

## 1. Start from an official example

Copy one of the official examples in
[`packages/theme-engine/examples`](../../packages/theme-engine/examples) and rename it.
The filename (without `.vellumstyle`) becomes the theme's stable id; `name` is the label
shown on the selector pill.

| Example                                                                             | Use it when                                                                                                                        |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [`minimal.vellumstyle`](../../packages/theme-engine/examples/minimal.vellumstyle)   | You want to change a handful of top-level colors and keep every other group from the built-in defaults.                            |
| [`complete.vellumstyle`](../../packages/theme-engine/examples/complete.vellumstyle) | You want to control everything. It declares every group with the values of the built-in **Day** theme, ready to edit leaf by leaf. |

CI checks both examples whenever the theme engine, its examples or these docs change: they
must pass the published JSON Schema, load in Vellum without warnings, and use only
cartographic keys from the contract. `minimal.vellumstyle` is a small, useful starting
theme (only `name` is strictly required, but a theme with no colors looks like the
defaults):

```json
{
  "$schema": "https://raw.githubusercontent.com/sebas-tcotd/vellum/main/packages/theme-engine/vellumstyle.schema.json",
  "schemaVersion": 1,
  "name": "My minimal theme",
  "mapBackground": "#efe8d8",
  "water": "#5f9ea0",
  "forests": "#6f8f5f"
}
```

## 2. Open it in an editor that understands the schema

The examples declare `$schema`, which points at the published
[`vellumstyle.schema.json`](../../packages/theme-engine/vellumstyle.schema.json). Once your
editor treats `.vellumstyle` as JSON (see
[Telling your editor that `.vellumstyle` is JSON](vellumstyle-schema.md#telling-your-editor-that-vellumstyle-is-json)),
you get autocompletion, hover docs and inline errors while you type.

`$schema` is optional. Vellum never reads it: deleting the line changes nothing about how
the file loads, and the built-in themes don't declare it. See
[Machine-readable schema](vellumstyle-schema.md#machine-readable-schema-json-schema) for
the few places where the schema is stricter than the app.

Keep the file strict JSON: no comments and no trailing commas.

## 3. Edit the colors

- **A group is all or nothing.** Leave a group out (`roads`, `buildings`, `grid`, …) and
  Vellum uses the built-in default for it. Include it and you must include every key
  inside it: there is no per-leaf merge. To change one road color, copy the whole `roads`
  block from `complete.vellumstyle` and edit that one leaf. Details in
  [Validation behavior](vellumstyle-schema.md#validation-behavior).
- **Colors are `#hex` or `hsl(...)`.** `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` and
  `hsl(210, 40%, 60%)` work; `rgb()` and named colors such as `red` do not. See
  [Color types](vellumstyle-schema.md#color-types).
- **What each field paints** is listed in
  [`RenderStyleParams` fields](vellumstyle-schema.md#renderstyleparams-fields), with the
  road tiers and building categories in their own tables.
- **Your own metadata is allowed.** A field Vellum doesn't know (`_author`, `_notes`, …) is
  ignored rather than rejected. See [Extension points](vellumstyle-schema.md#extension-points).

## 4. Install it and restart

1. Copy the file into the user themes directory for your platform, listed in
   [Installing a theme](vellumstyle-schema.md#installing-a-theme) (on macOS,
   `~/Library/Application Support/com.vellum.desktop/themes`).
2. Quit and reopen Vellum. There is no hot reload: after each edit, restart again.
3. Your theme appears in the selector under its `name`. A file named like a built-in
   theme (for example `day.vellumstyle`) replaces that built-in while it is valid.

## 5. Debug a rejected theme

When a file fails validation, Vellum skips the whole file, keeps loading the other themes
and shows a toast naming the theme, the field path and the reason:

> `My theme is not valid: field roads.highway is missing`

The toast uses the theme's `name` (or the filename when the file has no usable `name`)
and follows your interface language. If the rejected file overrides a built-in theme, the
built-in stays available.

Find the reason in the table and apply the fix:

| Toast says                                                   | Rule / field  | Cause                                                                                                                                                                   | Fix                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `field name is missing`                                      | `required`    | No `name`, or an empty string.                                                                                                                                          | Add `"name": "My theme"` at the root.                                                                                                                                                                                                                   |
| `field roads.highway is missing` (any group path)            | `required`    | You included a group but left out one of its keys.                                                                                                                      | Add the missing key, copying it from `complete.vellumstyle`, or remove the whole group to fall back to the defaults.                                                                                                                                    |
| `field root has the wrong type`                              | `type`        | The file is not a JSON object (for example `[]` or a bare string).                                                                                                      | Wrap the theme in `{ … }`.                                                                                                                                                                                                                              |
| `field name has the wrong type` (or a group path)            | `type`        | `name` is not a string, or a group is an array or a string instead of an object.                                                                                        | Give `name` a string value; give the group the object shape shown in the reference.                                                                                                                                                                     |
| `field water is not a valid color (use #rrggbb or hsl(...))` | `color-token` | A color leaf is present but is not `#hex` or `hsl(...)` (`"red"`, `rgb(…)`, a typo in the digits).                                                                      | Replace the value with a `#rrggbb` or `hsl(...)` color.                                                                                                                                                                                                 |
| `malformed JSON`                                             | `JSON`        | `JSON.parse` failed: a comment, a trailing comma, a missing quote or brace.                                                                                             | Open the file in an editor with JSON support; it points at the exact character. No field path is given in this case.                                                                                                                                    |
| No toast, and the theme is not in the selector               | —             | Vellum never read the file: wrong directory, extension other than `.vellumstyle` (e.g. `.vellumstyle.json`), no restart yet, or a file that is unreadable or not UTF-8. | Check the path and extension, save the file as UTF-8 and restart. An unreadable or non-UTF-8 file is skipped with only a native log line (`[load_themes] skipping …` on standard error, visible when Vellum is started from a terminal), never a toast. |

Only one problem is reported per file. After fixing it, restart: if the toast returns with
another path, repeat.

### Migration: old and newer files

Some differences between your file and the current schema are not errors, and produce no
toast. The [supported versions and evolution policy](vellumstyle-schema.md#supported-versions-and-evolution-policy)
covers them in full:

- **`schemaVersion` absent**: the file is treated as version `1` and loads normally.
  Add `"schemaVersion": 1` so your intent is explicit.
- **`schemaVersion` higher than the current version**: loaded best-effort. If it lacks a
  color the current Vellum needs, you get the usual `required` toast for that path; add
  the key or remove the group.
- **Retired fields** such as `roads.*.industrial` or `roads.rail.tram`: ignored as
  extension points. They are harmless, but you can delete them.
- **Groups added after your file was written** (`mapFrame`, `contourLine`, `grid`,
  `parkAreas`): filled from the built-in defaults. Copy them from `complete.vellumstyle`
  if you want to style them.

See the [backward compatibility guarantee](vellumstyle-schema.md#backward-compatibility-guarantee)
for what Vellum promises about files that load today.
