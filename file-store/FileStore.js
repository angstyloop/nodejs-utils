const { createWriteStream, createReadStream, unlink,
        rmSync, existsSync, readFileSync, writeFileSync } = require('fs');
const { createHash, randomUUID } = require('crypto');
const { join } = require('path');

/** Pseudo-node for FileStore. Only one TaskQueueWorker will be given a
 * FileStore. That is, only one Thread will be allowed to read and write files
 * to the FileStore at root ("/").
 */
class FileStore {
    constructor(rootDirectory) {
        /** The root directory of this file store. This path is prepended to
         * the fileName arguments of FileStore methods.
         */
        this.rootDirectory = rootDirectory || '/tmp';

        /** A set containing the unique fileIds of files in the store.
         */
        this.fileIds = new Set();

        /** An object whose entries are of the form
         *      fileId: fileName 
         */
        this.fileNames = {};

        /** An object mapping fileNames back to fileIds.
         */
        this._fileIdsByName = {};

        /** An object whose entries are of the form
         *
         *      fileId: fileHash this.
         *
         */
        this.fileHashes = {};

        /** Contains the work-in-progress hashes of files being incrementally
         * updated with [[`FileStore#write`]].
         */
        this._fileHashObjects = {};

        /** Currently open read-only file streams.
         */
        this.readStreams = {};

        /** Currently open write-only file streams.
         */
        this.writeStreams = {};

    }

    /** Create a new empty in this FileStore at @fileName. If the
     * implementation of the store is, e.g., a file system, this is where a
     * new file actually gets added to the file system.
     *
     * @param fileName - (string) The desired path to the new empty file in
     *                   the FileStore.
     *
     * @return (Promise<string>) resolve to FileId
     */
    async createNewEmptyFile(fileName) {
        return new Promise((resolve, reject) => {
            // If @_fileIdsByName[@fileName] is not undefined, re-use the
            // existing fileId and fileName, since they are both a Primary ID
            // for the file. Otherwise, create a new FileId, and add update

            // @fileIds, @fileNames, and @fileIdsByName.
            let id = '';
            if (this._fileIdsByName[fileName]) {
                id = this._fileIdsByName[fileName];
            } else {
                id = randomUUID();
                this.fileIds.add(id);
                this.fileNames[id] = fileName;
                this._fileIdsByName[fileName] = id;
            }
        
            // Close old write stream if it exists.
            if (this.writeStreams[id]) {
                this.writeStreams[id].end();
                this.writeStreams[id].close();
            }

            // Create the filePath string by joining @rootDirectory to @fileName
            const filePath = join(this.rootDirectory, fileName);

            // Create a new empty file at fileName (possibly overwriting).
            this.writeStreams[id] = createWriteStream(filePath)
                                        .on('open', () => {
                                            resolve(id);
                                        });
        });
    }

    /** Update the hash of the file in this FileStore corresponding @fileId.
     *
     * @param fileId - (string) 
     *
     * @return (Promise<string>) resolves to the hash
     */
    async updateHash(id) {
        return new Promise((resolve, reject) => {
            // reject if the id doesn't exist
            if (!this.fileIds.has(id)) {
                reject(new Error(`(FileStore#updateHash) Unknown FileId ${id}`));
            }

            // generate file hash
            // add fileId: fileHashes entry
            const hash = createHash('sha256').setEncoding('utf8');

            // open a readStream to the fileName for fileId if one doesn't
            // exist.
            this.getOrCreateReadStream(id)
                .on('data', (data) => {
                    // write data fragments to the hash
                    hash.update(data)
                })
                .on('error', reject)
                .on('end', () => {
                    // produce the hash when there is no more data left
                    this.fileHashes[id] = hash.digest('hex');
                    // add a fileId: readStream entry to readStreams.
                    resolve(this.fileHashes[id]);
                });
        });
    }

    toString() {
        const { rootDirectory, fileIds, fileNames, fileHashes, _fileIdsByName } = this;
        const size = this.getSize();
        const numberOfReadStreams = Object.keys(this.readStreams).length;
        const numberOfWriteStreams = Object.keys(this.writeStreams).length;
        return JSON.stringify({ rootDirectory,
                fileIds: [...fileIds], fileNames, fileHashes, size,
                numberOfReadStreams, numberOfWriteStreams, _fileIdsByName
        });
    }

