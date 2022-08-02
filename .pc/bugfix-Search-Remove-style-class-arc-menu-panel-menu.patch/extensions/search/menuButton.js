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

const { Clutter, GLib, GObject, St } = imports.gi;
const DBusUtils = Me.imports.dbusUtils;
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const SearchMenuLayout = Me.imports.searchMenuLayout;
const _ = Gettext.gettext;

var DASH_TO_PANEL_UUID = 'dash-to-panel@tos-shell-extensions';

var MenuButton = GObject.registerClass(class SearchMenuMenuButton extends PanelMenu.Button { // eslint-disable-line no-unused-vars
    _init(settings, panel) {
        super._init(0.5, null, true);
        this._settings = settings;
        this._panel = panel;
        this.menu.destroy();
        this.add_style_class_name('arc-menu-panel-menu');
        this.tooltipShowing = false;
        this.tooltipHidingID = null;
        this.tooltipShowingID = null;

        let menuManagerParent = this._panel;

        // Create Main Menus - SearchMenu
        this.searchMenu = new SearchMenu(this, 0.5, St.Side.TOP);
        this.searchMenu.connect('open-state-changed', this._onOpenStateChanged.bind(this));

        this.menuManager = new PopupMenu.PopupMenuManager(menuManagerParent);
        this.menuManager.addMenu(this.searchMenu);

        // Context Menus for applications and other menu items
        this.contextMenuManager = new PopupMenu.PopupMenuManager(this);
        this.contextMenuManager._onMenuSourceEnter = menu => {
            if (this.contextMenuManager.activeMenu && this.contextMenuManager.activeMenu !== menu)
                return Clutter.EVENT_STOP;

            return Clutter.EVENT_PROPAGATE;
        };

        // Sub Menu Manager - Control all other popup menus
        this.subMenuManager = new PopupMenu.PopupMenuManager(this);
        this.x_expand = false;
        this.y_expand = false;
    }

    initiate() {
        // Dash to Panel Integration
        this.dashToPanel = Main.extensionManager.lookup(DASH_TO_PANEL_UUID);
        this.extensionChangedId = Main.extensionManager.connect('extension-state-changed', (data, extension) => {
            if (extension.uuid === DASH_TO_PANEL_UUID && extension.state === 1) {
                this.dashToPanel = Main.extensionManager.lookup(DASH_TO_PANEL_UUID);
                this.syncWithDashToPanel();
            }
            if (extension.uuid === DASH_TO_PANEL_UUID && extension.state === 2) {
                this.dashToPanel = null;
                if (this.dtpPostionChangedID > 0 && this.extensionSettingsItem) {
                    this.extensionSettingsItem.disconnect(this.dtpPostionChangedID);
                    this.dtpPostionChangedID = 0;
                }
            }
        });
        if (this.dashToPanel && this.dashToPanel.stateObj)
            this.syncWithDashToPanel();


        this._iconThemeChangedId = St.TextureCache.get_default().connect('icon-theme-changed', this.reload.bind(this));
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            this.updateHeight();
        });

        // Create Basic Layout
        this.createLayoutID = GLib.timeout_add(0, 100, () => {
            this.createMenuLayout();
            this.createLayoutID = null;
            return GLib.SOURCE_REMOVE;
        });
    }

    syncWithDashToPanel() {
        if (global.dashToPanel) {
            global.dashToPanel.panels.forEach(p => {
                if (p.panel === this._panel)
                    this.dtpPanel = p;

            });
        }
    }

    createMenuLayout() {
        this.section = new PopupMenu.PopupMenuSection();
        this.searchMenu.addMenuItem(this.section);
        this.mainBox = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
        });
        this.mainBox._delegate = this.mainBox;

        let monitorIndex = Main.layoutManager.findIndexForActor(this.actor);
        let scaleFactor = Main.layoutManager.monitors[monitorIndex].geometry_scale;
        let monitorWorkArea = Main.layoutManager.getWorkAreaForMonitor(monitorIndex);
        let height = Math.round(550 / scaleFactor);
        if (height > monitorWorkArea.height)
            height = monitorWorkArea.height * 8 / 10;


        this.mainBox.style = `height: ${height}px; background-color:rgb(29, 29, 29); border-radius:14px 20px 20px 14px; box-shadow: 0px 0px 12px 1px rgba(0, 0, 0, 0.5); margin-top: 10px;`;
        this.section.actor.add_actor(this.mainBox);
        this.MenuLayout = new SearchMenuLayout.createMenu(this);
        this.add_actor(this.MenuLayout.searchBox.actor);
        this.updateStyle();
    }

    updateStyle() {
        this.searchMenu.actor.remove_style_class_name('popup-menu-boxpointer');
        this.searchMenu.actor.style = '-arrow-base:0px; -arrow-rise:0px; -boxpointer-gap: 0px; -arrow-border-radius: 14px;';
        this.searchMenu.box.style = 'margin:0px; padding: 0px;';

        if (this.MenuLayout)
            this.MenuLayout.updateStyle();
    }

    updateSearch() {
        if (this.MenuLayout)
            this.MenuLayout.updateSearch();
    }

    setSensitive(sensitive) {
        this.reactive = sensitive;
        this.can_focus = sensitive;
        this.track_hover = sensitive;
    }

    vfunc_event(event) {
        if (event.type() === Clutter.EventType.BUTTON_PRESS) {
            if (event.get_button() === 1)
                this.toggleMenu();

        } else if (event.type() === Clutter.EventType.TOUCH_BEGIN) {
            this.toggleMenu();
        }
        return Clutter.EVENT_PROPAGATE;
    }

    toggleMenu() {
        if (this.contextMenuManager.activeMenu)
            this.contextMenuManager.activeMenu.toggle();
        if (this.subMenuManager.activeMenu)
            this.subMenuManager.activeMenu.toggle();

        if (this.dtpPanel && !this.searchMenu.isOpen) {
            if (this.dtpPanel.intellihide && this.dtpPanel.intellihide.enabled) {
                this.dtpPanel.intellihide._revealPanel(true);
            } else if (!this.dtpPanel.panelBox.visible) {
                this.dtpPanel.panelBox.visible = true;
                this.dtpNeedsHiding = true;
            }
        } else if (this._panel === Main.panel && !Main.layoutManager.panelBox.visible && !this.searchMenu.isOpen) {
            Main.layoutManager.panelBox.visible = true;
            this.mainPanelNeedsHiding = true;
        }

        //           this.searchMenu.toggle();

        if (this.searchMenu.isOpen)
            this.mainBox.grab_key_focus();

    }

    getActiveMenu() {
        if (this.contextMenuManager.activeMenu)
            return this.contextMenuManager.activeMenu;
        else if (this.subMenuManager.activeMenu)
            return this.subMenuManager.activeMenu;
        else if (this.searchMenu.isOpen)
            return this.searchMenu;
        else
            return null;
    }

    updateHeight() {
        let monitorIndex = Main.layoutManager.findIndexForActor(this.actor);
        let scaleFactor = Main.layoutManager.monitors[monitorIndex].geometry_scale;
        let monitorWorkArea = Main.layoutManager.getWorkAreaForMonitor(monitorIndex);
        let height = Math.round(550 / scaleFactor);

        if (height > monitorWorkArea.height)
            height = monitorWorkArea.height * 8 / 10;


        if (this.MenuLayout)
            this.mainBox.style = `height: ${height}px`;

        this.reload();
    }

    _onDestroy() {
        if (this._iconThemeChangedId) {
            St.TextureCache.get_default().disconnect(this._iconThemeChangedId);
            this._iconThemeChangedId = null;
        }
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = null;
        }
        if (this.createLayoutID) {
            GLib.source_remove(this.createLayoutID);
            this.createLayoutID = null;
        }
        if (this.tooltipShowingID) {
            GLib.source_remove(this.tooltipShowingID);
            this.tooltipShowingID = null;
        }
        if (this.tooltipHidingID) {
            GLib.source_remove(this.tooltipHidingID);
            this.tooltipHidingID = null;
        }
        if (this.MenuLayout)
            this.MenuLayout.destroy();

        if (this.extensionChangedId) {
            Main.extensionManager.disconnect(this.extensionChangedId);
            this.extensionChangedId = null;
        }
        if (this.dtpPostionChangedID && this.extensionSettingsItem) {
            this.extensionSettingsItem.disconnect(this.dtpPostionChangedID);
            this.dtpPostionChangedID = null;
        }
        if (this.searchMenu)
            this.searchMenu.destroy();

        super._onDestroy();
    }

    reload() {
        if (this.MenuLayout)
            this.MenuLayout.needsReload = true;
    }

    resetSearch() {
        if (this.MenuLayout)
            this.MenuLayout.resetSearch();
    }

    setDefaultMenuView() {
        if (this.MenuLayout)
            this.MenuLayout.setDefaultMenuView();
    }

    _onOpenStateChanged(menu, open) {
        if (open) {
            this.add_style_pseudo_class('active');

            if (Main.panel.menuManager && Main.panel.menuManager.activeMenu)
                Main.panel.menuManager.activeMenu.toggle();
        } else {
            if (this.dtpPanel && this.dtpNeedsRelease) {
                this.dtpNeedsRelease = false;
                if (this.dtpPanel.intellihide)
                    this.dtpPanel.intellihide.release(2);

            }
            if (this.dtpPanel && this.dtpNeedsHiding) {
                this.dtpNeedsHiding = false;
                this.dtpPanel.panelBox.visible = false;
            }
            if (this.mainPanelNeedsHiding) {
                Main.layoutManager.panelBox.visible = false;
                this.mainPanelNeedsHiding = false;
            }
            if (!this.searchMenu.isOpen)
                this.remove_style_pseudo_class('active');

        }
    }
});

