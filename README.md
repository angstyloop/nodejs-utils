# Brief

Utilities missing from NodeJS that require NodeJS built-in libraries and thus
don't belong in the "js-utils" repo. 

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
