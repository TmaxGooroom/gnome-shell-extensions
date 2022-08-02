imports.searchPath.unshift('..');
const Logging = imports.logging;

var Test = class {
    constructor() {
        this._value = 0;
    }

    goo() {
        return this._value++;
    }

    foo() {
        let sum = 0;
        for (let i = 0; i < 6; i++)
            sum += this.goo();


        return sum;
    }
};

var test = new Test();
var debug = new Logging.Debugger();

debug.loggingFunction('foo', test);
debug.loggingFunction('goo', test, () => {
    return test._value === 5;
});

test.foo();
