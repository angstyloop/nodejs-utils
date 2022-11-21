const io = require('socket.io');
const isEmptyObject = require('./isEmptyObject');
const FileStore = require('./FileStore');
// for test
const client_io = require('socket.io-client');
const { existsSync, readFileSync } = require('fs');

class FileStoreControl {
    /** This class defines Socket.IO event handlers that facilitate file upload
     * and download over Socket.IO. 
     *
     * For now it also defines the Socket.IO server it attaches the event
     * handlers to.
     *
     * @param fileStore - (FileStore) The FileStore this class uses to read and
     * write files, in order to facilitate file transfer over Socket.IO.
     *
     */
    constructor(fileStore = null) {
        this.fileStore = fileStore || new FileStore();

        this.dataHandlers = {};

        this.socket = io(3333, {});

        this.socket.on('connect', (s) => {
            /** Event Name: "upload"
             *  Event Payload: { fileName: string }
             */
            s.on('upload', async ({ fileName }) => {
                let fileId = '';
                try {
                    // Add @fileName to @fileStore, generating a @fileId.
                    fileId = await this.fileStore.createNewEmptyFile(fileName);
                } catch (e) {
                    // On error, send an upload event with nonzero "code" property
                    // in the payload, and an error message.
                    const message = 'Unable to create new file.';
                    s.emit('upload', {
                        code: 1,
                        message, 
                    });
                    console.error(message);
                    return;
                }

                // TODO: don't close streams in FileStore, and re-run test_FileStore

                // Create an event listener for the event of the form:
                // Event Name: "upload-${fileId}"
                // Event Payload: { data: Utf8EncodedByteArray }
                //         * NOTE: data is an array of bytes
                //         * NOTE: it has a max length. we'll call it the "MTU"
                this.dataHandlers[fileId] = async (...args) => {
                    //
                    //
                    // Write the Utf8EncodedByteArray $data to write stream
                    //
                    //         * however FileStore is implemented it should keep 
                    //           the write stream for @fileId open until the EOS
                    //           event is received or an error occurs
                    //
                    //         * the EOS event is an event with an empty or falsy
                    //           payload
                    //
                    //         * if an error occurs, close the write stream, send
                    //           an upload-${fileId} event to the client with a
                    //           nonzero error code
                    //

                    if (args[0] && !isEmptyObject(args[0]) && args[0].data) {
                        // When events that are not the EOS are received, append
                        // their data to the file. FileStore#write dynamically
                        // updates the hash using crypto.Hash#update, instead of
                        // recomputing the hash after writing the entire file
                        // like FileStore#writeFile.
                        try {
                            //console.log(`fileId=${fileId}`);
                            await this.fileStore.write(fileId, args[0].data);
                            // After data is written succesfully, send an
                            // `upload-${fileId}` event to the client to indicate
                            // we are ready for the next chunk of data.
                            s.emit(`upload-${fileId}`);
                        } catch (e) {
                            s.emit(`upload-${fileId}`, {
                                code: 2,
                                message: 'Failed to upload file part way through.',
                            });
                        }
                    } else {
                        // When the EOS event is received, tell @fileStore to close the
                        // write stream for @fileId...
                        this.fileStore.close(fileId);
                        // Remove the `upload-${fileId}` event handler.
                        s.off(`upload-${fileId}`, this.dataHandlers[fileId]);
                        // Send a final 'upload-${fileId}' event back to
                        // the client, with no payload.
                        s.emit(`upload-${fileId}`);
                        // Push a task into the queue for 'copyFile'
                        //...
                    }
                }
                s.on(`upload-${fileId}`, this.dataHandlers[fileId]);

                // Send the FileId back to the Socket.IO client, so they can start
                // sending `upload-${fileId}` events with payloads of the form
                //
                //     {
                //         data: (string) a "chunk" of the file data, to be appended
                //               to the file with @fileId
                //     }
                //
                // The client should send the first `upload-${fileId}` event when
                // they are ready to start uploading. After the first
                // `upload-${fileId}` event, the client should send an additional
                // chunk on each `upload-${fileId}` event it receives back from
                // the server.
                //
                // When the client is done sending data, they should just send an
                // empty payload {} to `upload-${fileId}`, a falsy payload
                // (e.g. undefined, no argument at all), or simply a payload with a
                // falsy "data" property.
                //
                s.emit('upload', { fileId });
            });
        });
    }
}

module.exports = FileStoreControl;

function test_FileStoreControl() {
    for (const test of [
        () => {
            let pass = false;
            let err = '';
            try {
                const it = new FileStoreControl();
                const client = client_io('http://localhost:3333');
                client.on('upload', ({ fileId, code }) => {
                    //console.log(`(upload) Received FileId ${fileId} from server.`);
                    const _code = code || 0;
                    switch (_code) {
                        case 0: {
                            const data = [
                                { data: 'who\n' },
                                { data: 'what\n' },
                                { data: 'when\n' },
                                { data: 'where\n' },
                                { data: 'why' },
                                {}
                            ];
                            let readyForTest = false;
                            client.on(`upload-${fileId}`, () => {
                                if (readyForTest) {
                                    const path = '/tmp/mycoolfile';
                                    if (existsSync(path)) {
                                        const opts = { encoding: 'utf8', flag: 'r' };
                                        const actual = readFileSync(path, opts);
                                        const expected = 'who\nwhat\nwhen\nwhere\nwhy';
                                        pass = expected === actual;
                                        console.log([0], pass ? 'PASS' : 'FAIL', "It runs.");
                                        if (!pass) {
                                            console.error(err);
                                        }
                                        process.exit(pass ? 0 : 1);
                                    }
                                } else {
                                    const next = data.shift();
                                    if (isEmptyObject(next)) {
                                        readyForTest = true;
                                    }
                                    client.emit(`upload-${fileId}`, next);
                                }
                            });
                            const next = data.shift();
                            client.emit(`upload-${fileId}`, next);
                            break;
                        }
                        default: {
                            console.error(`Error code ${code}`);
                            break;
                        }
                    }
                });
                client.emit('upload', { fileName: 'mycoolfile' });
            } catch (e) {
                err = e;
                pass = false;
            }
        },
        () => {},
    ]) {
        test();
//        setTimeout(() => {
//            process.exit(0);
//        }, 10000);
    }
}

test_FileStoreControl();
