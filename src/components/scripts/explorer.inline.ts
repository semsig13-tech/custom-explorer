
// @ts-nocheck - Required for inline scripts that run in browser context

import { simplifySlug, resolveBasePath } from "@quartz-community/utils/path";

class FileTrieNode {
  constructor(segments, data) {
    this.children = [];
    this.slugSegments = segments;
    this.data = data || null;
    this.isFolder = false;
    this.fileSegmentHint = null;
    this.displayNameOverride = undefined;
    this.noteOrder = data?.frontmatter?.noteOrder;
    this.folderOrder = undefined;
  }

  get displayName() {
    if (this.displayNameOverride !== undefined) return this.displayNameOverride;
    const nonIndexTitle = this.data?.title === "index" ? undefined : this.data?.title;
    return nonIndexTitle || this.fileSegmentHint || this.slugSegment || "";
  }

  set displayName(name) {
    this.displayNameOverride = name;
  }

  get slug() {
    const path = this.slugSegments.join("/");
    return this.isFolder ? path + "/index" : path;
  }

  get slugSegment() {
    return this.slugSegments[this.slugSegments.length - 1] || "";
  }

  makeChild(path, file) {
    const fullPath = [...this.slugSegments, path[0]];
    const child = new FileTrieNode(fullPath, file);
    this.children.push(child);
    return child;
  }

  insert(path, file) {
    if (path.length === 0) return;

    this.isFolder = true;
    const segment = path[0];

    if (path.length === 1) {
      if (segment === "index") {
        // index.md is stored as folder metadata, not as a separate child.
        if (!this.data) this.data = file;
      } else {
        this.makeChild(path, file);
      }
    } else {
      let child = this.children.find((c) => c.slugSegment === segment);

      if (!child) {
        child = this.makeChild(path, undefined);
      }

      const fileParts = (file.filePath || file.slug || "").split("/");
      child.fileSegmentHint = fileParts[fileParts.length - path.length];
      child.insert(path.slice(1), file);
    }
  }

  add(file) {
    this.insert(file.slug.split("/"), file);
  }

  sort(sortFn) {
    this.children.sort(sortFn);
    this.children.forEach((child) => child.sort(sortFn));
  }

  filter(filterFn) {
    this.children = this.children.filter(filterFn);
    this.children.forEach((child) => child.filter(filterFn));
  }

  map(mapFn) {
    mapFn(this);
    this.children.forEach((child) => child.map(mapFn));
  }

  static fromEntries(entries) {
    const trie = new FileTrieNode([], null);
    entries.forEach(([, entry]) => trie.add(entry));
    return trie;
  }
}

// Normalize folder paths so that the same folder has the same key
// regardless of case, Unicode representation, or trailing /index.
function normalizeFolderPath(value) {
  let path = String(value || "").replace(/\\/g, "/");

  try {
    path = decodeURIComponent(path);
  } catch {
    // Keep the original path if it contains invalid URI encoding.
  }

  return path
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/index$/i, "")
    .normalize("NFC")
    .toLowerCase();
}

// Build a normalized lookup table for folderOrder.
function createFolderOrderMap(source) {
  const result = {};

  if (!source || typeof source !== "object") {
    return result;
  }

  for (const [key, value] of Object.entries(source)) {
    const normalizedKey = normalizeFolderPath(key);

    if (
      normalizedKey &&
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      result[normalizedKey] = value;
    }
  }

  return result;
}

// Find folderOrder using all known representations of a folder path.
function getFolderOrder(node, generatedOrder, orderMap) {
  const path = node.slugSegments.join("/");
  const candidates = [
    path,
    path + "/index",
    node.slug,
    node.data?.slug,
  ];

  for (const candidate of candidates) {
    const key = normalizeFolderPath(candidate);

    if (
      key &&
      typeof generatedOrder[key] === "number" &&
      Number.isFinite(generatedOrder[key])
    ) {
      return generatedOrder[key];
    }
  }

  // Fallback to the order map embedded in the Explorer component.
  for (const candidate of candidates) {
    const key = normalizeFolderPath(candidate);
    const metadata = orderMap[key];

    if (
      metadata &&
      typeof metadata.folderOrder === "number" &&
      Number.isFinite(metadata.folderOrder)
    ) {
      return metadata.folderOrder;
    }
  }

  return undefined;
}

const defaultSortFn = (a, b) => {
  // Notes always stay above folders at every nesting level.
  if (a.isFolder !== b.isFolder) {
    return a.isFolder ? 1 : -1;
  }

  // Compare noteOrder only with noteOrder,
  // and folderOrder only with folderOrder.
  const aOrder = a.isFolder ? a.folderOrder : a.noteOrder;
  const bOrder = b.isFolder ? b.folderOrder : b.noteOrder;

  const aHasOrder =
    typeof aOrder === "number" && Number.isFinite(aOrder);

  const bHasOrder =
    typeof bOrder === "number" && Number.isFinite(bOrder);

  if (aHasOrder && !bHasOrder) return -1;
  if (!aHasOrder && bHasOrder) return 1;

  if (aHasOrder && bHasOrder && aOrder !== bOrder) {
    return aOrder - bOrder;
  }

  return a.displayName.localeCompare(
    b.displayName,
    undefined,
    {
      numeric: true,
      sensitivity: "base",
    },
  );
};

