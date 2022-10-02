#! /usr/bin/env node

const { rmSync } = require('fs');
const { join, posix: { basename } } = require('path');
const listDirs = require('./listDirs');

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
