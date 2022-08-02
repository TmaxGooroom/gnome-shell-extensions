# Extension Debugger

Extension Debugger is GUI tool for debugging gnome-shell-extension that use
logging.js

## 1. Logging APIs

We provide several APIs for debugging the gnome-shell-extensions written in JS.
You can use the following debugging components by inserting the APIs in your code:
1. Function calls
2. Backtrace (Call trace)
3. Breakpoint
4. Logging Message
5. Watch variable (TBD.)
6. Displaying the JS variable (TBD.)

Before explain the usage of APIs, we introduce the basic notions appeared in APIs.

### 1.1 Basic notions (Channel, Level, Output)

We should set the channel and level before using the APIs.
Currently, we parse the configuration file written in json (i.e. logging.json).

#### 1.1.1 Channel

The Channel is used for restrictly defining the module to record the logs.
In other words, if you set the channel, the debugger save the logs only includes that.
For clearly defining the channel to represent a module, we force to set the channel name as the uuid of extensions.
If you set the channel arbitrarily, the debug module will cause the errors.

For example, the case of search extension :

```
...
'channel': 'search',
...
```

#### 1.1.2 Level

The level is used to set what kind of log to display and includes __INFO__, __WARNING__, __ERROR__.
* __INFO__ presents the all information about the module. you can use this anywhere to remain logs.
* __WARNING__ means that the code includes bugs potentially. Set this flag when it may causes errors.
* __ERROR__ means a point that unreachable point. It is only used for exceptional cases.

Also the level has the order, in other words, log all levels higher than itself (__INFO__ < __WARNING__ < __ERROR__).
For example, if you set the level to the INFO, the result includes all of the records from __INFO__, __WARNING__ and __ERROR__.

#### 1.1.3 Output

You can set the path of output file which includes the information of logging.
Debugger does not overwrite the given file, just append the logs on it.
Therefore, if you want the newest logs, you should erase the file before executing the extension.
The format of log in output:

```
...
[$channel][$level][$logtype] messages
...
```

#### 1.1.4 Configuration File

Since we set the default values from parsing the configuration file, you should write it.
It is formatted in json and should include the channel, level and output.
Here is the example:

```
my_configure.json
{
    "channel":"$my_extension_uuid",
    "level":"INFO",
    "output":"$my_result_path"
}
```

### 1.2 Function calls

You can record the metadatas for calling the user-defined functions.
It includes the arguments of the callee and the result of the function call.

Let's consider the following example:

```
var MyObject = Class {
    foo(a) {
        ...;
        return a;
    }
};

var myObject = new MyObject();

foo(5);
foo(4);
```

In this case, we can insert the API for logging the `foo` function:

```
...
var my Object = new MyObject();
var debug = new Debugger();

debug.loggingFunction('$channel', level, 'foo', myObject);

foo(5);
foo(4);
```

then the result will be following:

```
[Channel][Level][Log] Entering foo(5)
[Channel][Level][Log] Leaving foo(5) -> 5
[Channel][Level][Log] Entering foo(4)
[Channel][Level][Log] Leaving foo(4) -> 4
```

When we want to log the function only when some predicate is satisfied:

```
...
debug.loggingFunction('$channel', level, 'foo', myObject,
    (function () { return this.predicate(); }).bind(myObject));
...
```

### 1.3 Backtrace (Call trace)

You can see the call trace at the time the API is called.
It is similar to the __bt__ in GDB, however, it cannot display the arguments of calls and the state at the point.
Insert this API where you want to see the backtraces:

```
function foo() {
    debug.printBacktrace('$channel', level);
}
```

### 1.4 Breakpoint

It is used to stop the process when it calls with satisfied predicates.
Note that, since it uses the `SIGTRAP` signal, you should use this with debugger(i.e. GDB).
Otherwise, the process cannot handling the signal and will be died.
Hence, we recommand using this on your local debugging setting. (Do not remain this on git)

You can use `breakpointFunction` when stop before executing function.
When you use this with predicate, you can stop only for specific cases:
```
debug.breakpointFunction('$channel', level, 'foo', myObject,
    () => { return myObject.predicate() });
```

Also, we can insert the break anywhere:

```
debug.breakpoint('$channel', level, () => { return myObject.predicate(); });
```

Notice that, the predicate is not mandatory. (if the predicate is `undefined`, it will be replaced to the lambda function that always returns true.)

### 1.5. Logging Message

You can record customized message by inserting this API in your code.
The arguments are channel, level, customized message and optional predicate.
The simple example code is following:

```
debug.logging('$channel', level, 'test message', () => { return true; });
```
