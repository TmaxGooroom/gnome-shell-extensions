const ByteArray = imports.byteArray;

const GLib = imports.gi.GLib;

const IdentityMatrix = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];

class Device {
    constructor(deviceId) {
        this._deviceId = deviceId;
    }

    calibrate(matrix) {
        global.log('This is abstract Class');
        global.log(`input matrix: ${matrix.join(' ')}`);
    }
}

var LibinputDevice = class LibinputDevice extends Device { // eslint-disable-line no-unused-vars
    calibrate(matrix = IdentityMatrix) {
        let setPropCommand = `xinput --set-prop ${this._deviceId.toString()} "libinput Calibration Matrix" ${matrix.join(' ')}`;
        GLib.spawn_command_line_async(setPropCommand);
    }
};

var WacomDevice = class WacomDevice extends Device { // eslint-disable-line no-unused-vars
    constructor(deviceId) {
        super(deviceId);
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
