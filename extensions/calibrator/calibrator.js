/* exported init, asyncCalibrate */
const ByteArray = imports.byteArray;

const { GLib, Gio } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const XrandrUtil = Me.imports.xrandrUtil;


const IdentityMatrix = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];

var monitorManager;
var connector;

function init() {
    monitorManager = imports.gi.Meta.MonitorManager.get();
    connector = XrandrUtil.findPanelConnectorArray();
}

class Device {
    constructor(deviceId) {
        this._deviceId = deviceId;
        this._description = 'abstract class';
    }

    calibrate(matrix) {
        global.log('This is abstract Class');
        global.log(`input matrix: ${matrix.join(' ')}`);
    }
}

var LibinputDevice = class LibinputDevice extends Device { // eslint-disable-line no-unused-vars
    constructor(deviceId) {
        super(deviceId);
        this._description = 'Libinput';
    }

    calibrate(matrix = IdentityMatrix) {
        let setPropCommand = `xinput --set-prop ${this._deviceId.toString()} "libinput Calibration Matrix" ${matrix.join(' ')}`;
        GLib.spawn_command_line_async(setPropCommand);
    }
};

var WacomDevice = class WacomDevice extends Device { // eslint-disable-line no-unused-vars
    constructor(deviceId) {
        super(deviceId);
        this._description = 'Wacom';
        let listCommand = `xinput --list ${this._deviceId.toString()}`;
        let [success, xListByteArray] = GLib.spawn_command_line_sync(listCommand);
        if (!success)
            global.log('there are something wrong getting wacom property');

        let xPropertyString = ByteArray.toString(xListByteArray);

        /* There are two xWacom calibratable Device. First one is Pointer device and Second one is Touch device.
 * Pointer device has two position feature, Abs X and Abs Y, which express pointer's position.
 * Similarly, Touch device has two position feature, Abs MT Position X and Abs MT Position Y, whic express touch input's position
 * If Abs X is detected, then Abs Y is also detected.
 * Likewise, If Abs MT Position X is detected, then Abs Y is also detected.
 */
        let argumentIndex = xPropertyString.indexOf('Abs X\n\t\t  Range: ');

        if (argumentIndex !== -1) {
            xPropertyString = xPropertyString.slice(argumentIndex + 'Abs X\n\t\t  Range: '.length);
            let xMinMax = xPropertyString.split(' - ');
            this._minX = parseFloat(xMinMax[0]);
            this._maxX = parseFloat(xMinMax[1]);
            argumentIndex = xPropertyString.indexOf('Abs Y\n\t\t  Range: ');
            xPropertyString = xPropertyString.slice(argumentIndex + 'Abs Y\n\t\t  Range: '.length);
            let yMinMax = xPropertyString.split(' - ');
            this._minY = parseFloat(yMinMax[0]);
            this._maxY = parseFloat(yMinMax[1]);
        }

        argumentIndex = xPropertyString.indexOf('Abs MT Position X\n\t\t  Range: ');

        if (argumentIndex !== -1) {
            xPropertyString = xPropertyString.slice(argumentIndex + 'Abs MT Position X\n\t\t  Range: '.length);
            let xMinMax = xPropertyString.split(' - ');
            this._minX = parseFloat(xMinMax[0]);
            this._maxX = parseFloat(xMinMax[1]);
            argumentIndex = xPropertyString.indexOf('Abs MT Position Y\n\t\t  Range: ');
            xPropertyString = xPropertyString.slice(argumentIndex + 'Abs MT Position Y\n\t\t  Range: '.length);
            let yMinMax = xPropertyString.split(' - ');
            this._minY = parseFloat(yMinMax[0]);
            this._maxY = parseFloat(yMinMax[1]);
        }
    }

    calibrate(matrix = IdentityMatrix) {
        let width = this._maxX - this._minX;
        let height = this._maxY - this._minY;
        let leftUpX = this._minX + width * matrix[2] / matrix[0] * -1;
        let rightDownX = leftUpX + width / matrix[0];
        let leftUpY = this._minY + height * matrix[5] / matrix[4] * -1;
        let rightDownY = leftUpY + height / matrix[4];

        let setPropCommand = `xinput --set-prop ${this._deviceId.toString()} "Wacom Tablet Area" ${Math.floor(leftUpX)} ${Math.floor(leftUpY)} ${Math.ceil(rightDownX)} ${Math.ceil(rightDownY)}`;
        GLib.spawn_command_line_async(setPropCommand);
    }
};

