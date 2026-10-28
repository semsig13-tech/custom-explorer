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
  const aFm = a.data?.frontmatter ?? a.data;
  const bFm = b.data?.frontmatter ?? b.data;

  const aOrder = a.isFolder ? aFm?.folderOrder : aFm?.noteOrder;
  const bOrder = b.isFolder ? bFm?.folderOrder : bFm?.noteOrder;

  const aHas = typeof aOrder === "number";
  const bHas = typeof bOrder === "number";

  // 1) С явным порядком — выше
  if (aHas && !bHas) return -1;
  if (!aHas && bHas) return 1;
  // 2) Оба с порядком — по возрастанию
  if (aHas && bHas) return aOrder - bOrder;
  // 3) Стандартное поведение
  if (!a.isFolder && b.isFolder) return 1;
  if (a.isFolder && !b.isFolder) return -1;
  return a.displayName.localeCompare(b.displayName, undefined, {
    numeric: true,
    sensitivity: "base",
  });
};

const defaultFilterFn = (node) => node.slugSegment !== "tags";

function processTrie(trie, sortFn, filterFn, mapFn) {
  if (filterFn) trie.filter(filterFn);
  if (mapFn) trie.map(mapFn);
  if (sortFn) trie.sort(sortFn);
  return trie;
}

// Отрисовка дерева в DOM (сохранена логика апстрима)
function renderExplorer(trie, container) {
  function renderNode(node) {
    if (!node.isFolder) {
      const li = document.createElement("li");
      li.classList.add("file");
      const a = document.createElement("a");
      a.href = resolveBasePath(node.slug);
      a.textContent = node.displayName;
      li.appendChild(a);
      return li;
    }

    const li = document.createElement("li");
    li.classList.add("folder");
    li.classList.add("collapsed");

    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("folder-button");
    button.setAttribute("aria-expanded", "false");

    const icon = document.createElement("span");
    icon.classList.add("folder-icon");
    icon.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';

    const title = document.createElement("span");
    title.classList.add("folder-title");
    title.textContent = node.displayName;

    button.appendChild(icon);
    button.appendChild(title);

    const ul = document.createElement("ul");
    ul.classList.add("folder-content");
    node.children.forEach((child) => ul.appendChild(renderNode(child)));

    button.addEventListener("click", () => {
      const isOpen = li.classList.toggle("open");
      li.classList.toggle("collapsed", !isOpen);
      button.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    li.appendChild(button);
    li.appendChild(ul);
    return li;
  }

  container.innerHTML = "";
  const rootUl = document.createElement("ul");
  rootUl.classList.add("explorer-ul");
  trie.children.forEach((child) => rootUl.appendChild(renderNode(child)));
  container.appendChild(rootUl);
}

async function setupExplorer() {
  // Получаем данные из index.json (или другого эндпоинта в вашем форке)
  const base = document.body.dataset.baseUri || "";
  const url = `${base}/static/contentIndex.json`;
  const res = await fetch(url);
  const data = await res.json();

  const trie = FileTrieNode.fromEntries(Object.entries(data));
  processTrie(trie, defaultSortFn, defaultFilterFn, undefined);

  const containers = document.querySelectorAll(".explorer-tree");
  containers.forEach((c) => renderExplorer(trie, c));
}

document.addEventListener("nav", () => {
  setupExplorer();
});