// draft:true on index.md does not hide its folder.
// Ordinary draft pages are excluded from the tree.
const defaultFilterFn = (node) => {
  if (node.slugSegment === "tags") return false;
  if (node.isFolder) return true;
  return node.data?.frontmatter?.draft !== true;
};

function processTrie(trie, sortFn, filterFn, mapFn) {
  if (filterFn) trie.filter(filterFn);
  if (mapFn) trie.map(mapFn);
  if (sortFn) trie.sort(sortFn);
  return trie;
}

function renderTree(
  node,
  container,
  currentSlug,
  folderBehavior,
  savedState,
) {
  const folderTemplate = document.getElementById("template-folder");
  const fileTemplate = document.getElementById("template-file");

  if (!folderTemplate || !fileTemplate) {
    console.error("[custom-explorer] Не найдены шаблоны Quartz Explorer");
    return;
  }

  if (node.isFolder) {
    const clone = folderTemplate.content.cloneNode(true);
    const folderContainer = clone.querySelector(".folder-container");
    const folderButton = clone.querySelector(".folder-button");
    const folderTitle = clone.querySelector(".folder-title");
    const folderOuter = clone.querySelector(".folder-outer");
    const contentUl = clone.querySelector(".content");

    if (folderTitle) {
      folderTitle.textContent = node.displayName || node.slugSegment;
    }

    if (folderContainer) {
      folderContainer.dataset.folderpath = node.slug;
    }

    if (folderBehavior === "link" && folderButton) {
      const link = document.createElement("a");
      link.className = folderButton.className;
      link.href = resolveBasePath(simplifySlug(node.slug) || "");

      if (folderTitle) {
        link.appendChild(folderTitle);
      } else {
        link.textContent = node.displayName || node.slugSegment;
      }

      folderButton.replaceWith(link);
    }

    const isCollapsed =
      savedState[node.slug] !== undefined
        ? savedState[node.slug]
        : true;

    const current = simplifySlug(currentSlug);
    const folderPath = simplifySlug(node.slug);

    if (
      (!isCollapsed || (folderPath && current.startsWith(folderPath))) &&
      folderOuter
    ) {
      folderOuter.classList.add("open");
    }

    if (contentUl) {
      node.children.forEach((child) => {
        renderTree(
          child,
          contentUl,
          currentSlug,
          folderBehavior,
          savedState,
        );
      });
    }

    container.appendChild(clone);
  } else if (node.data) {
    const clone = fileTemplate.content.cloneNode(true);
    const link = clone.querySelector("a");

    if (link) {
      link.href = resolveBasePath(node.data.slug || node.slug);
      link.textContent = node.displayName || node.slugSegment;

      if ((node.data.slug || node.slug) === currentSlug) {
        link.classList.add("active", "is-active");
      }
    }

    container.appendChild(clone);
  }
}

function setupMobileExplorerToggle(explorer) {
  const mobileToggle = explorer.querySelector(".mobile-explorer");
  const desktopToggle = explorer.querySelector(".desktop-explorer");
  const quartzBody = document.querySelector("#quartz-body");

  const isMobile = () =>
    window.matchMedia("(max-width: 800px)").matches;

  if (
    desktopToggle &&
    desktopToggle.dataset.collapseInitialized !== "true"
  ) {
    desktopToggle.dataset.collapseInitialized = "true";

    desktopToggle.addEventListener("click", (event) => {
      if (isMobile()) return;

      event.preventDefault();

      const collapsed = explorer.classList.toggle("collapsed");

      desktopToggle.setAttribute(
        "aria-expanded",
        String(!collapsed),
      );

      explorer
        .querySelector(".explorer-content")
        ?.setAttribute("aria-expanded", String(!collapsed));
    });
  }

  if (
    !mobileToggle ||
    mobileToggle.dataset.mobileToggleInitialized === "true"
  ) {
    return;
  }

  mobileToggle.dataset.mobileToggleInitialized = "true";

  const closeMenu = () => {
    explorer.classList.add("collapsed");
    quartzBody?.classList.remove("lock-scroll");
    mobileToggle.setAttribute("aria-expanded", "false");
  };

  const openMenu = () => {
    explorer.classList.remove("collapsed");
    quartzBody?.classList.add("lock-scroll");
    mobileToggle.setAttribute("aria-expanded", "true");
  };

  if (isMobile()) closeMenu();

  mobileToggle.addEventListener("click", (event) => {
    if (!isMobile()) return;

    event.preventDefault();
    event.stopPropagation();

    explorer.classList.contains("collapsed")
      ? openMenu()
      : closeMenu();
  });

  explorer.addEventListener("click", (event) => {
    if (!isMobile()) return;

    const target = event.target;

    if (
      target instanceof Element &&
      target.closest(".explorer-content a")
    ) {
      closeMenu();
    }
  });

  window.addEventListener("resize", () => {
    if (!isMobile()) {
      explorer.classList.remove("collapsed");
      quartzBody?.classList.remove("lock-scroll");

      mobileToggle.setAttribute("aria-expanded", "true");
      desktopToggle?.setAttribute("aria-expanded", "true");
    } else {
      closeMenu();
    }
  });
}

