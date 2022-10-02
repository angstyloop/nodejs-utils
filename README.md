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

# Contents

## rmDirRecursive(root, target)

Synchronous. Recursively find and remove all subdirectories of @root named
@target. Implements BFS with a FIFO queue.

## chmodRecursive(root, perms)

Synchronous. Recursively find and chmod all children of @root to @perms, where
@perms is a string containing three digits, e.g. '777', for the octal code.

Implements BFS with a FIFO queue.

# Keywords

node.js nodejs fs find exec rm rf node\_modules recursive recurse remove all
