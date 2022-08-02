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

// Import Libraries
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { Atk, Clutter, Gio, GLib, GObject, Gtk, Shell, St } = imports.gi;
const AccountsService = imports.gi.AccountsService;
const AppFavorites = imports.ui.appFavorites;
const Constants = Me.imports.constants;
const Dash = imports.ui.dash;
const DND = imports.ui.dnd;
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Signals = imports.signals;
const Util = imports.misc.util;
const Utils =  Me.imports.utils;
const _ = Gettext.gettext;

const SWITCHEROO_BUS_NAME = 'net.hadess.SwitcherooControl';
const SWITCHEROO_OBJECT_PATH = '/net/hadess/SwitcherooControl';

const SwitcherooProxyInterface = '<node> \
<interface name="net.hadess.SwitcherooControl"> \
  <property name="HasDualGpu" type="b" access="read"/> \
  <property name="NumGPUs" type="u" access="read"/> \
  <property name="GPUs" type="aa{sv}" access="read"/> \
</interface> \
</node>';

const SwitcherooProxy = Gio.DBusProxy.makeProxyWrapper(SwitcherooProxyInterface);

// Menu Size variables
const MEDIUM_ICON_SIZE = 25;
const INDICATOR_ICON_SIZE = 18;
const SMALL_ICON_SIZE = 16;
const USER_AVATAR_SIZE = 28;

var ApplicationContextMenu = class ArcMenuApplicationContextMenu extends PopupMenu.PopupMenu {
    constructor(actor, app, menuLayout) {
        super(actor, 0.0, St.Side.TOP);
        this._menuLayout = menuLayout;
        this._settings = menuLayout._settings;
        this._menuButton = menuLayout.menuButton;
        this._app = app;
        this._boxPointer.setSourceAlignment(.20);
        this._boxPointer._border.queue_repaint();
        this.blockSourceEvents = true;
        this.discreteGpuAvailable = false;
        Gio.DBus.system.watch_name(SWITCHEROO_BUS_NAME,
            Gio.BusNameWatcherFlags.NONE,
            this._switcherooProxyAppeared.bind(this),
            () => {
                this._switcherooProxy = null;
                this._updateDiscreteGpuAvailable();
            });
        Main.uiGroup.add_actor(this.actor);
        this._menuLayout.contextMenuManager.addMenu(this);
    }

    centerBoxPointerPosition() {
        this._boxPointer.setSourceAlignment(.50);
        this._arrowAlignment = .5;
        this._boxPointer._border.queue_repaint();
    }

    rightBoxPointerPosition() {
        this._arrowSide = St.Side.LEFT;
        this._boxPointer._arrowSide = St.Side.LEFT;
        this._boxPointer._userArrowSide = St.Side.LEFT;
        this._boxPointer.setSourceAlignment(.50);
        this._arrowAlignment = .5;
        this._boxPointer._border.queue_repaint();
    }

    set isPinnedApp(isPinnedApp) {
        this._isPinnedApp = isPinnedApp;
    }

    set path(path) {
        this._path = path;
    }

    _updateDiscreteGpuAvailable() {
        if (!this._switcherooProxy)
            this.discreteGpuAvailable = false;
        else
            this.discreteGpuAvailable = this._switcherooProxy.HasDualGpu;
    }

    _switcherooProxyAppeared() {
        this._switcherooProxy = new SwitcherooProxy(Gio.DBus.system, SWITCHEROO_BUS_NAME, SWITCHEROO_OBJECT_PATH,
            (proxy, error) => {
                if (error) {
                    log(error.message);
                    return;
                }
                this._updateDiscreteGpuAvailable();
            });
    }

    closeMenus() {
        this.close();
        this._menuLayout.arcMenu.toggle();
    }

    open(animate) {
        if (this._menuButton.tooltipShowingID) {
            GLib.source_remove(this._menuButton.tooltipShowingID);
            this._menuButton.tooltipShowingID = null;
            this._menuButton.tooltipShowing = false;
        }
        if (this.sourceActor.tooltip) {
            this.sourceActor.tooltip.hide();
            this._menuButton.tooltipShowing = false;
        }

        super.open(animate);
    }

    close(animate) {
        if (this.isOpen) {
            this.sourceActor.sync_hover();
            super.close(animate);
        }
    }

    redisplay() {
        this.removeAll();
        this.actor.style_class = 'popup-menu-boxpointer';
        this.actor.add_style_class_name('popup-menu');

        if (this._app instanceof Shell.App) {
            if (this._path !== undefined) {
                this._newWindowMenuItem = this._appendMenuItem(_('Open Folder Location'));
                this._newWindowMenuItem.connect('activate', () => {
                    Util.spawnCommandLine(`nautilus "${this._path}"`);
                    this.emit('activate-window', null);
                    this.closeMenus();
                });
            } else {
                this.appInfo = this._app.get_app_info();
                let actions = this.appInfo.list_actions();

                let windows = this._app.get_windows().filter(
                    w => !w.skip_taskbar
                );

                if (windows.length > 0) {
                    let item = new PopupMenu.PopupMenuItem(_('Current Windows:'), { reactive: false, can_focus: false });
                    item.actor.add_style_class_name('inactive');
                    this.addMenuItem(item);
                }

                windows.forEach(window => {
                    let title = window.title ? window.title
                        : this._app.get_name();
                    let item = this._appendMenuItem(title);
                    item.connect('activate', () => {
                        this.closeMenus();
                        this.emit('activate-window', window);
                        Main.activateWindow(window);
                    });
                });
                if (!this._app.is_window_backed()) {
                    this._appendSeparator();
                    if (this._app.can_open_new_window() && !actions.includes('new-window')) {
                        this._newWindowMenuItem = this._appendMenuItem(_('New Window'));
                        this._newWindowMenuItem.connect('activate', () => {
                            this.closeMenus();
                            this._app.open_new_window(-1);
                            this.emit('activate-window', null);
                        });
                    }
                    if (this.discreteGpuAvailable &&
                        this._app.state === Shell.AppState.STOPPED &&
                        !actions.includes('activate-discrete-gpu')) {
                        this._onDiscreteGpuMenuItem = this._appendMenuItem(_('Launch using Dedicated Graphics Card'));
                        this._onDiscreteGpuMenuItem.connect('activate', () => {
                            this.closeMenus();
                            this._app.launch(0, -1, true);
                            this.emit('activate-window', null);
                        });
                    }

                    for (let i = 0; i < actions.length; i++) {
                        let action = actions[i];
                        let item;
                        if (action === 'empty-trash-inactive') {
                            item = new PopupMenu.PopupMenuItem(this.appInfo.get_action_name(action), { reactive: false, can_focus: false });
                            item.actor.add_style_class_name('inactive');
                            this._appendSeparator();
                            this.addMenuItem(item);
                        } else if (action === 'empty-trash') {
                            this._appendSeparator();
                            item = this._appendMenuItem(this.appInfo.get_action_name(action));
                        } else {
                            item = this._appendMenuItem(this.appInfo.get_action_name(action));
                        }

                        item.connect('activate', (emitter, event) => {
                            this.closeMenus();
                            this._app.launch_action(action, event.get_time(), -1);
                            this.emit('activate-window', null);
                        });
                    }

                    // If Trash Can, we don't want to add the rest of the entries below.
                    if (this.appInfo.get_string('Id') === 'ArcMenu_Trash')
                        return false;

                    let desktopIcons = Main.extensionManager.lookup('desktop-icons@csoriano');
                    let desktopIconsNG = Main.extensionManager.lookup('ding@rastersoft.com');
                    if (desktopIcons && desktopIcons.stateObj || desktopIconsNG && desktopIconsNG.stateObj) {
                        this._appendSeparator();
                        let fileSource = this.appInfo.get_filename();
                        let fileDestination = GLib.get_user_special_dir(imports.gi.GLib.UserDirectory.DIRECTORY_DESKTOP);
                        let file = Gio.File.new_for_path(`${fileDestination}/${this._app.get_id()}`);
                        let exists = file.query_exists(null);
                        if (exists) {
                            let item = this._appendMenuItem(_('Delete Desktop Shortcut'));
                            item.connect('activate', () => {
                                if (fileSource && fileDestination)
                                    Util.spawnCommandLine(`rm ${fileDestination}/${this._app.get_id()}`);
                                this.close();
                            });
                        } else {
                            let item = this._appendMenuItem(_('Create Desktop Shortcut'));
                            item.connect('activate', () => {
                                if (fileSource && fileDestination)
                                    Util.spawnCommandLine(`cp ${fileSource} ${fileDestination}`);
                                this.close();
                            });
                        }
                    }

                    let canFavorite = global.settings.is_writable('favorite-apps');
                    if (canFavorite) {
                        this._appendSeparator();
                        let isFavorite = AppFavorites.getAppFavorites().isFavorite(this._app.get_id());
                        if (isFavorite) {
                            let item = this._appendMenuItem(_('Remove from Favorites'));
                            item.connect('activate', () => {
                                let favs = AppFavorites.getAppFavorites();
                                favs.removeFavorite(this._app.get_id());
                            });
                        } else {
                            let item = this._appendMenuItem(_('Add to Favorites'));
                            item.connect('activate', () => {
                                let favs = AppFavorites.getAppFavorites();
                                favs.addFavorite(this._app.get_id());
                            });
                        }
                    }

                    let pinnedApps = this._settings.get_strv('pinned-app-list');
                    let pinnedAppID = [];
                    for (let i = 2; i < pinnedApps.length; i += 3)
                        pinnedAppID.push(pinnedApps[i]);

                    let match = pinnedAppID.find(element => {
                        return element === this._app.get_id();
                    });
                    if (match) { // if app is pinned add Unpin
                        let item = new PopupMenu.PopupMenuItem(_('Unpin from ArcMenu'));
                        item.connect('activate', () => {
                            this.close();
                            for (let i = 0; i < pinnedApps.length; i += 3) {
                                if (pinnedApps[i + 2] === this._app.get_id()) {
                                    pinnedApps.splice(i, 3);
                                    this._settings.set_strv('pinned-app-list', pinnedApps);
                                    break;
                                }
                            }
                        });
                        this.addMenuItem(item);
                    } else { // if app is not pinned add pin
                        let item = new PopupMenu.PopupMenuItem(_('Pin to ArcMenu'));
                        item.connect('activate', () => {
                            this.close();
                            pinnedApps.push(this.appInfo.get_display_name());
                            pinnedApps.push('');
                            pinnedApps.push(this._app.get_id());
                            this._settings.set_strv('pinned-app-list', pinnedApps);
                        });
                        this.addMenuItem(item);
                    }

                    if (Shell.AppSystem.get_default().lookup_app('org.gnome.Software.desktop')) {
                        this._appendSeparator();
                        let item = this._appendMenuItem(_('Show Details'));
                        item.connect('activate', () => {
                            let id = this._app.get_id();
                            let args = GLib.Variant.new('(ss)', [id, '']);
                            Gio.DBus.get(Gio.BusType.SESSION, null, (o, res) => {
                                let bus = Gio.DBus.get_finish(res);
                                bus.call('org.gnome.Software',
                                    '/org/gnome/Software',
                                    'org.gtk.Actions', 'Activate',
                                    GLib.Variant.new('(sava{sv})',
                                        ['details', [args], null]),
                                    null, 0, -1, null, null);
                                this.closeMenus();
                            });
                        });
                    }
                }

            }
        } else {  // if pinned custom shortcut add unpin option to menu
            this._appendSeparator();
            let item = new PopupMenu.PopupMenuItem(_('Unpin from ArcMenu'));
            item.connect('activate', () => {
                this.close();
                let pinnedApps = this._settings.get_strv('pinned-app-list');
                for (let i = 0; i < pinnedApps.length; i += 3) {
                    if (pinnedApps[i + 2] === this._app) {
                        pinnedApps.splice(i, 3);
                        this._settings.set_strv('pinned-app-list', pinnedApps);
                        break;
                    }
                }
            });
            this.addMenuItem(item);
        }
    }

    _appendSeparator() {
        let separator = new PopupMenu.PopupSeparatorMenuItem();
        separator.actor.style_class = 'app-right-click-sep';
        separator._separator.style_class = null;
        this.addMenuItem(separator);
    }

    _appendMenuItem(labelText) {
        let item = new PopupMenu.PopupMenuItem(labelText);
        this.addMenuItem(item);
        return item;
    }

    _onKeyPress(actor, event) {
        // Disable toggling the menu by keyboard
        // when it cannot be toggled by pointer
        if (!actor.reactive)
            return Clutter.EVENT_PROPAGATE;

        let navKey;
        switch (this._boxPointer.arrowSide) {
        case St.Side.TOP:
            navKey = Clutter.KEY_Down;
            break;
        case St.Side.BOTTOM:
            navKey = Clutter.KEY_Up;
            break;
        case St.Side.LEFT:
            navKey = Clutter.KEY_Right;
            break;
        case St.Side.RIGHT:
            navKey = Clutter.KEY_Left;
            break;
        }

        let state = event.get_state();

        // if user has a modifier down (except capslock)
        // then don't handle the key press here
        state &= ~Clutter.ModifierType.LOCK_MASK;
        state &= Clutter.ModifierType.MODIFIER_MASK;

        if (state)
            return Clutter.EVENT_PROPAGATE;

        let symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_space || symbol === Clutter.KEY_Return) {
            this.toggle();
            return Clutter.EVENT_STOP;
        } else if (symbol === Clutter.KEY_Escape && this.isOpen) {
            this.close();
            return Clutter.EVENT_STOP;
        } else if (symbol === navKey) {
            if (this.isOpen) {
                this.actor.navigate_focus(null, Gtk.DirectionType.TAB_FORWARD, false);
                return Clutter.EVENT_STOP;
            } else {
                return Clutter.EVENT_PROPAGATE;
            }
        } else {
            return Clutter.EVENT_PROPAGATE;
        }
    }
};

