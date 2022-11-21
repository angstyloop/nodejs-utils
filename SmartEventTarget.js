class SmartEventTarget extends EventTarget {
    constructor() {
        super();
        this.handlers = {};
    }
    addEventListener(name, handler) {
        super.addEventListener(name, handler);
        if (!this.handlers[name]) {
            this.handlers[name] = new Set();
        }
        this.handlers[name].add(handler);
    }
    removeEventListener(name, handler) {
        if (handler) {
            super.removeEventListener(name, handler);
            this.handlers[name].delete(handler);
        } else {
            this.handlers[name].forEach(h => {
                super.removeEventListener(name, h)
            });
            this.handlers[name].clear();
        }
    }
    removeAllListeners(name) {
        if (name) {
            this.removeEventListener(name, null);
        } else {
            Object.keys(this.handlers).map(name => {
                this.removeEventListener(name, null);
            });
            this.handlers = {};
        }
    }
}

// TEST
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function test_SmartEventTarget() {
    for (const test of [
        async () => {
            let pass = true;
            let err = null;
            try {
                const it = new SmartEventTarget();
            } catch (e) {
                err = e;
                pass = false;
            }
            console.log([0], pass ? 'PASS' : 'FAIL',
                    'It runs.');
            if (err) {
                console.log(err);
            }
        },
        async () => {
            let pass = true;
            let err = null;
            try {
                const it = new SmartEventTarget();
                it.addEventListener('what', () => {});
            } catch (e) {
                err = e;
                pass = false;
            }
            console.log([1], pass ? 'PASS' : 'FAIL',
                    'It adds an event listener.');
            if (err) {
                console.log(err);
            }
        },
        async () => {
            let pass = true;
            let err = null;
            try {
                const it = new SmartEventTarget();
                it.addEventListener('what', () => {});
                it.removeEventListener('what', () => {});
            } catch (e) {
                err = e;
                pass = false;
            }
            console.log([2], pass ? 'PASS' : 'FAIL',
                    'It removes a handler by specifying it by name.');
            if (err) {
                console.log(err);
            }
        },
        async () => {
            let pass = true;
            let err = null;
            try {
                const it = new SmartEventTarget();
                it.addEventListener('what', () => {});
                it.removeEventListener('what');
            } catch (e) {
                err = e;
                pass = false;
            }
            console.log([3], pass ? 'PASS' : 'FAIL',
                    'It removes a handler without specifying it by name.');
            if (err) {
                console.log(err);
            }
        },
        async () => {
            let pass = true;
            let err = '';
            let what = null;
            try {
                const it = new SmartEventTarget();
                it.addEventListener('what', (e) => { what = e.detail });
                await sleep(1000);
                it.dispatchEvent(new CustomEvent('what', { detail: 'what' }));
                await sleep(1000);
                if (what != 'what') {
                    pass = false;
                    err += (err ? '\n' : '') +
                            `Event handler was not called. what=${what}`;
                }
                it.removeAllListeners();
            } catch (e) {
                err += e + '\n';
                pass = false;
            }
            console.log([4], pass ? 'PASS' : 'FAIL',
                    'It handles a dispatched event.');
            if (err) {
                console.log(err);
            }
        },
        async () => {
            let pass = true;
            let err = '';
            let what = [null, null];
            try {
                const it = new SmartEventTarget();
                it.addEventListener('what', (e) => {
                    switch (e.detail) {
                    case 'left':
                        what[0] = e.detail;
                        break;
                    case 'right':
                        what[1] = e.detail;
                        break;
                    default:
                        break;
                    }
                    what[0] = e.detail
                });
                await sleep(1000);

                it.dispatchEvent(new CustomEvent('what', { detail: 'left' }));
                await sleep(1000);
                if (what[0] != 'left') {
                    pass = false;
                    err += (err ? '\n' : '') +
                            `Left event handler was not called. what[0]=${what}`;
                }

                it.dispatchEvent(new CustomEvent('what', { detail: 'right' }));
                await sleep(1000);
                if (what[1] != 'right') {
                    pass = false;
                    err += (err ? '\n' : '') +
                            `Right event handler was not called. what[1]=${what}`;
                }
                it.removeAllListeners();
            } catch (e) {
                err += e + '\n';
                pass = false;
            }
            console.log([5], pass ? 'PASS' : 'FAIL',
                    'It handles a dispatched event with two identically named handlers.');
            if (err) {
                console.log(err);
            }
        },
    ]) {
        await test();
    }
}

test_SmartEventTarget();
