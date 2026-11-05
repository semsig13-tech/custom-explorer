
import type { QuartzEmitterPlugin } from "@quartz-community/types"
import { slugifyFilePath } from "@quartz-community/utils"
import type { FilePath } from "@quartz-community/utils"

import fs from "node:fs/promises"
import path from "node:path"

/**
 * Emits folderOrder metadata from source index.md files.
 *
 * The folder slug is derived directly from the index.md source path.
 * This avoids relying on positional correspondence between ctx.allFiles
 * and ctx.allSlugs.
 *
 * Draft index.md files are intentionally included.
 */
export const FolderOrderEmitter: QuartzEmitterPlugin = () => ({
  name: "CustomExplorerFolderOrder",

  async emit(ctx) {
    const folderOrder: Record<string, number> = {}

    const files: string[] = Array.isArray(ctx.allFiles)
      ? ctx.allFiles
      : []

    for (const file of files) {
      const sourcePath = String(file).replace(/\\/g, "/")

      // Process only folder index files.
      if (!/(^|\/)index\.md$/i.test(sourcePath)) {
        continue
      }

      // Derive the slug from the actual source path.
      const fileSlug = slugifyFilePath(sourcePath as FilePath)
      const folderSlug = String(fileSlug)
        .replace(/^\/+|\/+$/g, "")
        .replace(/\/index$/i, "")

      // Do not add the root index.
      if (!folderSlug || folderSlug === "index") {
        continue
      }

      try {
        const absolutePath = path.resolve(
          ctx.argv.directory,
          sourcePath,
        )

        const source = await fs.readFile(absolutePath, "utf8")

        const frontmatter = source.match(
          /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/,
        )

        const frontmatterContent = frontmatter?.[1]

        if (typeof frontmatterContent !== "string") {
          continue
        }

        // Read only a top-level numeric folderOrder value.
        const orderMatch = frontmatterContent.match(
          /^folderOrder\s*:\s*(-?(?:\d+(?:\.\d*)?|\.\d+))\s*(?:#.*)?$/m,
        )

        if (!orderMatch) {
          continue
        }

        const order = Number(orderMatch[1])

        if (Number.isFinite(order)) {
          folderOrder[folderSlug] = order
        }
      } catch (error) {
        console.warn(
          `[custom-explorer] Не удалось прочитать ${sourcePath}:`,
          error,
        )
      }
    }

    const outputDir = path.join(ctx.argv.output, "static")

    await fs.mkdir(outputDir, { recursive: true })

    const outputFile = path.join(
      outputDir,
      "folder-order.json",
    )

    await fs.writeFile(
      outputFile,
      JSON.stringify(folderOrder),
      "utf8",
    )

    console.log(
      `[custom-explorer] Сформирована карта folderOrder: ${Object.keys(folderOrder).length}`,
    )
  },
})
