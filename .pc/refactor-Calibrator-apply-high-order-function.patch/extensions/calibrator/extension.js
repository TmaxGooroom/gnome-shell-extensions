const ByteArray = imports.byteArray;

const { Gio, GLib } = imports.gi;

const Main = imports.ui.main;

const IdentityMatrix = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1];

var _resolution = [-1, -1];

var _monitorId;

function _getXInputCommand(device, matrix = IdentityMatrix) {
    let CommandArray = ['xinput', '--set-prop', device, '"libinput Calibration Matrix"'];
    return CommandArray.concat(matrix).join(' ');
}

function init(metadata) { // eslint-disable-line no-unused-vars
}

function enable() { // eslint-disable-line no-unused-vars
    _monitorId = Main.layoutManager.connect('monitors-changed', () => {
        let calibratableDeviceId = _getCalibratableDeviceList();
        if (calibratableDeviceId.length <= 0)
            return;

        if (_resolution[0] === -1 && _resolution[1] === -1) {
            _resolution[0] = Main.layoutManager.primaryMonitor.width;
            _resolution[1] = Main.layoutManager.primaryMonitor.height;
        } else if (_resolution[0] !== Main.layoutManager.primaryMonitor.width ||
                   _resolution[1] !== Main.layoutManager.primaryMonitor.height) {
            _resolution[0] = Main.layoutManager.primaryMonitor.width;
            _resolution[1] = Main.layoutManager.primaryMonitor.height;
            _calibrate(calibratableDeviceId);
        }
    });

    // Of course, when 'monitors-changed' signal is emitted, DeviceId array will be refreshed. but maybe need it later.
    let calibratableDeviceId = _getCalibratableDeviceList();
    let logFile = Gio.File.new_for_path(`${global.userdatadir}/calibration`);
    if (logFile.query_exists(null)) {
        let [ok, logByteArray] = logFile.load_contents(null);
        if (!ok) {
            global.log('there are something wrong during load file contents');
            return;
        }

        let logCalibrationMatrix = ByteArray.toString(logByteArray);
        for (let deviceId of calibratableDeviceId) {
            let logCommand = _getXInputCommand(deviceId, logCalibrationMatrix);
            GLib.spawn_command_line_sync(logCommand);
        }
    }
}

function disable() { // eslint-disable-line no-unused-vars
    Main.layoutManager.disconnect(_monitorId);
}


/*
 * stdoutLines' format is following lines
 *
 * Calibrating standard Xorg driver "ELAN902C:00 04F3:2DCF"
 * current calibration values: min_x=$min_x, max_x=$max_x and min_y=$min_y, max_y=$max_y
 * If these values are estimated wrong, either supply it manually with the --precalib option, or run the 'get_precalib.sh' script to automatically get it (through HAL).
 * --> Making the calibration permanent <--
 * copy the snippet below into '/etc/X11/xorg.conf.d/99-calibration.conf' (/usr/share/X11/xorg.conf.d/ in some distro's)
 * Section "InputClass"
 * Identifier "calibration"
 * MatchProduct "ELAN902C:00 04F3:2DCF"
 * Option\t"MinX"\t"$MinX"
 * Option\t"MaxX"\t"$MaxX"
 * Option\t"MinY"\t"$MinY"
 * Option\t"MaxY"\t"$MaxY"
 * Option\t"SwapXY"\t"0" # unless it was already set to 1
 * Option\t"InvertX"\t"0" # unless it was already set
 * Option\tInvertY"\t"0" # unless it was already set
 * EndSection
 *
 * Then, we need to get values of $min_x, $max_x, $min_y, $max_y, $MinX, $MaxX, $MinY, $MaxY.
 * After we get values of above variable, we can generate calibration matrix.
*/

