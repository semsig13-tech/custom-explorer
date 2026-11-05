import type { QuartzEmitterPlugin } from "@quartz-community/types"
import { slugifyFilePath } from "@quartz-community/utils"
import fs from "node:fs/promises"
import path from "node:path"

/**
 * Builds folder-order.json directly from the content directory.
 *
 * This deliberately does not use ctx.allFiles / ctx.allSlugs: filters such as
 * RemoveDrafts may remove draft index.md files from the processed content.
 * Folder index.md files are still read here, even when they contain draft: true.
 */
export const FolderOrderEmitter: QuartzEmitterPlugin = () => ({
  name: "CustomExplorerFolderOrder",

  async emit(ctx) {
    const folderOrder: Record<string, number> = {}
    const contentDir = path.resolve(ctx.argv.directory)
    const outputDir = path.join(ctx.argv.output, "static")
    const outputFile = path.join(outputDir, "folder-order.json")

    // Respect the common ignorePatterns used by Quartz configuration.
    // The configured patterns in this project are directory/name patterns.
    const configuredPatterns: string[] =
      ctx.cfg?.configuration?.ignorePatterns ?? []

    const ignoredNames = configuredPatterns
      .map((pattern) => String(pattern).replace(/\\/g, "/").replace(/\/\*\*$/, "").replace(/^\*\//, ""))
      .filter((pattern) => pattern.length > 0 && !pattern.includes("/"))

    const isIgnoredDirectory = (name: string): boolean => {
      return ignoredNames.some((pattern) => {
        if (pattern.startsWith("*")) {
          return name.endsWith(pattern.slice(1))
        }
        return name === pattern
      })
    }

    const readFolderOrder = async (indexFile: string): Promise<number | undefined> => {
      try {
        // Remove a possible UTF-8 BOM before checking the YAML frontmatter.
        const source = (await fs.readFile(indexFile, "utf8")).replace(/^\uFEFF/, "")
        const frontmatter = source.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---(?:[ \t]*\r?\n|$)/)
        if (!frontmatter) return undefined

        // Read only a top-level numeric YAML value. draft: true is irrelevant.
        const orderMatch = frontmatter[1].match(
          /^folderOrder\s*:\s*["']?(-?(?:\d+(?:\.\d*)?|\.\d+))["']?\s*(?:#.*)?$/m,
        )
        if (!orderMatch) return undefined

        const order = Number(orderMatch[1])
        return Number.isFinite(order) ? order : undefined
      } catch (error) {
        console.warn(`[custom-explorer] Не удалось прочитать ${indexFile}:`, error)
        return undefined
      }
    }

    const walk = async (directory: string): Promise<void> => {
      let entries
      try {
        entries = await fs.readdir(directory, { withFileTypes: true })
      } catch (error) {
        console.warn(`[custom-explorer] Не удалось просмотреть папку ${directory}:`, error)
        return
      }

      for (const entry of entries) {
        const absolutePath = path.join(directory, entry.name)

        if (entry.isDirectory()) {
          if (!isIgnoredDirectory(entry.name)) {
            await walk(absolutePath)
          }
          continue
        }

        if (!entry.isFile() || !/^index\.md$/i.test(entry.name)) continue

        const relativePath = path.relative(contentDir, absolutePath).replace(/\\/g, "/")
        const slug = String(slugifyFilePath(relativePath as any)).replace(/^\/+|\/+$/g, "")
        const folderSlug = slug === "index" ? "" : slug.replace(/\/index$/i, "")

        // The content-root index.md is not a folder in the Explorer tree.
        if (!folderSlug) continue

        const order = await readFolderOrder(absolutePath)
        if (typeof order === "number") {
          folderOrder[folderSlug] = order
        }
      }
    }

    await walk(contentDir)

    await fs.mkdir(outputDir, { recursive: true })
    await fs.writeFile(outputFile, JSON.stringify(folderOrder), "utf8")

    console.log(
      `[custom-explorer] Сформирована карта folderOrder: ${Object.keys(folderOrder).length}`,
    )
    console.log("[custom-explorer] folderOrder:", JSON.stringify(folderOrder))

    return [outputFile as any]
  },

  getQuartzComponents() {
    return []
  },
})
