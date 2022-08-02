/* exported UnlockDialog */
const Me = imports.misc.extensionUtils.getCurrentExtension();

const { GObject } = imports.gi;

const GnomeUnlockDialog = imports.ui.unlockDialog;
const GnomeAuthPrompt = imports.gdm.authPrompt;

const AuthPrompt = Me.imports.authPrompt;

var UnlockDialog = GObject.registerClass(class UnlockDialog extends GnomeUnlockDialog.UnlockDialog {
    _ensureAuthPrompt() {
        if (this._authPrompt)
            return;

        this._authPrompt = new AuthPrompt.AuthPrompt(this._gdmClient,
            GnomeAuthPrompt.AuthPromptMode.UNLOCK_ONLY);
        this._authPrompt.connect('failed', this._fail.bind(this));
        this._authPrompt.connect('cancelled', this._fail.bind(this));
        this._authPrompt.connect('reset', this._onReset.bind(this));

        this._promptBox.add_child(this._authPrompt);

        this._authPrompt.reset();
        this._authPrompt.updateSensitivity(true);
    }

    open() {
        this.show();

        if (this._isModal)
            return true;

        /*  Remove the modal push code in this position to float network setup window.
        let modalParams = {
            timestamp,
            actionMode: Shell.ActionMode.UNLOCK_SCREEN,
        };
        if (!Main.pushModal(this, modalParams))
            return false;
        */

        this._isModal = true;

        return true;
    }

    popModal() {
        if (this._isModal) {
            // Since the modal push code has been deleted, delete modal pop code as well.
            // Main.popModal(this, timestamp);
            this._isModal = false;
        }
    }
});
