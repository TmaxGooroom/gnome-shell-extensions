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
});
