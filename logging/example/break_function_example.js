imports.searchPath.unshift('..');
const Logging = imports.logging;

var Test = class {
    constructor() {
        this._debug = false;
        this._count = 0;
    }

    foo() {
        debug.logging(`Log${this._count++}`);
        this._debug = !this._debug;
    }
};

var test = new Test();
var debug = new Logging.Debugger();

debug.breakpointFunction('foo', test, () => {
    return test._debug;
});

test.foo();
test.foo();
