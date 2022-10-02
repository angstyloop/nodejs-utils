#! /usr/bin/env node

const { readdirSync, lstatSync, copyFileSync, existsSync } = require('fs');
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

/** save all files (NOT subdirectories) in a directory @target back to the
 * directory they came from, @source. The wording may seem wrong to you.
 * The source is where the files belong. So they are being copied back
 * there from target.
 *
 * NOT recursive. DOES NOT follow symbolic links.
 *
 * Traps if @target DNE.
 *
 * @param source - (string) Full or relative path of source directory, where
 *                 the files belong.
 *
 * @target - (string) Full or relative path of target directory, where the
 *           files were moved during load, and where they need to be
 *           moved now.
 */
function saveFiles(source, target) {
    if (!existsSync(target)) {
        console.error(`Missing target directory: ${target}.`);
        process.exit(EXIT_FAILURE);
    }
    listFilesRelative(target)
            .map(it => copyFileSync(join(source, it), join(target, it)));
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
/*module.exports = */function saveOneToMany(source, ...targets) {
    targets.map(target => {
        let t = target, s = source;
        saveFiles(s, t);
        const tdirs = listDirs(t);
        const sdirs = tdirs.map(it => join(s, basename(it)));
        while (tdirs.length) {
            t = tdirs.shift()
            s = sdirs.shift();
            saveFiles(s, t);
            const dirs = listDirs(t);
            tdirs.push(...dirs);
            sdirs.push(...dirs.map(it => join(s, basename(it))));
        }
    });
}

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

/** Driver code.
 */
function main() {
    // "node" and the name of the script are always the first two arguments.
    if (process.argv.length < 4) {
        console.log('USAGE: ./saveOneToMany <SOURCE> <...TARGETS>');
        process.exit(EXIT_FAILURE);
    }
    saveOneToMany(...process.argv.slice(2));
    process.exit(EXIT_SUCCESS);
}

main();
