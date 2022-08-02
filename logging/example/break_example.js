imports.searchPath.unshift('..');
const Logging = imports.logging;

var debug = new Logging.Debugger();

for (let i = 0; i < 5; i++) {
    debug.logging(`Log${i}`);
    debug.breakpoint(() => {
        return i === 3;
    });
}
