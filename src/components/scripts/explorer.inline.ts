 // @ts-nocheck - Required for inline scripts that run in browser context
import { simplifySlug, resolveBasePath } from "@quartz-community/utils/path";

// Узел дерева проводника
class FileTrieNode {
  constructor(segments, data) {
    this.children = [];
    this.slugSegments = segments;
    this.data = data || null;
    this.isFolder = false;
    this.fileSegmentHint = null;
    this.displayNameOverride = undefined;

    this.noteOrder = data?.frontmatter?.noteOrder;
    this.folderOrder = data?.frontmatter?.folderOrder;
  }

  get displayName() {
    if (this.displayNameOverride !== undefined) {
      return this.displayNameOverride;
    }

    const nonIndexTitle =
      this.data?.title === "index" ? undefined : this.data?.title;

    return (
      nonIndexTitle ||
      this.fileSegmentHint ||
      this.slugSegment ||
      ""
    );
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
        if (!this.data && file) {
          this.data = file;
          this.noteOrder = file?.frontmatter?.noteOrder;
          this.folderOrder = file?.frontmatter?.folderOrder;
        }
      } else {
        this.makeChild(path, file);
      }
    } else {
      let child = this.children.find(
        (item) => item.slugSegment === segment,
      );

      if (!child) {
        child = this.makeChild(path, undefined);
      }

      const fileParts = (
        file?.filePath ||
        file?.slug ||
        ""
      ).split("/");

      child.fileSegmentHint =
        fileParts[fileParts.length - path.length] ||
        child.fileSegmentHint;

      child.insert(path.slice(1), file);
    }
  }

  add(file) {
    if (!file || typeof file.slug !== "string" || !file.slug) {
      console.warn(
        "[custom-explorer] Пропущена запись без slug:",
        file,
      );
      return;
    }

    const segments = file.slug.split("/").filter(Boolean);

    if (segments.length === 0) return;

    this.insert(segments, file);
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

    entries.forEach(([slug, entry]) => {
      if (!entry || typeof entry !== "object") {
        console.warn(
          "[custom-explorer] Некорректная запись индекса:",
          slug,
        );
        return;
      }

      // В contentIndex.json slug является ключом записи.
      // Добавляем его в объект перед построением дерева.
      const normalizedSlug = String(slug).replace(
        /^\/+|\/+$/g,
        "",
      );

      if (!normalizedSlug) return;

      trie.add({
        ...entry,
        slug: normalizedSlug,
      });
    });

    return trie;
  }
}

// Сортировка папок и файлов
const defaultSortFn = (a, b) => {
  const aFm = a.data?.frontmatter ?? a.data;
  const bFm = b.data?.frontmatter ?? b.data;

  const aOrder = a.isFolder
    ? a.folderOrder ?? aFm?.folderOrder
    : a.noteOrder ?? aFm?.noteOrder;

  const bOrder = b.isFolder
    ? b.folderOrder ?? bFm?.folderOrder
    : b.noteOrder ?? bFm?.noteOrder;

  const aHas =
    typeof aOrder === "number" && Number.isFinite(aOrder);
  const bHas =
    typeof bOrder === "number" && Number.isFinite(bOrder);

  // Элементы с указанным порядком идут первыми.
  if (aHas && !bHas) return -1;
  if (!aHas && bHas) return 1;

  // Сортировка по noteOrder или folderOrder.
  if (aHas && bHas && aOrder !== bOrder) {
    return aOrder - bOrder;
  }

  // При одинаковом приоритете сначала папки.
  if (a.isFolder && !b.isFolder) return -1;
  if (!a.isFolder && b.isFolder) return 1;

  // Резервная сортировка по названию.
  return a.displayName.localeCompare(
    b.displayName,
    undefined,
    {
      numeric: true,
      sensitivity: "base",
    },
  );
};

const defaultFilterFn = (node) =>
  node.slugSegment !== "tags";

function processTrie(trie, sortFn, filterFn, mapFn) {
  if (filterFn) trie.filter(filterFn);
  if (mapFn) trie.map(mapFn);
  if (sortFn) trie.sort(sortFn);

  return trie;
}

// Отрисовка дерева в DOM
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
    li.classList.add("folder", "collapsed");

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

    node.children.forEach((child) => {
      ul.appendChild(renderNode(child));
    });

    button.addEventListener("click", () => {
      const isOpen = li.classList.toggle("open");
      li.classList.toggle("collapsed", !isOpen);
      button.setAttribute("aria-expanded", String(isOpen));
    });

    li.appendChild(button);
    li.appendChild(ul);

    return li;
  }

  container.replaceChildren();

  const rootUl = document.createElement("ul");
  rootUl.classList.add("explorer-ul");

  trie.children.forEach((child) => {
    rootUl.appendChild(renderNode(child));
  });

  container.appendChild(rootUl);
}

// Загрузка индекса и построение дерева
async function setupExplorer() {
  const containers = document.querySelectorAll(".explorer-tree");

  if (containers.length === 0) {
    console.warn(
      "[custom-explorer] Контейнер .explorer-tree не найден",
    );
    return;
  }

  try {
    // Учитываем базовый путь сайта на GitHub Pages.
    const url = resolveBasePath("static/contentIndex.json");

    console.log(
      "[custom-explorer] Загрузка индекса:",
      url,
    );

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Не удалось загрузить ${url}: HTTP ${response.status}`,
      );
    }

    const data = await response.json();

    if (!data || typeof data !== "object") {
      throw new Error(
        "contentIndex.json содержит некорректные данные",
      );
    }

    const entries = Object.entries(data);

    console.log(
      "[custom-explorer] Записей в индексе:",
      entries.length,
    );

    const trie = FileTrieNode.fromEntries(entries);

    processTrie(
      trie,
      defaultSortFn,
      defaultFilterFn,
      undefined,
    );

    containers.forEach((container) => {
      renderExplorer(trie, container);
    });

    console.log(
      "[custom-explorer] Дерево построено. Корневых элементов:",
      trie.children.length,
    );
  } catch (error) {
    console.error(
      "[custom-explorer] Ошибка построения дерева:",
      error,
    );
  }
}

// Инициализация при первой загрузке и навигации Quartz.
document.addEventListener("nav", () => {
  setupExplorer();
});
