// TODO : this example can be executed on the included directory only.
//        (i.e. only on the {path}/extension_debugger/example/)
//        I can't understand the searchPath...

imports.searchPath.unshift('..');
const Logging = imports.logging;

function getCurrentPath() {
    try {
        throw new Error();
    } catch (e) {
        let currentFileInfo = e.stack.split('\n')[0];
        let filePath = currentFileInfo.split(':')[0].split('@')[1];
        if (!filePath.includes('/'))
            return '.';

        return filePath.substr(0, filePath.lastIndexOf('/'));
    }
}

/**
 * Example codes for `Debugger`
 */

var Test = class {
    constructor() {
        this._debug = false;
    }

    sum(a) {
        if (a === 0)
            return 0;

        if (a === 3)
            this._debug = true;

        return a + this.sum(a - 1);
    }

    foo() {
        return this.sum(5);
    }
};

var test = new Test();
var debug = new Logging.Debugger(`${getCurrentPath()}/logging.json`);

// debug.loggingFunction('ALL', 'sum', test,
//     (function () {
//         return this._debug;
//     }).bind(test));

// Implement same predicate with above statement by lambda expression :
debug.loggingFunction('ALL', Logging.Level.INFO, 'sum', test,
    () => {
        return test._debug;
    });


debug.breakpointFunction('ALL', Logging.Level.INFO, 'sum', test,
    () => {
        if (test._debug)
            debug.printBacktrace('ALL', Logging.Level.INFO);
        return test._debug;
    });
test.foo();
debug.logging('ALL', Logging.Level.INFO, 'test');
