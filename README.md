# Brief

Utilities missing from NodeJS that require NodeJS built-in libraries and thus
don't belong in the "js-utils" repo. 

# Note on recursion with the fs module.

Especially when recursively walking the filesystem and removing files, changing
their ownership, or changing their permission bits, it is important to be
aware of the vulnerability to TOCTOU attacks you are creating.

Please read about [these concerns](https://github.com/nodejs/tooling/issues/59)
related to [TOCTOU attacks](https://en.wikipedia.org/wiki/Time-of-check_to_time-of-use)
before using this code, and don't use it in production code.

The basic idea is a file can change in between the time that you call fstat
and the time that you make a decision based on the result of the fstat, e.g.
when you decide to change permissions on what you think is a regular file. 
That file may have been changed to a link by an attacker. Similar gotchas
exist for changing directories, removing files, writing to files, etc.

[Some commentary from here:](https://github.com/isaacs/chownr/issues/14)

"There will be a TOCTOU issue for any ... recursive filesystem operation"

"There is no atomic way to verify at the time of reading a directory
that it's a real directory and not a symlink somewhere else."


# Contents

## rmDirRecursive(root, target)

Synchronous. Recursively find and remove all subdirectories of @root named
@target. Implements BFS with a FIFO queue.

## chmodRecursive(root, perms)

Synchronous. Recursively find and chmod all children of @root to @perms, where
@perms is a string containing three digits, e.g. '777', for the octal code.

Implements BFS with a FIFO queue.

## cpRecursive(source, target)

Recursively copies a directory to a target path. There should not currently be
a directory at that path. TODO: remove that constraint

# Keywords

node.js nodejs fs find exec rm rf node\_modules recursive recurse remove all
