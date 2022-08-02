const ByteArray = imports.byteArray;

const { Gio, GLib, Meta } = imports.gi;

const Main = imports.ui.main;

var isCalibrating = false;

var monitorManager;
var resolution = [-1, -1];

var calibratableDeviceList = [];
var calibratableDeviceId = [];
var calibrationElement = [];

var identityMatrix = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];
var calibrationMatrix;
var calibrationCommandArray = ['xinput', '--set-prop', 0, '"libinput Calibration Matrix"'];

var stdoutLines = [];

// var i = 0;

function format() {
    var args = Array.prototype.slice.call(arguments, 1);  // eslint-disable-line prefer-rest-params
    return arguments[0].replace(/\{(\d+)\}/g, (match, index) => { // eslint-disable-line prefer-rest-params
        return args[index];
    });
}

function readOutput(outputStream, lineBuffer) {
    // let temp = i;
    // global.log("readoutput start! : " + temp);
    // i = i + 1;
    outputStream.read_line_async(0, null, (stream, res) => {
        try {
            let line = outputStream.read_line_finish_utf8(res)[0];

            if (line !== null) {
                lineBuffer.push(line);
                // global.log(line);
                readOutput(outputStream, lineBuffer);
            }
        } catch (e) {
            global.log(e);
        }
        // global.log("read async end!: " + temp);
    });
    // global.log("readouput end : " + temp);
}

function init(metadata) { // eslint-disable-line no-unused-vars
    global.log('initialize phase!');
    global.log(Main.layoutManager.primaryMonitor.width);
    global.log(Main.layoutManager.primaryMonitor.height);
}

function enable() { // eslint-disable-line no-unused-vars
    monitorManager = Meta.MonitorManager.get();
    this._monitorId = monitorManager.connect('monitors-changed', () => {
        global.log('monitor-change!');
        if (resolution[0] === -1 && resolution[1] === -1) {
            resolution[0] = Main.layoutManager.primaryMonitor.width;
            resolution[1] = Main.layoutManager.primaryMonitor.height;
            global.log('no need to calibrate');
        } else if (resolution[0] !== Main.layoutManager.primaryMonitor.width ||
                   resolution[1] !== Main.layoutManager.primaryMonitor.height) {
            global.log('need to calibrate');
            resolution[0] = Main.layoutManager.primaryMonitor.width;
            resolution[1] = Main.layoutManager.primaryMonitor.height;
            calibratableDeviceId = [];
            getCalibratableDeviceList();
            if (calibratableDeviceId.length > 0)
                calibrate();
        }
    });

    // Of course, when 'monitors-changed' signal is emitted, DeviceId array will be refreshed. but maybe need it later.
    getCalibratableDeviceList();
}

function disable() { // eslint-disable-line no-unused-vars
    monitorManager.disconnect(this._monitorId);

    global.log('Device ID list ');
    global.log(calibratableDeviceId);

    global.log('calibrationElement');
    global.log(calibrationElement);

    calibratableDeviceList = [];
    calibratableDeviceId = [];
    calibrationElement = [];

    global.log('okay bye...');
}

function extractCalibrationElement() {
    let  startIndex;
    if (stdoutLines.length <= 3) {
        stdoutLines = [];
        return;
    }
    if (calibratableDeviceId.length > 1)
        startIndex = 3;
    else
        startIndex = 1;

    global.log(stdoutLines[startIndex]);
    let range = stdoutLines[startIndex].split('=');

    global.log(range);
    for (let i = 1; i <= 4; i++)
        calibrationElement.push(parseInt(range[i]));

    for (let i = startIndex + 7; i <= startIndex + 10; i++) {
        let minMax = stdoutLines[i].split('"');
        calibrationElement.push(parseInt(minMax[3]));
    }
    calibrationMatrix = identityMatrix;
    calibrationMatrix[0] = (calibrationElement[1] - calibrationElement[0]) / (calibrationElement[5] - calibrationElement[4]);
    calibrationMatrix[2] = -1 * calibrationElement[4] * calibrationMatrix[0] / (calibrationElement[1] - calibrationElement[0]);
    calibrationMatrix[4] = (calibrationElement[3] - calibrationElement[2]) / (calibrationElement[7] - calibrationElement[6]);
    calibrationMatrix[5] = -1 * calibrationElement[6] * calibrationMatrix[4] / (calibrationElement[3] - calibrationElement[2]);

    let enterString = calibrationCommandArray;
    enterString[2] = calibratableDeviceId[0];
    let newString = enterString.concat(calibrationMatrix);

    global.log(newString);
    GLib.spawn_command_line_sync(newString.join(' '));

    newString[2] = 13;

    GLib.spawn_command_line_sync(newString.join(' '));

    stdoutLines = [];
    calibrationElement = [];
}


function calibrate() {
    if (!isCalibrating) {
        isCalibrating = true;

        // Before calibrating, We need to unset previous Calibration Matrix. Because, It causes that wrong Calibration Matrix.
        let initCommand = format('xinput --set-prop {0} "libinput Calibration Matrix" 1 0 0 0 1 0 0 0 1', calibratableDeviceId[0]);
        // global.log(initCommand);
        GLib.spawn_command_line_sync(initCommand);

        // global.log("enter");

        // we must run xinput-calibrator asynchronously.
        // If it runs synchronously, it cause Blackscreen.
        let [, calibratorPid, stdin, stdout] = GLib.spawn_async_with_pipes('/home/ttt/',
            ['xinput_calibrator'],
            null,
            GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
            null
        );
        // we don't need stdin value
        GLib.close(stdin);

        // open the stdout file descriptor to read xinput-calibrator's output.
        let stdoutStream = new Gio.DataInputStream({
            base_stream: new Gio.UnixInputStream({ fd: stdout, close_fd: true }),
            close_base_stream: true,
        });

        readOutput(stdoutStream, stdoutLines);

        // we need to watch xinput-calibrator's processing, when it's execution is done, we can get xinput-calibrator's output.
        GLib.child_watch_add(GLib.PRIORITY_DEFAULT_IDLE, calibratorPid, (pid, status) => {
            if (status === 0)
                global.log(stdoutLines.join('\n'));

            stdoutStream.close(null);
            GLib.spawn_close_pid(pid);

            global.log('calibrator done');

            isCalibrating = false;
            extractCalibrationElement();
        });
        global.log('exit');
    }
}

function getCalibratableDeviceList() {
    let listCommand = 'xinput_calibrator --list';
    let [isOk_, listByteArray] = GLib.spawn_command_line_sync(listCommand);
    let listString = ByteArray.toString(listByteArray);

    // get "xinput-calibrator --list" output, and split by line by line.
    // If there are two more line, multiple calibratable device detected. and there are two more lines printed to warning.
    // If there are one line, either no device detetecd or one deivce detected.
    calibratableDeviceList =  listString.split('\n');
    if (calibratableDeviceList.length <= 2) {
        let deviceQuery = calibratableDeviceList[0].split('id=');
        if (deviceQuery.length === 2) {
            global.log(`id : ${deviceQuery[1]}`);
            calibratableDeviceId.push(parseInt(deviceQuery[1]));
        } else {
            global.log('there is no calibratable Device');
        }
    } else {
        for (let i = 0; i < calibratableDeviceList.length; i++) {
            let deviceQuery = calibratableDeviceList[i].split('id=');
            if (deviceQuery.length === 2) {
                global.log(`id : ${deviceQuery[1]}`);
                calibratableDeviceId.push(parseInt(deviceQuery[1]));
            }
        }
    }
}
