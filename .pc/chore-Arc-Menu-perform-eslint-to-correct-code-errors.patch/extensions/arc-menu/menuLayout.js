/*
 * ArcMenu - A traditional application menu for GNOME 3
 *
 * ArcMenu Lead Developer and Maintainer
 * Andrew Zaech https://gitlab.com/AndrewZaech
 *
 * ArcMenu Founder, Former Maintainer, and Former Graphic Designer
 * LinxGem33 https://gitlab.com/LinxGem33 - (No Longer Active)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Clutter, GLib, Gio, Shell, St } = imports.gi;
const BaseMenuLayout = Me.imports.baseMenuLayout;
const Constants = Me.imports.constants;
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const Main = imports.ui.main;
const MW = Me.imports.menuWidgets;
const PopupMenu = imports.ui.popupMenu;
const _ = Gettext.gettext;
// const Gtk = imports.gi;
// const PlaceDisplay = Me.imports.placeDisplay;
// const Utils =  Me.imports.utils;

const COLUMN_SPACING = 10;
const ROW_SPACING = 10;
const COLUMN_COUNT = 3;

var createMenu = class extends BaseMenuLayout.BaseLayout { // eslint-disable-line no-unused-vars
    createLayout() {
        this.actionsBox = new St.BoxLayout({
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.END,
            vertical: true,
        });
        this.actionsBox.style = 'background-color:rgb(41, 41, 41); border-radius: 14px 0px 0px 14px; margin: 0px; spacing: 10px; padding: 0px 5px 0px 5px; width: 38px;';
        this.mainBox.add(this.actionsBox);

        // User Button
        let userButton = new MW.CurrentUserButton(this);
        userButton.actor.expand = false;
        userButton.actor.margin = 5;
        this.actionsBox.add(userButton.actor);

        // Documents Button
        let path = GLib.get_user_special_dir(imports.gi.GLib.UserDirectory.DIRECTORY_DOCUMENTS);
        if (path !== null) {
            let placeInfo = new MW.PlaceInfo(Gio.File.new_for_path(path), _('Documents'));
            let placeMenuItem = new MW.PlaceButtonItem(this, placeInfo);
            this.actionsBox.add_actor(placeMenuItem.actor);
        }

        // Settings Button
        let settingsButton = new MW.SettingsButton(this);
        settingsButton.actor.expand = false;
        settingsButton.actor.margin = 5;
        this.actionsBox.add(settingsButton.actor);

        // Power Button
        this.powerButton = new MW.LeaveButton(this);
        this.powerButton.actor.expand = false;
        this.powerButton.actor.margin = 5;
        this.actionsBox.add(this.powerButton.actor);

        this.subMainBox = new St.BoxLayout({
            x_expand: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.START,
            vertical: true,
        });
        this.mainBox.add(this.subMainBox);

        this.favoritesScrollBox = this._createScrollBox({
            x_expand: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.START,
            overlay_scrollbars: true,
        });
        this.favoritesScrollBox.style = 'background-color: rgb(237, 237, 242); color: rgb(0, 0, 0); width: 330px; border-radius: 0px 14px 14px 0px; height: 650px;';

        this.mainBox.add(this.favoritesScrollBox);
        this.favoritesBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
        });
        this.favoritesScrollBox.add_actor(this.favoritesBox);

        this.applicationsBox = new St.BoxLayout({
            vertical: true,
        });

        // Grid Layout
        let layout = new Clutter.GridLayout({
            orientation: Clutter.Orientation.VERTICAL,
            column_spacing: COLUMN_SPACING,
            row_spacing: ROW_SPACING,
        });
        this.grid = new St.Widget({
            x_expand: false,
            y_expand: false,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.START,
            layout_manager: layout,
        });
        this.grid.style = 'margin-left: 20px;';
        layout.hookup_style(this.grid);

        this.applicationsScrollBox = this._createScrollBox({
            x_expand: false,
            y_expand: false,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.START,
            overlay_scrollbars: true,
        });
        this.applicationsScrollBox.style = 'background-color: rgb(255, 255, 255); color: rgb(0, 0, 0); width: 350px;';

        this.applicationsScrollBox.add_actor(this.applicationsBox);
        this.subMainBox.add(this.applicationsScrollBox);

        this.loadFavorites();
        this.loadCategories();
        this.displayAllApps();
        this._createLeaveMenu();
        this.setDefaultMenuView();
    }

    createLabelRow(title) {
        let labelRow = new PopupMenu.PopupMenuItem(_(title), {
            hover: false,
            can_focus: false,
        });
        labelRow.actor.add_style_pseudo_class = () => {
            return false;
        };
        labelRow.label.style = 'font-weight: bold;';
        return labelRow;
    }

    _createLeaveMenu() {
        this.leaveMenu = new PopupMenu.PopupMenu(this.powerButton, 0.5, St.Side.BOTTOM);

        let section = new PopupMenu.PopupMenuSection();
        this.leaveMenu.addMenuItem(section);

        let box = new St.BoxLayout({
            vertical: true,
        });
        box._delegate = box;
        section.actor.add_actor(box);

        box.add(this.createLabelRow(_('Session')));

        this.lock = new MW.PlasmaPowerItem(this, Constants.PowerType.LOCK, _('Lock'), 'changes-prevent-symbolic');
        this.lock._icon.icon_size = 16;
        box.add(this.lock);
        this.logOut = new MW.PlasmaPowerItem(this, Constants.PowerType.LOGOUT, _('Log Out'), 'application-exit-symbolic');
        this.logOut._icon.icon_size = 16;
        box.add(this.logOut);

        box.add(this.createLabelRow(_('System')));

        this.suspend = new MW.PlasmaPowerItem(this, Constants.PowerType.SUSPEND, _('Suspend'), 'media-playback-pause-symbolic');
        this.suspend._icon.icon_size = 16;
        box.add(this.suspend);

        this.restart = new MW.PlasmaPowerItem(this, Constants.PowerType.RESTART, _('Restart...'), Me.path + Constants.RESTART_ICON.Path);
        this.restart._icon.icon_size = 16;
        box.add(this.restart);

        this.powerOff = new MW.PlasmaPowerItem(this, Constants.PowerType.POWEROFF, _('Power Off...'), 'system-shutdown-symbolic');
        this.powerOff._icon.icon_size = 16;
        box.add(this.powerOff);
        this.subMenuManager.addMenu(this.leaveMenu);
        this.leaveMenu.actor.hide();
        Main.uiGroup.add_actor(this.leaveMenu.actor);
    }

    toggleLeaveMenu() {
        this.leaveMenu.actor.style_class = 'popup-menu-boxpointer';
        this.leaveMenu.actor.add_style_class_name('popup-menu');
        this.leaveMenu.toggle();
    }

    setDefaultMenuView() {
        super.setDefaultMenuView();

        this.displayAllApps();
        this.displayFavorites();
        let appsScrollBoxAdj = this.favoritesScrollBox.get_vscroll_bar().get_adjustment();
        appsScrollBoxAdj.set_value(0);
    }

    updateIcons() {
        for (let i = 0; i < this.frequentAppsList.length; i++) {
            let item = this.frequentAppsList[i];
            item._updateIcon();
        }
        super.updateIcons();
    }

    displayAllApps() {
        this._clearActorsFromBox();
        let frequentAppsLabel = new PopupMenu.PopupMenuItem(_('Frequent'), {
            hover: false,
            can_focus: false,
        });
        frequentAppsLabel.actor.add_style_pseudo_class = () => {
            return false;
        };
        frequentAppsLabel.label.style = 'font-weight: bold; margin: 6px 0px; font-size: 16px;';
        this.applicationsBox.add_actor(frequentAppsLabel.actor);

        let mostUsed = Shell.AppUsage.get_default().get_most_used();
        this.frequentAppsList = [];
        for (let i = 0; i < mostUsed.length; i++) {
            if (mostUsed[i] && mostUsed[i].get_app_info().should_show()) {
                let item = new MW.ApplicationMenuItem(this, mostUsed[i]);
                this.frequentAppsList.push(item);
            }
        }
        let activeMenuItemSet = false;
        for (let i = 0; i < this.frequentAppsList.length; i++) {
            let item = this.frequentAppsList[i];
            if (item.actor.get_parent())
                item.actor.get_parent().remove_actor(item.actor);
            if (!item.actor.get_parent())
                this.applicationsBox.add_actor(item.actor);
            if (!activeMenuItemSet) {
                activeMenuItemSet = true;
                this.activeMenuItem = item;
                if (this.arcMenu.isOpen)
                    this.mainBox.grab_key_focus();

            }
        }

        let appList = [];
        this.applicationsMap.forEach((value, key, map) => { // eslint-disable-line no-unused-vars
            appList.push(key);
        });
        appList.sort((a, b) => {
            return a.get_name().toLowerCase() > b.get_name().toLowerCase();
        });

        this._displayAppList(appList);
    }

    _reload() {
        super.reload();
        let themeContext = St.ThemeContext.get_for_stage(global.stage);
        let scaleFactor = themeContext.scale_factor;
        let height =  Math.round(650 / scaleFactor);
        this.leftPanelPopup.style = `height: ${height}px`;
    }

    loadCategories() {
        this.categoryDirectories = null;
        this.categoryDirectories = new Map();
        super.loadCategories();
    }

    _clearActorsFromBox(box) {
        super._clearActorsFromBox(box);
    }

    _displayAppList(apps) {
        let activeMenuItemSet = false;
        let currentCharacter;

        for (let i = 0; i < apps.length; i++) {
            let app = apps[i];
            let character;
            let ascii = app.get_name().charCodeAt(0);

            if (ascii >= 0xAC00 && ascii <= 0xD7A3) {
                var consonants = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ',
                    'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
                var offset = parseInt((ascii - 0xAC00) / 0x24C);
                character = consonants[offset];
            } else if (ascii >= 0x61 && ascii <= 0x7A || ascii >= 0x41 && ascii <= 0x5A) {
                character = app.get_name().charAt(0).toUpperCase();
            } else {
                character = '#';
            }

            if (currentCharacter !== character) {
                currentCharacter = character;

                let characterLabel = new PopupMenu.PopupMenuItem(character, {
                    hover: false,
                    can_focus: false,
                });
                characterLabel.actor.add_style_pseudo_class = () => {
                    return false;
                };
                characterLabel.label.style = 'font-weight: bold; margin: 7px 0px 0px 0px;';
                this.applicationsBox.add_actor(characterLabel.actor);
            }
            let item = this.applicationsMap.get(app);
            if (!item) {
                item = new MW.ApplicationMenuItem(this, app);
                this.applicationsMap.set(app, item);
            }
            if (item.actor.get_parent())
                item.actor.get_parent().remove_actor(item.actor);

            if (!item.actor.get_parent())
                this.applicationsBox.add_actor(item.actor);

            if (!activeMenuItemSet) {
                activeMenuItemSet = true;
                this.activeMenuItem = item;
                if (this.arcMenu.isOpen)
                    this.mainBox.grab_key_focus();

            }
        }
    }

    displayFavorites() {
        super._clearActorsFromBox(this.favoritesBox);
        this.grid.remove_all_children();
        let label = this.createLabelRow(_('Pinned Apps'));
        label.style = 'margin: 6px 0px 6px 20px; font-size: 16px;';
        label.remove_actor(label._ornamentLabel);
        this.favoritesBox.add_actor(label);
        super._displayAppGridList(this.favoritesArray, COLUMN_COUNT, true, this.grid);
        if (!this.favoritesBox.contains(this.grid))
            this.favoritesBox.add(this.grid);
        if (this.arcMenu.isOpen)
            this.mainBox.grab_key_focus();

        this.updateStyle();
    }
};