    static fromString(json) {
        try {
            const data = JSON.parse(json);
            const { rootDirectory, fileIds, fileNames, fileHashes, _fileIdsByName } = data;
            const it = new FileStore(rootDirectory);
            it.fileIds = new Set(fileIds);
            it.fileNames = fileNames;
            it.fileHashes = fileHashes;
            it._fileIdsByName = _fileIdsByName;
            console.log(JSON.stringify(it));
            return it;
        } catch(e) {
            console.error(e);
            return undefined;
        }
    }

    /** Close any open streams (readable or writable) for a FileId @id.
     * @param id - (string) FileId of the open stream.
     */
    close(id) {
        if (this._fileHashObjects[id]) {
            // Get the hash string from the hash object. 
            this.fileHashes[id] = this._fileHashObjects[id].digest('hex');

            // Remove the hash object when finished with it.
            delete this._fileHashObjects[id];
        }

        // Close any open readStreams
        if (this.readStreams[id]) {
            this.readStreams[id].close();
            delete this.readStreams[id];
        }

        // Close any open writeStreams
        if (this.writeStreams[id]) {
            this.writeStreams[id].close();
            delete this.writeStreams[id];
        }
    }

    /** Close all open streams
     */
    closeAll() {
        this.fileIds.forEach(id => this.close(id));
    }

    /** Get the number of files in the store.
     * 
     * @return (number) The number of files in the store. Return zero if there
     * are no files or if an error occured.
     */
    getSize() {
        return this.fileIds.size;
    }

    _createHash() {
        return createHash('sha256').setEncoding('utf8');
    }

    /* Write from @inputStream to the file at @fileName. If the file exists,
     * overwrite it. Otherwise, create a new file and write to it. Compute
     * the new hash of the file in either case.
     *
     * @param fileName - (string) Desired path to the file in this FileStore.
     *
     * @param inputStream - (Stream) Data will be piped from @inputStream to the
     *                      file at @fileName.
     *
     * @return (Promise<string>) Promise resolves to FileId.
     */
    async writeFile(fileName, inputStream) {
        const id = await this.createNewEmptyFile(fileName);
        return new Promise((resolve, reject) => {
            const hash = this._createHash();
            inputStream
                .on('data', (data) => {
                    hash.update(data);
                    this.writeStreams[id].write(data);
                })
                .on('error', reject)
                .on('end', () => {
                    this.fileHashes[id] = hash.digest('hex');
                    resolve(id);
                });
        });
    }

    static async copyFile(tempFileStore, fileStore, sourceId, targetId) {
        const inputStream = tempFileStore.getOrCreateReadStream(sourceId);
        const targetName = fileStore.fileNames[targetId];
        await fileStore.writeFile(targetName, inputStream);
    }

    /** Append a chunk of data to the file with @fileId. The file must already
     * exist, with an open write stream, e.g., via a call to
     * [[`createNewEmptyFile`]] or [[`writeFile`]].
     *
     * @param fileId - (string) FileId of the file we want to upload.
     *
     * @param data - (string) a small chunk of data to append to the file.
     *
     * @return (Promise<void>)
     */
    async write(fileId, data) {
        return new Promise((resolve, reject) => {
            if (!this.writeStreams[fileId]) {
                reject(new Error(`Unknown FileId: "${fileId}".`));
            }
            this.writeStreams[fileId]
                    .write(data, e => {
                        if (e) {
                            reject(e);
                        } else {
                            // If there is no hash object currently in progress for the serious
                            // of writes that contains this write, create one, and attach
                            // a handler to the write stream to update the hash when the write
                            // stream closes.
                            if (!this._fileHashObjects[fileId]) {
                                this._fileHashObjects[fileId] = this._createHash();
                            }

                            // Incrementally update the hash object for this
                            // series of writes.
                            this._fileHashObjects[fileId].update(data);
                            resolve();
                        }
                    });
        });
    }

    /** Get a readable stream for the file corresponding to the FileId @id, or
     * `undefined` if @id does not exist in @fileIds.
     *
     * @param id - (string) A FileId that may or may not already exist in
     *             @fileIds. If @id does not exist in @fileIds, a warning will
     *             be logged, and `undefined` will be returned.
     *
     * @return (Stream|undefined) the readable stream or undefined if it is not
     *         in @readStreams
     */
     //TODO make async
    getReadStream(id) {
        // if the id doesn't exist return undefined
        if (!this.fileIds.has(id)) {
            //console.warn(`(FileStore#getReadStream) Unknown FileId ${id}`);
            return undefined;
        }
        // if the id exists, create the read stream if it doesn't already
        // exist, and return the new or already existing stream
        return this.getOrCreateReadStream(id);
    }

