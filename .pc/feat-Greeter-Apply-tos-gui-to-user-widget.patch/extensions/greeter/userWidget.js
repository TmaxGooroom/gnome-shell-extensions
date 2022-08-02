// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
//
// A widget showing the user avatar and name
/* exported UserWidget */

const { Clutter, GObject, St } = imports.gi;

const GnomeUserWidget = imports.ui.userWidget;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;

var Avatar = GObject.registerClass(class Avatar extends GnomeUserWidget.Avatar {
    _init(user, params) {
        super._init(user, params);
    }

    changeUser(user) {
        this._user = user;
    }
});

var UserWidgetLabel = GObject.registerClass(
class UserWidgetLabel extends St.Label {
    _init(user) {
        super._init({ y_align: Clutter.ActorAlign.CENTER });

        this._user = user;
    }

    update() {
        if (this._user && this._user.is_loaded)
            this.text = this._user.get_real_name();
        else
            this.text = '';
    }

    changeUser(user) {
        this._user = user;
    }
});

var UserWidget = GObject.registerClass(
class UserWidget extends St.BoxLayout {
    _init(user) {
        // If user is null, that implies a username-based login authorization.
        this._user = user;

        let vertical = true;
        let xAlign = Clutter.ActorAlign.CENTER;
        let styleClass = 'user-widget vertical';
        super._init({ styleClass, vertical, xAlign });

        this.connect('destroy', this._onDestroy.bind(this));

        this._userLoadedId = 0;
        this._userChangedId = 0;

        this._createAvatar(user);
        this._createLabelButton(user);
        this._createUserListMenu();

        this._labelButton.connect('clicked', this._onLabelButtonClicked.bind(this));

        this._updateUser();
    }

    _onLabelButtonClicked() {
        if (this._user === null)
            return;

        if (this._userList && this._userList.numItems() === 1)
            return;

        this._userListMenu.toggle();
    }

    _createAvatar(user) {
        this._avatar = new Avatar(user);
        this._avatar.x_align = Clutter.ActorAlign.CENTER;
        this.add_child(this._avatar);
    }

    _createLabelButton(user) {
        // labelButtonBox
        this._labelButtonBox = new St.BoxLayout({
            x_expand: true,
            y_expand: true,
            vertical: false,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._labelButtonBox.style = 'spacing: 15px;';

        // label and icon
        this._label = new UserWidgetLabel(user);
        this._labelButtonBox.add_actor(this._label);

        this._icon = new St.Icon({
            icon_name: 'pan-down-symbolic',
            icon_size: 20,
            y_align: Clutter.ActorAlign.END,
        });
        this._labelButtonBox.add_actor(this._icon);

        // labelButton
        this._labelButton = new St.Button({ child: this._labelButtonBox });
        this.add_child(this._labelButton);
    }

    _createUserListMenu() {
        this._userListMenu = new PopupMenu.PopupMenu(this._labelButton, 0.5, St.Side.TOP);
        this._userListMenuSection = new PopupMenu.PopupMenuSection();
        this._userListMenu.addMenuItem(this._userListMenuSection);
        this._userListMenu.actor.hide();

        this.subMenuManager = new PopupMenu.PopupMenuManager(this);
        this.subMenuManager.addMenu(this._userListMenu);
        Main.uiGroup.add_actor(this._userListMenu.actor);
    }

    setUserList(userList) {
        this._userListMenuSection.actor.add_actor(userList);
    }

    _onDestroy() {
        if (this._userLoadedId !== 0) {
            this._user.disconnect(this._userLoadedId);
            this._userLoadedId = 0;
        }

        if (this._userChangedId !== 0) {
            this._user.disconnect(this._userChangedId);
            this._userChangedId = 0;
        }
    }

    _updateUser() {
        this._avatar.update();
        this._label.update();
    }

    changeUser(user) {
        this._onDestroy();

        if (user) {
            this._userLoadedId = user.connect('notify::is-loaded', this._updateUser.bind(this));
            this._userChangedId = user.connect('changed', this._updateUser.bind(this));
        }

        this._user = user;
        this._avatar.changeUser(user);
        this._label.changeUser(user);

        this._updateUser();

        this._icon.visible = user !== null;
    }

    setOnlyUserName(name) {
        this._label.text = name;
    }
});
