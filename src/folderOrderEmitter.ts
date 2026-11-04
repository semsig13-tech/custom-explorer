import type { QuartzEmitterPlugin } from "@quartz-community/types"
import fs from "node:fs/promises"
import path from "node:path"

/**
 * Emits metadata for folders from their source index.md files.
 * This runs after RemoveDrafts, but ctx.allFiles/allSlugs are collected
 * before filtering, so draft index.md files are still discoverable.
 */
export const FolderOrderEmitter: QuartzEmitterPlugin = () => ({
  name: "CustomExplorerFolderOrder",

  async emit(ctx) {
    const folderOrder: Record<string, number> = {}
    const files: string[] = Array.isArray(ctx.allFiles) ? ctx.allFiles : []
    const slugs: string[] = Array.isArray(ctx.allSlugs) ? ctx.allSlugs : []

    for (let i = 0; i < files.length; i++) {
      const sourcePath = String(files[i]).replace(/\\/g, "/")
      if (!/(^|\/)index\.md$/i.test(sourcePath)) continue

      const slug = String(slugs[i] ?? "").replace(/^\/+|\/+$/g, "")
      const folderSlug = slug === "index" ? "" : slug.replace(/\/index$/i, "")
      if (!folderSlug) continue

      try {
        const absolutePath = path.resolve(ctx.argv.directory, sourcePath)
        const source = await fs.readFile(absolutePath, "utf8")
        const frontmatter = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
        if (!frontmatter) continue

        // folderOrder is a top-level numeric YAML scalar.
        const orderMatch = frontmatter[1].match(/^folderOrder\s*:\s*(-?(?:\d+(?:\.\d*)?|\.\d+))\s*(?:#.*)?$/m)
        if (!orderMatch) continue

        const order = Number(orderMatch[1])
        if (Number.isFinite(order)) folderOrder[folderSlug] = order
      } catch (error) {
        console.warn(`[custom-explorer] Не удалось прочитать ${sourcePath}:`, error)
      }
    }

    const outputDir = path.join(ctx.argv.output, "static")
    await fs.mkdir(outputDir, { recursive: true })
    const outputFile = path.join(outputDir, "folder-order.json")
    await fs.writeFile(outputFile, JSON.stringify(folderOrder), "utf8")

    console.log(`[custom-explorer] Сформирована карта folderOrder: ${Object.keys(folderOrder).length}`)
    return [outputFile as any]
  },

  getQuartzComponents() {
    return []
  },
})
