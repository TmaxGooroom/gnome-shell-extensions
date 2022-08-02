/* eslint-disable no-invalid-this */
const { Clutter, IBus } = imports.gi;

const Main = imports.ui.main;

const IBusManager = imports.misc.ibusManager;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const QwertyKeysyms = Me.imports.xkbcommon_keysyms.QwertyMap;
const getIBusHangul = Me.imports.utils.getIBusHangul;

const HangulKiyeog = 0x0ea1;
const HangulJYeorinHieuh = 0x0efa;

function _isKoreanCharactor(keyval) {
    if (!keyval)
        return false;

    return HangulKiyeog <= keyval && keyval <= HangulJYeorinHieuh;
}

function _krToUsKeysym(keyval) {
    return _isKoreanCharactor(keyval) ? QwertyKeysyms[keyval] : keyval;
}

function _getCurrentGroup() {
    let ibusHangul = getIBusHangul();

    if (ibusHangul && ibusHangul.properties)
        return ibusHangul.properties.get('InputMode').get_state() === 0 ? 'us' : 'kr';


    return null;
}

function _nextInputMethod() {
    let ibusHangul = getIBusHangul();

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

class BaseKeyboardWrapper {
    constructor(keyboard, controller) {
        this._keyboard = keyboard;
        this._controller = controller;
        this._originalFunctions = [];
    }

    wrap(target, originalFuncName, replaceFunc) {
        if (!target[originalFuncName])
            throw new Error(`such function name does not exist in ${target.name}!`);

        let originalFunction = target[originalFuncName];

        this._originalFunctions.push({ target, 'function': originalFunction });

        target[originalFuncName] = function (...args) {
            return replaceFunc.apply(this, [originalFunction].concat(args));
        };
    }

    restoreAll() {
        for (let info of this._originalFunctions) {
            let { target, 'function': func } = info;
            target[func.name] = func;
        }
    }
}
var IbusKeyboardWrapper = class IbusKeyboardWrapper extends BaseKeyboardWrapper { // eslint-disable-line no-unused-vars
    wrapAll(keyboard, controller) {
        this.wrap(controller, 'keyvalPress', function (originalKeyvalPress, keyval) {
            keyval = _krToUsKeysym(keyval);
            return originalKeyvalPress.call(this, keyval);
        });

        this.wrap(controller, 'keyvalRelease', function (originalKeyvalRelease, keyval) {
            keyval = _krToUsKeysym(keyval);
            return originalKeyvalRelease.call(this, keyval);
        });

        // change the functionality of flag icon
        this.wrap(keyboard, '_popupLanguageMenu', () => {
            _nextInputMethod();
        });

        this.wrap(keyboard, '_setAnimationWindow', () => {});
        this.wrap(keyboard, '_createLayersForGroup', function (originalCreateLayersForGroup, groupname) {
            let layers = originalCreateLayersForGroup.call(this, groupname);
            for (let l of Object.keys(layers)) {
                for (let container of layers[l]) {
                    let key = container.get_children()[0];
                    if (key.get_style_class_name().includes('layout-key'))
                        key.set_label('한/영');
                }
            }

            return layers;
        });
        // Since 'xkbId' is a single value indicating which language the input method supports, so xkbId of ibus-hangul is always 'kr'.
        // This occurs that original _setActiveLayer() function shows only korean keyboard layout even if the actual InputMode is english.
        // So, temporarily change xkbId to match the InputMode of ibus-hangul and restore it.
        this.wrap(keyboard, '_setActiveLayer', function (originalSetActiveLayer, activeLevel) {
            // make us keyboard layout if not exist
            this._ensureKeysForGroup('us');

            let oldGroupName = this._keyboardController.getCurrentGroup();
            let newGroupname = _getCurrentGroup();
            if (!newGroupname)
                newGroupname = oldGroupName;

            // if current purpose is password, show english keyboard only
            if (Main.inputMethod._purpose === Clutter.InputContentPurpose.PASSWORD)
                newGroupname = 'us';

            this._keyboardController._currentSource.xkbId = newGroupname;

            originalSetActiveLayer.call(this, activeLevel);

            this._keyboardController._currentSource.xkbId = oldGroupName;
        });
    }
};

var XkbKeyboardWrapper = class XkbKeyboardWrapper extends BaseKeyboardWrapper { // eslint-disable-line no-unused-vars
    wrapAll(keyboard) {
        this.wrap(keyboard, '_setAnimationWindow', () => {});
        this.wrap(keyboard, '_setActiveLayer', function (originalSetActiveLayer, activeLevel) {
            // make us keyboard layout if not exist
            this._ensureKeysForGroup('us');
            this._keyboardController._currentSource.xkbId = 'us';

            originalSetActiveLayer.call(this, activeLevel);

            this._keyboardController._currentSource.xkbId = 'kr';
        });
    }
};
