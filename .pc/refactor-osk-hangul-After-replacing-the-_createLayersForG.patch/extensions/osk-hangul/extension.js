/*
 * extension descripttion. TBD.
 */

const Main = imports.ui.main;

const IBusManager = imports.misc.ibusManager;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Wrapper = Me.imports.keyboardWrapper;
const getIBusHangul = Me.imports.utils.getIBusHangul;

const { changeIBusPurposeToClutterPurpose } = Me.imports.utils;

const BASIC_KEYBOARD_LAYOUT = 0;

let _ibusReadyId = null;

let _a11ySignalId = null;
let _touchModeNotifyId = null;
let _lastDeviceChangedId = null;
let _keyboardDestroyId = null;

let wrapper = null;

// remove previous kr and us keyboard groups and create them again.
function _resetKeyboardLayout(keyboard) {
    keyboard._groups['kr'] = null;
    keyboard._groups['us'] = null;
    keyboard._ensureKeysForGroup('kr');
    keyboard._ensureKeysForGroup('us');
    keyboard._setActiveLayer(0);
}

function init() { // eslint-disable-line no-unused-vars
}


function _enable() {
    if (wrapper) {
        wrapper.restoreAll();
        wrapper = null;
    }

    if (getIBusHangul())
        wrapper = new Wrapper.IbusKeyboardWrapper();
    else
        wrapper = new Wrapper.XkbKeyboardWrapper();

    let keyboard = Main.keyboard._keyboard;
    let controller = keyboard._keyboardController;
    wrapper.wrapAll(keyboard, controller);

    _resetKeyboardLayout(keyboard);
}

// Synchronize with this extension and availability of on-screen-keyboard.
// Encapsulate _isOSKEnabled so that it is not contaminated by external factors.
function _getSyncKeyboardFunc() {
    let _isOSKEnabled = false;
    let keyboardManager = Main.keyboard;

    function applyKoreanKeyboard() {
        if (!_isOSKEnabled && keyboardManager._keyboard) {
            _enable();
            _isOSKEnabled = true;

            let ibusManager = IBusManager.getIBusManager();
            _ibusReadyId = ibusManager.connect('ready', () => {
                _enable();
            });

            _keyboardDestroyId = keyboardManager._keyboard.connect('destroy', () => {
                _resetKeyboard();
                if (_ibusReadyId) {
                    ibusManager.disconnect(_ibusReadyId);
                    _ibusReadyId = null;
                }
                _isOSKEnabled = false;
            });
        }
    }

    return applyKoreanKeyboard;
}

function enable() { // eslint-disable-line no-unused-vars
    let keyboardManager = Main.keyboard;

    let syncKeyboard = _getSyncKeyboardFunc();

    _a11ySignalId = keyboardManager._a11yApplicationsSettings.connect_after('changed', syncKeyboard);
    _touchModeNotifyId = keyboardManager._seat.connect_after('notify::touch-mode', syncKeyboard);
    _lastDeviceChangedId = global.backend.connect_after('last-device-changed', syncKeyboard);

    syncKeyboard();

    let ibusManager = IBusManager.getIBusManager();
    ibusManager.connect('set-content-type', (im, purpose, _hints) => {
        if (purpose !== Main.inputMethod._purpose) {
            Main.inputMethod._purpose = changeIBusPurposeToClutterPurpose(purpose);

            // To show the keyboard according to the purpose on the screen, call the method.
            Main.keyboard._keyboard._setActiveLayer(BASIC_KEYBOARD_LAYOUT);
        }
    });
}

function _resetKeyboard() {
    let keyboard = Main.keyboard._keyboard;
    if (keyboard) {
        if (wrapper)
            wrapper.restoreAll();

        if (_keyboardDestroyId) {
            keyboard.disconnect(_keyboardDestroyId);
            _keyboardDestroyId = null;
        }

        _resetKeyboardLayout(keyboard);
    }
}

function disable() { // eslint-disable-line no-unused-vars
    _resetKeyboard();

    Main.keyboard._a11yApplicationsSettings.disconnect(_a11ySignalId);
    Main.keyboard._seat.disconnect(_touchModeNotifyId);
    global.backend.disconnect(_lastDeviceChangedId);

    _a11ySignalId = null;
    _touchModeNotifyId = null;
    _lastDeviceChangedId = null;

    let ibusManager = IBusManager.getIBusManager();
    if (_ibusReadyId)
        ibusManager.disconnect(_ibusReadyId);
}
