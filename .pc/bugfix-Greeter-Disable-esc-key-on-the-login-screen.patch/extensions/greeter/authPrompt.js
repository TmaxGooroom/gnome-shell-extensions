/* exported AuthPrompt */
/*
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2, or (at your option)
 * any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, see <http://www.gnu.org/licenses/>.
 */
const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Clutter, Gio, GObject, St } = imports.gi;
const GnomeAuthPrompt = imports.gdm.authPrompt;
const GdmUtil = imports.gdm.util;

const UserProfile = Me.imports.userProfile;
const UserVerifier = Me.imports.userVerifier;
const Constants = Me.imports.constants;

const Gettext = imports.gettext;
const _ = Gettext.gettext;

var AuthPrompt = GObject.registerClass(class AuthPrompt extends GnomeAuthPrompt.AuthPrompt {
    _init(gdmClient, mode) {
        super._init(gdmClient, mode);

        this.remove_style_class_name('login-dialog-prompt-layout');
        this.add_style_class_name('authprompt');

        this._customizeCancelButton();
        this._customizeEntry();

        this.cancelButton.hide();

        this._userProfile = new UserProfile.UserProfile(null);
        this._userWell.set_child(this._userProfile);

        let reauthenticationOnly;
        if (this._mode === GnomeAuthPrompt.AuthPromptMode.UNLOCK_ONLY)
            reauthenticationOnly = true;
        else if (this._mode === GnomeAuthPrompt.AuthPromptMode.UNLOCK_OR_LOG_IN)
            reauthenticationOnly = false;

        this._userVerifier = null;
        this._userVerifier = new UserVerifier.ShellUserVerifier(this._gdmClient, { reauthenticationOnly });
        this._userVerifier.connect('ask-question', this._onAskQuestion.bind(this));
        this._userVerifier.connect('show-message', this._onShowMessage.bind(this));
        this._userVerifier.connect('verification-failed', this._onVerificationFailed.bind(this));
        this._userVerifier.connect('verification-complete', this._onVerificationComplete.bind(this));
        this._userVerifier.connect('reset', this._onReset.bind(this));
        this._userVerifier.connect('smartcard-status-changed', this._onSmartcardStatusChanged.bind(this));
        this._userVerifier.connect('credential-manager-authenticated', this._onCredentialManagerAuthenticated.bind(this));
        this.smartcardDetected = this._userVerifier.smartcardDetected;

        this._hideCapsLockPlaceholder();
    }

    _customizeCancelButton() {
        this._mainBox.x_expand = true;
        this._mainBox.x_align = Clutter.ActorAlign.CENTER;
        this._mainBox.style_class = 'authprompt-mainbox';
        this._mainBox.remove_child(this.cancelButton);

        this._cancelButtonBox = new St.BoxLayout();
        this._cancelButtonBox.style_class = 'cancel-box';
        this._cancelButtonBox.add_child(this.cancelButton);
        this._mainBox.insert_child_at_index(this._cancelButtonBox, 0);

        this.cancelButton.remove_style_class_name('cancel-button');
        this.cancelButton.add_style_class_name('cancel');
        this.cancelButton.child.icon_size = Constants.CANCEL_BTN_ICON_SIZE;
        this.cancelButton.child.gicon = Gio.icon_new_for_string(Constants.CANCEL_BTN_ICON);
    }

    _customizeEntry() {
        this._passwordEntry.x_expand = false;
        this._passwordEntry.x_align = Clutter.ActorAlign.FILL;
        this._textEntry.x_expand = false;
        this._textEntry.x_align = Clutter.ActorAlign.FILL;

        this._passwordEntry.add_style_class_name('entry');
        this._textEntry.add_style_class_name('entry');

        this._passwordEntry.connect_after('secondary-icon-clicked', this._updatePasswdVisibleIcon.bind(this));
        this._updatePasswdVisibleIcon();
    }

    _hideCapsLockPlaceholder() {
        let children = this.get_children();
        let index = children.indexOf(this._capsLockWarningLabel);
        let capsLockPlaceholder = this.get_child_at_index(index - 1);
        if (capsLockPlaceholder)
            capsLockPlaceholder.set_height(0);
    }

    _updatePasswdVisibleIcon() {
        let secondary = this._passwordEntry.get_secondary_icon();
        let iconName;
        if (this._passwordEntry.password_visible)
            iconName = Constants.PASSWD_SHOW_ICON;
        else
            iconName = Constants.PASSWD_HIDE_ICON;

        secondary.gicon = Gio.icon_new_for_string(iconName);
        secondary.icon_size = Constants.PASSWD_EYE_ICON_SIZE;
    }

    _onAskQuestion(verifier, serviceName, question, secret) {
        super._onAskQuestion(verifier, serviceName, question, secret);
        if (question === 'Password:' || question === 'Password: ' ||
            question === '암호:' || question === '암호: ')
            this.setQuestion(_('비밀번호'));
    }

    setQuestion(question) {
        super.setQuestion(question);
        this._entry.get_hint_actor().add_style_class_name('hint-style');
    }

    _onVerificationFailed(userVerifier, canRetry) {
        if (this._queryingService === 'gdm-password') {
            let message = null;
            let errorType = this._userVerifier._errorType;

            switch (errorType) {
            case UserVerifier.ErrorType.NONE:
                message = '아이디 또는 비밀번호를 확인해주세요';
                break;
            case UserVerifier.ErrorType.EXCEED_MAX_LOGIN_COUNT:
                message = '계정이 비활성화되었습니다.\n WAPL에서 비밀번호 찾기를 통해 계정을 활성화해주세요.';
                break;
            case UserVerifier.ErrorType.NETWORK_DISCONNECTED:
                message = '네트워크 연결 상태를 확인해주세요.';
                break;
            default:
                message = '아이디 또는 비밀번호를 확인해주세요';
                log('Greeter: assert error. Invalid verification error type.');
                break;
            }
            this.setMessage(_(message), GdmUtil.MessageType.ERROR);
            this._userVerifier._errorType = UserVerifier.ErrorType.NONE;
        }

        super._onVerificationFailed(userVerifier, canRetry);
    }

    setUser(user) {
        this._userProfile.changeUser(user);
        if (!user)
            this._updateEntry(false);
    }

    setUserList(userList) {
        this._userProfile.setUserList(userList);
    }

    hideUserListMenu() {
        if (this._userProfile._userListMenu.isOpen)
            this._userProfile._userListMenu.toggle();
    }
});
