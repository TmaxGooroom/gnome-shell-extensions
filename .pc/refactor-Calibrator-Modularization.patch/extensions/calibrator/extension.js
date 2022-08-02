const ByteArray = imports.byteArray;

const { Clutter, Gio, GLib, GObject, Meta } = imports.gi;

const WindowManager = imports.ui.windowManager;
const Main = imports.ui.main;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Calibrator = Me.imports.calibrator;
const XrandrUtil = Me.imports.xrandrUtil;

const IdentityMatrix = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];

var HEIGHT = -1;
var WIDTH = -1;
var connector;
var monitorManager;
/* After Display changed at gnome-control-center, Gnome-shell pop up DisplayChangeDialog to confirm
 * user's decison.
 * After user's confirm decision, Calibrator should be called to calibrate touch setting.
 * In order to do this, we need replace DisplayChangeDialog.
 * So, we make new DisplayChangeDialog(TmaxDispalyChangeDialog), which is inherited old DisplayChangeDialog.
 * If we disable calibrator extension, the extension restore DisplayChangeDialog.
 */
var TmaxDisplayChangeDialog = GObject.registerClass(
    class DisplayChangeDialog extends WindowManager.DisplayChangeDialog {
        _init(wm) {
            super._init(wm);

            /* Translators: this and the following message should be limited in length,
        to avoid ellipsizing the labels.
        */
            this.clearButtons();
            this._cancelButton = this.addButton({ label: _('Revert Settings'), // eslint-disable-line no-undef
                action: this._onFailure.bind(this),
                key: Clutter.KEY_Escape });
            this._okButton = this.addButton({ label: _('Keep Changes'), // eslint-disable-line no-undef
                action: this.onSuccess.bind(this),
                default: true });
        }

        onSuccess() {
            this._wm.complete_display_change(true);
            this.close();
            let manager = Meta.MonitorManager.get();
            if (manager.get_is_builtin_display_on()) {
                let panelIndex = monitorManager.get_monitor_for_connector(connector[0]);
                if (WIDTH !== Main.layoutManager.monitors[panelIndex].width || HEIGHT !== Main.layoutManager.monitors[panelIndex].height) {
                    WIDTH = Main.layoutManager.monitors[panelIndex].width;
                    HEIGHT = Main.layoutManager.monitors[panelIndex].height;
                    _asyncCalibrate();
                }
            }
        }
    });

var OldDisplayChangeDialog = null;

function init(metadata) { // eslint-disable-line no-unused-vars
    connector = XrandrUtil.findPanelConnectorArray();
    monitorManager = Meta.MonitorManager.get();
}

function enable() { // eslint-disable-line no-unused-vars
    // Of course, when 'monitors-changed' signal is emitted, DeviceId array will be refreshed. but maybe need it later.
    OldDisplayChangeDialog = WindowManager.DisplayChangeDialog;
    WindowManager.DisplayChangeDialog = TmaxDisplayChangeDialog;
    if (connector.length > 0) {
        let panelIndex = monitorManager.get_monitor_for_connector(connector[0]);
        WIDTH = Main.layoutManager.monitors[panelIndex].width;
        HEIGHT = Main.layoutManager.monitors[panelIndex].height;
    }
    let logFile = Gio.File.new_for_path(`${global.userdatadir}/calibration`);
    if (!logFile.query_exists(null)) {
        global.log('There are no log files, stop loading calibration');
        return;
    }

    /* logFile include calibration setting which recently applied calibration variable before logout.
     * If there are logFile exist, we need to apply calibration to input driver.
     * logFile is calibration Matrix array (3 * 3). we load the matrix and use it.
     */
    let [ok, logByteArray] = logFile.load_contents(null);
    if (!ok) {
        global.log('There are something wrong during load file contents');
        return;
    }

    let logCalibrationMatrixString = ByteArray.toString(logByteArray);
    let logCalibrationMatrix = logCalibrationMatrixString.split(' ');
    logCalibrationMatrix = logCalibrationMatrix.map(element => parseFloat(element));

    let asyncLoadCalibration = async () => {
        let calibratableDeviceList = await _asyncGetCalibratableDeviceList();
        calibratableDeviceList.forEach(device => {
            device.calibrate(logCalibrationMatrix);
        });
    };
    asyncLoadCalibration();

}

function disable() { // eslint-disable-line no-unused-vars
    WindowManager.DisplayChangeDialog = OldDisplayChangeDialog;
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
            list.push(new Calibrator.LibinputDevice(deviceId));
            return list;
        } else if (propsString.indexOf('Wacom Tablet Area') !== -1) {
            list.push(new Calibrator.WacomDevice(deviceId));
            return list;
        }
        return list;
    }, []);
    return calibratableDeviceList;
}

function _asyncGetCalibratableDeviceList() {
    return new Promise(resolve => {
        let result = _getCalibratableDeviceList();
        global.log('loading');
        resolve(result);
    });
}

async function _asyncCalibrate() {
    let calibratableDeviceList = await _asyncGetCalibratableDeviceList();
    _calibrate(calibratableDeviceList);
}
