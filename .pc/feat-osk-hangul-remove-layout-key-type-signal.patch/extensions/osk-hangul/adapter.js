/* exported Adapter */

const Signals = imports.signals;

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

    get layoutKeyType() {
        return this._layoutKeyType;
    }

    set layoutKeyType(type) {
        if (this.layoutKeyType === type)
            return;

        this._layoutKeyType = type;
        this.emit('layout-key-type');
    }

    setInputMethod(inputMethod) {
        if (this._currentInputMethod !== inputMethod) {
            this.restoreAll();

            let newWrapper = this.wrappers[inputMethod];
            this._currentInputMethod = inputMethod;
            this._currentWrapper = newWrapper.wrapper;
            this._currentWrapper.wrapAll();
            this.layoutKeyType = newWrapper.type;
        }
    }

    restoreAll() {
        if (this._currentWrapper)
            this._currentWrapper.restoreAll();
    }
};

Signals.addSignalMethods(Adapter.prototype);
