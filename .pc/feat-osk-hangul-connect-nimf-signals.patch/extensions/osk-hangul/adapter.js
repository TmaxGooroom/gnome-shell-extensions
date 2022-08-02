/* exported Adapter */

const Signals = imports.signals;

const Me = imports.misc.extensionUtils.getCurrentExtension();

const KeyboardWrapper = Me.imports.keyboardWrapper;

const LAYOUT_KEY_TYPE_ICON = 'icon';
const LAYOUT_KEY_TYPE_LABEL = 'label';

var Adapter = class Adapter {
    constructor() {
        this.wrappers = {
            xkb: {
                inputMethod: 'xkb',
                wrapper: new KeyboardWrapper.XkbKeyboardWrapper(),
                type: LAYOUT_KEY_TYPE_ICON,
            },
            ibus: {
                inputMethod: 'ibus',
                wrapper: new KeyboardWrapper.IbusKeyboardWrapper(),
                type: LAYOUT_KEY_TYPE_LABEL,
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
            if (this._currentWrapper)
                this.restoreAll();

            let newWrapper = this.wrappers[inputMethod];
            this._currentInputMethod = inputMethod;
            this._currentWrapper = newWrapper.wrapper;
            this.wrapAll();
            this.layoutKeyType = newWrapper.type;
        }
    }

    wrapAll() {
        if (this._currentWrapper)
            this._currentWrapper.wrapAll();
    }

    restoreAll() {
        if (this._currentWrapper)
            this._currentWrapper.restoreAll();
    }
};

Signals.addSignalMethods(Adapter.prototype);
