imports.searchPath.unshift('..');
const Logging = imports.logging;

var debug = new Logging.Debugger();

var TestClass = class {
    constructor() {
        this._a = 1;
    }
};

var Test = class {
    constructor() {
        this._arr = [1, 2, 3, 4, 5];
        this._str = 'Test String';
        this._bool = true;
        this._float = 1.4;
        this._int = 5;
        this._function = () => {
            return 1;
        };
        this._object = new TestClass();
    }

    foo() {
        return this._arr;
    }
};

var test = new Test();

debug.logging(test);
debug.logging(test._object);
debug.logging(test.foo);
