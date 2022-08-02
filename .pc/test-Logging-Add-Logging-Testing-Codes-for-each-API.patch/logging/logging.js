/* exported Debugger */

const System = imports.system;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const ByteArray = imports.byteArray;

/**
 * Level:
 *
 * Public object for setting the level of logging.
 * 'Debugger' present the logs which are upper cases of the determined level.
 * (e.g. If the level is 'INFO', the logs for 'WARNING' and 'ERROR' are stamped also.)
 * INFO: It is used for remaining the informations. Using it to find out all about the logs.
 * WARNING: It is used for codes which potentially includes errors.
 *          Set this flag when it may causes errors
 * ERROR: It is used for unreachable state, which means that 'must not reach here'
 */

var Level = {
    NONE: 0,
    INFO: 1,
    WARNING: 2,
    ERROR: 3,
};

var BACKTRACE_LOG = 'Backtrace';
var COMMON_LOG = 'Log';

var Debugger = class {
    constructor(confFile) {
        this._breakpoints = 0;
        this._output = `${GLib.get_home_dir()}/.tos_shell_log.out`;
        this._level = Level.INFO;
        this._channel = this._getDefaultChannel();

        this._parseConfigFile(confFile);
    }

    _parseConfigFile(confFile) {
        if (confFile === undefined)
            return;


        let [result, contents] = GLib.file_get_contents(confFile);

        if (!result)
            return;


        let json = JSON.parse(ByteArray.toString(contents));

        this._channel = json['channel'];
        this._level = this._stringToLevel(json['level']);
        this._output = json['output'];
    }

    _getDefaultChannel() {
        let dir = this._getCurrentDir();

        if (dir === undefined)
            return 'ALL';


        let metadata = `${dir}/metadata.json`;

        if (!GLib.file_test(metadata, GLib.FileTest.EXISTS))
            return 'ALL';


        let [result, contents] = GLib.file_get_contents(metadata);

        if (!result)
            return 'ALL';

        let json = JSON.parse(ByteArray.toString(contents));

        let uuid = json['uuid'];

        if (json['uuid'] === undefined)
            return 'ALL';


        return uuid;
    }

    _getCurrentDir() {
        let stackLine = new Error().stack.split('\n')[1];
        if (!stackLine)
            return undefined;

        let match = new RegExp('@(.+):\\d+').exec(stackLine);

        if (!match)
            return undefined;

        let file = Gio.File.new_for_path(match[1]);

        return file.get_parent().get_path();
    }

    _stringToLevel(level) {
        if (level === 'INFO')
            return Level.INFO;
        if (level === 'WARNING')
            return Level.WARNING;
        if (level === 'ERROR')
            return Level.ERROR;
        return Level.NONE;
    }

    _levelToString(level) {
        if (level === Level.INFO)
            return 'INFO';

        if (level === Level.WARNING)
            return 'WARNING';

        if (level === Level.ERROR)
            return 'ERROR';

        return 'NONE';
    }

    _getPropertyDescriptor(obj, property) {
        if (obj.hasOwnProperty(property))
            return Object.getOwnPropertyDescriptor(obj, property);

        return this._getPropertyDescriptor(obj, property);
    }

    _wrappingFunc(func, wrappedFunc, properties) {
        wrappedFunc.isWrapped = true;
        wrappedFunc.innerFunc = func;

        for (let property in properties) {
            let descriptor = this._getPropertyDescriptor(properties, property);
            Object.defineProperty(wrappedFunc, property, descriptor);
        }

        return wrappedFunc;
    }

    _getInnerFunc(func) {
        if (!func.isWrapped)
            return func;


        return this._getInnerFunc(func.innerFunc);
    }

    _getTagValue(func, tag) {
        while (func.isWrapped) {
            if (func.hasOwnProperty(tag))
                return func[tag];

            func = func.innerFunc;
        }
        return undefined;
    }

    _isValid(channel, level) {
        // TODO : Check whether the channel's uuid is included in extension list.

        if (channel !== this._channel && this._channel !== 'ALL')
            return false;


        if (this._level > level)
            return false;


        return true;
    }

    _getCurrentDateTime() {
        let date = new Date();
        let dateTimeStr = date.toLocaleDateString();
        dateTimeStr += date.toLocaleTimeString('en-US', {
            hour12: false,
            hour: 'numeric',
            minute: 'numeric',
        });
        dateTimeStr = `${dateTimeStr}:${date.getSeconds()}`;
        return dateTimeStr.replace(/\s+/g, '');

    }

    _convertToString(msg, indent, isIndentable) {
        let str = '';

        if (msg === null)
            return str;


        if (isIndentable) {
            for (let i = 0; i < indent; i++)
                str = `${str} `;

        }

        if (msg instanceof Function && msg !== null) {
            // NOTE: For Function messages
            str += 'Function';
        } else if (typeof msg === 'object' && msg.join === undefined) {
            // NOTE: For General Object
            str += `${msg.constructor.name}: { \n`;
            for (let prop in msg) {
                str += `${this._convertToString(prop, indent + 2, true)}:`;
                try {
                    if (msg[prop] === null)
                        str += 'null';
                    else if (msg[prop] === undefined)
                        str += 'undefined';

                    else if (msg[prop] instanceof Function)
                        str += 'Function';

                    else
                        str += `${msg[prop].toString()}`;

                } catch (e) {
                    str += 'Unknown';
                }
                str += ',\n';
            }
            str = str.slice(0, -2);
            str += this._convertToString('\n}', indent, true);
        } else if (typeof msg === 'object' && !(msg.join === undefined)) {
            // NOTE: For Array Object
            str += '[';
            for (let prop in msg)
                str += `${this._convertToString(prop, indent, false)}, `;

            if (msg.length > 0)
                str = str.slice(0, -2);

            str += ']';
        } else {
            // NOTE: The other values
            str += msg;
        }

        return str;
    }

    _recordLogMessage(channel, level, msg, logType) {
        let logFile = Gio.File.new_for_path(this._output);
        let outputStream = logFile.append_to(0, null);

        let lines = this._convertToString(msg, 0, false).split(/\r?\n/);

        let res = '';

        lines.forEach(element => {
            res += `[${channel}][${this._levelToString(level)}][${logType}][${this._getCurrentDateTime()}] ${element}\n`;
        });

        let byteStream = ByteArray.fromString(res);
        outputStream.write(byteStream, null);
        outputStream.close(null);
    }

    _mergePredicate(func, predicate, predName) {
        predicate = typeof predicate !== 'undefined' ? predicate
            : () => {
                return true;
            };

        let prevPred = this._getTagValue(func, predName);

        if (prevPred !== undefined) {
            Object.defineProperty(func, predName, {
                value: () => {
                    return prevPred() || predicate();
                },
            });
            return true;
        }
        return false;
    }

    // PUBLIC API
    /*
     * printBacktraceFunction:
     * channel: channel for logging
     * level: level of the logging function call
     * funcName: a string name of function for priting call-trace of functions
     * obj: Actual object includes the function
     * predicate: predicates for whether logging or not.
     *            It should be a function that returns `bool` without any arguments.
     *
     * This function is used to wrap the given function with printing call-trace.
     * If the channel and level are unsuitable for the debugger, it does not record the logs.
     * Also, we can set the conditions for recording logs.
     * For example, we can record the call-trace information only when the predicates
     * are satisfied :
     * ...
     * printBacktraceFunction(..., () => { return condition(); });
     * ...
     */

    // For handling variadic situation, currently we get the parameters with rest-params.
    // The original proto-type of function is following:

    // printBacktraceFunction(channel, level, funcName, obj, predicate)
    printBacktraceFunction(...args) {
        let channel = this._channel;
        let level = this._level;
        let funcName = '';
        let obj;
        let predicate = () => {
            return true;
        };

        // At least funcName and obj should be provided
        if (args.length < 2 || args.length > 5)
            return;

        let index = args.length - 1;

        if (args[index] instanceof Function)
            predicate = args[index--];


        obj = args[index--];
        funcName = args[index--];

        for (let i = index; i >= 0; i--) {
            if (args[i] >= Level.NONE && args[i] <= Level.ERROR)
                level = args[i];
            else
                channel = args[i];

        }

        if (!this._isValid(channel, level))
            return;

        let func = obj[funcName];

        if (this._mergePredicate(func, predicate, 'backtracePredicate')) {
            // if logging predicate was already registered
            return;
        }

        // TODO : How can we capture the member function of debugger in wrapped function..?
        let print = this.printBacktrace.bind(this);
        let record = this._recordLogMessage.bind(this);

        function wrappedFunction(...funcArgs) {
            let log = typeof funcName === undefined ? 'anonymous function'
                : funcName;

            let isLogging = wrappedFunction['backtracePredicate']();

            let ret = func.apply(obj, funcArgs);

            if (isLogging) {
                record(channel, level, `Backtrace for ${log}`, BACKTRACE_LOG);
                print(channel, level);
            }

            return ret;
        }

        let properties = {
            backtracePredicate: predicate,
        };

        obj[funcName] = this._wrappingFunc(func, wrappedFunction, properties);
    }

    /*
     * printBacktrace:
     * @channel: The channel for logging. If the channel is not registered in 'Debugger',
     *           logs are not recorded.
     * @level: the level of printing backtrace for the state.
     *
     * Print the call-trace when this function is called.
     * The purpose of this function is logging the call stack. (i.e. backtrace in GDB)
     * The function calls are separated by lines, and each line includes
     * function name, javascript file, and location of function.
     * TODO: Remove the trace of the debugger's calls
     */


    // printBacktrace(channel, level)
    printBacktrace(...args) {
        let channel = this._channel;
        let level = this._level;

        for (let i = 0; i < args.length - 1; i++) {
            if (args[i] >= Level.NONE && args[i] <= Level.ERROR)
                level = args[i];
            else
                channel = args[i];
        }

        if (!this._isValid(channel, level))
            return;

        try {
            throw new Error();
        } catch (e) {
            let stack = e.stack.split('\n');

            // sanitizing meaningless lines, i.e, erasing current function in trace
            stack.pop();
            stack.shift();
            this._recordLogMessage(channel, level, '-------------------------', BACKTRACE_LOG);

            stack.forEach(element => {
                if (element.split('@')[0] === 'wrappedFunction')
                    return;

                this._recordLogMessage(channel, level, element, BACKTRACE_LOG);
            });
            this._recordLogMessage(channel, level, '-------------------------', BACKTRACE_LOG);
        }
    }

    /*
     * loggingFunction:
     * channel: channel for logging
     * level: level of the logging function call
     * funcName: a string name of function which is recoreded by logging
     * obj: Actual object includes the function
     * predicate: predicates for whether logging or not.
     *            It should be a function that returns `bool` without any arguments.
     *
     * This function is used to wrap the given function with logging logics.
     * If the channel and level are unsuitable for the debugger, it does not record the logs.
     * The logging information includes the arguments and return value of the function.
     * Also, we can set the conditions for recording logs.
     * For example, we can logging the function call information only when the predicates
     * are satisfied :
     * ...
     * loggingFunction(..., () => { return condition(); });
     * ...
     */
    // loggingFunction(channel, level, funcName, obj, predicate)
    loggingFunction(...args) {
        let channel = this._channel;
        let level = this._level;
        let funcName = '';
        let obj;
        let predicate = () => {
            return true;
        };

        // At least funcName and obj should be provided
        if (args.length < 2 || args.length > 5)
            return;

        let index = args.length - 1;

        if (args[index] instanceof Function)
            predicate = args[index--];


        obj = args[index--];
        funcName = args[index--];

        for (let i = index; i >= 0; i--) {
            if (args[i] >= Level.NONE && args[i] <= Level.ERROR)
                level = args[i];
            else
                channel = args[i];

        }

        if (!this._isValid(channel, level))
            return;

        let func = obj[funcName];

        if (this._mergePredicate(func, predicate, 'loggingPredicate')) {
            // if logging predicate was already registered
            return;
        }

        // TODO : How can we capture the member function of debugger in wrapped function..?
        let print = this._convertToString.bind(this);
        let record = this._recordLogMessage.bind(this);

        function wrappedFunction(...funcArgs) {
            let log = typeof funcName === undefined ? 'anonymous function'
                : funcName;
            log += '(';

            for (let i = 0; i < funcArgs.length; i++)
                log = `${log + print(funcArgs[i])}, `;


            if (funcArgs.length > 0)
                log = log.slice(0, -2);

            log += ')';

            let isLogging = wrappedFunction['loggingPredicate']();

            if (isLogging)
                record(channel, level, `Entering ${log}`, COMMON_LOG);

            let ret = func.apply(obj, funcArgs);

            let retStr = print(ret, 0, false);

            if (isLogging)
                record(channel, level, `Leaving ${log} -> ${retStr}`, COMMON_LOG);

            return ret;
        }

        let properties = {
            loggingPredicate: predicate,
        };

        obj[funcName] = this._wrappingFunc(func, wrappedFunction, properties);
    }

    /*
     * logging:
     * channel: channel for logging
     * level: level of the logging function call
     * message: logging message
     * predicate: predicates for whether logging or not.
     *            It should be a function that returns `bool` without any arguments.
     *
     * This function is used to log user-defined message.
     * If the channel and level are unsuitable for the debugger, it does not record the logs.
     * Also, we can set the conditions for recording logs.
     * For example, we can logging the message only when the predicates are satisfied.
     */

    // logging(channel, level, message, predicate)
    logging(...args) {
        let channel = this._channel;
        let level = this._level;
        let message = '';
        let predicate = () => {
            return true;
        };

        if (args.length < 1 || args.length > 4)
            return;

        let index = args.length - 1;

        if (args[index] instanceof Function)
            predicate = args[index--];


        message = args[index--];

        for (let i = index; i >= 0; i--) {
            if (args[i] >= Level.NONE && args[i] <= Level.ERROR)
                level = args[i];
            else
                channel = args[i];
        }

        if (!this._isValid(channel, level))
            return;

        let pred = typeof predicate !== 'undefined' ? predicate
            : () => {
                return true;
            };

        if (pred())
            this._recordLogMessage(channel, level, message, COMMON_LOG);


    }

    /*
     * breakpointFunction:
     * channel: channel for stopping
     * level: level of the breakpoint
     * funcName: a string name of function which will be stopped
     * obj: Actual object includes the function
     * predicate: predicates for whether stop or not.
     *            It should be a function that returns `bool` without any arguments.
     *
     * Set a breakpoint for a given function.
     * If channel and level are unsuitable, it may not stop.
     * If the predicate is true, it will stop at the beginning of a function.
     * Since it uses a signal (SIGTRAP), it must be used with the debugger (e.g. GDB).
     * If you does not use below function with debugger, the application get the signal and
     * will be turned off.
     */

    // breakpointFunction(channel, level, funcName, obj, predicate) {
    breakpointFunction(...args) {
        let channel = this._channel;
        let level = this._level;
        let funcName = '';
        let obj;
        let predicate = () => {
            return true;
        };

        // At least funcName and obj should be provided
        if (args.length < 2 || args.length > 5)
            return;

        let index = args.length - 1;

        if (args[index] instanceof Function)
            predicate = args[index--];


        obj = args[index--];
        funcName = args[index--];

        for (let i = index; i >= 0; i--) {
            if (args[i] >= Level.NONE && args[i] <= Level.ERROR)
                level = args[i];
            else
                channel = args[i];

        }

        if (!this._isValid(channel, level))
            return;

        let func = obj[funcName];

        if (this._mergePredicate(func, predicate, 'loggingPredicate')) {
            // if logging predicate was already registered
            return;
        }

        let record = this._recordLogMessage.bind(this);

        function wrappedFunction(...funcArgs) {
            if (wrappedFunction['breakPredicate']()) {
                record(channel, level, `Breakpoint ${wrappedFunction['breakpoint']} reached`, COMMON_LOG);
                System.breakpoint();
            }
            return func.apply(obj, funcArgs);
        }

        let properties = {
            breakpoint: ++this._breakpoints,
            breakPredicate: predicate,
        };

        obj[funcName] = this._wrappingFunc(func, wrappedFunction, properties);

        this._recordLogMessage(channel, level, `Breakpoint ${this._breakpoints} for ${obj.constructor.name}.${funcName} is registered`, COMMON_LOG);
    }

    /*
     * breakpoint:
     * channel: channel for stopping
     * level: level of the breakpoint
     * predicate: predicates for whether stop or not.
     *            It should be a function that returns `bool` without any arguments.
     *
     * Set a breakpoint where the user insert it.
     * If channel and level are unsuitable, it may not stop.
     * If the predicate is true, it will stop at the line of the declared code.
     * Since it uses a signal (SIGTRAP), it must be used with the debugger (e.g. GDB).
     * If you does not use below function with debugger, the application get the signal and
     * will be turned off.
     */

    // breakpoint(channel, level, predicate) {
    breakpoint(...args) {
        let channel = this._channel;
        let level = this._level;
        let predicate = () => {
            return true;
        };

        let index = args[index--];

        if (args[index] instanceof Function)
            predicate = args[index--];


        for (let i = index; i >= 0; i--) {
            if (args[i] >= Level.NONE && args[i] <= Level.ERROR)
                level = args[i];
            else
                channel = args[i];
        }

        if (!this._isValid(channel, level))
            return;

        if (predicate())
            System.breakpoint();

    }
};
