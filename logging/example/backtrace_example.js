imports.searchPath.unshift('..');
const Logging = imports.logging;

var Test = class {
    constructor() {
        this._debug = false;
    }

    hoo() {
        if (this._debug)
            debug.printBacktrace();

    }

    goo() {
        this._debug = !this._debug;
        this.hoo();
    }

    foo() {
        this.goo();
    }
};

var test = new Test();
var debug = new Logging.Debugger();

debug.printBacktraceFunction('foo', test);
debug.printBacktraceFunction('goo', test, () => {
    return test._debug;
});

test.foo();
test.foo();
