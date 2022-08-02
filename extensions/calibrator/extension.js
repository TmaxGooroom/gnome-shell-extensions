const ByteArray = imports.byteArray;

const Gio = imports.gi.Gio;

const WindowManager = imports.ui.windowManager;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Calibrator = Me.imports.calibrator;
const DisplayChangeDialog = Me.imports.displayChangeDialog;

var OldDisplayChangeDialog = null;

function init(metadata) { // eslint-disable-line no-unused-vars
    Calibrator.init();
}

function enable() { // eslint-disable-line no-unused-vars
    // Of course, when 'monitors-changed' signal is emitted, DeviceId array will be refreshed. but maybe need it later.
    OldDisplayChangeDialog = WindowManager.DisplayChangeDialog;
    WindowManager.DisplayChangeDialog = DisplayChangeDialog.TmaxDisplayChangeDialog;

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
        let calibratableDeviceList = await Calibrator.asyncGetCalibratableDeviceList();
        calibratableDeviceList.forEach(device => {
            device.calibrate(logCalibrationMatrix);
        });
    };
    asyncLoadCalibration();

}

function disable() { // eslint-disable-line no-unused-vars
    WindowManager.DisplayChangeDialog = OldDisplayChangeDialog;
}
