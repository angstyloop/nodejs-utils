#! /usr/bin/env node

const { readdirSync, chmodSync } = require('fs');
const { join } = require('path');
const listDirs = require('./listDirs');

/** List files (and subdirectories) in target directory @dir. NOT recursive.
 * @param dir - (string) Full or relative path of target directory.
 * @return (string[]) Files of @dir.
 */
function listChildren(dir) {
    return readdirSync(dir).map(it => join(dir, it));
}

/** chmod all files (and subdirectories) in a directory @dir, giving them new
 * permissions @perms. NOT recursive.
 *
 * @param dir - (string) Full or relative path of target directory.
 * @perms - (string) Permissions for chmod, as a string (e.g., '644')
 */
function chmodChildren(dir, perms) {
    listChildren(dir).map(it => chmodSync(it, perms));
}

/* Starting in the directory named @root, recursively find and chmod all
 * all files and subdirectories. The directory @root is also chmod'd.
 * Implements BFS with a FIFO queue.
 *
 * @root - Full or relative path of directory to start in.
 * @perms - (string) Permissions for chmod, as a string (e.g., '644')
 *
 */
/*module.exports = */function chmodRecursive(root, perms) {
    let dir = root;
    chmodSync(root, perms);
    chmodChildren(root, perms);
    const dirs = listDirs(dir);
    while (dirs.length) {
        dir = dirs.shift();
        chmodChildren(dir, perms);
        dirs.push(...listDirs(dir));
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
        console.log('USAGE: ./chmodRecursive <DIRECTORY> <PERMISSIONS>');
        console.log('PERMISSIONS is a three character string, like 777.');
        process.exit(EXIT_FAILURE);
    }
    chmodRecursive(...process.argv.slice(2));
    process.exit(EXIT_SUCCESS);
}

main();
