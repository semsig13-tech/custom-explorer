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

