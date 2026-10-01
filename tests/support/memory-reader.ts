/**
 * A file system in memory, in the shape `scripts/lib/notices.mjs` reads
 * through, so a test can lay out exactly the tree it is about.
 *
 * POSIX paths only. `links` maps a path to the real folder it points at,
 * which is how pnpm lays out `node_modules`.
 */

export type Tree = Record<string, string>;

export function memoryReader(files: Tree, links: Record<string, string> = {}) {
  const real = (path: string): string => {
    for (const [link, target] of Object.entries(links)) {
      if (path === link || path.startsWith(`${link}/`)) {
        return real(target + path.slice(link.length));
      }
    }
    return path;
  };
  const children = (dir: string) =>
    Object.keys(files)
      .filter((path) => path.startsWith(`${real(dir)}/`))
      .map((path) => path.slice(real(dir).length + 1).split("/"));

  return {
    readText: (path: string) => files[real(path)],
    listFiles: (dir: string) =>
      children(dir)
        .filter((parts) => parts.length === 1)
        .map(([name]) => name),
    listDirs: (dir: string) => [
      ...new Set(
        children(dir)
          .filter((parts) => parts.length > 1)
          .map(([name]) => name),
      ),
    ],
    realPath: real,
  };
}

/** A `package.json`, from its fields. */
export const manifest = (fields: Record<string, unknown>): string =>
  JSON.stringify(fields);