    /** Create a read stream for the file with FileId @id if it doesn't exist
     * in @readStreams already, and return the @readStream corresponding to @id.
     * Assumes @id is a FileId that already exists in @fileIds
     *
     * @param id - (string) A FileId that already exists in @fileIds
     *
     * @return (Stream) the readable stream corresponding to @id.
     */
     //TODO make async
    getOrCreateReadStream(id) {
        if (!this.readStreams[id]) {
            this.readStreams[id] =
                    createReadStream(join(this.rootDirectory, 
                                          this.fileNames[id]));
        }
        return this.readStreams[id];
    }

    /* Read the file in this FileStore corresponding to @fileId to
     * @outputStream.
     *
     * @param fileId - (string) The unique randomly-generated UUID identifying
     *                          the file.
     *
     * @param outputStream - (string) Data will be piped from the file to
     *                       @outputStream.
     *
     * @return (Promise<void>)
     */
    async readFile(id, outputStream) {
        return new Promise((resolve, reject) => {
                // if the id doesn't exist, log a warning and return false
                if (!this.fileIds.has(id)) {
                    reject(new Error(`(FileStore#readFile) Unknown FileId ${id}`));
                }
                // otherwise, open a read stream to the file if it isn't already.
                // open add entry to readStreams if it isn't already there.
                // pipe the readStream to outputStream.
                this.getOrCreateReadStream(id)
                    .on('data', (data) => outputStream.write(data))
                    .on('error', reject)
                    .on('end', resolve);
        });
    }

    /* Delete a file by FileId. If the implementation is a file system, this
     * is where the file actually gets removed from the file system.
     *
     * @param fileId - (string) the ID of the file to remove.
     *
     * @return (Promise<boolean>) true if deleted, false otherwise
     */
    async deleteFile(id) {
        return new Promise((resolve, reject) => {
            const filePath = join(this.rootDirectory, this.fileNames[id]);
            unlink(filePath, (e) => {
                if (e) {
                    reject(e);
                }

                // Close any open readable or writable streams
                this.close(id);

                // remove fileName from _fileNames (a set)
                delete this._fileIdsByName[this.fileNames[id]];

                // remove entry from fileNames
                delete this.fileNames[id];

                // remove entry from fileHashes
                delete this.fileHashes[id];

                // remove item from fileIds (a Set)
                this.fileIds.delete(id);

                // Resolve when file has been removed from FileStore and deleted from
                // the file system.
                resolve();
            });
        });
    }
};

