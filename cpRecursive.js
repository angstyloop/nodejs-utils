#! /usr/bin/env node

const { readdirSync, lstatSync, cpFileSync, mkdirSync, existsSync } = require('fs');
const { join, posix: { basename } } = require('path');
const listDirs = require('./listDirs');

/** List files in target directory @dir.
 * Returns relative paths, NOT full paths.
 * NOT recursive. DOES NOT follow symbolic links.
 *
 * @param dir - (string) Full or relative path of target directory.
 * @return (string[]) Files of @dir.
 */
function listFilesRelative(dir) {
    return readdirSync(dir)
            .filter(it => lstatSync(join(dir, it)).isFile());
}

/** cp all files (NOT subdirectories) in a directory @source to @target.
 * NOT recursive. DOES NOT follow symbolic links.
 * If @target does not exist, creates it.
 * @param dir - (string) Full or relative path of target directory.
 * @target - (string) Permissions for cp, as a string (e.g., '644')
 */
function cpFiles(source, target) {
    if (!existsSync(target)) {
        mkdirSync(target);
    }
    listFilesRelative(source)
            .map(it => cpFileSync(join(source, it), join(target, it)));
}

/* Starting in the directory named @source, recursively cp all
 * all files and subdirectories to @target, creating dirs as needed.
 * Implements BFS with a FIFO queue.
 * DOES NOT follow symbolic links (stats the LINK ITSELF, NOT THE FILE)
 *
 * @source - Full or relative path of directory to start in.
 * @target - (string) Permissions for cp, as a string (e.g., '644')
 *
 */
/*module.exports = */function cpRecursive(source, target) {
    let s = source, t = target;
    cpFiles(s, t);
    const sdirs = listDirs(s);
    const tdirs = sdirs.map(it => join(t, basename(it)));
    while (sdirs.length) {
        s = sdirs.shift();
        t = tdirs.shift()
        cpFiles(s, t);
        const dirs = listDirs(s);
        sdirs.push(...dirs);
        tdirs.push(...dirs.map(it => join(t, basename(it))));
    }
}

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

/** Driver code.
 */
function main() {
    // "node" and the name of the script are always the first two arguments.
    // Your command line arguments start at index=2 (the third argument -
    // totally not confusing, right?)
    if (process.argv.length !== 4) {
        console.log('USAGE: ./cpRecursive <DIRECTORY> <PERMISSIONS>');
        console.log('PERMISSIONS is a three character string, like 777.');
        process.exit(EXIT_FAILURE);
    }
    cpRecursive(...process.argv.slice(2));
    process.exit(EXIT_SUCCESS);
}

main();
