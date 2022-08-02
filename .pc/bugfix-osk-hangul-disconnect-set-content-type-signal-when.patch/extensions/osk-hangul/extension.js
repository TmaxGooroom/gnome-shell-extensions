/*
 * extension descripttion. TBD.
 */

const Main = imports.ui.main;
const KeyboardManager = Main.keyboard;

const IBusManager = imports.misc.ibusManager;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Adapter = Me.imports.adapter;
const { changeIBusPurposeToClutterPurpose, getNimfService, Enums } = Me.imports.utils;

const BASIC_KEYBOARD_LAYOUT = 0;


let _a11ySignalId = null;
let _touchModeNotifyId = null;
let _lastDeviceChangedId = null;
let _ibusSetContentTypeId = null;

let _ibusFocusInId = null;
let _nimfFocusInId = null;
let _nimfFocusOutId = null;
let _keyboardDestroyId = null;

let adapter = null;

function init() { // eslint-disable-line no-unused-vars
}


function _enable(inputMethod = Enums.KeyboardType.XKB) {
    if (!adapter)
        adapter = new Adapter.Adapter();

    adapter.setInputMethod(inputMethod);
    KeyboardManager._keyboard._setActiveLayer(BASIC_KEYBOARD_LAYOUT);
    KeyboardManager._keyboard._suggestions.hide();
}

// Synchronize with this extension and availability of on-screen-keyboard.
// Encapsulate _isOSKEnabled so that it is not contaminated by external factors.
function _getSyncKeyboardFunc() {
    let _isOSKEnabled = false;

    function applyKoreanKeyboard() {
        if (!_isOSKEnabled && KeyboardManager._keyboard) {
            _enable();
            _isOSKEnabled = true;

            const ibusManager = IBusManager.getIBusManager();
            _ibusFocusInId = ibusManager.connect('focus-in', () => {
                if (ibusManager._currentEngineName === 'hangul')
                    _enable(Enums.KeyboardType.IBUS);
                else
                    _enable(Enums.KeyboardType.XKB);
            });

            const nimfService = getNimfService();
            const focusTracker = KeyboardManager._keyboard._focusTracker;
            _nimfFocusInId = nimfService.connect('focus-in', () => {
                _enable(Enums.KeyboardType.NIMF);
                focusTracker.emit('focus-changed', true);
            });
            _nimfFocusOutId = nimfService.connect('focus-out', () => {
                focusTracker.emit('focus-changed', false);
            });

            _keyboardDestroyId = KeyboardManager._keyboard.connect('destroy', () => {
                _resetKeyboard();
                _isOSKEnabled = false;
            });
        }
    }

    return applyKoreanKeyboard;
}

function _resetKeyboard() {
    let keyboard = KeyboardManager._keyboard;

    if (adapter) {
        adapter.restoreAll();
        adapter = null;
    }

    if (keyboard) {
        keyboard._onKeyboardGroupsChanged();
        if (_keyboardDestroyId)
            keyboard.disconnect(_keyboardDestroyId);
    }

    let ibusManager = IBusManager.getIBusManager();
    if (_ibusFocusInId)
        ibusManager.disconnect(_ibusFocusInId);

    const nimfService = getNimfService();
    if (_nimfFocusInId)
        nimfService.disconnect(_nimfFocusInId);

    if (_nimfFocusOutId)
        nimfService.disconnect(_nimfFocusOutId);
}

function enable() { // eslint-disable-line no-unused-vars
    let syncKeyboard = _getSyncKeyboardFunc();

    _a11ySignalId = KeyboardManager._a11yApplicationsSettings.connect_after('changed', syncKeyboard);
    _touchModeNotifyId = KeyboardManager._seat.connect_after('notify::touch-mode', syncKeyboard);
    _lastDeviceChangedId = global.backend.connect_after('last-device-changed', syncKeyboard);

    syncKeyboard();

    let ibusManager = IBusManager.getIBusManager();
    _ibusSetContentTypeId = ibusManager.connect('set-content-type', (im, purpose, _hints) => {
        if (purpose !== Main.inputMethod._purpose) {
            Main.inputMethod._purpose = changeIBusPurposeToClutterPurpose(purpose);

            // To show the keyboard according to the purpose on the screen, call the method.
            KeyboardManager._keyboard._setActiveLayer(BASIC_KEYBOARD_LAYOUT);
        }
    });
}

function disable() { // eslint-disable-line no-unused-vars
    _resetKeyboard();

    KeyboardManager._a11yApplicationsSettings.disconnect(_a11ySignalId);
    KeyboardManager._seat.disconnect(_touchModeNotifyId);
    global.backend.disconnect(_lastDeviceChangedId);
    IBusManager.getIBusManager().disconnect(_ibusSetContentTypeId);
}
