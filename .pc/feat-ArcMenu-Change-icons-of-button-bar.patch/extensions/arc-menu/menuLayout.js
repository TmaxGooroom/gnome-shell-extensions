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
const appSys = Shell.AppSystem.get_default();

// Favorites
const COLUMN_SPACING = 10;
const ROW_SPACING = 10;
const COLUMN_COUNT = 3;

// Recently Installed
const TWO_WEEKS = 60 * 60 * 24 * 12;

// Applist
// NOTE(210527, sohee) : IMS260589
// MISSING_APPS : Apps that are missing from the list of apps given by GMenu.Tree.
// Check if these apps are installed during reload and add them if they are missing.
const MISSING_APPS = ['google-chrome.desktop', 'vm-helper.desktop'];

var createMenu = class extends BaseMenuLayout.BaseLayout { // eslint-disable-line no-unused-vars
    createLayout() {
        this.actionsBox = new St.BoxLayout({
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.END,
            vertical: true,
        });
        this.actionsBox.style = 'background-color:rgb(29, 29, 29); border-radius: 14px 0px 0px 14px; margin: 0px; spacing: 10px; padding: 0px 7px 9px 5px; width: 38px;';
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

        // Favorites Box (pinned-app-list)
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

        // Applications Box (recently installed apps, all apps)
        this.applicationsScrollBox = this._createScrollBox({
            x_expand: false,
            y_expand: false,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.START,
            overlay_scrollbars: true,
        });
        this.applicationsScrollBox.style = 'background-color: rgb(255, 255, 255); color: rgb(0, 0, 0); width: 350px;';
        this.subMainBox.add(this.applicationsScrollBox);

        this.applicationsBox = new St.BoxLayout({
            vertical: true,
        });
        this.applicationsScrollBox.add_actor(this.applicationsBox);

        this.recentAppsBox = new St.BoxLayout({
            vertical: true,
            y_align: Clutter.ActorAlign.START,
        });
        this.applicationsBox.add_actor(this.recentAppsBox);

        this.allAppsBox = new St.BoxLayout({
            vertical: true,
        });
        this.applicationsBox.add_actor(this.allAppsBox);

        this.loadFavorites();
        this.loadCategories();
        this.displayAllApps();
        this._createLeaveMenu();
        this.displayFavorites();
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

    setActiveMenuItem(item) {
        this.activeMenuItem = item;
        if (this.arcMenu.isOpen)
            this.mainBox.grab_key_focus();
    }

    displayRecentlyInstalledApps() {
        super._clearActorsFromBox(this.recentAppsBox);

        let appList = [];
        this.applicationsMap.forEach((value, key) => {
            appList.push(key);
        });

        this.frequentAppsList = [];
        let currentTime = GLib.DateTime.new_now_local().to_unix();

        for (let i = 0; i < appList.length; i++) {
            let appInfo = appList[i].get_app_info();
            let createdTime = this.getCreatedTime(appInfo);
            let diff = currentTime - createdTime;
            let isRecentlyInstalled = diff < TWO_WEEKS;

            if (isRecentlyInstalled && appInfo.should_show()) {
                let item = new MW.RecentAppMenuItem(this, appList[i], createdTime);
                this.frequentAppsList.push(item);
            }
        }

        // Sort
        this.frequentAppsList.sort((a, b) => {
            return a.getCreatedTime() < b.getCreatedTime();
        });

        let size = this.frequentAppsList.length;
        let maxSize = this._settings.get_int('max-recent-app-size');
        let end = size > maxSize ? maxSize : size;
        for (let i = 0; i < end; i++) {
            let item = this.frequentAppsList[i];

            if (i === 0) {
                this.createRecentLabel();
                this.setActiveMenuItem(item);
                this.recentAppsBox.style = 'margin-bottom: 20px;';
            }

            if (!item.actor.get_parent())
                this.recentAppsBox.add_actor(item.actor);
        }

        // only if count > 4
        this.createExpandButton();
        this.collapseAll();
    }

    getCreatedTime(appInfo) {
        let filename = appInfo.get_filename();
        try {
            // NOTE(210531, sohee): When an app is deleted while performing logic,
            // an error occurs that there is no such file or directory.
            let file = Gio.File.new_for_path(filename);

            let fileInfo = file.query_info('time::created', Gio.FileQueryInfoFlags.NONE, null);
            let createdTime = fileInfo.get_attribute_uint64('time::created');
            return createdTime;
        } catch (e) {
            return 0;
        }
    }

    createRecentLabel() {
        let frequentAppsLabel = new PopupMenu.PopupMenuItem(_('Recently Installed App'), {
            hover: false,
            can_focus: false,
        });
        frequentAppsLabel.actor.add_style_pseudo_class = () => {
            return false;
        };
        frequentAppsLabel.label.style = 'font-weight: bold; margin: 6px 0px; font-size: 16px;';
        this.recentAppsBox.add_actor(frequentAppsLabel.actor);
    }

    createExpandButton() {
        let size = this.frequentAppsList.length;
        let minSize = this._settings.get_int('min-recent-app-size');
        if (size > minSize) {
            let expandButton = new MW.ExpandButton(this);
            expandButton.x_align = Clutter.ActorAlign.CENTER;
            this.recentAppsBox.add_actor(expandButton);
        }
    }

    collapseAll() {
        let size = this.frequentAppsList.length;
        let minSize = this._settings.get_int('min-recent-app-size');
        if (size > minSize) {
            let maxSize = this._settings.get_int('max-recent-app-size');
            let end = size > maxSize ? maxSize : size;
            for (let i = minSize; i < end; i++)
                this.frequentAppsList[i].hide();

        }
    }

    expandAll() {
        let size = this.frequentAppsList.length;
        let minSize = this._settings.get_int('min-recent-app-size');
        if (size > minSize) {
            let maxSize = this._settings.get_int('max-recent-app-size');
            let end = size > maxSize ? maxSize : size;
            for (let i = minSize; i < end; i++)
                this.frequentAppsList[i].show();

        }
    }

    displayAllApps() {
        super._clearActorsFromBox(this.allAppsBox);

        let appList = [];
        this.applicationsMap.forEach((value, key) => {
            appList.push(key);
        });

        let newAppList = this.listAllApps();
        let newApps = newAppList.filter(appId => {
            let app = appSys.lookup_app(appId);
            return !appList.includes(app);
        });

        // NOTE(210527, sohee) : IMS260589
        // Check and add missing apps from GMenu.Tree's list of apps.
        newApps.forEach(newAppId => {
            let missing = MISSING_APPS.some(element => {
                return element === newAppId;
            });

            if (missing) {
                let app = appSys.lookup_app(newAppId);
                appList.push(app);
            }
        });

        appList.sort((a, b) => {
            return a.get_name().toLowerCase() > b.get_name().toLowerCase();
        });

        this._displayAppList(appList);
    }

    listAllApps() {
        let appList = appSys.get_installed().filter(appInfo => {
            try {
                appInfo.get_id();
            } catch (e) {
                // NOTE(210531, sohee): type conversion error (gappinfo->gdesktopappinfo)
                return false;
            }
            return appInfo.should_show();
        });
        return appList.map(app => app.get_id());
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

    _displayAppList(apps) {
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
                this.allAppsBox.add_actor(characterLabel.actor);
            }
            let item = this.applicationsMap.get(app);
            if (!item) {
                item = new MW.ApplicationMenuItem(this, app);
                this.applicationsMap.set(app, item);
            }
            if (item.actor.get_parent())
                item.actor.get_parent().remove_actor(item.actor);

            if (!item.actor.get_parent())
                this.allAppsBox.add_actor(item.actor);

            if (i === 0)
                this.setActiveMenuItem(item);
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
