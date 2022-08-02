/* exported LoginDialog */
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

const { Gio, GLib, GObject, Clutter, St, Shell } = imports.gi;
const Main = imports.ui.main;
const GnomeLoginDialog = imports.gdm.loginDialog;
const GnomeAuthPrompt = imports.gdm.authPrompt;
const GdmUtil = imports.gdm.util;
const Batch = imports.gdm.batch;
const CtrlAltTab = imports.ui.ctrlAltTab;
const Background = imports.ui.background;

const AuthPrompt = Me.imports.authPrompt;
const Constants = Me.imports.constants;

const Gettext = imports.gettext;
const _ = Gettext.gettext;

const SOM_ACCOUNT_FIRST_UID = 50001;

const BLUR_BRIGHTNESS = 0.55;
const BLUR_SIGMA = 60;

function _sortItems(items) {
    let sorted = {};
    let arr = [];

    for (let userName in items) {
        let item = items[userName];
        arr.push(item);
    }

    arr.sort((item1, item2) => {
        let user1 = item1.user;
        let user2 = item2.user;
        return user1.get_login_time() < user2.get_login_time();
    });

    for (let i = 0; i < arr.length; i++) {
        let userName = arr[i].user.get_user_name();
        sorted[userName] = items[userName];
    }

    return sorted;
}

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
        avatar._iconSize = Constants.USER_ITEM_ICON_SIZE;
        avatar.update();

        let realNameLabel = this._userWidget._label._realNameLabel;
        realNameLabel.add_style_class_name('user-list-item-label');
        let userNameLabel = this._userWidget._label._userNameLabel;
        userNameLabel.add_style_class_name('user-list-item-label');

        // Unify by using the real name(display name).
        userNameLabel.text = realNameLabel.text;
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

        let uid = user.get_uid();
        let lastLoginTime = user.get_login_time();
        if (uid >= SOM_ACCOUNT_FIRST_UID && lastLoginTime <= 0)
            return;

        this.removeUser(user);

        let item = new UserListItem(user);
        this._items[userName] = item;
        this._items = _sortItems(this._items);

        let keys = Object.keys(this._items);
        let index = keys.indexOf(userName);
        this._box.insert_child_at_index(item, index);

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

        this._replaceWithCustomizedAuthPrompt();

        this._userList.destroy();
        this._userList = new UserList();
        this._userList.connect('activate', (userList, item) => {
            this._onUserListActivated(item);
        });

        this._user = null;

        this._customizeNotListedButton();
        this._authPrompt.add_child(this._notListedButton);
        this._notListedButton.hide();

        // Background
        this._backgroundGroup = new Clutter.Actor();
        this.add_child(this._backgroundGroup);
        this.set_child_below_sibling(this._backgroundGroup, null);
        this._bgManagers = [];
        this._updateBackgrounds();
        this._monitorsChangedId =
            Main.layoutManager.connect('monitors-changed', this._updateBackgrounds.bind(this));
    }

    vfunc_allocate(dialogBox) {
        super.vfunc_allocate(dialogBox);

        let backgroundAllocation = null;
        if (this._backgroundGroup.visible)
            backgroundAllocation = this._getCenterActorAllocation(dialogBox, this._backgroundGroup);

        if (backgroundAllocation)
            this._backgroundGroup.allocate(backgroundAllocation);
    }

    _replaceWithCustomizedAuthPrompt() {
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
        if (this._userListLoaded)
            return GLib.SOURCE_REMOVE;

        this._userListLoaded = true;

        this._authPrompt.setUserList(this._userList);

        let users = this._userManager.list_users();

        for (let i = 0; i < users.length; i++)
            this._userList.addUser(users[i]);

        this._updateDisableUserList();

        this._userAddedId = this._userManager.connect('user-added',
            (userManager, user) => {
                this._userList.addUser(user);
                this._updateDisableUserList();
            });

        this._userRemovedId = this._userManager.connect('user-removed',
            (userManager, user) => {
                this._userList.removeUser(user);
                this._updateDisableUserList();
            });

        this._userChangedId = this._userManager.connect('user-changed',
            (userManager, user) => {
                if (this._userList.containsUser(user) && user.locked)
                    this._userList.removeUser(user);
                else if (!this._userList.containsUser(user) && !user.locked)
                    this._userList.addUser(user);
                this._updateDisableUserList();
            });

        this._showLastLoginUser();

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
        // To obtain the last login user, get first item of sorted UserList.
        let items = this._userList._items;
        let keys = Object.keys(items);
        if (keys.length === 0)
            return;

        let lastLoginUserItem = items[keys[0]];
        let lastLoginUser = lastLoginUserItem.user;

        this._changeUser(lastLoginUser);
    }

    _changeUser(newUser) {
        this._user = newUser;

        let batch = new Batch.ConcurrentBatch(this,
            [this._beginVerificationForUser(newUser)]);
        batch.run();
    }

    _beginVerificationForUser(user) {
        this._authPrompt.setUser(user);

        let userName = user.get_user_name();
        let hold = new Batch.Hold();

        this._authPrompt.begin({ userName, hold });
        return hold;
    }

    _onUserListActivated(activatedItem) {
        this._authPrompt.hideUserListMenu();

        if (activatedItem.user === this._user)
            return;

        this._authPrompt.cancel();
        this._changeUser(activatedItem.user);
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
        // NOTE(210824, sohee): If authentication channel is established with UserVerifier, it must be cancelled.
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
        this._authPrompt.setQuestion(_('사용자 계정'));

        this._showRealmLoginHint(this._realmManager.loginFormat);

        if (this._nextSignalId)
            this._authPrompt.disconnect(this._nextSignalId);
        this._nextSignalId = this._authPrompt.connect('next',
            () => {
                let answer = this._authPrompt.getAnswer();
                if (answer.trim() === '') {
                    this._authPrompt.setMessage(_('사용자 계정을 입력하세요'), GdmUtil.MessageType.ERROR);
                    this._authPrompt.updateSensitivity(true);
                    return;
                }
                this._authPrompt.disconnect(this._nextSignalId);
                this._nextSignalId = 0;
                this._authPrompt.updateSensitivity(false);

                // NOTE(210823, sohee): When userWidget is set to null,
                // the account name must be shown to userWidget when account name is entered.
                this._authPrompt._userProfile.setOnlyUserName(answer);

                this._authPrompt.clear();
                this._authPrompt.begin({ userName: answer });
                this._updateCancelButton(true);
            });
        this._sessionMenuButton.updateSensitivity(false);
        this._authPrompt.updateSensitivity(true);
        this._showPrompt();
    }

    _loginScreenSessionActivated() {
        let isUserExist = this._user !== null;

        this._authPrompt.cancel();
        if (isUserExist)
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

    _createBackground(monitorIndex) {
        let monitor = Main.layoutManager.monitors[monitorIndex];
        let widget = new St.Widget({
            style_class: 'screen-shield-background',
            x: monitor.x,
            y: monitor.y,
            width: monitor.width,
            height: monitor.height,
            effect: new Shell.BlurEffect({
                brightness: BLUR_BRIGHTNESS,
                sigma: BLUR_SIGMA,
            }),
        });

        let bgManager = new Background.BackgroundManager({
            container: widget,
            monitorIndex,
            controlPosition: false,
        });

        this._bgManagers.push(bgManager);

        this._backgroundGroup.add_child(widget);
    }

    _updateBackgrounds() {
        for (let i = 0; i < this._bgManagers.length; i++)
            this._bgManagers[i].destroy();

        this._bgManagers = [];
        this._backgroundGroup.destroy_all_children();

        for (let i = 0; i < Main.layoutManager.monitors.length; i++)
            this._createBackground(i);
    }
});