var ScrollView = GObject.registerClass( // eslint-disable-line no-unused-vars
    class ArcMenuScrollView extends St.ScrollView {
        vfunc_style_changed() {
            super.vfunc_style_changed();
            let fade = this.get_effect('fade');
            if (fade)
                fade.set_shader_source(Utils.ScrollViewShader);
        }
    });

var ArcMenuPopupBaseMenuItem = GObject.registerClass({
    Properties: {
        'active': GObject.ParamSpec.boolean('active', 'active', 'active',
            GObject.ParamFlags.READWRITE,
            false),
        'sensitive': GObject.ParamSpec.boolean('sensitive', 'sensitive', 'sensitive',
            GObject.ParamFlags.READWRITE,
            true),
    },
    Signals: {
        'activate': { param_types: [Clutter.Event.$gtype] },
    },

},   class ArcMenuPopupBaseMenuItem extends St.BoxLayout {
    _init(menuLayout, params) {
        params = imports.misc.params.parse(params, {
            reactive: true,
            activate: true,
            hover: true,
            style_class: null,
            can_focus: true,
        });
        super._init({ style_class: 'popup-menu-item',
            reactive: params.reactive,
            track_hover: params.reactive,
            can_focus: params.can_focus,
            accessible_role: Atk.Role.MENU_ITEM });
        this.hasContextMenu = false;
        this._delegate = this;
        this.needsDestroy = true;
        this._menuLayout = menuLayout;
        this.shouldShow = true;
        this._parent = null;
        this._active = false;
        this._activatable = params.reactive && params.activate;
        this._sensitive = true;

        this._ornamentLabel = new St.Label({ style_class: 'popup-menu-ornament' });
        this.add(this._ornamentLabel);

        this.box = new St.BoxLayout();
        this.add(this.box);

        this.box.style = 'spacing: 6px; padding: 0px; margin: 0px;';
        this.box.x_align = Clutter.ActorAlign.FILL;
        this.box.x_expand = true;

        if (!this._activatable)
            this.add_style_class_name('popup-inactive-menu-item');

        if (params.style_class)
            this.add_style_class_name(params.style_class);

        if (params.reactive && params.hover)
            this.bind_property('hover', this, 'active', GObject.BindingFlags.SYNC_CREATE);

        if (params.hover)
            this.actor.connect('notify::hover', this._onHover.bind(this));
        this.actor.connect('destroy', this._onDestroy.bind(this));
    }

    get actor() {
        return this;
    }

    set active(active) {
        let activeChanged = active !== this.active;
        if (activeChanged) {
            this._active = active;
            if (active) {
                this.add_style_class_name('selected');
                this._menuLayout.activeMenuItem = this;
                if (this.can_focus)
                    this.grab_key_focus();
            } else {
                this.remove_style_class_name('selected');
                this.set_style_pseudo_class(null);
            }
            this.notify('active');
        }
    }

    setShouldShow() {
        // If a saved shortcut link is a desktop app, check if currently installed.
        // Do NOT display if application not found.
        if (this._command.endsWith('.desktop') && !Shell.AppSystem.get_default().lookup_app(this._command))
            this.shouldShow = false;

    }

    _onHover() {
        if (this.tooltip === undefined && this.actor.hover && this.label) {
            let description = this.description;
            if (this._app)
                description = this._app.get_description();
            Utils.createTooltip(this._menuLayout, this, this.label, description);
        }
    }

    vfunc_button_press_event() {
        let event = Clutter.get_current_event();
        this.pressed = false;
        if (event.get_button() === 1) {
            this._menuLayout._blockActivateEvent = false;
            this.pressed = true;
            if (this.hasContextMenu)
                this.contextMenuTimeOut();
        } else if (event.get_button() === 3) {
            this.pressed = true;
        }
        this.add_style_pseudo_class('active');
        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_button_release_event() {
        let event = Clutter.get_current_event();
        if (event.get_button() === 1 && !this._menuLayout._blockActivateEvent && this.pressed) {
            this.pressed = false;
            this.activate(event);
            this.remove_style_pseudo_class('active');
        }
        if (event.get_button() === 3 && this.pressed) {
            this.pressed = false;
            if (this.hasContextMenu)
                this.popupContextMenu();
            this.remove_style_pseudo_class('active');
        }
        return Clutter.EVENT_STOP;
    }

    vfunc_key_focus_in() {
        super.vfunc_key_focus_in();
        if (!this.actor.hover)
            this._menuLayout._keyFocusIn(this.actor);
        this.active = true;
    }

    vfunc_key_focus_out() {
        if (this.contextMenu && this.contextMenu.isOpen)
            return;

        super.vfunc_key_focus_out();
        this.active = false;
    }

    activate(event) {
        this.emit('activate', event);
    }

    vfunc_key_press_event(keyEvent) {
        if (!this._activatable)
            return super.vfunc_key_press_event(keyEvent);

        let state = keyEvent.modifier_state;

        // if user has a modifier down (except capslock and numlock)
        // then don't handle the key press here
        state &= ~Clutter.ModifierType.LOCK_MASK;
        state &= ~Clutter.ModifierType.MOD2_MASK;
        state &= Clutter.ModifierType.MODIFIER_MASK;

        if (state)
            return Clutter.EVENT_PROPAGATE;

        let symbol = keyEvent.keyval;
        if (symbol === Clutter.KEY_space || symbol === Clutter.KEY_Return) {
            this.activate(Clutter.get_current_event());
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_touch_event(event) {
        if (event.type === Clutter.EventType.TOUCH_END && !this._menuLayout._blockActivateEvent && this.pressed) {
            this.remove_style_pseudo_class('active');
            this.activate(Clutter.get_current_event());
            this.pressed = false;
            return Clutter.EVENT_STOP;
        } else if (event.type === Clutter.EventType.TOUCH_BEGIN && !this._menuLayout.contextMenuManager.activeMenu) {
            this.pressed = true;
            this._menuLayout._blockActivateEvent = false;
            if (this.hasContextMenu)
                this.contextMenuTimeOut();
            this.add_style_pseudo_class('active');
        } else if (event.type === Clutter.EventType.TOUCH_BEGIN && this._menuLayout.contextMenuManager.activeMenu) {
            this.pressed = false;
            this._menuLayout._blockActivateEvent = false;
            this._menuLayout.contextMenuManager.activeMenu.toggle();
        }
        return Clutter.EVENT_PROPAGATE;
    }

    contextMenuTimeOut() {
        this._popupTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 600, () => {
            this.pressed = false;
            this._popupTimeoutId = null;
            if (this.hasContextMenu && this._menuLayout.arcMenu.isOpen && !this._menuLayout._blockActivateEvent) {
                this.popupContextMenu();
                this._menuLayout.contextMenuManager.ignoreRelease();
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _onDestroy() {
        this.needsDestroy = false;
        if (this.contextMenu) {
            Main.uiGroup.remove_actor(this.contextMenu.actor);
            this.contextMenu.destroy();
        }
    }
});

var Tooltip = class ArcMenuTooltip {
    constructor(menuLayout, sourceActor, title, description) {
        this._menuButton = menuLayout.menuButton;
        this._settings = this._menuButton._settings;
        this.sourceActor = sourceActor;
        if (this.sourceActor.tooltipLocation)
            this.location = this.sourceActor.tooltipLocation;
        else
            this.location = Constants.TooltipLocation.BOTTOM;
        let titleLabel, descriptionLabel;
        this.actor = new St.BoxLayout({
            vertical: true,
            style_class: 'dash-label tooltip-menu-item',
            opacity: 0,
        });

        if (title) {
            titleLabel = new St.Label({
                text: title,
                style: description ? 'font-weight: bold;' : null,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.actor.add_actor(titleLabel);
        }

        if (description) {
            descriptionLabel = new St.Label({
                text: description,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.actor.add_actor(descriptionLabel);
        }

        global.stage.add_actor(this.actor);

        this.actor.connect('destroy', () => {
            if (this.destroyID) {
                this.sourceActor.disconnect(this.destroyID);
                this.destroyID = null;
            }
            if (this.activeID) {
                this.sourceActor.disconnect(this.activeID);
                this.activeID = null;
            }

            if (this.hoverID) {
                this.sourceActor.disconnect(this.hoverID);
                this.hoverID = null;
            }
            if (this.toggleID) {
                this._settings.disconnect(this.toggleID);
                this.toggleID = null;
            }
        });
        this.activeID = this.sourceActor.connect('notify::active', () => this.setActive(this.sourceActor.active));
        this.destroyID = this.sourceActor.connect('destroy', this.destroy.bind(this));
        this.hoverID = this.sourceActor.connect('notify::hover', this._onHover.bind(this));
        this._useTooltips = true;
    }

    setActive(active) {
        if (!active)
            this.hide();
    }

    _onHover() {
        if (this._useTooltips) {
            if (this.sourceActor.hover) {
                if (this._menuButton.tooltipShowing) {
                    this.show();
                    this._menuButton.activeTooltip = this.actor;
                } else {
                    this._menuButton.tooltipShowingID = GLib.timeout_add(0, 750, () => {
                        this.show();
                        this._menuButton.tooltipShowing = true;
                        this._menuButton.activeTooltip = this.actor;
                        this._menuButton.tooltipShowingID = null;
                        return GLib.SOURCE_REMOVE;
                    });
                }
                if (this._menuButton.tooltipHidingID) {
                    GLib.source_remove(this._menuButton.tooltipHidingID);
                    this._menuButton.tooltipHidingID = null;
                }
            } else {
                this.hide();
                if (this._menuButton.tooltipShowingID) {
                    GLib.source_remove(this._menuButton.tooltipShowingID);
                    this._menuButton.tooltipShowingID = null;
                }
                this._menuButton.tooltipHidingID = GLib.timeout_add(0, 750, () => {
                    this._menuButton.tooltipShowing = false;
                    this._menuButton.activeTooltip = null;
                    this._menuButton.tooltipHidingID = null;
                    return GLib.SOURCE_REMOVE;
                });
            }
        }
    }

    show() {
        if (this._useTooltips) {
            this.actor.opacity = 0;
            this.actor.show();

            let [stageX, stageY] = this.sourceActor.get_transformed_position();

            let itemWidth  = this.sourceActor.allocation.x2 - this.sourceActor.allocation.x1;
            let itemHeight = this.sourceActor.allocation.y2 - this.sourceActor.allocation.y1;

            let labelWidth = this.actor.get_width();
            let labelHeight = this.actor.get_height();

            let x, y;
            let gap = 5;

            switch (this.location) {
            case Constants.TooltipLocation.BOTTOM_CENTERED:
                y = stageY + itemHeight + gap;
                x = stageX + Math.floor((itemWidth - labelWidth) / 2);
                break;
            case Constants.TooltipLocation.TOP_CENTERED:
                y = stageY - labelHeight - gap;
                x = stageX + Math.floor((itemWidth - labelWidth) / 2);
                break;
            case Constants.TooltipLocation.BOTTOM:
                y = stageY + itemHeight + gap;
                x = stageX + gap;
                break;
            }

            // keep the label inside the screen
            let monitor = Main.layoutManager.findMonitorForActor(this.sourceActor);
            if (x - monitor.x < gap)
                x += monitor.x - x + gap;
            else if (x + labelWidth > monitor.x + monitor.width - gap)
                x -= x + labelWidth - (monitor.x + monitor.width) + gap;
            else if (y - monitor.y < gap)
                y += monitor.y - y + gap;
            else if (y + labelHeight > monitor.y + monitor.height - gap)
                y -= y + labelHeight - (monitor.y + monitor.height) + gap;

            this.actor.set_position(x, y);
            this.actor.ease({
                opacity: 255,
                duration: Dash.DASH_ITEM_LABEL_SHOW_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
    }

    hide() {
        if (this._useTooltips) {
            this.actor.ease({
                opacity: 0,
                duration: Dash.DASH_ITEM_LABEL_HIDE_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => this.actor.hide(),
            });
        }
    }

    destroy() {
        if (this._menuButton.tooltipShowingID) {
            GLib.source_remove(this._menuButton.tooltipShowingID);
            this._menuButton.tooltipShowingID = null;
        }
        if (this._menuButton.tooltipHidingID) {
            GLib.source_remove(this._menuButton.tooltipHidingID);
            this._menuButton.tooltipHidingID = null;
        }
        if (this.toggleID > 0) {
            this._settings.disconnect(this.toggleID);
            this.toggleID = 0;
        }
        if (this.hoverID > 0) {
            this.sourceActor.disconnect(this.hoverID);
            this.hoverID = 0;
        }

        global.stage.remove_actor(this.actor);
        this.actor.destroy();
    }
};


/**
 * A base class for custom session menuLayouts.
 */
var SessionButton = GObject.registerClass(
    class ArcMenuSessionButton extends St.Button {
        _init(menuLayout, accessibleName, iconName, gicon) {
            super._init({
                reactive: true,
                can_focus: true,
                track_hover: true,
                accessible_name: accessibleName ? accessibleName : '',
                style_class: 'system-button',
            });
            this.hasContextMenu = false;
            this._menuLayout = menuLayout;
            this.needsDestroy = true;
            this._settings = this._menuLayout._settings;
            this.toggleMenuOnClick = true;
            this.tooltip = new Tooltip(this._menuLayout, this.actor, accessibleName);
            this.tooltip.location = Constants.TooltipLocation.TOP_CENTERED;
            this.tooltip.hide();
            this._icon = new St.Icon({
                gicon: gicon ? gicon : Gio.icon_new_for_string(iconName),
                icon_size: 22,
            });
            if (iconName)
                this._icon.fallback_icon_name = iconName;
            this.set_child(this._icon);
            this.connect('key-focus-in', this._onKeyFocusIn.bind(this));
            this.connect('destroy', () => {
                this.needsDestroy = false;
            });
        }

        get actor() {
            return this;
        }

        _onKeyFocusIn() {
            if (!this.actor.hover)
                this._menuLayout._keyFocusIn(this.actor);
            this.active = true;
        }

        vfunc_button_press_event(buttonEvent) {
            const ret = super.vfunc_button_press_event(buttonEvent);
            if (buttonEvent.button === 1) {
                this._setPopupTimeout();
            } else if (buttonEvent.button === 3) {
                if (this.hasContextMenu) {
                    this.popupContextMenu();
                    this.fake_release();
                    this.set_hover(true);
                    this._menuLayout.contextMenuManager.ignoreRelease();
                }
                return Clutter.EVENT_STOP;
            }
            return ret;
        }

        vfunc_touch_event(touchEvent) {
            const ret = super.vfunc_touch_event(touchEvent);
            if (touchEvent.type === Clutter.EventType.TOUCH_BEGIN)
                this._setPopupTimeout();

            return ret;
        }

        vfunc_clicked(button) {
            this._removeMenuTimeout();
            if (this.toggleMenuOnClick)
                this._menuLayout.arcMenu.toggle();
            this.activate(button);
        }

        vfunc_leave_event(crossingEvent) {
            const ret = super.vfunc_leave_event(crossingEvent);

            this.fake_release();
            this._removeMenuTimeout();
            return ret;
        }

        _setPopupTimeout() {
            this._popupTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 600, () => {
                this._popupTimeoutId = null;
                if (this.hasContextMenu && this._menuLayout.arcMenu.isOpen && !this._menuLayout._blockActivateEvent) {
                    this.popupContextMenu();
                    this.fake_release();
                    this.set_hover(true);
                    this._menuLayout.contextMenuManager.ignoreRelease();
                }
                return GLib.SOURCE_REMOVE;
            });
        }

        _removeMenuTimeout() {
            if (this._popupTimeoutId) {
                GLib.source_remove(this._popupTimeoutId);
                this._popupTimeoutId = null;
            }
        }

        activate() {
            global.log('Activate Not Implemented');
        }
    });
// Menu Place Button Shortcut item class
var PlaceButtonItem = GObject.registerClass(class ArcMenuPlaceButtonItem extends SessionButton { // eslint-disable-line no-unused-vars
    _init(menuLayout, info) {
        super._init(menuLayout, _(info.name), info.icon, info.gicon ? info.gicon : null);
        this._menuLayout = menuLayout;
        this._info = info;
    }

    activate() {
        this._info.launch();
    }

});

var ShortcutButtonItem = GObject.registerClass(class ArcMenuShortcutButtonItem extends SessionButton { // eslint-disable-line no-unused-vars
    _init(menuLayout, name, icon, command) {
        let app = Shell.AppSystem.get_default().lookup_app(command);
        if (app && icon === '') {
            let appIcon = app.create_icon_texture(MEDIUM_ICON_SIZE);
            if (appIcon instanceof St.Icon)
                icon = appIcon.gicon.to_string();

        }
        super._init(menuLayout, name, icon);
        this._command = command;
        this._menuLayout = menuLayout;
        this._settings = this._menuLayout._settings;
        this.shouldShow = true;

        // Check for default commands--------
        if (this._command === 'ArcMenu_Software') {
            let softwareManager = Utils.findSoftwareManager();
            this._command = softwareManager ? softwareManager : 'ArcMenu_unfound.desktop';
        }
        if (command === 'ArcMenu_Trash') {
            this.trash = new Me.imports.placeDisplay.Trash(this);
            this._command = 'ArcMenu_Trash';
            this._app = this.trash.getApp();
            this._icon.gicon = this._app.create_icon_texture(MEDIUM_ICON_SIZE).gicon;
        }
        if (!this._app)
            this._app = Shell.AppSystem.get_default().lookup_app(this._command);
        this.hasContextMenu = !!this._app;
        if (this._command.endsWith('.desktop') && !Shell.AppSystem.get_default().lookup_app(this._command))
            this.shouldShow = false;

    }

    popupContextMenu() {
        if (this.contextMenu === undefined) {
            this.contextMenu = new ApplicationContextMenu(this.actor, this._app, this._menuLayout);
            this.contextMenu.actor.hide();
        }
        this.tooltip.hide();
        if (!this.contextMenu.isOpen)
            this.contextMenu.redisplay();
        this.contextMenu.toggle();
    }

    activate() {
        if (this._app) {
            this._app.open_new_window(-1);
        } else if (this._command === 'ArcMenu_LogOut') {
            this._menuLayout.systemActions.activateLogout();
        } else if (this._command === 'ArcMenu_Lock') {
            this._menuLayout.isRunning = false;
            this._menuLayout.systemActions.activateLockScreen();
        } else if (this._command === 'ArcMenu_PowerOff') {
            this._menuLayout.systemActions.activatePowerOff();
        } else if (this._command === 'ArcMenu_Restart') {
            if (this._menuLayout.systemActions.activateRestart)
                this._menuLayout.systemActions.activateRestart();
            else
                this._menuLayout.systemActions.activatePowerOff();
        } else if (this._command === 'ArcMenu_Suspend') {
            this._menuLayout.systemActions.activateSuspend();
        } else if (this._command === 'ArcMenu_ActivitiesOverview') {
            Main.overview.show();
        } else if (this._command === 'ArcMenu_RunCommand') {
            Main.openRunDialog();
        } else if (this._command === 'ArcMenu_ShowAllApplications') {
            Main.overview.viewSelector._toggleAppsPage();
        } else {
            Util.spawnCommandLine(this._command);
        }
    }
});
// Settings Button
var SettingsButton = GObject.registerClass(class ArcMenuSettingsButton extends SessionButton { // eslint-disable-line no-unused-vars
    _init(menuLayout) {
        super._init(menuLayout, _('Settings'), 'emblem-system-symbolic');
    }

    activate() {
        Util.spawnCommandLine('gnome-control-center');
    }
});

var LeaveButton = GObject.registerClass(class ArcMenuLeaveButton extends SessionButton { // eslint-disable-line no-unused-vars
    _init(menuLayout) {
        super._init(menuLayout, _('Leave'), 'system-shutdown-symbolic');
        this.toggleMenuOnClick = false;
    }

    activate() {
        this._menuLayout.toggleLeaveMenu();
    }
});

// User Button
var CurrentUserButton = GObject.registerClass(class ArcMenuCurrentUserButton extends SessionButton { // eslint-disable-line no-unused-vars
    _init(menuLayout) {
        super._init(menuLayout, GLib.get_real_name(), 'system-users-symbolic');
    }

    activate() {
        Util.spawnCommandLine('gnome-control-center user-accounts');
    }
});

var PowerButton = GObject.registerClass(class ArcMenuPowerButton extends SessionButton { // eslint-disable-line no-unused-vars
    _init(menuLayout) {
        super._init(menuLayout, _('Power Off'), 'system-shutdown-symbolic');
    }

    activate() {
        this._menuLayout.systemActions.activatePowerOff();
    }
});

var RestartButton = GObject.registerClass(class ArcMenuRestartButton extends SessionButton { // eslint-disable-line no-unused-vars
    _init(menuLayout) {
        super._init(menuLayout, _('Restart'), Me.path + Constants.RESTART_ICON.Path);
    }

    activate() {
        if (this._menuLayout.systemActions.activateRestart)
            this._menuLayout.systemActions.activateRestart();
        else
            this._menuLayout.systemActions.activatePowerOff();
    }
});

var LogoutButton = GObject.registerClass(class ArcMenuLogoutButton extends SessionButton { // eslint-disable-line no-unused-vars
    _init(menuLayout) {
        super._init(menuLayout, _('Log Out'), 'application-exit-symbolic');
    }

    activate() {
        this._menuLayout.systemActions.activateLogout();
    }
});

var SuspendButton = GObject.registerClass(class ArcMenuSuspendButton extends SessionButton { // eslint-disable-line no-unused-vars
    _init(menuLayout) {
        super._init(menuLayout, _('Suspend'), 'media-playback-pause-symbolic');
    }

    activate() {
        this._menuLayout.systemActions.activateSuspend();
    }
});

var LockButton = GObject.registerClass(class ArcMenuLockButton extends SessionButton { // eslint-disable-line no-unused-vars
    _init(menuLayout) {
        super._init(menuLayout, _('Lock'), 'changes-prevent-symbolic');
    }

    activate() {
        this._menuLayout.isRunning = false;
        this._menuLayout.systemActions.activateLockScreen();
    }
});

var PlasmaPowerItem = GObject.registerClass(class ArcMenuPlasmaPowerItem extends ArcMenuPopupBaseMenuItem { // eslint-disable-line no-unused-vars
    _init(menuLayout, type, title, icon) {
        super._init(menuLayout);
        this.type = type;
        this._menuLayout = menuLayout;
        this._settings = this._menuLayout._settings;
        this._icon = new St.Icon({
            gicon: Gio.icon_new_for_string(icon),
            style_class: 'popup-menu-icon',
            icon_size: MEDIUM_ICON_SIZE,
        });

        this.label = new St.Label({
            text: _(title),
            y_expand: false,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this.box.add_actor(this._icon);
        this.box.add_actor(this.label);
    }

    activate(event) {
        if (this.type === Constants.PowerType.POWEROFF)
            this._menuLayout.systemActions.activatePowerOff();
        if (this.type === Constants.PowerType.RESTART) {
            if (this._menuLayout.systemActions.activateRestart)
                this._menuLayout.systemActions.activateRestart();
            else
                this._menuLayout.systemActions.activatePowerOff();
        }
        if (this.type === Constants.PowerType.LOCK) {
            this._menuLayout.isRunning = false;
            this._menuLayout.systemActions.activateLockScreen();
        }
        if (this.type === Constants.PowerType.LOGOUT)
            this._menuLayout.systemActions.activateLogout();
        if (this.type === Constants.PowerType.SUSPEND)
            this._menuLayout.systemActions.activateSuspend();
        super.activate(event);
    }
});

// Menu shortcut item class
var ShortcutMenuItem = GObject.registerClass(class ArcMenuShortcutMenuItem extends ArcMenuPopupBaseMenuItem { // eslint-disable-line no-unused-vars
    _init(menuLayout, name, icon, command) {
        super._init(menuLayout);
        this._menuLayout = menuLayout;
        this._settings = this._menuLayout._settings;
        this._command = command;
        this.isGridIcon = false;
        // Check for default commands--------
        if (this._command === 'ArcMenu_Software') {
            let softwareManager = Utils.findSoftwareManager();
            this._command = softwareManager ? softwareManager : 'ArcMenu_unfound.desktop';
        } else if (this._command === 'ArcMenu_Trash') {
            this.trash = new Me.imports.placeDisplay.Trash(this);
            this._command = 'ArcMenu_Trash';
            this._app = this.trash.getApp();
        }
        if (!this._app)
            this._app = Shell.AppSystem.get_default().lookup_app(this._command);

        if (this._app && icon === '') {
            let appIcon = this._app.create_icon_texture(MEDIUM_ICON_SIZE);
            if (appIcon instanceof St.Icon)
                icon = appIcon.gicon.to_string();

        }

        this.hasContextMenu = !!this._app;
        // ---------
        this._icon = new St.Icon({
            icon_name: icon,
            gicon: Gio.icon_new_for_string(icon),
            style_class: 'popup-menu-icon',
            icon_size: SMALL_ICON_SIZE,
        });
        this.box.add_child(this._icon);
        this.label = new St.Label({
            text: _(name), y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.box.add_child(this.label);

        this.setShouldShow();
    }

    popupContextMenu() {
        if (this._app && this.contextMenu === undefined) {
            this.contextMenu = new ApplicationContextMenu(this.actor, this._app, this._menuLayout);
            if (this.isGridIcon)
                this.contextMenu.centerBoxPointerPosition();
            if (this._path)
                this.contextMenu.path = this._path;
        }
        if (this.contextMenu !== undefined) {
            if (this.tooltip !== undefined)
                this.tooltip.hide();
            if (!this.contextMenu.isOpen)
                this.contextMenu.redisplay();

            this.contextMenu.toggle();
        }
    }

    setAsGridIcon() {
        this.isGridIcon = true;
        this.tooltipLocation = Constants.TooltipLocation.BOTTOM_CENTERED;
        this.box.vertical = true;
        this.label.x_align = Clutter.ActorAlign.CENTER;
        this.label.y_align = Clutter.ActorAlign.CENTER;
        this.label.y_expand = true;
        this._icon.y_align = Clutter.ActorAlign.CENTER;
        this._icon.y_expand = true;
        this.label.get_clutter_text().set_line_wrap(true);

        this.remove_child(this._ornamentLabel);
        Utils.setGridLayoutStyle(this.actor, this.box);
        this._iconSize = 36;
        this._icon.icon_size = this._iconSize;
    }

    activate(event) {
        this._menuLayout.arcMenu.toggle();
        if (this._command === 'ArcMenu_LogOut') {
            this._menuLayout.systemActions.activateLogout();
        } else if (this._command === 'ArcMenu_Lock') {
            this._menuLayout.isRunning = false;
            this._menuLayout.systemActions.activateLockScreen();
        } else if (this._command === 'ArcMenu_PowerOff') {
            this._menuLayout.systemActions.activatePowerOff();
        } else if (this._command === 'ArcMenu_Restart') {
            if (this._menuLayout.systemActions.activateRestart)
                this._menuLayout.systemActions.activateRestart();
            else
                this._menuLayout.systemActions.activatePowerOff();
        } else if (this._command === 'ArcMenu_Suspend') {
            this._menuLayout.systemActions.activateSuspend();
        } else if (this._command === 'ArcMenu_ActivitiesOverview') {
            Main.overview.show();
        } else if (this._command === 'ArcMenu_RunCommand') {
            Main.openRunDialog();
        } else if (this._command === 'ArcMenu_ShowAllApplications') {
            Main.overview.viewSelector._toggleAppsPage();
        } else if (this._app) {
            this._app.open_new_window(-1);
        } else {
            Util.spawnCommandLine(this._command);
        }
        super.activate(event);
    }

    _updateIcon() {
        this._icon.icon_size = SMALL_ICON_SIZE;
    }

    setIconSizeLarge() {
        this._icon.icon_size = MEDIUM_ICON_SIZE;
    }
});

// Menu item which displays the current user
var UserMenuItem = GObject.registerClass(class ArcMenuUserMenuItem extends ArcMenuPopupBaseMenuItem { // eslint-disable-line no-unused-vars
    _init(menuLayout, userAvatarSize) {
        super._init(menuLayout);
        this._menuLayout = menuLayout;
        let username = GLib.get_user_name();
        this._user = AccountsService.UserManager.get_default().get_user(username);
        this.iconBin =  new St.Bin({
            style_class: 'menu-user-avatar',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._userAvatarSize = userAvatarSize ? userAvatarSize : USER_AVATAR_SIZE;

        this.iconBin.style = `width: ${this._userAvatarSize}px; height: ${this._userAvatarSize}px;`;
        this.box.add_actor(this.iconBin);
        this._userLabel = new St.Label({
            text: GLib.get_real_name(),
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.box.add_actor(this._userLabel);
        this._userLoadedId = this._user.connect('notify::is-loaded', this._onUserChanged.bind(this));
        this._userChangedId = this._user.connect('changed', this._onUserChanged.bind(this));
        this.actor.connect('destroy', this._onDestroy.bind(this));
        this._onUserChanged();
    }

    activate(event) {
        Util.spawnCommandLine('gnome-control-center user-accounts');
        this._menuLayout.arcMenu.toggle();
        super.activate(event);
    }

    _onUserChanged() {
        if (this._user.is_loaded) {
            this._userLabel.set_text(this._user.get_real_name());
            let iconFileName = this._user.get_icon_file();
            if (iconFileName && !GLib.file_test(iconFileName, GLib.FileTest.EXISTS))
                iconFileName = null;
            if (iconFileName) {
                this.iconBin.child = null;
                this.iconBin.style = `${'background-image: url("%s");'.format(iconFileName)}width: ${this._userAvatarSize}px; height: ${this._userAvatarSize}px;`;
            } else {
                this.iconBin.style = null;
                this.iconBin.child = new St.Icon({
                    icon_name: 'avatar-default-symbolic',
                    icon_size: this._userAvatarSize,
                });
            }
        }
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
});

var UserMenuIcon = class ArcMenuUserMenuIcon { // eslint-disable-line no-unused-vars
    constructor(menuLayout, size) {
        this._menuLayout = menuLayout;
        this._size = size;
        let username = GLib.get_user_name();
        this._user = AccountsService.UserManager.get_default().get_user(username);
        this.actor = new St.Bin({
            style_class: 'menu-user-avatar',
            track_hover: true,
            reactive: true,
        });
        this.actor.style = `width: ${this._size}px; height: ${this._size}px;`;
        this._userLoadedId = this._user.connect('notify::is-loaded', this._onUserChanged.bind(this));
        this._userChangedId = this._user.connect('changed', this._onUserChanged.bind(this));
        this.actor.connect('destroy', this._onDestroy.bind(this));
        this._onUserChanged();
        this.actor.connect('notify::hover', this._onHover.bind(this));
    }

    _onHover() {
        if (this.tooltip === undefined && this.actor.hover) {
            this.tooltip = new Tooltip(this._menuLayout, this.actor, GLib.get_real_name());
            this.tooltip.location = Constants.TooltipLocation.BOTTOM_CENTERED;
            this.tooltip._onHover();
        }
    }

    _onUserChanged() {
        if (this._user.is_loaded) {
            let iconFileName = this._user.get_icon_file();
            if (iconFileName && !GLib.file_test(iconFileName, GLib.FileTest.EXISTS))
                iconFileName = null;
            if (iconFileName) {
                this.actor.child = null;
                this.actor.style = `${'background-image: url("%s");'.format(iconFileName)}width: ${this._size}px; height: ${this._size}px;`;
            } else {
                this.actor.style = null;
                this.actor.child = new St.Icon({ icon_name: 'avatar-default-symbolic',
                    icon_size: this._size });
            }
        }

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
};

// Menu pinned apps/favorites item class
var FavoritesMenuItem = GObject.registerClass({ // eslint-disable-line no-unused-vars
    Signals: {  'saveSettings': {} },
}, class ArcMenuFavoritesMenuItem extends ArcMenuPopupBaseMenuItem {
    _init(menuLayout, name, icon, command) {
        super._init(menuLayout);
        this._menuLayout = menuLayout;
        this._menuButton = menuLayout.menuButton;
        this._settings = this._menuLayout._settings;
        this._command = command;
        this._iconString = this._iconPath = icon;
        this._name = name;
        this._app = Shell.AppSystem.get_default().lookup_app(this._command);
        this.hasContextMenu = true;

        // Modifiy the Default Pinned Apps---------------------
        if (this._name === 'ArcMenu Settings')
            this._name = _('ArcMenu Settings');
        else if (this._name === 'Terminal')
            this._name = _('Terminal');

        if (this._iconPath === 'ArcMenu_ArcMenuIcon' || this._iconPath ===  `${Me.path}/media/icons/arc-menu-symbolic.svg`)
            this._iconString = this._iconPath = `${Me.path}/media/icons/menu_icons/arc-menu-symbolic.svg`;

        // -------------------------------------------------------

        if (this._app && this._iconPath === '') {
            let appIcon = this._app.create_icon_texture(MEDIUM_ICON_SIZE);
            if (appIcon instanceof St.Icon) {
                this._iconString = appIcon.gicon ? appIcon.gicon.to_string() : appIcon.fallback_icon_name;
                if (!this._iconString)
                    this._iconString = '';
            }
        }

        this.actor.style = 'width: 80px; height: 95px; text-align: center; padding: 5px; spacing: 0px;';
        this.actor.style_class = null;
        this.box.style = 'width: 80px; padding: 0px; margin: 0px; spacing: 5px; font-size: 14px;';

        this._icon = new St.Icon({
            style_class: 'favorites-menu-item',
            track_hover: true,
            reactive: true,
            gicon: Gio.icon_new_for_string(this._iconString),
            icon_size: 55,
        });
        this.box.add_child(this._icon);

        this.label = new St.Label({
            text: _(this._name),
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.box.add_child(this.label);

        this.tooltipLocation = Constants.TooltipLocation.BOTTOM_CENTERED;
        this.label.x_align = Clutter.ActorAlign.CENTER;
        this.label.y_align = Clutter.ActorAlign.CENTER;
        this.label.y_expand = true;
        this._icon.y_align = Clutter.ActorAlign.CENTER;
        this._icon.y_expand = true;
        this.label.get_clutter_text().set_line_wrap(true);

        this.box.vertical = true;
        this.remove_child(this._ornamentLabel);
        this.setShouldShow();
    }

    _updateIcon() {
        this._icon.icon_size = 36;
    }

    popupContextMenu() {
        if (this.contextMenu === undefined) {
            let app = this._app ? this._app : this._command;
            this.contextMenu = new ApplicationContextMenu(this.actor, app, this._menuLayout);
            this.contextMenu.centerBoxPointerPosition();
            this.contextMenu.isPinnedApp = true;
        }
        if (this.tooltip !== undefined)
            this.tooltip.hide();
        if (!this.contextMenu.isOpen)
            this.contextMenu.redisplay();
        this.contextMenu.toggle();
    }

    _onDragBegin() {
        if (this._menuButton.tooltipShowingID) {
            GLib.source_remove(this._menuButton.tooltipShowingID);
            this._menuButton.tooltipShowingID = null;
            this._menuButton.tooltipShowing = false;
        }
        if (this.tooltip) {
            this.tooltip.hide();
            this._menuButton.tooltipShowing = false;
        }

        if (this.contextMenu && this.contextMenu.isOpen)
            this.contextMenu.toggle();

        if (this._popupTimeoutId) {
            GLib.source_remove(this._popupTimeoutId);
            this._popupTimeoutId = null;
        }

        this._dragMonitor = {
            dragMotion: (this, this._onDragMotion.bind(this)),
        };

        this._parentBox = this.actor.get_parent();
        DND.addDragMonitor(this._dragMonitor);
        DND.SNAP_BACK_ANIMATION_TIME = 0;

        this.dragStartY = this._draggable._dragStartY;
        this._emptyDropTarget = new Dash.EmptyDropTargetItem();
        this._emptyDropTarget.setChild(new St.Bin({ style_class: 'arc-empty-dash-drop-target' }));

        let p = this._parentBox.get_transformed_position();
        this.posY = p[1];

        this.rowHeight = this._parentBox.get_child_at_index(0).height;

        this.startIndex = 0;
        for (let i = 0; i < this._parentBox.get_children().length; i++) {
            if (this.actor === this._parentBox.get_child_at_index(i))
                this.startIndex = i;
        }
        this._parentBox.insert_child_at_index(this._emptyDropTarget, this.startIndex);

        Main.overview.beginItemDrag(this);
        this._emptyDropTarget.show(true);
    }

    _onDragMotion(/* dragEvent*/) {
        this.newIndex = Math.floor((this._draggable._dragY - this.posY) / this.rowHeight);

        if (this.newIndex > this._parentBox.get_children().length - 1)
            this.newIndex = this._parentBox.get_children().length - 1;
        if (this.newIndex < 0)
            this.newIndex = 0;
        if (this._parentBox.get_child_at_index(this.newIndex) !== this._emptyDropTarget)
            this._parentBox.set_child_at_index(this._emptyDropTarget, this.newIndex);

        return DND.DragMotionResult.CONTINUE;
    }

    _onDragCancelled() {
        Main.overview.cancelledItemDrag(this);
    }

    _onDragEnd() {
        this._parentBox.remove_child(this._emptyDropTarget);
        let index = this.newIndex;
        if (index > this.startIndex)
            index--;
        if (index > this._parentBox.get_children().length - 1)
            index = this._parentBox.get_children().length - 1;
        if (index < 0)
            index = 0;
        if (index !== this.startIndex) {
            this._parentBox.set_child_at_index(this.actor, index);
            let temp = this._menuLayout.favoritesArray[this.startIndex];
            this._menuLayout.favoritesArray.splice(this.startIndex, 1);
            this._menuLayout.favoritesArray.splice(index, 0, temp);
        }
        Main.overview.endItemDrag(this);
        DND.removeDragMonitor(this._dragMonitor);
        this.emit('saveSettings');
    }

    getDragActor() {
        let icon = new St.Icon({
            gicon: Gio.icon_new_for_string(this._iconString),
            style_class: 'popup-menu-icon',
            icon_size: 40,
        });
        icon.remove_style_class_name('arc-menu-action');
        return icon;
    }

    getDragActorSource() {
        return this.actor;
    }

    activate(event) {
        if (this._app)
            this._app.open_new_window(-1);
        else if (this._command === 'ArcMenu_ShowAllApplications')
            Main.overview.viewSelector._toggleAppsPage();
        else
            Util.spawnCommandLine(this._command);

        this._menuLayout.arcMenu.toggle();
        super.activate(event);
        this._icon.remove_style_pseudo_class('active');
    }

    vfunc_key_focus_in() {
        this._icon.add_style_pseudo_class('focus');
    }

    vfunc_key_focus_out() {
        this._icon.remove_style_pseudo_class('focus');
    }

    vfunc_button_press_event() {
        this._icon.add_style_pseudo_class('active');

        let event = Clutter.get_current_event();
        this.pressed = true;
        if (event.get_button() === 1)
            this._menuLayout._blockActivateEvent = false;

        this.add_style_pseudo_class('active');
        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_button_release_event() {
        this._icon.remove_style_pseudo_class('active');
        return super.vfunc_button_release_event();
    }

    vfunc_leave_event(crossingEvent) {
        this._icon.remove_style_pseudo_class('active');
        return super.vfunc_leave_event(crossingEvent);
    }

    _onHover() {
        super._onHover();
        this._icon.remove_style_pseudo_class('focus');
    }
});

var ExpandButton = GObject.registerClass(class ArcMenuExpandButton extends ArcMenuPopupBaseMenuItem { // eslint-disable-line no-unused-vars
    _init(menuLayout) {
        super._init(menuLayout);
        this._menuLayout = menuLayout;

        // Icon
        this._icon = new St.Icon({
            icon_size: 30,
        });
        this.box.add_child(this._icon);

        // Label
        this.label = new St.Label({
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.label.style = 'font-size: 14px;';
        this.box.add_child(this.label);
        this.box.label_actor = this.label;

        this.remove_child(this._ornamentLabel);

        this.box.x_align = Clutter.ActorAlign.CENTER;
        this.box.style = 'spacing: 0px;';
        this.actor.style_class = 'expand-button';

        this.toggled = false;
        this.updateIcon(this.toggled);
        this.updateLabel(this.toggled);
    }

    _onHover() {
        super._onHover();
        this.actor.remove_style_pseudo_class('focus');
    }

    activate(event) {
        this.toggled = !this.toggled;
        this.updateIcon(this.toggled);
        this.updateLabel(this.toggled);
        if (this.toggled)
            this._menuLayout.expandAll();
        else
            this._menuLayout.collapseAll();

        super.activate(event);
    }

    updateIcon(toggled) {
        if (toggled) {
            let upImagePath = `${Me.path}/media/icons/tos_desktop_ic_menu_btn_arrow_up.png`;
            this._icon.set_gicon(Gio.icon_new_for_string(upImagePath));
        } else {
            let downImagePath = `${Me.path}/media/icons/tos_desktop_ic_menu_btn_arrow_down.png`;
            this._icon.set_gicon(Gio.icon_new_for_string(downImagePath));
        }
    }

    updateLabel(toggled) {
        if (toggled) {
            this.label.style = 'color: rgb(57, 97, 202);';
            this.label.set_text('축소');
        } else {
            this.label.style = 'color: rgb(0,0,0);';
            this.label.set_text('확장');
        }
    }
});

var ApplicationMenuItem = GObject.registerClass(class ArcMenuApplicationMenuItem extends ArcMenuPopupBaseMenuItem { // eslint-disable-line no-unused-vars
    _init(menuLayout, app, isIconGrid = false) {
        super._init(menuLayout);
        this._app = app;
        this._menuLayout = menuLayout;
        this._settings = this._menuLayout._settings;
        this._isIconGrid = isIconGrid;
        this.hasContextMenu = true;
        let recentApps = this._settings.get_strv('recently-installed-apps');
        this.isRecentlyInstalled = recentApps.some(element => element === this._app.get_id());

        this._iconBin = new St.Bin();
        this.box.add_child(this._iconBin);
        this.label = new St.Label({
            text: app.get_name(),
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.label.style = 'font-size: 14px;';
        this.box.add_child(this.label);
        this.box.style = 'spacing: 12px; height: 43px;';
        this.actor.style_class = 'app-menu-item';

        this.box.label_actor = this.label;

        if (this.isRecentlyInstalled) {
            this._indicator = new St.Label({
                text: _('New'),
                style_class: 'arc-menu-menu-item-text-indicator',
                style: 'border-radius: 15px; margin: 0px; padding: 0px 10px;',
                x_expand: true,
                x_align: Clutter.ActorAlign.END,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.box.add_child(this._indicator);
        }

        if (this._isIconGrid) {
            this._iconBin.x_align = Clutter.ActorAlign.CENTER;
            this._iconBin.y_align = Clutter.ActorAlign.CENTER;
            this._iconBin.y_expand = true;
            this.label.x_align = Clutter.ActorAlign.CENTER;
            this.label.y_align = Clutter.ActorAlign.CENTER;
            this.label.y_expand = true;
            this.tooltipLocation = Constants.TooltipLocation.BOTTOM_CENTERED;
            this.label.get_clutter_text().set_line_wrap(true);

            this.box.vertical = true;
            this.remove_child(this._ornamentLabel);
            if (this.isRecentlyInstalled) {
                this.box.remove_child(this._indicator);
                this.box.insert_child_at_index(this._indicator, 0);
                this._indicator.x_align = Clutter.ActorAlign.CENTER;
                this._indicator.y_align = Clutter.ActorAlign.START;
                this._indicator.y_expand = false;
            }
            Utils.setGridLayoutStyle(this.actor, this.box);
        }
        this._updateIcon();
    }

    removeIndicator() {
        if (this.isRecentlyInstalled) {
            this.isRecentlyInstalled = false;
            let recentApps = this._settings.get_strv('recently-installed-apps');
            let index = recentApps.indexOf(this._app.get_id());
            if (index > -1)
                recentApps.splice(index, 1);

            this._settings.set_strv('recently-installed-apps', recentApps);

            this._indicator.hide();
            this._menuLayout.setRecentlyInstalledIndicator();
        }
    }

    popupContextMenu() {
        this.removeIndicator();
        if (this.contextMenu === undefined) {
            this.contextMenu = new ApplicationContextMenu(this.actor, this._app, this._menuLayout);
            if (this._isIconGrid)
                this.contextMenu.centerBoxPointerPosition();
        }
        if (this.tooltip !== undefined)
            this.tooltip.hide();
        if (!this.contextMenu.isOpen)
            this.contextMenu.redisplay();
        this.contextMenu.toggle();
    }

    getAppId() {
        return this._app.get_id();
    }

    _createIcon(iconSize) {
        return this._app.create_icon_texture(iconSize);
    }

    activate(event) {
        this.removeIndicator();
        this._app.open_new_window(-1);
        this._menuLayout.arcMenu.toggle();
        super.activate(event);
    }

    _onHover() {
        super._onHover();
        this.actor.remove_style_pseudo_class('focus');
    }

    grabKeyFocus() {
        this.actor.grab_key_focus();
    }

    _updateIcon() {
        if (this._isIconGrid) {
            let icon = this._app.create_icon_texture(36);
            this._iconBin.set_child(icon);
        } else {
            let icon = this._app.create_icon_texture(30);
            this._iconBin.set_child(icon);
        }
    }
});

var RecentAppMenuItem = GObject.registerClass(class ArcMenuRecentAppMenuItem extends ApplicationMenuItem { // eslint-disable-line no-unused-vars
    _init(menuLayout, app, createdTime) {
        super._init(menuLayout, app);
        this.createdTime = createdTime;
    }

    getCreatedTime() {
        return this.createdTime;
    }
});

// Menu Category item class
var CategoryMenuItem = GObject.registerClass(class ArcMenuCategoryMenuItem extends ArcMenuPopupBaseMenuItem { // eslint-disable-line no-unused-vars
    _init(menuLayout, category) {
        super._init(menuLayout);
        this.appList = [];
        this._menuLayout = menuLayout;
        this._settings = this._menuLayout._settings;
        this._category = category;
        this._name = '';

        this._icon = new St.Icon({
            style_class: 'popup-menu-icon',
            icon_size: MEDIUM_ICON_SIZE,
        });

        let [name, gicon, iconName, fallbackIconName] = Utils.getCategoryDetails(this._category);
        this._name = _(name);
        if (gicon)
            this._icon.gicon = gicon;
        else if (iconName)
            this._icon.icon_name = iconName;
        else
            this._icon.fallback_icon_name = fallbackIconName;

        this.box.add_child(this._icon);

        this.label = new St.Label({
            text: this._name,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.box.add_child(this.label);

        if (this.isRecentlyInstalled)
            this.setRecentlyInstalledIndicator(true);

        this._arrowIcon = new St.Icon({
            icon_name: 'go-next-symbolic',
            style_class: 'popup-menu-icon',
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
            icon_size: 12,
        });
        this.box.add_child(this._arrowIcon);

        this.box.label_actor = this.label;
    }

    setRecentlyInstalledIndicator(shouldShow) {
        this.isRecentlyInstalled = shouldShow;
        if (shouldShow) {
            this._indicator = new St.Icon({
                icon_name: 'message-indicator-symbolic',
                style_class: 'arc-menu-menu-item-indicator',
                icon_size: INDICATOR_ICON_SIZE,
                x_expand: true,
                y_expand: false,
                x_align: Clutter.ActorAlign.END,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.box.insert_child_at_index(this._indicator, this.box.get_n_children() - 1);
            if (this._arrowIcon)
                this._arrowIcon.x_expand = false;
        } else if (this._indicator && this.box.contains(this._indicator)) {
            if (this._arrowIcon)
                this._arrowIcon.x_expand = true;
            this.box.remove_child(this._indicator);
        }
    }
});

// Place Info class
var PlaceInfo = class ArcMenuPlaceInfo {
    constructor(file, name, icon) {
        this.file = file;
        this.name = name ? name : this._getFileName();
        this.icon = icon ? icon : null;
        this.gicon = icon ? null : this.getIcon();
    }

    launch(timestamp) {
        let launchContext = global.create_app_launch_context(timestamp, -1);
        Gio.AppInfo.launch_default_for_uri(this.file.get_uri(), launchContext);
    }

    getIcon() {
        try {
            let info = this.file.query_info('standard::symbolic-icon', 0, null);
            return info.get_symbolic_icon();

        } catch (e) {
            if (e instanceof Gio.IOErrorEnum) {
                if (!this.file.is_native())
                    return new Gio.ThemedIcon({ name: 'folder-remote-symbolic' });
                else
                    return new Gio.ThemedIcon({ name: 'folder-symbolic' });

            }
        }
    }

    _getFileName() {
        try {
            let info = this.file.query_info('standard::display-name', 0, null);
            return info.get_display_name();
        } catch (e) {
            if (e instanceof Gio.IOErrorEnum)
                return this.file.get_basename();

        }
    }
};
Signals.addSignalMethods(PlaceInfo.prototype);

// Menu Place Shortcut item class
var PlaceMenuItem = GObject.registerClass(class ArcMenuPlaceMenuItem extends ArcMenuPopupBaseMenuItem { // eslint-disable-line no-unused-vars
    _init(menuLayout, info) {
        super._init(menuLayout);
        this._menuLayout = menuLayout;
        this._info = info;
        this._icon = new St.Icon({
            gicon: info.gicon ? info.gicon : Gio.icon_new_for_string(info.icon),
            icon_size: SMALL_ICON_SIZE,
        });

        this.box.add_child(this._icon);
        this.label = new St.Label({
            text: _(info.name),
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.box.add_child(this.label);
        this._changedId = this._info.connect('changed', this._propertiesChanged.bind(this));
        this.connect('destroy', this._onDestroy.bind(this));
    }

    setIconSizeLarge() {
        this._icon.icon_size = MEDIUM_ICON_SIZE;
    }

    _updateIcon() {
        this._icon.icon_size = SMALL_ICON_SIZE;
    }

    _onDestroy() {
        if (this._changedId) {
            this._info.disconnect(this._changedId);
            this._changedId = 0;
        }
    }

    activate(event) {
        this._info.launch(event.get_time());
        this._menuLayout.arcMenu.toggle();
        super.activate(event);
    }

    _propertiesChanged(info) {
        this._icon.gicon = info.icon;
        this.label.text = info.name;
    }
});

/**
 * This class is responsible for the appearance of the menu button.
 */
var MenuButtonWidget = class ArcMenuMenuButtonWidget { // eslint-disable-line no-unused-vars
    constructor() {
        this.actor = new St.BoxLayout({
            pack_start: false,
            x_align: Clutter.ActorAlign.END,
        });
        this.actor.style = 'width: 45px;';
        this._arrowIcon = PopupMenu.arrowIcon(St.Side.BOTTOM);
        this._arrowIcon.add_style_class_name('arc-menu-arrow');

        this._icon = new St.Icon({
            icon_name: 'start-here-symbolic',
            style_class: 'arc-menu-icon',
            track_hover: true,
            reactive: true,
        });
        this._label = new St.Label({
            text: _('Applications'),
            y_expand: true,
            style_class: 'arc-menu-text',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this.actor.add_child(this._icon);
        this.actor.add_child(this._label);
        this.actor.add_child(this._arrowIcon);
    }

    setActiveStylePseudoClass(enable) {
        if (enable) {
            this._arrowIcon.add_style_pseudo_class('active');
            this._icon.add_style_pseudo_class('active');
            this._label.add_style_pseudo_class('active');
        } else {
            this._arrowIcon.remove_style_pseudo_class('active');
            this._icon.remove_style_pseudo_class('active');
            this._label.remove_style_pseudo_class('active');
        }
    }

    updateArrowIconSide(side) {
        let iconName;
        switch (side) {
        case St.Side.TOP:
            iconName = 'pan-down-symbolic';
            break;
        case St.Side.RIGHT:
            iconName = 'pan-start-symbolic';
            break;
        case St.Side.BOTTOM:
            iconName = 'pan-up-symbolic';
            break;
        case St.Side.LEFT:
            iconName = 'pan-end-symbolic';
            break;
        }
        this._arrowIcon.icon_name = iconName;
    }

    getPanelLabel() {
        return this._label;
    }

    getPanelIcon() {
        return this._icon;
    }

    showArrowIcon() {
        if (!this.actor.contains(this._arrowIcon))
            this.actor.add_child(this._arrowIcon);

    }

    hideArrowIcon() {
        if (this.actor.contains(this._arrowIcon))
            this.actor.remove_child(this._arrowIcon);

    }

    showPanelIcon() {
        if (!this.actor.contains(this._icon))
            this.actor.add_child(this._icon);

    }

    hidePanelIcon() {
        if (this.actor.contains(this._icon))
            this.actor.remove_child(this._icon);

    }

    showPanelText() {
        if (!this.actor.contains(this._label))
            this.actor.add_child(this._label);

    }

    hidePanelText() {
        this._label.style = '';
        if (this.actor.contains(this._label))
            this.actor.remove_child(this._label);

    }

    setPanelTextStyle(style) {
        this._label.style = style;
    }
};
