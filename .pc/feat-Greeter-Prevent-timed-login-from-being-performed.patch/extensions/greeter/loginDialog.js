// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
/* exported LoginDialog */
/*
 * Copyright 2011 Red Hat, Inc
 *
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

const { GObject, Clutter } = imports.gi;
const Main = imports.ui.main;
const GnomeLoginDialog = imports.gdm.loginDialog;
const GnomeAuthPrompt = imports.gdm.authPrompt;
const Batch = imports.gdm.batch;
const CtrlAltTab = imports.ui.ctrlAltTab;

const AuthPrompt = Me.imports.authPrompt;

const Gettext = imports.gettext;
const _ = Gettext.gettext;

var LoginDialog = GObject.registerClass(class LoginDialog extends GnomeLoginDialog.LoginDialog {
    _init(parentActor) {
        super._init(parentActor);

        // Hide userSelectionBox
        this._userSelectionBox.remove_child(this._userList);
        this._userSelectionBox.remove_child(this._notListedButton);
        this._userSelectionBox.visible = false;

        this._addCustomizedAuthPrompt();

        this._user = null;

        this._notListedButton.hide();
        this._authPrompt.add_child(this._notListedButton);
    }

    _addCustomizedAuthPrompt() {
        this.remove_child(this._authPrompt);

        this._authPrompt = new AuthPrompt.AuthPrompt(this._gdmClient, GnomeAuthPrompt.AuthPromptMode.UNLOCK_OR_LOG_IN);
        this._authPrompt.connect('prompted', this._onPrompted.bind(this));
        this._authPrompt.connect('reset', this._onReset.bind(this));
        this._authPrompt.hide();
        this.add_child(this._authPrompt);
    }

    _loadUserList() {
        if (!this._userListLoaded)
            this._authPrompt.setUserList(this._userList);

        return super._loadUserList();
    }

    _showUserList() {
        this._ensureUserListLoaded();
        this._hideBannerView();
        this._sessionMenuButton.close();
        this._sessionMenuButton.hide();
        this._notListedButton.show();
    }

    _showLastLoginUser() {
        let users = this._userManager.list_users();
        users.sort((a, b) => {
            return a.get_login_time() < b.get_login_time();
        });

        let lastLoginUser;
        for (let i = 0; i < users.length; i++) {
            let user = users[i];

            if (!user.get_user_name())
                continue;
            if (!user.is_loaded)
                continue;
            if (user.is_system_account())
                continue;
            if (user.locked)
                continue;

            lastLoginUser = user;
            break;
        }

        this._user = lastLoginUser;
        this._changeUser(lastLoginUser);
    }

    _changeUser(newUser) {
        this._authPrompt.setUser(newUser);

        let batch = new Batch.ConcurrentBatch(this,
            [this._beginVerificationForUser(newUser)]);
        batch.run();
    }

    _beginVerificationForUser(user) {
        let userName = user.get_user_name();
        let hold = new Batch.Hold();

        this._authPrompt.begin({ userName, hold });
        return hold;
    }

    _onUserListActivated(activatedItem) {
        this._authPrompt.hideUserListMenu();

        if (activatedItem.user === this._user)
            return;

        this._user = activatedItem.user;
        this._authPrompt.cancel();
        this._changeUser(this._user);
    }

    _onReset(authPrompt, beginRequest) {
        this._resetGreeterProxy();
        this._sessionMenuButton.updateSensitivity(true);

        if (this._nextSignalId) {
            this._authPrompt.disconnect(this._nextSignalId);
            this._nextSignalId = 0;
        }

        this._updateCancelButton(false);

        if (beginRequest === GnomeAuthPrompt.BeginRequestType.PROVIDE_USERNAME) {
            if (!this._disableUserList) {
                this._showUserList();

                if (!this._user)
                    this._showLastLoginUser();
            } else {
                this._hideUserListAskForUsernameAndBeginVerification();
            }
        } else {
            this._hideUserListAndBeginVerification();
        }
    }

    _updateCancelButton(visible) {
        this._authPrompt.cancelButton.visible = visible;
    }

    _hideUserListAskForUsernameAndBeginVerification() {
        if (this._authPrompt.verificationStatus === GnomeAuthPrompt.AuthPromptStatus.VERIFYING ||
            this._authPrompt.verificationStatus === GnomeAuthPrompt.AuthPromptStatus.VERIFICATION_FAILED)
            this._authPrompt.cancel();

        this._notListedButton.hide();
        let visible = !this._disableUserList;
        this._updateCancelButton(visible);

        this._askForUsernameAndBeginVerification();
    }

    _askForUsernameAndBeginVerification() {
        this._user = null;
        this._authPrompt.setUser(null);
        this._authPrompt.setQuestion(_('Username'));

        this._showRealmLoginHint(this._realmManager.loginFormat);

        if (this._nextSignalId)
            this._authPrompt.disconnect(this._nextSignalId);
        this._nextSignalId = this._authPrompt.connect('next',
            () => {
                this._authPrompt.disconnect(this._nextSignalId);
                this._nextSignalId = 0;
                this._authPrompt.updateSensitivity(false);
                let answer = this._authPrompt.getAnswer();
                this._authPrompt._userWidget.setOnlyUserName(answer);
                this._authPrompt.clear();
                this._authPrompt.begin({ userName: answer });
                this._updateCancelButton(true);
            });
        this._sessionMenuButton.updateSensitivity(false);
        this._authPrompt.updateSensitivity(true);
        this._showPrompt();
    }

    _loginScreenSessionActivated() {
        if (!this._user) {
            this._authPrompt.cancel();
            return;
        }

        this._authPrompt.cancel();
        this._changeUser(this._user);
    }

    cancel() {}

    open() {
        Main.ctrlAltTabManager.addGroup(this,
            _('Login Window'),
            'dialog-password-symbolic',
            { sortGroup: CtrlAltTab.SortGroup.MIDDLE });
        this.activate();

        this.opacity = 0;

        // NOTE(210803, sohee): Remove the modal push code in this position
        // to float network setup window.

        this.ease({
            opacity: 255,
            duration: 1000,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
        });

        return true;
    }

    close() {
        // NOTE(210803, sohee): Since the modal push code has been deleted,
        // delete modal pop code as well.

        Main.ctrlAltTabManager.removeGroup(this);
    }
});
