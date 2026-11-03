import type {
  QuartzComponent,
  QuartzComponentConstructor,
  QuartzComponentProps,
} from "@quartz-community/types";
import OverflowListFactory from "./OverflowList";
import { classNames } from "../util/lang";
import { i18n } from "../i18n";
import style from "./styles/explorer.scss";
import { readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
// @ts-expect-error - Inline script loaded as text by esbuild plugin
import script from "./scripts/explorer.inline.ts";

interface FileTrieNode {
  slugSegment?: string;
  slugSegments?: string[];
  displayName?: string;
  isFolder: boolean;
  data: Record<string, unknown> | null;
  children: FileTrieNode[];
  noteOrder?: number;
  folderOrder?: number;
}

export interface ExplorerOptions {
  title?: string;
  folderDefaultState: "collapsed" | "open";
  folderClickBehavior: "collapse" | "link";
  useSavedState: boolean;
  sortFn?: (a: FileTrieNode, b: FileTrieNode) => number;
  filterFn?: (node: FileTrieNode) => boolean;
  mapFn?: (node: FileTrieNode) => FileTrieNode;
  order?: Array<"filter" | "map" | "sort">;
}

const defaultSortFn = (a: FileTrieNode, b: FileTrieNode): number => {
  // At every tree level, notes must be listed before child folders.
  if (a.isFolder !== b.isFolder) return a.isFolder ? 1 : -1;

  const aOrder = a.isFolder ? a.folderOrder : a.noteOrder;
  const bOrder = b.isFolder ? b.folderOrder : b.noteOrder;
  const aHasOrder = typeof aOrder === "number" && Number.isFinite(aOrder);
  const bHasOrder = typeof bOrder === "number" && Number.isFinite(bOrder);

  if (aHasOrder && !bHasOrder) return -1;
  if (!aHasOrder && bHasOrder) return 1;
  if (aHasOrder && bHasOrder && aOrder !== bOrder) return aOrder - bOrder;

  return (a.displayName || "").localeCompare(b.displayName || "", undefined, {
    numeric: true,
    sensitivity: "base",
  });
};

const defaultOptions: ExplorerOptions = {
  folderDefaultState: "collapsed",
  folderClickBehavior: "link",
  useSavedState: true,
  mapFn: (node: FileTrieNode) => node,
  sortFn: defaultSortFn,
  filterFn: (node: FileTrieNode) => node.slugSegment !== "tags",
  order: ["filter", "map", "sort"],
};

let numExplorers = 0;

function concatenateResources(...resources: (string | undefined)[]): string {
  return resources.filter((r): r is string => !!r).join("\n");
}

type OrderEntry = { noteOrder?: number; folderOrder?: number };

let cachedFolderOrderMap: Record<string, OrderEntry> | undefined;

function readFolderOrderFromIndex(filePath: string): number | undefined {
  try {
    const source = readFileSync(filePath, "utf8");
    const frontmatter = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n|$)/);
    if (!frontmatter) return undefined;

    // folderOrder is deliberately read only from the YAML frontmatter of index.md.
    const yaml = frontmatter[1] ?? "";
    const match = yaml.match(/^\s*folderOrder\s*:\s*(-?(?:\d+\.?\d*|\.\d+))\s*(?:#.*)?$/m);
    if (!match) return undefined;

    const value = Number(match[1]);
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function scanFolderOrderFiles(contentDirectory: string): Record<string, OrderEntry> {
  const result: Record<string, OrderEntry> = {};

  const visit = (directory: string, relativeDirectory: string) => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const relativePath = relativeDirectory
          ? `${relativeDirectory}/${entry.name}`
          : entry.name;
        visit(absolutePath, relativePath);
      } else if (entry.isFile() && entry.name.toLowerCase() === "index.md" && relativeDirectory) {
        const folderOrder = readFolderOrderFromIndex(absolutePath);
        if (folderOrder !== undefined) {
          const slug = relativeDirectory
            .split("/")
            .map((segment) =>
              segment
                .replace(/&/g, "-and-")
                .replace(/\s/g, "-")
                .replace(/%/g, "-percent")
                .toLowerCase(),
            )
            .join("/");
          result[slug] = { folderOrder };
        }
      }
    }
  };

  if (statSync(contentDirectory).isDirectory()) visit(contentDirectory, "");
  return result;
}

