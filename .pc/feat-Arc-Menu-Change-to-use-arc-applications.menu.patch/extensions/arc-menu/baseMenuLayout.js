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

const { Clutter, GMenu, Shell, St } = imports.gi;
const appSys = Shell.AppSystem.get_default();
const Constants = Me.imports.constants;
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const Main = imports.ui.main;
const MW = Me.imports.menuWidgets;
const PopupMenu = imports.ui.popupMenu; // eslint-disable-line no-unused-vars
const SystemActions = imports.misc.systemActions;
const Utils =  Me.imports.utils;
const _ = Gettext.gettext;

// This class handles the core functionality of all the menu layouts.
var BaseLayout = class { // eslint-disable-line no-unused-vars
    constructor(menuButton) {
        this.menuButton = menuButton;
        this._settings = menuButton._settings;
        this.mainBox = menuButton.mainBox;
        this.contextMenuManager = menuButton.contextMenuManager;
        this.subMenuManager = menuButton.subMenuManager;
        this.arcMenu = menuButton.arcMenu;
        this.section = menuButton.section;
        this.isRunning = true;
        this._focusChild = null;
        this.shouldLoadFavorites = true;
        this.systemActions = new SystemActions.getDefault();

        this._mainBoxKeyPressId = this.mainBox.connect('key-press-event', this._onMainBoxKeyPress.bind(this));

        this._tree = new GMenu.Tree({ menu_basename: 'applications.menu' });
        this._treeChangedId = this._tree.connect('changed', () => {
            this.needsReload = true;
        });

        // NOTE(210527, sohee) : IMS260589
        // In the case of google-chrome or vm-helper, GMenu.tree does not send "changed" signal
        // because the binary is created later in the /usr/bin path than other apps.
        this._installedChangedId = appSys.connect('installed-changed', () => {
            this.needsReload = true;
        });

        this.mainBox.vertical = false;
        this.createLayout();
        this.updateStyle();
    }

    reload() {
        let isReload = true;
        this.destroy(isReload);
        this.createLayout();
        this.updateStyle();
    }

    updateStyle() {
        if (this.actionsBox) {
            this.actionsBox.get_children().forEach(actor => {
                if (actor instanceof St.Button)
                    actor.remove_style_class_name('arc-menu-action');

            });
        }
    }

    loadCategories(categoryWidget = MW.CategoryMenuItem, isIconGrid = false) {
        this.applicationsMap = new Map();
        this._tree.load_sync();
        let root = this._tree.get_root_directory();
        let iter = root.iter();
        let nextType;
        while ((nextType = iter.next()) !== GMenu.TreeItemType.INVALID) {
            if (nextType === GMenu.TreeItemType.DIRECTORY) {
                let dir = iter.get_directory();
                if (!dir.get_is_nodisplay()) {
                    let categoryId = dir.get_menu_id();
                    let categoryMenuItem = new categoryWidget(this, dir, isIconGrid);
                    this.categoryDirectories.set(categoryId, categoryMenuItem);
                    let foundRecentlyInstallApp = this._loadCategory(isIconGrid, categoryId, dir);
                    categoryMenuItem.setRecentlyInstalledIndicator(foundRecentlyInstallApp);
                    // Sort the App List Alphabetically
                    categoryMenuItem.appList.sort((a, b) => {
                        return a.get_name().toLowerCase() > b.get_name().toLowerCase();
                    });
                }
            }
        }
        let categoryMenuItem = this.categoryDirectories.get(Constants.CategoryType.ALL_PROGRAMS);
        if (categoryMenuItem) {
            let appList = [];
            this.applicationsMap.forEach((value, key) => {
                appList.push(key);
                // Show Recently Installed Indicator on All Programs category
                if (value.isRecentlyInstalled && !categoryMenuItem.isRecentlyInstalled)
                    categoryMenuItem.setRecentlyInstalledIndicator(true);
            });
            appList.sort((a, b) => {
                return a.get_name().toLowerCase() > b.get_name().toLowerCase();
            });
            categoryMenuItem.appList = appList;
        }

        categoryMenuItem = this.categoryDirectories.get(Constants.CategoryType.PINNED_APPS);
        if (categoryMenuItem) {
            categoryMenuItem.appList = categoryMenuItem.appList.concat(this.favoritesArray);
            for (let favoriteMenuItem of categoryMenuItem.appList)
                favoriteMenuItem._updateIcon();

        }
    }

    _loadCategory(isIconGrid, categoryId, dir, submenuItem) {
        let iter = dir.iter();
        let nextType;
        let foundRecentlyInstallApp = false;
        while ((nextType = iter.next()) !== GMenu.TreeItemType.INVALID) {
            if (nextType === GMenu.TreeItemType.ENTRY) {
                let entry = iter.get_entry();
                let id;
                try {
                    id = entry.get_desktop_file_id();
                } catch (e) {
                    continue;
                }
                let app = appSys.lookup_app(id);
                if (!app)
                    app = new Shell.App({ app_info: entry.get_app_info() });
                if (app.get_app_info().should_show()) {
                    let item = this.applicationsMap.get(app);
                    if (!item)
                        item = new MW.ApplicationMenuItem(this, app, isIconGrid);


                    if (item.isRecentlyInstalled)
                        foundRecentlyInstallApp = true;

                    if (!submenuItem) {
                        let categoryMenuItem = this.categoryDirectories.get(categoryId);
                        categoryMenuItem.appList.push(app);
                        this.applicationsMap.set(app, item);
                    } else {
                        submenuItem.applicationsMap.set(app, item);
                    }
                }
            } else if (nextType === GMenu.TreeItemType.DIRECTORY) {
                let subdir = iter.get_directory();
                if (!subdir.get_is_nodisplay()) {
                    let recentlyInstallApp = this._loadCategory(isIconGrid, categoryId, subdir);
                    if (recentlyInstallApp)
                        foundRecentlyInstallApp = true;
                }
            }
        }
        return foundRecentlyInstallApp;
    }

    setRecentlyInstalledIndicator() {
        for (let categoryMenuItem of this.categoryDirectories.values()) {
            categoryMenuItem.setRecentlyInstalledIndicator(false);
            for (let i = 0; i < categoryMenuItem.appList.length; i++) {
                let item = this.applicationsMap.get(categoryMenuItem.appList[i]);
                if (item.isRecentlyInstalled) {
                    categoryMenuItem.setRecentlyInstalledIndicator(true);
                    break;
                }
            }
        }
    }

    loadFavorites() {
        let pinnedApps = this._settings.get_strv('pinned-app-list');
        this.favoritesArray = [];
        for (let i = 0; i < pinnedApps.length; i += 3) {
            let desktopFileId = pinnedApps[i + 2];
            let favoritesMenuItem = new MW.FavoritesMenuItem(this, desktopFileId);
            favoritesMenuItem.connect('saveSettings', () => {
                let array = [];
                for (let j = 0; j < this.favoritesArray.length; j++) {
                    array.push(this.favoritesArray[j]._name);
                    array.push(this.favoritesArray[j]._iconPath);
                    array.push(this.favoritesArray[j]._command);
                }
                this._settings.set_strv('pinned-app-list', array);
            });
            this.favoritesArray.push(favoritesMenuItem);
        }
        let categoryMenuItem = this.categoryDirectories ? this.categoryDirectories.get(Constants.CategoryType.PINNED_APPS) : null;
        if (categoryMenuItem) {
            categoryMenuItem.appList = null;
            categoryMenuItem.appList = [];
            categoryMenuItem.appList = categoryMenuItem.appList.concat(this.favoritesArray);
            for (let favoriteMenuItem of categoryMenuItem.appList)
                favoriteMenuItem._updateIcon();

        }
    }

    _clearActorsFromBox(box) {
        if (!box)
            box = this.allAppsBox;

        let parent = box.get_parent();
        if (parent instanceof St.ScrollView) {
            let scrollBoxAdj = parent.get_vscroll_bar().get_adjustment();
            scrollBoxAdj.set_value(0);
        }
        let actors = box.get_children();
        for (let i = 0; i < actors.length; i++) {
            let actor = actors[i];
            box.remove_actor(actor);
        }
    }

    _displayAppGridList(apps, columns, isFavoriteMenuItem, differentGrid) {
        let count = 0;
        let top = -1;
        let left = 0;
        let grid = differentGrid ? differentGrid : this.grid;
        let activeMenuItemSet = false;
        let rtl = this.mainBox.get_text_direction() === Clutter.TextDirection.RTL;
        for (let i = 0; i < apps.length; i++) {
            let app = apps[i];
            let item;
            let shouldShow = true;

            if (isFavoriteMenuItem) {
                item = app;
                if (!item.shouldShow)
                    shouldShow = false;
            } else {
                item = this.applicationsMap.get(app);
            }

            if (!item) {
                let isIconGrid = true;
                item = new MW.ApplicationMenuItem(this, app, isIconGrid);
                this.applicationsMap.set(app, item);
            }

            if (shouldShow) {
                if (!rtl && count % columns === 0) {
                    top++;
                    left = 0;
                } else if (rtl && left === 0) {
                    top++;
                    left = columns;
                }
                grid.layout_manager.attach(item, left, top, 1, 1);
                if (!rtl)
                    left++;

                else if (rtl)
                    left--;

                count++;

                if (!activeMenuItemSet && !differentGrid) {
                    activeMenuItemSet = true;
                    this.activeMenuItem = item;
                    if (this.arcMenu.isOpen)
                        this.mainBox.grab_key_focus();

                }
            }
        }
    }

    _onMainBoxKeyPress(actor, event) {
        if (event.has_control_modifier())
            return Clutter.EVENT_PROPAGATE;


        let symbol = event.get_key_symbol();
        let direction;

        switch (symbol) {
        case Clutter.KEY_BackSpace:
        case Clutter.KEY_Tab:
        case Clutter.KEY_KP_Tab:
            return Clutter.EVENT_PROPAGATE;
        case Clutter.KEY_Up:
        case Clutter.KEY_Down:
        case Clutter.KEY_Left:
        case Clutter.KEY_Right:
            if (symbol === Clutter.KEY_Down)
                direction = St.DirectionType.DOWN;
            if (symbol === Clutter.KEY_Right)
                direction = St.DirectionType.RIGHT;
            if (symbol === Clutter.KEY_Up)
                direction = St.DirectionType.UP;
            if (symbol === Clutter.KEY_Left)
                direction = St.DirectionType.LEFT;

            if (global.stage.key_focus === this.mainBox) {
                this.activeMenuItem.actor.grab_key_focus();
                return Clutter.EVENT_STOP;
            }
            return actor.navigate_focus(global.stage.key_focus, direction, false);
        case Clutter.KEY_KP_Enter:
        case Clutter.KEY_Return:
        case Clutter.KEY_Escape:
        case Clutter.KEY_Delete:
            return Clutter.EVENT_PROPAGATE;
        default:
            if (event.get_key_unicode()) {
                this.arcMenu.toggle();
                Main.overview.focusSearch(event);
            }
        }
        return Clutter.EVENT_PROPAGATE;
    }

    destroy(isReload) {
        if (this.applicationsMap) {
            this.applicationsMap.forEach(value => {
                if (value && value.needsDestroy)
                    value.destroy();
            });
            this.applicationsMap = null;
        }

        if (this.categoryDirectories) {
            this.categoryDirectories.forEach(value => {
                if (value && value.needsDestroy)
                    value.destroy();
            });
            this.categoryDirectories = null;
        }

        if (this.favoritesArray) {
            for (let i = 0; i < this.favoritesArray.length; i++) {
                if (this.favoritesArray[i] && this.favoritesArray[i].needsDestroy)
                    this.favoritesArray[i].destroy();
            }
            this.favoritesArray = null;
        }

        if (this.recentManager) {
            if (this._recentFilesChangedID) {
                this.recentManager.disconnect(this._recentFilesChangedID);
                this._recentFilesChangedID = null;
            }
        }

        if (!isReload) {
            if (this._mainBoxKeyPressId > 0) {
                this.mainBox.disconnect(this._mainBoxKeyPressId);
                this._mainBoxKeyPressId = 0;
            }

            if (this._treeChangedId > 0) {
                this._tree.disconnect(this._treeChangedId);
                this._treeChangedId = 0;
                this._tree = null;
            }

            if (this._installedChangedId > 0)
                this._installedChangedId = 0;


            this.isRunning = false;
        }

        this.mainBox.get_children().forEach(child => {
            if (child && child !== undefined && child !== null)
                child.destroy();
        });
    }

    _createScrollBox(params) {
        let scrollBox = new MW.ScrollView(params);
        let panAction = new Clutter.PanAction({ interpolate: false });
        panAction.connect('pan', action => {
            this._blockActivateEvent = true;
            this.onPan(action, scrollBox);
        });
        panAction.connect('gesture-cancel', action => this.onPanEnd(action, scrollBox));
        panAction.connect('gesture-end', action => this.onPanEnd(action, scrollBox));
        scrollBox.add_action(panAction);

        scrollBox.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        scrollBox.clip_to_allocation = true;

        return scrollBox;
    }

    _keyFocusIn(actor) {
        if (this._focusChild === actor)
            return;
        this._focusChild = actor;
        Utils.ensureActorVisibleInScrollView(actor);
    }

    onPan(action, scrollbox) {
        let [dist_, dx_, dy] = action.get_motion_delta(0);
        let adjustment = scrollbox.get_vscroll_bar().get_adjustment();
        adjustment.value -=  dy;
        return false;
    }

    onPanEnd(action, scrollbox) {
        let velocity = -action.get_velocity(0)[2];
        let adjustment = scrollbox.get_vscroll_bar().get_adjustment();
        let endPanValue = adjustment.value + velocity * 2;
        adjustment.value = endPanValue;
    }
};
