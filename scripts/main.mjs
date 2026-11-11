// Shared helpers for the command-line scripts.
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * True when the module at `url` (pass `import.meta.url`) is the script Node was started with.
 * Compares real paths, so it also holds when the skill folder is reached through a symlink.
 */
export function isMain(url) {
  if (!process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(url)); }
  catch { return false; }
}

/**
 * How a rework instruction names the page file at absolute `path`: relative to the
 * nearest ancestor directory holding SKILL.md (the skill root), else relative to the
 * current directory, with forward slashes either way.
 */
export function pageLabel(path) {
  let dir = dirname(path);
  for (;;) {
    if (existsSync(join(dir, 'SKILL.md'))) return relative(dir, path).split(sep).join('/');
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return relative(process.cwd(), path).split(sep).join('/');
}