async function setupExplorer(event) {
  const explorers = document.querySelectorAll(".explorer");

  if (!explorers.length) return;

  explorers.forEach(setupMobileExplorerToggle);

  try {
    const url = resolveBasePath("static/contentIndex.json");
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${url}`);
    }

    const raw = await response.json();
    const contentData = raw.content || raw;

    // Load folderOrder generated from source index.md files.
    // Draft index.md files are included by FolderOrderEmitter.
    let generatedFolderOrder = {};

    try {
      const orderUrl = resolveBasePath("static/folder-order.json");
      const orderResponse = await fetch(orderUrl);

      if (orderResponse.ok) {
        const orderData = await orderResponse.json();
        generatedFolderOrder = createFolderOrderMap(orderData);
      } else {
        console.warn(
          "[custom-explorer] Не удалось загрузить folder-order.json:",
          orderResponse.status,
        );
      }
    } catch (error) {
      console.warn(
        "[custom-explorer] Ошибка загрузки folder-order.json:",
        error,
      );
    }

    const entries = Object.entries(contentData).map(
      ([slug, entry]) => [
        slug,
        {
          ...entry,
          slug: entry.slug || slug,
        },
      ],
    );

    const currentSlug = String(
      event?.detail?.url || window.location.pathname,
    )
      .replace(/^\/+/, "")
      .replace(/\/$/, "");

    for (const explorer of explorers) {
      const trie = FileTrieNode.fromEntries(entries);

      let orderMap = {};

      try {
        orderMap = JSON.parse(
          explorer.dataset.orderMap || "{}",
        );
      } catch (error) {
        console.warn(
          "[custom-explorer] Ошибка чтения order-map:",
          error,
        );
      }

      // Apply noteOrder and folderOrder to every node in the trie.
      trie.map((node) => {
        const path = node.slugSegments.join("/");
        const fileSlug = node.data?.slug || path;

        if (node.isFolder) {
          const folderOrder = getFolderOrder(
            node,
            generatedFolderOrder,
            orderMap,
          );

          if (typeof folderOrder === "number") {
            node.folderOrder = folderOrder;
          }
        } else {
          const noteMeta = orderMap[fileSlug];

          if (
            typeof noteMeta?.noteOrder === "number" &&
            Number.isFinite(noteMeta.noteOrder)
          ) {
            node.noteOrder = noteMeta.noteOrder;
          }
        }
      });

      // Sorting is recursive: it applies at every folder level.
      processTrie(
        trie,
        defaultSortFn,
        defaultFilterFn,
        undefined,
      );

      const ul = explorer.querySelector(".explorer-ul");

      if (!ul) continue;

      ul.replaceChildren();

      const savedState = {};

      try {
        if (explorer.dataset.savestate !== "false") {
          JSON.parse(
            localStorage.getItem("fileTree") || "[]",
          ).forEach((item) => {
            savedState[item.path] = item.collapsed;
          });
        }
      } catch (error) {
        console.warn(
          "[custom-explorer] Ошибка загрузки состояния папок:",
          error,
        );
      }

      trie.children.forEach((child) => {
        renderTree(
          child,
          ul,
          currentSlug,
          explorer.dataset.behavior || "link",
          savedState,
        );
      });

      explorer
        .querySelector(".mobile-explorer")
        ?.classList.remove("hide-until-loaded");

      explorer
        .querySelectorAll(".folder-icon, .folder-button")
        .forEach((control) => {
          control.addEventListener("click", (evt) => {
            const folder = control.closest(".folder-container");
            const outer = folder?.nextElementSibling;

            if (
              !folder ||
              !outer ||
              (
                explorer.dataset.behavior === "link" &&
                control.classList.contains("folder-button")
              )
            ) {
              return;
            }

            evt.preventDefault();
            evt.stopPropagation();

            outer.classList.toggle("open");

            if (explorer.dataset.savestate !== "false") {
              try {
                const saved = JSON.parse(
                  localStorage.getItem("fileTree") || "[]",
                );

                const path = folder.dataset.folderpath;
                const collapsed = !outer.classList.contains("open");

                const index = saved.findIndex(
                  (item) => item.path === path,
                );

                if (index >= 0) {
                  saved[index].collapsed = collapsed;
                } else {
                  saved.push({ path, collapsed });
                }

                localStorage.setItem(
                  "fileTree",
                  JSON.stringify(saved),
                );
              } catch (error) {
                console.warn(error);
              }
            }
          });
        });
    }
  } catch (error) {
    console.error(
      "[custom-explorer] Ошибка построения дерева:",
      error,
    );
  }
}

document.addEventListener("nav", setupExplorer);
document.addEventListener("render", setupExplorer);
