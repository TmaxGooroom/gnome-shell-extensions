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

const { Clutter, GLib, GObject, Shell, St } = imports.gi;
const appSys = Shell.AppSystem.get_default();
const Convenience = Me.imports.convenience;
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const Main = imports.ui.main;
const MW = Me.imports.menuWidgets;
const MenuLayout = Me.imports.menuLayout;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Utils = Me.imports.utils;
const _ = Gettext.gettext;

var DASH_TO_PANEL_UUID = 'dash-to-panel@jderose9.github.com';

var MenuButton = GObject.registerClass(class ArcMenuButton extends PanelMenu.Button { // eslint-disable-line no-unused-vars
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

        // Create Main Menus - ArcMenu and arcMenu's context menu
        this.arcMenu = new ArcMenu(this, 0.5, St.Side.TOP);
        this.arcMenu.connect('open-state-changed', this._onOpenStateChanged.bind(this));

        this.menuManager = new PopupMenu.PopupMenuManager(menuManagerParent);
        this.menuManager.addMenu(this.arcMenu);

        // Context Menus for applications and other menu items
        this.contextMenuManager = new PopupMenu.PopupMenuManager(this);
        this.contextMenuManager._onMenuSourceEnter = menu => {
            if (this.contextMenuManager.activeMenu && this.contextMenuManager.activeMenu !== menu)
                return Clutter.EVENT_STOP;

            return Clutter.EVENT_PROPAGATE;
        };

        // Sub Menu Manager - Control all other popup menus
        this.subMenuManager = new PopupMenu.PopupMenuManager(this);
        this.menuButtonWidget = new MW.MenuButtonWidget();
        this.x_expand = false;
        this.y_expand = false;

        // Add Menu Button Widget to Button
        this.container.style = 'width: 50px;';
        this.remove_style_class_name('panel-button');
        this.add_actor(this.menuButtonWidget.actor);
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
                this.updateArrowSide(St.Side.TOP);
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

        this._appList = this.listAllApps();
        // Update Categories on 'installed-changed' event-------------------------------------
        this._installedChangedId = appSys.connect('installed-changed', () => {
            this._appList = this.listAllApps();
        });
        this._setMenuPositionAlignment();

        // Create Basic Layout
        this.createLayoutID = GLib.timeout_add(0, 100, () => {
            this.createMenuLayout();
            this.createLayoutID = null;
            return GLib.SOURCE_REMOVE;
        });
    }

    /*
    setDragApp() {
    }

    handleDragOver(source, _actor, _x, _y, _time) {
        return imports.ui.dnd.DragMotionResult.NO_DROP;
    }

    acceptDrop(source, _actor, _x, _y, _time) {
        return false;
    }
    */

    getArrowSide() {
        let monitorIndex = Main.layoutManager.findIndexForActor(this.menuButtonWidget.actor);
        let side = Utils.getDashToPanelPosition(this.extensionSettingsItem, monitorIndex);
        return side;
    }

    syncWithDashToPanel() {
        this.extensionSettingsItem = Convenience.getDTPSettings('org.gnome.shell.extensions.dash-to-panel', this.dashToPanel);
        //     let monitorIndex = Main.layoutManager.findIndexForActor(this.menuButtonWidget.actor);
        //     let side = Utils.getDashToPanelPosition(this.extensionSettingsItem, monitorIndex);
        this.updateArrowSide(this.getArrowSide());
        let dashToPanelPositionSettings = 'panel-positions';
        try {
            this.extensionSettingsItem.get_string(dashToPanelPositionSettings);
        } catch (e) {
            dashToPanelPositionSettings = 'panel-position';
        }
        this.dtpPostionChangedID = this.extensionSettingsItem.connect(`changed::${dashToPanelPositionSettings}`, () => {
            //           let monitorIndex = Main.layoutManager.findIndexForActor(this.menuButtonWidget.actor);
            //           let side = Utils.getDashToPanelPosition(this.extensionSettingsItem, monitorIndex);
            this.updateArrowSide(this.getArrowSide());
        });
        if (global.dashToPanel) {
            global.dashToPanel.panels.forEach(p => {
                if (p.panel === this._panel)
                    this.dtpPanel = p;

            });
        }
    }

    listAllApps() {
        let appList = appSys.get_installed().filter(appInfo => {
            try {
                appInfo.get_id(); // catch invalid file encodings
            } catch (e) {
                return false;
            }
            return appInfo.should_show();
        });
        return appList.map(app => app.get_id());
    }

    createMenuLayout() {
        this.section = new PopupMenu.PopupMenuSection();
        this.arcMenu.addMenuItem(this.section);
        this.mainBox = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
        });
        this.mainBox._delegate = this.mainBox;

        let monitorIndex = Main.layoutManager.findIndexForActor(this.menuButtonWidget.actor);
        let scaleFactor = Main.layoutManager.monitors[monitorIndex].geometry_scale;
        let monitorWorkArea = Main.layoutManager.getWorkAreaForMonitor(monitorIndex);
        let height = Math.round(650 / scaleFactor);

        if (height > monitorWorkArea.height)
            height = monitorWorkArea.height * 8 / 10;


        this.mainBox.style = `height: ${height}px`;
        this.section.actor.add_actor(this.mainBox);
        this.MenuLayout = new MenuLayout.createMenu(this);
        this._setMenuPositionAlignment();
        this.updateStyle();
    }

    _setMenuPositionAlignment() {
        if (this.dashToPanel && this.dashToPanel.stateObj) {
            let monitorIndex = Main.layoutManager.findIndexForActor(this.menuButtonWidget.actor);
            let side = Utils.getDashToPanelPosition(this.extensionSettingsItem, monitorIndex);
            this.updateArrowSide(side, false);
        } else {
            this.updateArrowSide(St.Side.TOP, false);
        }
    }

    updateArrowSide(side, setAlignment = true) {
        let arrowAlignment;
        this.menuButtonWidget.updateArrowIconSide(side);
        if (side === St.Side.RIGHT || side === St.Side.LEFT)
            arrowAlignment = 1.0;
        else
            arrowAlignment = 0.5;

        this.arcMenu._arrowSide = side;
        this.arcMenu._boxPointer._arrowSide = side;
        this.arcMenu._boxPointer._userArrowSide = side;
        this.arcMenu._boxPointer.setSourceAlignment(0.5);
        this.arcMenu._arrowAlignment = arrowAlignment;
        this.arcMenu._boxPointer._border.queue_repaint();

        if (setAlignment)
            this._setMenuPositionAlignment();
    }

    updateStyle() {
        this.arcMenu.actor.style_class = 'popup-menu-boxpointer';
        this.arcMenu.actor.add_style_class_name('popup-menu');

        this.arcMenu.actor.style = '-arrow-base:0px; -arrow-rise:0px; -boxpointer-gap: 0px; -arrow-border-radius: 20px; -arrow-border-width: 0px;';
        this.arcMenu.box.style = 'margin:0px; padding: 0px;';

        if (this.MenuLayout)
            this.MenuLayout.updateStyle();
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

        if (this.dtpPanel && !this.arcMenu.isOpen) {
            if (this.dtpPanel.intellihide && this.dtpPanel.intellihide.enabled) {
                this.dtpPanel.intellihide._revealPanel(true);
            } else if (!this.dtpPanel.panelBox.visible) {
                this.dtpPanel.panelBox.visible = true;
                this.dtpNeedsHiding = true;
            }
        } else if (this._panel === Main.panel && !Main.layoutManager.panelBox.visible && !this.arcMenu.isOpen) {
            Main.layoutManager.panelBox.visible = true;
            this.mainPanelNeedsHiding = true;
        }

        this.arcMenu.toggle();
        if (this.arcMenu.isOpen)
            this.mainBox.grab_key_focus();

    }

    getActiveMenu() {
        if (this.contextMenuManager.activeMenu)
            return this.contextMenuManager.activeMenu;
        else if (this.subMenuManager.activeMenu)
            return this.subMenuManager.activeMenu;
        else if (this.arcMenu.isOpen)
            return this.arcMenu;
        else
            return null;
    }

    updateHeight() {
        let monitorIndex = Main.layoutManager.findIndexForActor(this.menuButtonWidget.actor);
        let scaleFactor = Main.layoutManager.monitors[monitorIndex].geometry_scale;
        let monitorWorkArea = Main.layoutManager.getWorkAreaForMonitor(monitorIndex);
        let height = Math.round(650 / scaleFactor);

        if (height > monitorWorkArea.height)
            height = monitorWorkArea.height * 8 / 10;


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
        if (this.reloadID) {
            GLib.source_remove(this.reloadID);
            this.reloadID = null;
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
        if (this.dtdPostionChangedID && this._panel._settings) {
            this._panel._settings.disconnect(this.dtdPostionChangedID);
            this.dtdPostionChangedID = null;
        }
        if (this._installedChangedId) {
            appSys.disconnect(this._installedChangedId);
            this._installedChangedId = null;
        }
        if (this.arcMenu)
            this.arcMenu.destroy();

        super._onDestroy();
    }

    _loadPinnedShortcuts() {
        if (this.MenuLayout)
            this.MenuLayout.loadPinnedShortcuts();
    }

    updateLocation() {
        if (this.MenuLayout)
            this.MenuLayout.updateLocation();
    }

    _loadCategories() {
        if (this.MenuLayout)
            this.MenuLayout.loadCategories();
    }

    _clearApplicationsBox() {
        if (this.MenuLayout)
            this.MenuLayout.clearApplicationsBox();
    }

    _displayCategories() {
        if (this.MenuLayout)
            this.MenuLayout.displayCategories();
    }

    _displayFavorites() {
        if (this.MenuLayout)
            this.MenuLayout.displayFavorites();
    }

    _loadFavorites() {
        if (this.MenuLayout)
            this.MenuLayout.loadFavorites();
    }

    _displayAllApps() {
        if (this.MenuLayout)
            this.MenuLayout.displayAllApps();
    }

    selectCategory(dir) {
        if (this.MenuLayout)
            this.MenuLayout.selectCategory(dir);
    }

    _displayGnomeFavorites() {
        if (this.MenuLayout)
            this.MenuLayout.displayGnomeFavorites();
    }

    scrollToButton(button) {
        if (this.MenuLayout)
            this.MenuLayout.scrollToButton(button);
    }

    reload() {
        if (this.MenuLayout)
            this.MenuLayout.needsReload = true;
    }

    getShouldLoadFavorites() {
        if (this.MenuLayout)
            return this.MenuLayout.shouldLoadFavorites;
    }

    setDefaultMenuView() {
        if (this.MenuLayout)
            this.MenuLayout.setDefaultMenuView();
    }

    _onOpenStateChanged(menu, open) {
        if (open) {
            this.menuButtonWidget.setActiveStylePseudoClass(true);
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
            if (!this.arcMenu.isOpen) {
                this.menuButtonWidget.setActiveStylePseudoClass(false);
                this.remove_style_pseudo_class('active');
            }
        }
    }
});

