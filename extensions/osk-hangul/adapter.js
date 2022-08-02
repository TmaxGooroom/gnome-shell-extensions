/* exported Adapter */

const Me = imports.misc.extensionUtils.getCurrentExtension();

const KeyboardWrapper = Me.imports.keyboardWrapper;
const { Enums } = Me.imports.utils;

var Adapter = class Adapter {
    constructor() {
        this.wrappers = {
            [Enums.KeyboardType.XKB]: {
                wrapper: new KeyboardWrapper.XkbKeyboardWrapper(),
                type: Enums.LayoutKeyType.ICON,
            },
            [Enums.KeyboardType.IBUS]: {
                wrapper: new KeyboardWrapper.IbusKeyboardWrapper(),
                type: Enums.LayoutKeyType.LABEL,
            },
            [Enums.KeyboardType.NIMF]: {
                wrapper: new KeyboardWrapper.NimfKeyboardWrapper(),
                type: Enums.LayoutKeyType.LABEL,
            },
        };

        this._layoutKeyType = null;
        this._currentInputMethod = null;
        this._currentWrapper = null;
    }

    _setLayoutKeyType(type) {
        if (this._layoutKeyType === type)
            return;

        this._layoutKeyType = type;
        const keyboard = imports.ui.main.keyboard._keyboard;
        keyboard._onKeyboardGroupsChanged();
    }

    setInputMethod(inputMethod) {
        if (this._currentInputMethod !== inputMethod) {
            this.restoreAll();

            let newWrapper = this.wrappers[inputMethod];
            this._currentInputMethod = inputMethod;
            this._currentWrapper = newWrapper.wrapper;
            this._currentWrapper.wrapAll();
            this._setLayoutKeyType(newWrapper.type);
        }
    }

    restoreAll() {
        if (this._currentWrapper)
            this._currentWrapper.restoreAll();
    }
};
