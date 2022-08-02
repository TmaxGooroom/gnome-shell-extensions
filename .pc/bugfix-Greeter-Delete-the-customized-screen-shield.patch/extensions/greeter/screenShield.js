// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Me = imports.misc.extensionUtils.getCurrentExtension();

const Main = imports.ui.main;
const GnomeScreenShield = imports.ui.screenShield;

var ScreenShield = class ScreenShield extends GnomeScreenShield.ScreenShield { // eslint-disable-line no-unused-vars
    constructor() {
        super();
        // NOTE(210722, sohee): To float network settings window (nm-connection-editor)
        // over the screenshield, change layer to which the screenshield belongs.
        Main.layoutManager.removeChrome(this.actor);
        Main.layoutManager._backgroundGroup.add_child(this.actor);
    }

    _becomeModal() {
        return true;
    }

    ensureLoginDialog() {
        if (!this._dialog) {
            let constructor = Me.imports.loginDialog.LoginDialog;
            if (!constructor) {
                // This session mode has no locking capabilities
                this.deactivate(true);
                return false;
            }

            this._dialog = new constructor(this._lockDialogGroup);

            let time = global.get_current_time();
            if (!this._dialog.open(time)) {
                // This is kind of an impossible error: we're already modal
                // by the time we reach this...
                log('Could not open login dialog: failed to acquire grab');
                this.deactivate(true);
                return false;
            }

            this._dialog.connect('failed', this._onUnlockFailed.bind(this));
            this._wakeUpScreenId = this._dialog.connect(
                'wake-up-screen', this._wakeUpScreen.bind(this));
        }
        return true;
    }

    set isModal(isModal) {
        this._isModal = false;
    }

    get isModal() {
        return this._isModal;
    }
};
