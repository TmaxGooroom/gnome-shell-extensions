/* exported BaseKeyboardWrapper, IbusKeyboardWrapper, XkbKeyboardWrapper */
const { Clutter, IBus } = imports.gi;

const Main = imports.ui.main;
const KeyboardManager = Main.keyboard;

const IBusManager = imports.misc.ibusManager;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const QwertyKeysyms = Me.imports.xkbcommon_keysyms.QwertyMap;
const getIBusHangul = Me.imports.utils.getIBusHangul;

// Korean Charactor that indicates kiyeog. First letter of korean key symbols.
const HangulKiyeog = 0x0ea1;
// Korean Charactor that indicates yeorin higuh of jongseong that is last letter of Korean key symbols
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

function _switchInputMethod() {
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
    constructor() {
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

    wrapAll() {
        let keyboard = KeyboardManager._keyboard;
        this.wrap(keyboard, '_setAnimationWindow', () => {});
    }

    restoreAll() {
        for (let info of this._originalFunctions) {
            let { target, 'function': func } = info;
            target[func.name] = func;
        }
    }
}
var IbusKeyboardWrapper = class IbusKeyboardWrapper extends BaseKeyboardWrapper {
    wrapAll() {
        super.wrapAll();
        let keyboard = KeyboardManager._keyboard;
        let controller = keyboard._keyboardController;

        this.wrap(controller, 'keyvalPress', (originalKeyvalPress, keyval) => {
            keyval = _krToUsKeysym(keyval);
            return originalKeyvalPress.call(controller, keyval);
        });

        this.wrap(controller, 'keyvalRelease', (originalKeyvalRelease, keyval) => {
            keyval = _krToUsKeysym(keyval);
            return originalKeyvalRelease.call(controller, keyval);
        });

        // change the functionality of flag icon
        this.wrap(keyboard, '_popupLanguageMenu', () => {
            _switchInputMethod();
        });

        this.wrap(keyboard, '_createLayersForGroup', (originalCreateLayersForGroup, groupname) => {
            let layers = originalCreateLayersForGroup.call(keyboard, groupname);
            for (let layer of Object.keys(layers)) {
                for (let key of layers[layer]) {
                    let button = key.keyButton;
                    if (button.get_style_class_name().includes('layout-key'))
                        button.set_label('한/영');
                }
            }

            return layers;
        });

        keyboard._onKeyboardGroupsChanged();
        // Since 'xkbId' is a single value indicating which language the input method supports, so xkbId of ibus-hangul is always 'kr'.
        // This occurs that original _setActiveLayer() function shows only korean keyboard layout even if the actual InputMode is english.
        // So, temporarily change xkbId to match the InputMode of ibus-hangul and restore it.
        this.wrap(keyboard, '_setActiveLayer', (originalSetActiveLayer, activeLevel) => {
            // make us keyboard layout if not exist
            keyboard._ensureKeysForGroup('us');

            let oldGroupName = controller.getCurrentGroup();
            let newGroupname = _getCurrentGroup();
            if (!newGroupname)
                newGroupname = oldGroupName;

            // if current purpose is password, show english keyboard only
            if (Main.inputMethod._purpose === Clutter.InputContentPurpose.PASSWORD)
                newGroupname = 'us';

            controller._currentSource.xkbId = newGroupname;

            originalSetActiveLayer.call(keyboard, activeLevel);

            controller._currentSource.xkbId = oldGroupName;
        });
    }

    restoreAll() {
        super.restoreAll();

        let keyboard = KeyboardManager._keyboard;
        keyboard._onKeyboardGroupsChanged();
    }
};

var XkbKeyboardWrapper = class XkbKeyboardWrapper extends BaseKeyboardWrapper {
    wrapAll() {
        super.wrapAll();

        let keyboard = KeyboardManager._keyboard;
        let controller = keyboard._keyboardController;
        this.wrap(keyboard, '_setActiveLayer', (originalSetActiveLayer, activeLevel) => {
            // make us keyboard layout if not exist
            keyboard._ensureKeysForGroup('us');
            controller._currentSource.xkbId = 'us';

            originalSetActiveLayer.call(keyboard, activeLevel);

            controller._currentSource.xkbId = 'kr';
        });
    }
};
