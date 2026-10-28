// @ts-nocheck - Required for inline scripts that run in browser context
import { simplifySlug, resolveBasePath } from "@quartz-community/utils/path";

// Простая реализация trie-узла для клиентской части
class FileTrieNode {
  constructor(segments, data) {
    this.children = [];
    this.slugSegments = segments;
    this.data = data || null;
    this.isFolder = false;
    this.fileSegmentHint = null;
    this.displayNameOverride = undefined;
    // ===== ИЗМЕНЕНО: поля порядка =====
    this.noteOrder = data?.frontmatter?.noteOrder;
    this.folderOrder = data?.frontmatter?.folderOrder;
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
    this.children.forEach((c) => c.sort(sortFn));
  }

  filter(filterFn) {
    this.children = this.children.filter(filterFn);
    this.children.forEach((c) => c.filter(filterFn));
  }

  map(mapFn) {
    mapFn(this);
    this.children.forEach((c) => c.map(mapFn));
  }

  static fromEntries(entries) {
    const trie = new FileTrieNode([], null);
    entries.forEach(([, entry]) => trie.add(entry));
    return trie;
  }
}

// ===== ИЗМЕНЕНО: клиентская функция сортировки =====
const defaultSortFn = (a, b) => {
  const aOrder = a.isFolder ? a.folderOrder : a.noteOrder;
  const bOrder = b.isFolder ? b.folderOrder : b.noteOrder;
  const aHas = typeof aOrder === "number" && Number.isFinite(aOrder);
  const bHas = typeof bOrder === "number" && Number.isFinite(bOrder);
  if (aHas && !bHas) return -1;
  if (!aHas && bHas) return 1;
  if (aHas && bHas && aOrder !== bOrder) return aOrder - bOrder;
  if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
  return a.displayName.localeCompare(b.displayName, undefined, { numeric: true, sensitivity: "base" });
};

const defaultFilterFn = (node) => node.slugSegment !== "tags";

function processTrie(trie, sortFn, filterFn, mapFn) {
  if (filterFn) trie.filter(filterFn);
  if (mapFn) trie.map(mapFn);
  if (sortFn) trie.sort(sortFn);
  return trie;
}

// Используем штатные шаблоны Quartz Explorer, сохраняя исходное оформление.
function renderTree(node, container, currentSlug, folderBehavior, savedState) {
  const folderTemplate = document.getElementById("template-folder");
  const fileTemplate = document.getElementById("template-file");
  if (!folderTemplate || !fileTemplate) {
    console.error("[custom-explorer] Не найдены шаблоны Quartz Explorer");
    return;
  }

  if (node.isFolder) {
    const clone = folderTemplate.content.cloneNode(true);
    const folderContainer = clone.querySelector(".folder-container");
    let folderButton = clone.querySelector(".folder-button");
    const folderTitle = clone.querySelector(".folder-title");
    const folderOuter = clone.querySelector(".folder-outer");
    const contentUl = clone.querySelector(".content");
    if (folderTitle) folderTitle.textContent = node.displayName || node.slugSegment;
    if (folderContainer) folderContainer.dataset.folderpath = node.slug;

    if (folderBehavior === "link" && folderButton) {
      const link = document.createElement("a");
      link.className = folderButton.className;
      link.href = resolveBasePath(simplifySlug(node.slug) || "");
      if (folderTitle) link.appendChild(folderTitle);
      else link.textContent = node.displayName || node.slugSegment;
      folderButton.replaceWith(link);
    }

    const isCollapsed = savedState[node.slug] !== undefined ? savedState[node.slug] : true;
    const current = simplifySlug(currentSlug);
    const folderPath = simplifySlug(node.slug);
    if ((!isCollapsed || (folderPath && current.startsWith(folderPath))) && folderOuter) folderOuter.classList.add("open");
    if (contentUl) node.children.forEach((child) => renderTree(child, contentUl, currentSlug, folderBehavior, savedState));
    container.appendChild(clone);
  } else if (node.data) {
    const clone = fileTemplate.content.cloneNode(true);
    const link = clone.querySelector("a");
    if (link) {
      link.href = resolveBasePath(node.data.slug || node.slug);
      link.textContent = node.displayName || node.slugSegment;
      if ((node.data.slug || node.slug) === currentSlug) link.classList.add("active", "is-active");
    }
    container.appendChild(clone);
  }
}

async function setupExplorer(event) {
  const explorers = document.querySelectorAll(".explorer");
  if (!explorers.length) return;
  try {
    const url = resolveBasePath("static/contentIndex.json");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    const raw = await response.json();
    const contentData = raw.content || raw;
    const entries = Object.entries(contentData).map(([slug, entry]) => [slug, { ...entry, slug: entry.slug || slug }]);
    const currentSlug = String(event?.detail?.url || window.location.pathname).replace(/^\/+/, "").replace(/\/$/, "");

    for (const explorer of explorers) {
      const trie = FileTrieNode.fromEntries(entries);
      let orderMap = {};
      try { orderMap = JSON.parse(explorer.dataset.orderMap || "{}"); } catch (e) { console.warn("[custom-explorer] Ошибка чтения order-map", e); }
      trie.map((node) => {
        const path = node.slugSegments.join("/");
        const fileSlug = node.data?.slug || path;
        node.noteOrder = orderMap[fileSlug]?.noteOrder;
        node.folderOrder = (orderMap[path] || orderMap[path + "/index"])?.folderOrder;
      });
      processTrie(trie, defaultSortFn, defaultFilterFn, undefined);

      const ul = explorer.querySelector(".explorer-ul");
      if (!ul) continue;
      ul.replaceChildren();
      const savedState = {};
      try {
        if (explorer.dataset.savestate !== "false") JSON.parse(localStorage.getItem("fileTree") || "[]").forEach((item) => { savedState[item.path] = item.collapsed; });
      } catch (e) { console.warn("[custom-explorer] Ошибка загрузки состояния папок", e); }
      trie.children.forEach((child) => renderTree(child, ul, currentSlug, explorer.dataset.behavior || "link", savedState));
      explorer.querySelector(".mobile-explorer")?.classList.remove("hide-until-loaded");

      explorer.querySelectorAll(".folder-icon, .folder-button").forEach((control) => {
        control.addEventListener("click", (evt) => {
          const folder = control.closest(".folder-container");
          const outer = folder?.nextElementSibling;
          if (!folder || !outer || (explorer.dataset.behavior === "link" && control.classList.contains("folder-button"))) return;
          evt.preventDefault(); evt.stopPropagation(); outer.classList.toggle("open");
          if (explorer.dataset.savestate !== "false") {
            try {
              const saved = JSON.parse(localStorage.getItem("fileTree") || "[]");
              const path = folder.dataset.folderpath; const collapsed = !outer.classList.contains("open");
              const i = saved.findIndex((item) => item.path === path);
              if (i >= 0) saved[i].collapsed = collapsed; else saved.push({ path, collapsed });
              localStorage.setItem("fileTree", JSON.stringify(saved));
            } catch (e) { console.warn(e); }
          }
        });
      });
    }
  } catch (error) { console.error("[custom-explorer] Ошибка построения дерева:", error); }
}

document.addEventListener("nav", setupExplorer);
document.addEventListener("render", setupExplorer);
