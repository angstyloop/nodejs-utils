#! /usr/bin/env node

const { readdirSync, lstatSync, isDirectory, rmSync } = require('fs');
const { join, posix: { basename } } = require('path');

/** List subdirectories of target directory @d. NOT recursive.
 * @param d - (string) Target directory.
 * @return (string[]) Subdirectories of @d.
 */
function listDirs(dir) {
    return readdirSync(dir)
            .map(it => join(dir, it))
            .filter(it => lstatSync(it).isDirectory());
}

/* Starting in the directory named @root, recursively find and remove all
 * all directories named @target. Implements BFS with a FIFO queue.
 *
 * @root - Full or relative path of directory to start in.
 * @target - name (basename, not path) of target directory to remove.
 *
 */
module.exports = function rmDirRecursive(root, target) {
    let dir = root;
    const dirs = listDirs(dir);
    while (dirs.length) {
        dir = dirs.shift();
        if (basename(dir) === target) {
            rmSync(dir, { recursive: true, force: true });
        } else {
            dirs.push(...listDirs(dir));
        }
    }
}