function _extractCalibrationElement(stdoutLines, calibratableDeviceId) {
    let calibrationElement = [];
    let stdoutString = stdoutLines.join(' ');

    let filterWord = ['min_x=', 'max_x=', 'min_y=', 'max_y=', '"MinX"\t"', '"MaxX"\t"', '"MinY"\t"', '"MaxY"\t"'];

    for (let word of filterWord) {
        let argumentIndex = stdoutString.indexOf(word);
        stdoutString = stdoutString.slice(argumentIndex + word.length);
        calibrationElement.push(parseInt(stdoutString));
    }

    let calibrationMatrix = IdentityMatrix.slice();

    calibrationMatrix[0] = (calibrationElement[1] - calibrationElement[0]) / (calibrationElement[5] - calibrationElement[4]);
    calibrationMatrix[2] = -1 * calibrationElement[4] * calibrationMatrix[0] / (calibrationElement[1] - calibrationElement[0]);
    calibrationMatrix[4] = (calibrationElement[3] - calibrationElement[2]) / (calibrationElement[7] - calibrationElement[6]);
    calibrationMatrix[5] = -1 * calibrationElement[6] * calibrationMatrix[4] / (calibrationElement[3] - calibrationElement[2]);

    // we log the calbration matrix value for restore configuration. filepath : $homeDir/.local/share/gnome-shell/calibrtaion
    let logString = calibrationMatrix.join(' ');
    let logByteStream = ByteArray.fromString(logString);

    let logFile = Gio.File.new_for_path(`${global.userdatadir}/calibration`);
    let outputStream = logFile.replace(null, true, Gio.FileCreateFlags.NONE, null);

    outputStream.write(logByteStream, null);
    outputStream.close(null);
    for (let deviceId of calibratableDeviceId) {
        let newString = _getXInputCommand(deviceId, calibrationMatrix);
        GLib.spawn_command_line_sync(newString);
    }
}

function _calibrate(calibratableDeviceId) {

    // HandleMe : During calibrating, resolution can be changed. then we close old one, and start new one. it can be happen.

    // Before calibrating, We need to unset previous Calibration Matrix. Because, It causes that wrong Calibration Matrix.
    for (let deviceId of calibratableDeviceId) {
        let initCommand = _getXInputCommand(deviceId);
        // initCommand[2] = calibratableDeviceId[0];
        GLib.spawn_command_line_sync(initCommand);
    }
    // we must run xinput-calibrator asynchronously.
    // If it runs synchronously, it cause Blackscreen.
    let [, calibratorPid, stdin, stdout] = GLib.spawn_async_with_pipes(global.userdatadir,
        ['xinput_calibrator'],
        null,
        GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
        null
    );

    // we don't need stdin value
    GLib.close(stdin);

    // we need to watch xinput-calibrator's processing, when it's execution is done, we can get xinpuuut-calibrator's output.
    GLib.child_watch_add(GLib.PRIORITY_DEFAULT_IDLE, calibratorPid, (pid, status) => { // eslint-disable-line no-unused-vars
        let stdoutStream = new Gio.DataInputStream({
            base_stream: new Gio.UnixInputStream({ fd: stdout, close_fd: true }),
            close_base_stream: true,
        });
        let stdoutLines = [];
        let [outputByteArray, length] = stdoutStream.read_line(null);

        if (length === 0)
            return;

        while (length !== 0) {
            stdoutLines.push(ByteArray.toString(outputByteArray));
            [outputByteArray, length] = stdoutStream.read_line(null);
        }

        stdoutStream.close(null);
        GLib.spawn_close_pid(pid);

        _extractCalibrationElement(stdoutLines, calibratableDeviceId);
    });
}

function _getCalibratableDeviceList() {
    let xinputListCommand = 'xinput --list';
    let listPropsCommand = ['xinput', '--list-props', 0];

    let [isOk, xListByteArray] = GLib.spawn_command_line_sync(xinputListCommand);

    if (!isOk) {
        global.log('there are something wrong happen during get calibratable device list');
        return;
    }

    let xListString = ByteArray.toString(xListByteArray);
    let xDeviceList = xListString.split('\n');

    let xDeviceIdList = [];
    for (let xDevice of xDeviceList) {
        if (xDevice.indexOf('master') !== -1)
            continue;
        let deviceId = xDevice.split('id=');
        xDeviceIdList.push(parseInt(deviceId[1]));
    }

    let calibratableDeviceId = [];
    for (let xDeviceId of xDeviceIdList) {
        listPropsCommand[2] = xDeviceId;
        let [Ok, infoByteArray] = GLib.spawn_command_line_sync(listPropsCommand.join(' '));
        let infoString = ByteArray.toString(infoByteArray);

        if (!Ok) {
            global.log('there are something wrong happen during get calibratable device property');
            return;
        }

        if (infoString.indexOf('libinput Calibration Matrix') !== -1)
            calibratableDeviceId.push(xDeviceId);
    }

    return calibratableDeviceId;
}
