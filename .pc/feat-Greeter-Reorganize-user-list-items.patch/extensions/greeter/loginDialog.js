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

const { Gio, GLib, GObject, Clutter, St } = imports.gi;
const Main = imports.ui.main;
const GnomeLoginDialog = imports.gdm.loginDialog;
const GnomeAuthPrompt = imports.gdm.authPrompt;
const Batch = imports.gdm.batch;
const CtrlAltTab = imports.ui.ctrlAltTab;

const AuthPrompt = Me.imports.authPrompt;
const Constants = Me.imports.constants;

const Gettext = imports.gettext;
const _ = Gettext.gettext;

var UserListItem = GObject.registerClass(class UserListItem extends GnomeLoginDialog.UserListItem {
    _init(user) {
        super._init(user);

        this._customize();
    }

    _customize() {
        this.add_style_class_name('user-list-item');

        this._userWidget.y_align = Clutter.ActorAlign.CENTER;
        this._userWidget.y_expand = true;

        let avatar = this._userWidget._avatar;
        avatar.remove_style_class_name('user-icon');
        avatar.add_style_class_name('user-avatar');
        avatar._iconSize = 42;
        avatar.update();

        let label = this._userWidget._label._realNameLabel;
        label.add_style_class_name('user-list-item-label');

    }

    vfunc_key_focus_in() {
        if (this.actor.hover)
            return;

        super.vfunc_key_focus_in();
        this.add_style_class_name('focus');
    }

    vfunc_key_focus_out() {
        if (this.actor.hover)
            return;

        super.vfunc_key_focus_out();
        this.remove_style_class_name('focus');
    }
});

var UserList = GObject.registerClass(class UserList extends GnomeLoginDialog.UserList {
    _init() {
        super._init();
        this.overlay_scrollbars = true;

        this._box.add_style_class_name('user-list-box');
    }

    addUser(user) {
        if (!user.is_loaded)
            return;

        if (user.is_system_account())
            return;

        if (user.locked)
            return;

        let userName = user.get_user_name();
        if (!userName)
            return;

        this.removeUser(user);

        let item = new UserListItem(user);
        this._box.add_child(item);

        this._items[userName] = item;

        item.connect('activate', this._onItemActivated.bind(this));

        // Try to keep the focused item front-and-center
        item.connect('key-focus-in', () => this.scrollToItem(item));

        this._moveFocusToItems();

        this.emit('item-added', item);
    }

});

var LoginDialog = GObject.registerClass(class LoginDialog extends GnomeLoginDialog.LoginDialog {
    _init(parentActor) {
        super._init(parentActor);

        // Hide userSelectionBox
        this._userSelectionBox.remove_child(this._userList);
        this._userSelectionBox.remove_child(this._notListedButton);
        this._userSelectionBox.visible = false;

        this._addCustomizedAuthPrompt();

        this._userList.destroy();
        this._userList = new UserList();
        this._userList.connect('activate', (userList, item) => {
            this._onUserListActivated(item);
        });

        this._user = null;

        // notListedButton
        this._customizeNotListedButton();
        this._authPrompt.add_child(this._notListedButton);
        this._notListedButton.hide();
    }

    _addCustomizedAuthPrompt() {
        this.remove_child(this._authPrompt);

        this._authPrompt = new AuthPrompt.AuthPrompt(this._gdmClient, GnomeAuthPrompt.AuthPromptMode.UNLOCK_OR_LOG_IN);
        this._authPrompt.connect('prompted', this._onPrompted.bind(this));
        this._authPrompt.connect('reset', this._onReset.bind(this));
        this._authPrompt.hide();
        this.add_child(this._authPrompt);
    }

    _customizeNotListedButton() {
        this._notListedButton.remove_all_children();

        let notListedButtonBox = new St.BoxLayout();
        notListedButtonBox.style = 'spacing: 10px;';

        let icon = new St.Icon({
            gicon: Gio.icon_new_for_string(Constants.USER_DEFAULT_ICON),
            icon_size: 30,
        });
        let label = new St.Label({
            text: _('다른 계정으로 로그인'),
            y_align: Clutter.ActorAlign.CENTER,
        });
        notListedButtonBox.add_actor(icon);
        notListedButtonBox.add_actor(label);

        this._notListedButton.x_align = Clutter.ActorAlign.CENTER;
        this._notListedButton.set_child(notListedButtonBox);
    }

    _loadUserList() {
        if (!this._userListLoaded)
            this._authPrompt.setUserList(this._userList);

        super._loadUserList();
        this._authPrompt._userWidget.updateLabelStyleAndIconVisibility();

        return GLib.SOURCE_REMOVE;
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

    _onTimedLoginRequested() {
        // NOTE(sohee, 210728): Due to security issues,
        // we decided not to provide the timed login function.
        // Therefore, it does not deal with anything here.
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