async function test_FileStore() {
    for (const test of [
        async () => {
            let pass = false;
            let err = '';
            try {
                const it = FileStore.fromString(new FileStore().toString());
                pass = it.toString() === new FileStore().toString();
            } catch (e) {
                err = e;
            }
            console.log([0], pass ? 'PASS' : 'FAIL', "It transforms to and from a String.");
            if (!pass) {
                console.error(err);
            }
        },
        async () => {
            let pass = false;
            let err = '';
            let fileName = '';
            try {
                const it = new FileStore();
                fileName = `test_FileStore.1.${randomUUID()}`;
                await it.createNewEmptyFile(fileName);
                if (existsSync(join('/tmp', fileName))) {
                    pass = true;
                }
            } catch (e) {
                err = e;
            }
            console.log([1], pass ? 'PASS' : 'FAIL',
                    "It creates a new empty file.");
            if (!pass) {
                console.error(err);
            }
            if (existsSync(join('/tmp', fileName))) {
                rmSync(join('/tmp', fileName));
            }
        },
        async () => {
            let pass = false;
            let err = '';
            let fileName = '';
            try {
                const it = new FileStore();
                fileName = `test_FileStore.2.${randomUUID()}`;
                const id = await it.createNewEmptyFile(fileName);
                if (/^.+$/.test(id)) {
                    pass = true;
                }
            } catch (e) {
                err = e;
            }
            console.log([2], pass ? 'PASS' : 'FAIL',
                    "It creates a new FileId for the new empty file.");
            if (!pass) {
                console.error(err);
            }
            if (existsSync(join('/tmp', fileName))) {
                rmSync(join('/tmp', fileName));
            }
        },
        async () => {
            let pass = false;
            let err = '';
            let fileName = '';
            try {
                const it = new FileStore();
                fileName = `test_FileStore.3.${randomUUID()}`;
                const id = await it.createNewEmptyFile(fileName);
                if (!it.fileHashes[id]) {
                    pass = true;
                }
            } catch (e) {
                err = e;
            }
            console.log([3], pass ? 'PASS' : 'FAIL',
                    "It does not generate a file hash for the new empty file.");
            if (!pass) {
                console.error(err);
            }
            if (existsSync(join('/tmp', fileName))) {
                rmSync(join('/tmp', fileName));
            }
        },
        async () => {
            let pass = false;
            let err = '';
            let fileName = '';
            try {
                const it = new FileStore();
                fileName = `test_FileStore.4.${randomUUID()}`;
                const id = await it.createNewEmptyFile(fileName);
                const hash = await it.updateHash(id);
                if (hash && hash === it.fileHashes[id]) {
                    pass = true;
                }
            } catch (e) {
                err = e;
            }
            console.log([4], pass ? 'PASS' : 'FAIL',
                    "It generates a file hash when updateHash is called.");
            if (!pass) {
                console.error(err);
            }
            if (existsSync(join('/tmp', fileName))) {
                rmSync(join('/tmp', fileName));
            }
        },
        async () => {
            let pass = false;
            let err = '';
            let fileName = '';
            try {
                const it = new FileStore();
                fileName = `test_FileStore.5.${randomUUID()}`;
                const id = await it.createNewEmptyFile(fileName);
                it.close(id);
                if (!it.writeStreams[id] && !it.readStreams[id]) {
                    pass = true;
                }
            } catch (e) {
                err = e;
            }
            console.log([5], pass ? 'PASS' : 'FAIL',
                    "It closes open streams.");
            if (!pass) {
                console.error(err);
            }
            if (existsSync(join('/tmp', fileName))) {
                rmSync(join('/tmp', fileName));
            }
        },
        async () => {
            let pass = false;
            let err = '';
            let fileName = '';
            try {
                const it = new FileStore();
                fileName = `test_FileStore.6.${randomUUID()}`;
                const id = await it.createNewEmptyFile(fileName);
                it.closeAll();
                if (!it.writeStreams[id] && !it.readStreams[id]) {
                    pass = true;
                }
            } catch (e) {
                err = e;
            }
            console.log([6], pass ? 'PASS' : 'FAIL',
                    "It closes open streams (2).");
            if (!pass) {
                console.error(err);
            }
            if (existsSync(join('/tmp', fileName))) {
                rmSync(join('/tmp', fileName));
            }
        },
        async () => {
            let pass = false;
            let err = '';
            let fileName = '';
            try {
                const it = new FileStore;
                fileName = `test_FileStore.7.${randomUUID()}`;
                const id = await it.createNewEmptyFile(fileName);
                if (it.getSize() === 1) {
                    pass = true;
                }
            } catch (e) {
                err = e;
            }
            console.log([7], pass ? 'PASS' : 'FAIL',
                    "It has a size.");
            if (!pass) {
                console.error(err);
            }
            if (existsSync(join('/tmp', fileName))) {
                rmSync(join('/tmp', fileName));
            }
        },
        async () => {
            let pass = false;
            let err = '';
            let fileName1 = '';
            let fileName2 = '';
            let testMessage = "test";
            try {
                // Create a FileStore.
                const it = new FileStore;
                // Define the test file paths.
                fileName1 = `test_FileStore.8.1.${randomUUID()}`;
                fileName2 = `test_FileStore.8.2.${randomUUID()}`;
                // Create a new empty file, fileId, and fileName in the
                // FileStore.
                const id = await it.createNewEmptyFile(fileName1);
                // Write a test message to the second test file (the one
                // outside the store)
                writeFileSync(join('/tmp', fileName2), testMessage, { encoding: 'utf8', flag: 'w' });
                // Create a read stream to the second test file.
                const inputStream = createReadStream(join('/tmp', fileName2));
                // Call FileStore#writeFile to write the contents of the
                // second file (inputStream, the test message) to the first
                // file.
                await it.writeFile(fileName1, inputStream);
                it.close(id);
                // Compute the new hash of the first file (the one in the
                // store).
                const newHash = it.fileHashes[id];
                //console.log(`newHash=${newHash}`);
                if (newHash) {
                    pass = true;
                }
            } catch (e) {
                err = e;
            }
            console.log([8], pass ? 'PASS' : 'FAIL',
                    "It writes to a file.");
            if (!pass) {
                console.error(err);
            }
            if (existsSync(join('/tmp', fileName1))) {
                rmSync(join('/tmp', fileName1));
            }
            if (existsSync(join('/tmp', fileName2))) {
                rmSync(join('/tmp', fileName2));
            }
        },
        async () => {
            let pass = false;
            let err = '';
            let fileName1 = '';
            let fileName2 = '';
            let testMessage1 = "test1";
            let testMessage2 = "test2";
            let oldHash = '';
            let newHash = '';
            try {
                // Create a FileStore.
                const it = new FileStore;
                // Define the test file paths.
                fileName1 = `test_FileStore.9.1.${randomUUID()}`;
                fileName2 = `test_FileStore.9.2.${randomUUID()}`;
                // Create a write stream to the second test file, which is not
                // in the FileStore.
                let writeStream = createWriteStream(join('/tmp', fileName2));
                // Write a test message to the second test file (the one
                // outside the store)
                writeFileSync(join('/tmp', fileName2), testMessage1, { encoding: 'utf8', flag: 'w' });
                // Create a read stream to the second test file.
                let inputStream = createReadStream(join('/tmp', fileName2));
                // Call FileStore#writeFile to write the contents of the
                // second file (inputStream, the test message) to the first
                // file.
                const id = await it.writeFile(fileName1, inputStream);
                // Note the file hash
                oldHash = it.fileHashes[id];
                // Write a new message to the second test file.
                writeFileSync(join('/tmp', fileName2), testMessage2, { encoding: 'utf8', flag: 'w' });
                inputStream = createReadStream(join('/tmp', fileName2));
                await it.writeFile(fileName1, inputStream);
                newHash = it.fileHashes[id];
                //console.log(`newHash=${newHash}`);
                //console.log(`oldHash=${oldHash}`);
                if (newHash !== oldHash) {
                    pass = true;
                }
            } catch (e) {
                err = e;
            }
            console.log([9], pass ? 'PASS' : 'FAIL',
                    "It writes to a file (2).");
            if (!pass && err) {
                console.error(err);
            }
            if (existsSync(join('/tmp', fileName1))) {
                rmSync(join('/tmp', fileName1));
            }
            if (existsSync(join('/tmp', fileName2))) {
                rmSync(join('/tmp', fileName2));
            }
        },
        async () => {
            let pass = false;
            let err = '';
            let fileName = '';
            try {
                const it = new FileStore();
                fileName = `test_FileStore.10.${randomUUID()}`;
                const id = await it.createNewEmptyFile(fileName);
                if (it.getReadStream(id)) {
                    pass = true;
                }
            } catch (e) {
                err = e;
            }
            console.log([10], pass ? 'PASS' : 'FAIL',
                    "It gets a read stream.");
            if (!pass) {
                console.error(err);
            }
            if (existsSync(join('/tmp', fileName))) {
                rmSync(join('/tmp', fileName));
            }
        },
        async () => {
            let pass = false;
            let err = '';
            try {
                const it = new FileStore();
                const id = 'doesnotexist';
                if (!it.getReadStream(id)) {
                    pass = true;
                }
            } catch (e) {
                err = e;
            }
            console.log([11], pass ? 'PASS' : 'FAIL',
                    "getReadStream returns undefined if passed an unknown " +
                    "FileId.");
            if (!pass) {
                console.error(err);
            }
        },
        async () => {
            let pass = false;
            try {
                const it = new FileStore();
                const id = 'doesnotexist';
                it.getOrCreateReadStream(id);
            } catch (e) {
                //console.log(e);
                pass = true;
            }
            console.log([12], pass ? 'PASS' : 'FAIL',
                    "getOrCreateReadStream throws an Error when passed an " +
                    "unknown FileId.");
        },
        async () => {
            let pass = false;
            let err = '';
            let fileName1 = '';
            let fileName2 = '';
            const testMessage = 'test';
            try {
                // Prepare a store with one test file in it.
                const it = new FileStore();
                fileName1 = `test_FileStore.13.${randomUUID()}`;
                fileName2 = `test_FileStore.13.${randomUUID()}`;
                writeFileSync(join('/tmp', fileName2), testMessage,
                              { encoding: 'utf8', flag: 'w' });
                const inputStream = createReadStream(join('/tmp', fileName2));
                const id = await it.writeFile(fileName1, inputStream);
                inputStream.close();
                // Make sure streams are closed before testing
                // getOrCreateReadStream
                it.close(id);
                if (it.getOrCreateReadStream(id)) {
                    pass = true;
                }
            } catch (e) {
                err = e
            }
            console.log([13], pass ? 'PASS' : 'FAIL',
                    "It gets or creates a read stream.");
            if (!pass) {
                console.error(e);
            }
            if (existsSync(join('/tmp', fileName1))) {
                rmSync(join('/tmp', fileName1));
            }
            if (existsSync(join('/tmp', fileName2))) {
                rmSync(join('/tmp', fileName2));
            }
        },
        async () => {
            let pass = false;
            let err = '';
            let fileName1 = '';
            let fileName2 = '';
            let testMessage1 = "test1";
            let testMessage2 = "test2";
            try {
                // Prepare a FileStore with one test file in it, and a test
                // file outside the store.
                const it = new FileStore();
                fileName1 = `test_FileStore.14.1.${randomUUID()}`;
                fileName2 = `test_FileStore.14.2.${randomUUID()}`;
                const id = await it.createNewEmptyFile(fileName1);
                writeFileSync(join('/tmp', fileName2), testMessage1,
                              { encoding: 'utf8', flag: 'w' });
                let inputStream = await new Promise((resolve, reject) => {
                    const it = createReadStream(join('/tmp', fileName2))
                        .on('open', () => {
                            resolve(it);
                        });
                });
                await it.writeFile(fileName1, inputStream);
                inputStream.close();
                it.close(id);
                // Write different data to the file outside the store
                writeFileSync(join('/tmp', fileName2), testMessage2,
                              { encoding: 'utf8', flag: 'w' });
                // Read the data from the file in the store into the file
                // outside the store, overwriting the file outside the store
                // with the data it originally had.
                const writeStream = await new Promise((resolve, reject) => {
                    const it = createWriteStream(join('/tmp', fileName2))
                        .on('open', () => {
                            resolve(it);
                        });
                });
                await it.readFile(id, writeStream);
                writeStream.close();
                it.close(id);
                // The test passes if the file outside the store contains the
                // original test message.
                const msg = readFileSync(join('/tmp', fileName2),
                                         { encoding: 'utf8', flag: 'r' });
                //console.log(`expected=${msg}`);
                //console.log(`actual=${testMessage1}`);
                if (msg === testMessage1) {
                    pass = true;
                }
            } catch (e) {
                err = e;
            }
            console.log([14], pass ? 'PASS' : 'FAIL',
                    "It reads from a file.");
            if (!pass) {
                console.error(err);
            }
            if (existsSync(join('/tmp', fileName1))) {
                rmSync(join('/tmp', fileName1));
            }
            if (existsSync(join('/tmp', fileName2))) {
                rmSync(join('/tmp', fileName2));
            }
        },
        async () => {
            let pass = false;
            let err = '';
            let fileName1 = '';
            let fileName2 = '';
            let testMessage1 = 'test1';
            let testMessage2 = 'test2';
            try {
                const it = new FileStore();
                fileName1 = `test_FileStore.15.1.${randomUUID()}`;
                fileName2 = `test_FileStore.15.2.${randomUUID()}`;
                const id = await it.createNewEmptyFile(fileName1); 
                writeFileSync(join('/tmp', fileName2), testMessage1,
                              { encoding: 'utf8', flag: 'w' });
                let inputStream = createReadStream(join('/tmp', fileName2));
                await it.writeFile(fileName1, inputStream);
                inputStream.close();
                it.close(id);
                // Write new data to the file outside the store...
                writeFileSync(join('/tmp', fileName2), testMessage2,
                              { encoding: 'utf8', flag: 'w' });
                // Then overwrite the new data in the file outside the store
                // with the old data from the file in the store.
                const writeStream = createWriteStream(join('/tmp', fileName2));
                await it.readFile(id, writeStream);
                writeStream.close();
                it.close(id);
                // The test passes if the file outside the store contains the
                // original test message.
                const msg = readFileSync(join('/tmp', fileName2),
                                         { encoding: 'utf8', flag: 'r' });
                //console.log(`expected=${msg}`);
                //console.log(`actual=${testMessage1}`);
                if (msg === testMessage1) {
                    pass = true;
                }
            } catch (e) {
                err = e;
            }
            console.log([15], pass ? 'PASS' : 'FAIL',
                'It reads a file.');
            if (!pass) {
                console.error(err);
            }
            if (existsSync(join('/tmp', fileName1))) {
                rmSync(join('/tmp', fileName1));
            }
            if (existsSync(join('/tmp', fileName2))) {
                rmSync(join('/tmp', fileName2));
            }
        },
        async () => {
            let pass = false;
            let err = '';
            let fileName = '';
            let it = undefined;
            let exists = false;
            try {
                it = new FileStore();
                fileName = `test_FileStore.16.1.${randomUUID()}`
                const id = await it.createNewEmptyFile(fileName);
                await it.deleteFile(id);
                exists = existsSync(join('/tmp', fileName));
                if (!exists &&
                        !it.fileIds.has(id) &&
                        !it.fileNames[id] &&
                        !it.fileHashes[id] &&
                        !it._fileIdsByName[fileName] &&
                        !it.readStreams[id] &&
                        !it.writeStreams[id])
                {
                    pass = true;
                }
            } catch (e) {
                err = e;
            }
            console.log([16], pass ? 'PASS' : 'FAIL',
                    'It deletes a file.');
            if (!pass) {
                //console.log("DEBUG INFO");
                //console.log(`FileStore=${it.toString()}`);
                //console.log(`exists=${exists}`);
                console.error(err);
            }
            if (existsSync(join('/tmp', fileName))) {
                rmSync(join('/tmp', fileName));
            }
        },
        async () => {
            let pass = false;
            let err = '';
            let fileName = '';
            let it = undefined;
            const testData = 'data';
            try {
                it = new FileStore();
                fileName = `test_FileStore.17.1.${randomUUID()}`
                const id = await it.createNewEmptyFile(fileName);
                const hash1 = it.fileHashes[id];
                await it.write(id, testData);
                await it.close(id);
                const hash2 = it.fileHashes[id];
                const actual = readFileSync(join('/tmp', fileName), { encoding: 'utf8', flag: 'r' });
                //console.log(hash1);
                //console.log(hash2);
                if (testData === actual) {
                    pass = true;
                }
            } catch (e) {
                err = e;
            }
            console.log([17], pass ? 'PASS' : 'FAIL',
                'It writes and hashes incrementally.');
            if (!pass) {
                //console.log("DEBUG INFO");
                //console.log(`FileStore=${it.toString()}`);
                console.error(err);
            }
            if (existsSync(join('/tmp', fileName))) {
                rmSync(join('/tmp', fileName));
            }
        },
        async () => {
            let pass = false;
            let err = '';
            let fileName = '';
            let it = undefined;
            const testData1 = 'data1';
            const testData2 = 'data2';
            try {
                it = new FileStore();
                fileName = `test_FileStore.18.1.${randomUUID()}`
                const id = await it.createNewEmptyFile(fileName);
                const hash1 = it.fileHashes[id];
                await it.write(id, testData1);

                // Since we aren't closing after writing the first chunk, the
                // hash string in FileSTore#fileHashes will not be updated yet,
                // because the underlying object hash is still being updated.

                const hash2 = it.fileHashes[id];
                const actual1 = readFileSync(join('/tmp', fileName), { encoding: 'utf8', flag: 'r' });
                await it.write(id, testData2);
                await it.close(id);

                // Now that the writeStream for @fileId is closed, the hash
                // string in @fileHashes will be updated.

                const hash3 = it.fileHashes[id];
                const actual2 = readFileSync(join('/tmp', fileName), { encoding: 'utf8', flag: 'r' });
                //console.log(hash1);
                //console.log(hash2);
                //console.log(hash3);
                if (testData1 === actual1 &&
                        testData1+testData2 === actual2 &&
                        !hash1 &&
                        hash1 === hash2
                        && hash2 !== hash3)
                {
                    pass = true;
                }
            } catch (e) {
                err = e;
            }
            console.log([18], pass ? 'PASS' : 'FAIL',
                'It writes and hashes incrementally. (2)');
            if (!pass) {
                //console.log("DEBUG INFO");
                //console.log(`FileStore=${it.toString()}`);
                console.error(err);
            }
            if (existsSync(join('/tmp', fileName))) {
                rmSync(join('/tmp', fileName));
            }
        },

    ]) {
        await test();
    }
}

module.exports = FileStore;

/** To test FileSTore, uncomment the "test_" line and run:
node FileStore.js
 */
//test_FileStore();
