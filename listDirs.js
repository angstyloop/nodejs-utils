const { readdirSync, lstatSync, isDirectory } = require('fs');
const { posix: { join } } = require('path');

/** List subdirectories of target directory @d. NOT recursive.
 * @param dir - (string) Target directory.
 * @return (string[]) Subdirectories of @d.
 */
function listDirs(dir) {
    return readdirSync(dir)
            .map(it => join(dir, it))
            .filter(it => lstatSync(it).isDirectory());
}

module.exports = listDirs;
