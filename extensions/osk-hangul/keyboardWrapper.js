/* exported BaseKeyboardWrapper, IbusKeyboardWrapper, XkbKeyboardWrapper, NimfKeyboardWrapper */
const { Clutter } = imports.gi;

const Main = imports.ui.main;
const KeyboardManager = Main.keyboard;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const { QwertyMap } = Me.imports.qwertyMap;
const { getIBusHangul, getNimfService, Enums } = Me.imports.utils;
const { makeKey } = Me.imports.keyButton;

const HangulKeysymStart = 0x0ea1;
const HangulKeysymEnd = 0x0efa;

function _converToAlphabet(keyval) {
    let label = String.fromCharCode(Clutter.keysym_to_unicode(keyval));
    if (HangulKeysymStart <= keyval && keyval <= HangulKeysymEnd) {
        label = QwertyMap[label];
        keyval = Clutter.unicode_to_keysym(label.charCodeAt(0));
    }

    return keyval;
}

class BaseKeyboardWrapper {
    constructor() {
        this._functionsToOverride = {};
        this._declareFunctionsToOverride();
    }

    _save(target, originalFunc, replaceFunc) {
        let funcName = originalFunc.name;
        this._functionsToOverride[funcName] = { target, originalFunc, replaceFunc };
    }

    _declareFunctionsToOverride() {
        let keyboard = KeyboardManager._keyboard;

        const _setAnimationWindow = () => {};
        this._save(keyboard, keyboard._setAnimationWindow, _setAnimationWindow);

        const _createLayersForGroup = (originalCreateLayersForGroup, groupname) => {
            let layers = originalCreateLayersForGroup.call(keyboard, groupname);
            for (let layer of Object.keys(layers)) {
                for (let key of layers[layer]) {
                    makeKey(key, groupname);
                    let button = key.keyButton;
                    if (button.get_style_class_name().includes('layout-key')) {
                        if (this._layoutKeyType === Enums.LayoutKeyType.LABEL)
                            button.set_label('한/영');
                        else
                            button.set_child(key._icon);
                    }
                }
            }

            return layers;
        };
        this._save(keyboard, keyboard._createLayersForGroup, _createLayersForGroup);

        // NOTE: the code below is copied from Gnome-Shell original code to apply new height scheme for TOS.
        const _relayout = () => {
            let monitor = Main.layoutManager.keyboardMonitor;

            if (!monitor)
                return;

            let maxHeight = monitor.width >= 1024 ? 400 : 200;

            if (monitor.width < 1024)
                keyboard.add_style_class_name('scaled');
            else
                keyboard.remove_style_class_name('scaled');

            keyboard.width = monitor.width;

            if (monitor.width > monitor.height) {
                keyboard.height = maxHeight;
            } else {
                /* In portrait mode, lack of horizontal space means we won't be
                * able to make the OSK that big while keeping size ratio, so
                * we allow the OSK being smaller than 1/3rd of the monitor height
                * there.
                */
                const forWidth = keyboard.get_theme_node().adjust_for_width(monitor.width);
                const [, natHeight] = keyboard.get_preferred_height(forWidth);
                keyboard.height = Math.min(maxHeight, natHeight);
            }
        };
        this._save(keyboard, keyboard._relayout, _relayout);
    }

    wrapAll() {
        for (let funcName of Object.keys(this._functionsToOverride)) {
            let { target, originalFunc, replaceFunc } = this._functionsToOverride[funcName];

            if (!target[funcName])
                throw new Error(`${funcName} does not exist in ${target.name}!`);

            target[funcName] = function (...args) {
                return replaceFunc.apply(this, [originalFunc].concat(args));
            };
        }
    }

    restoreAll() {
        for (let funcName of Object.keys(this._functionsToOverride)) {
            let { target, originalFunc } = this._functionsToOverride[funcName];

            if (!target[funcName])
                throw new Error(`such function name does not exist in ${target.name}!`);

            target[funcName] = originalFunc;
        }
    }
}
var IbusKeyboardWrapper = class IbusKeyboardWrapper extends BaseKeyboardWrapper {
    constructor() {
        super();
        this._layoutKeyType = Enums.LayoutKeyType.LABEL;
    }

    _declareFunctionsToOverride() {
        super._declareFunctionsToOverride();

        let keyboard = KeyboardManager._keyboard;
        let controller = keyboard._keyboardController;

        const keyvalPress = (originalKeyvalPress, keyval) => {
            keyval = _converToAlphabet(keyval);
            return originalKeyvalPress.call(controller, keyval);
        };
        this._save(controller, controller.keyvalPress, keyvalPress);

        const keyvalRelease = (originalKeyvalRelease, keyval) => {
            keyval = _converToAlphabet(keyval);
            return originalKeyvalRelease.call(controller, keyval);
        };
        this._save(controller, controller.keyvalRelease, keyvalRelease);

        const _popupLanguageMenu = () => {
            this._switchInputMethod(controller);
        };
        this._save(keyboard, keyboard._popupLanguageMenu, _popupLanguageMenu);

        const _setActiveLayer = (originalSetActiveLayer, activeLevel) => {
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
        this._save(keyboard, keyboard._setActiveLayer, _setActiveLayer);
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
    }

    _declareFunctionsToOverride() {
        super._declareFunctionsToOverride();

        let keyboard = KeyboardManager._keyboard;
        let controller = keyboard._keyboardController;

        const _setActiveLayer = (originalSetActiveLayer, activeLevel) => {
            // make us keyboard layout if not exist
            keyboard._ensureKeysForGroup('us');

            let oldGroupName = controller.getCurrentGroup();
            let newGroupname = this._getCurrentGroup();

            controller._currentSource.xkbId = newGroupname;

            originalSetActiveLayer.call(keyboard, activeLevel);

            controller._currentSource.xkbId = oldGroupName;
        };

        this._save(keyboard, keyboard._setActiveLayer, _setActiveLayer);
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
        this._layoutKeyType = Enums.LayoutKeyType.ICON;
    }

    _declareFunctionsToOverride() {
        super._declareFunctionsToOverride();

        let keyboard = KeyboardManager._keyboard;
        let controller = keyboard._keyboardController;
        const _setActiveLayer = (originalSetActiveLayer, activeLevel) => {
            // make us keyboard layout if not exist
            keyboard._ensureKeysForGroup('us');
            controller._currentSource.xkbId = 'us';

            originalSetActiveLayer.call(keyboard, activeLevel);

            controller._currentSource.xkbId = 'kr';
        };

        this._save(keyboard, keyboard._setActiveLayer, _setActiveLayer);
    }
};
