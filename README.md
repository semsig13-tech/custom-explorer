# Custom Explorer for Quartz

[English](README.md) · [Русский](README.ru.md)

A customized file-tree and navigation component for [Quartz](https://quartz.jzhao.xyz/). This repository is based on the Quartz Community Explorer and is intended for sites that need a familiar Explorer interface with custom ordering for folders and notes.

## Features

- Interactive file and folder tree.
- Expand and collapse folders.
- Mobile navigation toggle.
- Quartz-style Explorer layout and styling.
- Hide the `tags` directory from the tree by default.
- Custom ordering using Markdown frontmatter:
  - `folderOrder` in a folder's `index.md` controls the folder's position.
  - `noteOrder` in a note controls that note's position.
- Alphabetical sorting as a fallback when an order value is not set.

> **Note:** Ordering fields must be available to the Explorer at runtime. If your Quartz build excludes draft pages or omits frontmatter fields from its content index, the plugin may need a build-time metadata source for those values.

## Requirements

- Quartz 5 or later (the plugin metadata declares `quartzVersion: ">=5.0.0"`).
- Node.js 22 or later and npm 10.9 or later for local development/building.

## Installation

From your Quartz project directory, run:

```bash
npx quartz plugin add github:semsig13-tech/custom-explorer
```

If the plugin is already listed in your Quartz configuration, make sure it is enabled and that the installed plugin revision includes the changes you want to use.

## Enable the plugin

In `quartz.config.yaml`, configure the plugin in the component/plugin list used by your Quartz setup. For the Quartz Community plugin format, the entry looks like this:

```yaml
- source: github:semsig13-tech/custom-explorer
  enabled: true
  layout:
    position: left
    priority: 50
```

If you are replacing the built-in/community Explorer, disable the other Explorer entry to avoid rendering two navigation trees.

## Ordering folders and notes

Add numeric ordering values to the relevant Markdown frontmatter.

### Folder order

Put `folderOrder` in the `index.md` file inside the folder:

```yaml
---
title: Protection functions
folderOrder: 2
---
```

### Note order

Put `noteOrder` in each note that should have a custom position:

```yaml
---
title: Main protections
noteOrder: 1
---
```

Lower numbers appear before higher numbers. Items without an order value use the fallback sort implemented by the plugin. Use numbers, not quoted strings (for example, `noteOrder: 2`, not `noteOrder: "2"`).

## Configuration options

The component supports these options:

| Option | Type | Description |
|---|---|---|
| `title` | `string` | Heading displayed above the Explorer. |
| `folderDefaultState` | `"collapsed" \| "open"` | Initial folder state. |
| `folderClickBehavior` | `"collapse" \| "link"` | Whether clicking a folder toggles it or navigates to its index page. |
| `useSavedState` | `boolean` | Whether to remember folder state in browser storage. |
| `sortFn` | function | Custom comparator for tree entries. |
| `filterFn` | function | Custom filter for tree entries. |
| `mapFn` | function | Custom transformation for tree entries. |
| `order` | array | Order in which filtering, mapping, and sorting are applied. |

Example override (for Quartz setups that expose plugin component options in TypeScript):

```ts
ExternalPlugin.Explorer({
  title: "Documentation",
  folderDefaultState: "collapsed",
  folderClickBehavior: "link",
  useSavedState: true,
});
```

Use the configuration mechanism supported by your installed Quartz version; the exact location of TypeScript overrides may differ between Quartz setups.

## Development

```bash
npm install
npm run build
```

Available checks are defined in `package.json`, including `npm run typecheck`, `npm run lint`, `npm run format`, and `npm test`.

## Credits

Based on the Explorer component from [quartz-community/explorer](https://github.com/quartz-community/explorer), adapted for custom documentation navigation and ordering.
