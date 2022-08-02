/* exported Adapter */

const Signals = imports.signals;

const Me = imports.misc.extensionUtils.getCurrentExtension();

const KeyboardWrapper = Me.imports.keyboardWrapper;

const LayoutKeyType = {
    ICON: 0,  // original icon(keyboard-layout-filled-symbolic) for gnome-shell OSK keyboard
    LABEL: 1, // 한/영 label for this extension
};

var Adapter = class Adapter {
    constructor() {
        this.wrappers = {
            xkb: {
                inputMethod: 'xkb',
                wrapper: new KeyboardWrapper.XkbKeyboardWrapper(),
                type: LayoutKeyType.ICON,
            },
            ibus: {
                inputMethod: 'ibus',
                wrapper: new KeyboardWrapper.IbusKeyboardWrapper(),
                type: LayoutKeyType.LABEL,
            },
            nimf: {
                inputMethod: 'nimf',
                wrapper: new KeyboardWrapper.NimfKeyboardWrapper(),
                type: LayoutKeyType.LABEL,
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