function getFolderOrderMap(): Record<string, OrderEntry> {
  if (cachedFolderOrderMap) return cachedFolderOrderMap;

  const contentDirectory = path.join(process.cwd(), "content");
  try {
    cachedFolderOrderMap = scanFolderOrderFiles(contentDirectory);
  } catch {
    cachedFolderOrderMap = {};
  }
  return cachedFolderOrderMap;
}

function buildOrderMap(allFiles: any[]) {
  const map: Record<string, OrderEntry> = { ...getFolderOrderMap() };

  for (const file of allFiles) {
    const slug = String(file.slug ?? "").replace(/^\/+|\/+$/g, "");
    const fm = file.frontmatter ?? {};
    if (!slug) continue;

    // Ordinary notes only: noteOrder is never mixed with folderOrder.
    if (slug !== "index" && !slug.endsWith("/index")) {
      if (typeof fm.noteOrder === "number" && Number.isFinite(fm.noteOrder)) {
        map[slug] = { ...map[slug], noteOrder: fm.noteOrder };
      }
    }
  }

  return map;
}

export default ((userOpts?: Partial<ExplorerOptions>) => {
  const opts: ExplorerOptions = { ...defaultOptions, ...userOpts };

  const { OverflowList, overflowListAfterDOMLoaded } = OverflowListFactory();

  const ExplorerComponent: QuartzComponent = (props: QuartzComponentProps) => {
    const { cfg } = props;
    const displayClass = (props as { displayClass?: "mobile-only" | "desktop-only" }).displayClass;
    const id = `explorer-${numExplorers++}`;
    const locale = cfg?.locale ?? "en-US";
    const title = opts.title ?? i18n(locale).components.explorer.title;
    const orderMap = buildOrderMap(props.allFiles ?? []);

    return (
      <div
        class={classNames(displayClass, "explorer", "nav-files-container")}
        data-behavior={opts.folderClickBehavior}
        data-collapsed={opts.folderDefaultState}
        data-savestate={opts.useSavedState}
        data-order-map={JSON.stringify(orderMap)}
      >
        <button
          type="button"
          class="explorer-toggle mobile-explorer hide-until-loaded"
          data-mobile={true}
          aria-controls={id}
          aria-label={title}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide-menu">
            <line x1="4" x2="20" y1="12" y2="12" />
            <line x1="4" x2="20" y1="6" y2="6" />
            <line x1="4" x2="20" y1="18" y2="18" />
          </svg>
        </button>

        <button type="button" class="title-button explorer-toggle desktop-explorer" data-mobile={false} aria-expanded={true}>
          <h2>{title}</h2>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="5 8 14 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="fold">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>

        <div id={id} class="explorer-content" aria-expanded={false} role="group">
          <OverflowList class="explorer-ul" />
        </div>

        <template id="template-file">
          <li><a href="#" class="nav-file-title tree-item-self"></a></li>
        </template>

        <template id="template-folder">
          <li>
            <div class="folder-container nav-folder-title tree-item-self">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="5 8 14 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="folder-icon nav-folder-collapse-indicator collapse-icon">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
              <div><button class="folder-button"><span class="folder-title"></span></button></div>
            </div>
            <div class="folder-outer"><ul class="content tree-item-children"></ul></div>
          </li>
        </template>
      </div>
    );
  };

  ExplorerComponent.css = style;
  ExplorerComponent.afterDOMLoaded = concatenateResources(script, overflowListAfterDOMLoaded);
  return ExplorerComponent;
}) satisfies QuartzComponentConstructor;
