/* exported BaseKeyboardWrapper, IbusKeyboardWrapper, XkbKeyboardWrapper, NimfKeyboardWrapper */
const { Clutter } = imports.gi;

const Main = imports.ui.main;
const KeyboardManager = Main.keyboard;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const QwertyKeysyms = Me.imports.xkbcommon_keysyms.QwertyMap;
const { getIBusHangul, getNimfService } = Me.imports.utils;

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


class BaseKeyboardWrapper {
    constructor() {
        this._originalFunctions = [];
        this._setAnimationWindow = () => {};
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
        this.wrap(keyboard, '_setAnimationWindow', this._setAnimationWindow);
    }

    restoreAll() {
        for (let info of this._originalFunctions) {
            let { target, 'function': func } = info;
            target[func.name] = func;
        }
    }
}
var IbusKeyboardWrapper = class IbusKeyboardWrapper extends BaseKeyboardWrapper {
    constructor() {
        super();

        let keyboard = KeyboardManager._keyboard;
        let controller = keyboard._keyboardController;

        this.keyvalPress = (originalKeyvalPress, keyval) => {
            keyval = _krToUsKeysym(keyval);
            return originalKeyvalPress.call(controller, keyval);
        };

        this.keyvalRelease = (originalKeyvalRelease, keyval) => {
            keyval = _krToUsKeysym(keyval);
            return originalKeyvalRelease.call(controller, keyval);
        };

        this._popupLanguageMenu = () => {
            this._switchInputMethod(controller);
        };

        this._createLayersForGroup = (originalCreateLayersForGroup, groupname) => {
            let layers = originalCreateLayersForGroup.call(keyboard, groupname);
            for (let layer of Object.keys(layers)) {
                for (let key of layers[layer]) {
                    let button = key.keyButton;
                    if (button.get_style_class_name().includes('layout-key'))
                        button.set_label('한/영');
                }
            }

            return layers;
        };

        this._setActiveLayer = (originalSetActiveLayer, activeLevel) => {
            // make us keyboard layout if not exist
            keyboard._ensureKeysForGroup('us');

            let oldGroupName = controller.getCurrentGroup();
            let newGroupname = this._getCurrentGroup();
            if (!newGroupname)
                newGroupname = oldGroupName;

            // if current purpose is password, show english keyboard only
            if (Main.inputMethod._purpose === Clutter.InputContentPurpose.PASSWORD)
                newGroupname = 'us';

            controller._currentSource.xkbId = newGroupname;

            originalSetActiveLayer.call(keyboard, activeLevel);

            controller._currentSource.xkbId = oldGroupName;
        };
    }

    wrapAll() {
        super.wrapAll();
        let keyboard = KeyboardManager._keyboard;
        let controller = keyboard._keyboardController;

        this.wrap(controller, 'keyvalPress', this.keyvalPress);

        this.wrap(controller, 'keyvalRelease', this.keyvalRelease);

        // change the functionality of flag icon
        this.wrap(keyboard, '_popupLanguageMenu', this._popupLanguageMenu);

        this.wrap(keyboard, '_createLayersForGroup', this._createLayersForGroup);

        // Since 'xkbId' is a single value indicating which language the input method supports, so xkbId of ibus-hangul is always 'kr'.
        // This occurs that original _setActiveLayer() function shows only korean keyboard layout even if the actual InputMode is english.
        // So, temporarily change xkbId to match the InputMode of ibus-hangul and restore it.
        this.wrap(keyboard, '_setActiveLayer', this._setActiveLayer);
    }

    _getCurrentGroup() {
        let ibusHangul = getIBusHangul();

        if (ibusHangul && ibusHangul.properties)
            return ibusHangul.properties.get('InputMode').get_state() === 0 ? 'us' : 'kr';

        return null;
    }

    _switchInputMethod(controller) {
        controller.keyvalPress(0xff31);
        controller.keyvalRelease(0xff31);
    }
};

var NimfKeyboardWrapper = class NimfKeyboardWrapper extends IbusKeyboardWrapper {
    constructor() {
        super();
        this._current = 'us';

        let keyboard = KeyboardManager._keyboard;
        let controller = keyboard._keyboardController;

        this._setActiveLayer = (originalSetActiveLayer, activeLevel) => {
            // make us keyboard layout if not exist
            keyboard._ensureKeysForGroup('us');

            let oldGroupName = controller.getCurrentGroup();
            let newGroupname = this._getCurrentGroup();

            controller._currentSource.xkbId = newGroupname;

            originalSetActiveLayer.call(keyboard, activeLevel);

            controller._currentSource.xkbId = oldGroupName;
        };
    }

    wrapAll() {
        super.wrapAll();

        const nimfService = getNimfService();
        this._nimfEngineChangeId = nimfService.connect('engine-change', this._onEngineChange.bind(this));
    }

    _onEngineChange(_, engine) {
        if (engine === 'nimf-libhangul')
            this._current = 'kr';
        else
            this._current = 'us';

        KeyboardManager._keyboard._onGroupChanged();
    }

    _getCurrentGroup() {
        return this._current;
    }

    restoreAll() {
        super.restoreAll();

        const nimfService = getNimfService();
        nimfService.disconnect(this._nimfEngineChangeId);
    }
};

var XkbKeyboardWrapper = class XkbKeyboardWrapper extends BaseKeyboardWrapper {
    constructor() {
        super();

        let keyboard = KeyboardManager._keyboard;
        let controller = keyboard._keyboardController;
        this._setActiveLayer = (originalSetActiveLayer, activeLevel) => {
            // make us keyboard layout if not exist
            keyboard._ensureKeysForGroup('us');
            controller._currentSource.xkbId = 'us';

            originalSetActiveLayer.call(keyboard, activeLevel);

            controller._currentSource.xkbId = 'kr';
        };
    }

    wrapAll() {
        super.wrapAll();

        let keyboard = KeyboardManager._keyboard;
        this.wrap(keyboard, '_setActiveLayer', this._setActiveLayer);
    }
};
