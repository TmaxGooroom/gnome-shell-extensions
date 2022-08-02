/*
 * extension descripttion. TBD.
 */

const { IBus } = imports.gi;

const Main = imports.ui.main;

const IBusManager = imports.misc.ibusManager;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const QwertyKeysyms = Me.imports.xkbcommon_keysyms.QwertyMap;

const HangulKiyeog = 0x0ea1;
const HangulJYeorinHieuh = 0x0efa;

let _originalKeyvalPress = null;
let _originalKeyvalRelease = null;
let _originalPopupLanguageMenu = null;
let _originalSetActiveLayer = null;
let _originalSyncEnabled = null;
let _keyboardDestroyId;

function _isKoreanCharactor(keyval) {
    if (!keyval)
        return false;

    return HangulKiyeog <= keyval && keyval <= HangulJYeorinHieuh;
}

function _krToUsKeysym(keyval) {
    return _isKoreanCharactor(keyval) ? QwertyKeysyms[keyval] : keyval;
}

function _getIBusHangul() {
    let inputSourceManager = Main.inputMethod._inputSourceManager;
    let inputSources = inputSourceManager.inputSources;
    if (!inputSources)
        return null;

    for (let i of Object.keys(inputSources)) {
        if (inputSources[i].id === 'hangul')
            return inputSources[i];
    }

    return null;
}

function _getCurrentGroup() {
    let ibusHangul = _getIBusHangul();

    if (ibusHangul && ibusHangul.properties)
        return ibusHangul.properties.get('InputMode').get_state() === 0 ? 'us' : 'kr';


    return null;
}

function _nextInputMethod() {
    let ibusHangul = _getIBusHangul();

    if (!ibusHangul)
        return;

    let inputMethod = Main.inputMethod;
    if (inputMethod._currentSource !== ibusHangul) {
        let inputSourceManager = inputMethod._inputSourceManager;
        inputSourceManager.activateInputSource(ibusHangul, true);
    }

    let ibusManager = IBusManager.getIBusManager();
    // change InputMode to Korean or English according to its previous mode
    ibusManager.activateProperty('InputMode', IBus.PropState.CHECKED);
}

function init() { // eslint-disable-line no-unused-vars
}

function _enable() {
    let keyboard = Main.keyboard._keyboard;
    let controller = keyboard._keyboardController;

    _originalKeyvalPress = controller.keyvalPress;
    _originalKeyvalRelease = controller.keyvalRelease;

    // Change the keyval to english keyval.
    // Because the Hangul combination does not work properly if sending Korean charactor as it is.
    controller.keyvalPress = keyval => {
        _originalKeyvalPress.call(controller, _krToUsKeysym(keyval));
    };

    controller.keyvalRelease = keyval => {
        _originalKeyvalRelease.call(controller, _krToUsKeysym(keyval));
    };

    _originalPopupLanguageMenu = keyboard._popupLanguageMenu;
    keyboard._popupLanguageMenu = () => {
        _nextInputMethod();
    };

    // Since 'xkbId' is a single value indicating which language the input method supports, so xkbId of ibus-hangul is always 'kr'.
    // This occurs that original _setActiveLayer() function shows only korean keyboard layout even if the actual InputMode is english.
    // So, temporarily change xkbId to match the InputMode of ibus-hangul and restore it.
    _originalSetActiveLayer = keyboard._setActiveLayer;
    keyboard._setActiveLayer = activeLevel => {
        // make us keyboard layout if not exist
        keyboard._ensureKeysForGroup('us');

        let oldGroupName = controller._currentSource.xkbId;
        let newGroupname = _getCurrentGroup();
        if (!newGroupname)
            newGroupname = oldGroupName;

        controller._currentSource.xkbId = newGroupname;

        _originalSetActiveLayer.call(keyboard, activeLevel);
        controller._currentSource.xkbId = oldGroupName;
    };

    keyboard._setActiveLayer(0);
}

function enable() { // eslint-disable-line no-unused-vars
    _originalSyncEnabled = Main.keyboard._syncEnabled;
    let _isEnabled = false;
    Main.keyboard._syncEnabled = () => {
        _originalSyncEnabled.call(Main.keyboard);
        if (Main.keyboard._keyboard && !_isEnabled) {
            _enable();
            _isEnabled = true;
            _keyboardDestroyId = Main.keyboard._keyboard.connect('destroy', () => {
                _keyboardDestroyId = null;
                _isEnabled = false;
            });
        }
    };
    Main.keyboard._syncEnabled();
}

function disable() { // eslint-disable-line no-unused-vars
    let keyboard = Main.keyboard._keyboard;
    let controller = keyboard._keyboardController;

    if (controller) {
        controller.keyvalPress = _originalKeyvalPress;
        controller.keyvalRelease = _originalKeyvalRelease;
    }
    if (keyboard) {
        keyboard._setActiveLayer = _originalSetActiveLayer;
        keyboard._popupLanguageMenu = _originalPopupLanguageMenu;
        if (_keyboardDestroyId)
            keyboard.disconnect(_keyboardDestroyId);
        keyboard._setActiveLayer(0);
    }

    _originalKeyvalPress = null;
    _originalKeyvalRelease = null;
    _originalPopupLanguageMenu = null;
    _originalSetActiveLayer = null;

    Main.keyboard._syncEnabled = _originalSyncEnabled;
    _originalSyncEnabled = null;
}