var ArcMenu = class ArcMenu extends PopupMenu.PopupMenu {
    constructor(sourceActor, arrowAlignment, arrowSide) {
        super(sourceActor, arrowAlignment, arrowSide);
        this._settings = sourceActor._settings;
        this._menuButton = sourceActor;
        Main.uiGroup.add_actor(this.actor);
        this.actor.hide();
        this._menuCloseID = this.connect('menu-closed', () => this._onCloseEvent());
        this.connect('destroy', () => this._onDestroy());
    }

    open(animation) {
        if (this._menuButton.dtpPanel && !this._menuButton.dtpNeedsRelease) {
            this._menuButton.dtpNeedsRelease = true;
            if (this._menuButton.dtpPanel.intellihide)
                this._menuButton.dtpPanel.intellihide.revealAndHold(2);
        }
        this._onOpenEvent();
        super.open(animation);
    }

    close(animation) {
        if (this._menuButton.contextMenuManager.activeMenu)
            this._menuButton.contextMenuManager.activeMenu.toggle();
        if (this._menuButton.subMenuManager.activeMenu)
            this._menuButton.subMenuManager.activeMenu.toggle();
        super.close(animation);
    }

    _onOpenEvent() {
        this._menuButton.arcMenu.actor._muteInput = false;
        if (this._menuButton.MenuLayout && this._menuButton.MenuLayout.needsReload) {
            this._menuButton.MenuLayout.reload();
            this._menuButton.MenuLayout.needsReload = false;
            this._menuButton.setDefaultMenuView();
        }
        this._menuButton.MenuLayout.displayRecentlyInstalledApps();
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