function _getCalibratableDeviceList() {
    let listCommand = 'xinput --list';
    let [success, listByteArray] = GLib.spawn_command_line_sync(listCommand);

    if (!success) {
        global.log('there are something wrong happen during get calibratable device list');
        return;
    }

    let listString = ByteArray.toString(listByteArray);
    let deviceList = listString.split('\n');

    let deviceIdList = deviceList.reduce((idList, device) => {
        if (device.indexOf('master') !== -1)
            return idList;

        let deviceId = device.split('id=');
        if (deviceId.length > 1)
            idList.push(parseInt(deviceId[1]));
        return idList;
    }, []);

    let calibratableDeviceList = deviceIdList.reduce((list, deviceId) => {
        let listPropsCommand = `xinput --list-props ${deviceId.toString()}`;
        let [propSuccess, propsByteArray] = GLib.spawn_command_line_sync(listPropsCommand);
        if (!propSuccess) {
            global.log('there are something wrong happen during get calibratable device property');
            return list;
        }
        let propsString = ByteArray.toString(propsByteArray);

        if (propsString.indexOf('libinput Calibration Matrix') !== -1) {
            list.push(new LibinputDevice(deviceId));
            return list;
        } else if (propsString.indexOf('Wacom Tablet Area') !== -1) {
            list.push(new WacomDevice(deviceId));
            return list;
        }
        return list;
    }, []);
    return calibratableDeviceList;
}

function asyncGetCalibratableDeviceList() {
    return new Promise(resolve => {
        let result = _getCalibratableDeviceList();
        resolve(result);
    });
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

function _extractCalibrationElement(stdoutLines, calibratableDeviceList) {
    let stdoutString = stdoutLines.join(' ');

    let filterWord = ['min_x=', 'max_x=', 'min_y=', 'max_y=', '"MinX"\t"', '"MaxX"\t"', '"MinY"\t"', '"MaxY"\t"'];
    let calibrationElement = filterWord.map(word => {
        let argumentIndex = stdoutString.indexOf(word);
        stdoutString = stdoutString.slice(argumentIndex + word.length);
        return parseInt(stdoutString);
    });

    let calibrationMatrix = IdentityMatrix.slice();
    if (calibrationElement[5] === calibrationElement[4] ||
       calibrationElement[1] === calibrationElement[0] ||
       calibrationElement[7] === calibrationElement[6] ||
       calibrationElement[3] === calibrationElement[2]
    ) {
        global.log('divided by zero exception');
        return;
    }
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

    calibratableDeviceList.forEach(device => {
        device.calibrate(calibrationMatrix);
    });
}

function _calibrate(calibratableDeviceList) {

    let panelIndex = monitorManager.get_monitor_for_connector(connector[0]);
    let area = global.display.get_monitor_geometry(panelIndex);
    // HandleMe : During calibrating, resolution can be changed. then we close old one, and start new one. it can be happen.

    // Before calibrating, We need to unset previous Calibration Matrix. Because, It causes that wrong Calibration Matrix.
    calibratableDeviceList.forEach(deviceId => {
        deviceId.calibrate();
    });
    // we must run xinput-calibrator asynchronously.
    // If it runs synchronously, it cause Blackscreen.
    let [, calibratorPid, stdin, stdout] = GLib.spawn_async_with_pipes(global.userdatadir,
        ['xinput_calibrator', '--xy', `${area.x}x${area.y}`, '--geometry', `${area.width}x${area.height}`],
        null,
        GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
        null
    );

    // we don't need stdin value , stdout is automatically deleted by following GLib.child_watch_add function
    GLib.close(stdin);

    // we need to watch xinput-calibrator's processing, when it's execution is done, we can get xinpuuut-calibrator's output.
    GLib.child_watch_add(GLib.PRIORITY_DEFAULT_IDLE, calibratorPid, (pid, status) => { // eslint-disable-line no-unused-vars
        let stdoutStream = new Gio.DataInputStream({
            base_stream: new Gio.UnixInputStream({ fd: stdout, close_fd: true }),
            close_base_stream: true,
        });
        let stdoutLines = [];
        let [outputByteArray, length] = stdoutStream.read_line(null);

        global.log(outputByteArray);

        if (length === 0)
            return;

        while (length !== 0) {
            stdoutLines.push(ByteArray.toString(outputByteArray));
            [outputByteArray, length] = stdoutStream.read_line(null);
        }
        stdoutStream.close(null);
        GLib.spawn_close_pid(pid);

        _extractCalibrationElement(stdoutLines, calibratableDeviceList);
    });
}

async function asyncCalibrate() {
    let calibratableDeviceList = await asyncGetCalibratableDeviceList();
    _calibrate(calibratableDeviceList);
}