var SearchMenu = class SearchMenu extends PopupMenu.PopupMenu {
    constructor(sourceActor, arrowAlignment, arrowSide) {
        super(sourceActor, arrowAlignment, arrowSide);
        this._settings = sourceActor._settings;
        this._menuButton = sourceActor;
        Main.uiGroup.add_actor(this.actor);
        this.actor.hide();
        this._menuCloseID = this.connect('menu-closed', () => this._onCloseEvent());
        this.connect('destroy', () => this._onDestroy());

        DBusUtils.init();
    }

    open(animation) {
        if (this._menuButton.dtpPanel && !this._menuButton.dtpNeedsRelease) {
            this._menuButton.dtpNeedsRelease = true;
            if (this._menuButton.dtpPanel.intellihide)
                this._menuButton.dtpPanel.intellihide.revealAndHold(2);

        }
        this._onOpenEvent();
        super.open(animation);

        // Since the super class(PopupMenu) always place its actor at the top of stage,
        // it needs to be manually modified to bring the actor under the keyboard's actor.
        Main.uiGroup.set_child_below_sibling(this.actor, Main.layoutManager.keyboardBox);
    }

    close(animation) {
        if (this._menuButton.contextMenuManager.activeMenu)
            this._menuButton.contextMenuManager.activeMenu.toggle();
        if (this._menuButton.subMenuManager.activeMenu)
            this._menuButton.subMenuManager.activeMenu.toggle();
        super.close(animation);
    }

    _onOpenEvent() {
        this._menuButton.searchMenu.actor._muteInput = false;
        if (this._menuButton.MenuLayout && this._menuButton.MenuLayout.needsReload) {
            this._menuButton.MenuLayout.reload();
            this._menuButton.MenuLayout.needsReload = false;
            this._menuButton.setDefaultMenuView();
        }
    }

    _onCloseEvent() {
        if (this._menuButton.MenuLayout && this._menuButton.MenuLayout.isRunning) {
            if (this._menuButton.MenuLayout.needsReload)
                this._menuButton.MenuLayout.reload();
            this._menuButton.MenuLayout.needsReload = false;
            this._menuButton.setDefaultMenuView();
        }
    }

    _onDestroy() {
        if (this._menuCloseID) {
            this.disconnect(this._menuCloseID);
            this._menuCloseID = null;
        }
    }
};
