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
const Constants = Me.imports.constants;
const Dash = imports.ui.dash;
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
        this._menuLayout.searchMenu.toggle();
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
        _init(params) {
            super._init(params);
            this.mouse_scroll = false;
        }

        vfunc_scroll_event(event) {
            let newValue, callback, adjustment;
            switch (event.direction) {
            case Clutter.SCROLL_SMOOTH:
                callback = () => {
                    let deltaX, deltaY;
                    [deltaX, deltaY] = event.get_scroll_delta();
                    this.hscroll.adjustment.adjust_for_scroll_event(deltaX);
                    this.vscroll.adjustment.adjust_for_scroll_event(deltaY);
                };
                break;
            case Clutter.ScrollDirection.DOWN:
            case Clutter.ScrollDirection.RIGHT:
                adjustment = event.direction === Clutter.ScrollDirection.DOWN ? this.vscroll.adjustment : this.hscroll.adjustment;
                callback = () => {
                    newValue = adjustment.value + adjustment.page_size / 6;
                    adjustment.set_value(newValue);
                };
                break;
            case Clutter.ScrollDirection.UP:
            case Clutter.ScrollDirection.LEFT:
                adjustment = event.direction === Clutter.ScrollDirection.UP ? this.vscroll.adjustment : this.hscroll.adjustment;
                callback = () => {
                    newValue = adjustment.value - adjustment.page_size / 6;
                    adjustment.set_value(newValue);
                };
                break;
            default:
                break;
            }
            if (callback)
                Main.initializeDeferredWork(this, callback);
            return Clutter.EVENT_PROPAGATE;
        }

        vfunc_style_changed() {
            super.vfunc_style_changed();
            let fade = this.get_effect('fade');
            if (fade)
                fade.set_shader_source(Utils.ScrollViewShader);
        }
    });

var SearchMenuPopupBaseMenuItem = GObject.registerClass({
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
        if (this.actor.hover && this._menuLayout.newSearch && this._menuLayout.newSearch._highlightDefault)
            this._menuLayout.newSearch.highlightDefault(false);
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
            if (this.hasContextMenu && this._menuLayout.searchMenu.isOpen && !this._menuLayout._blockActivateEvent) {
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

var Tooltip = class ArcMenuTooltip { // eslint-disable-line no-unused-vars
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
        this._useTooltips = !this._settings.get_boolean('disable-tooltips');
        this.toggleID = this._settings.connect('changed::disable-tooltips', this.disableTooltips.bind(this));
    }

    setActive(active) {
        if (!active)
            this.hide();
    }

    disableTooltips() {
        this._useTooltips = !this._settings.get_boolean('disable-tooltips');
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

var SearchResultItem = GObject.registerClass( // eslint-disable-line no-unused-vars
    class ArcMenuSearchResultItem extends SearchMenuPopupBaseMenuItem {
        _init(menuLayout, app, path) {
            super._init(menuLayout);
            this._menuLayout = menuLayout;
            this._app = app;
            this.hasContextMenu = !!this._app;
            this._path = path;
        }

        _createIcon(iconSize) {
            return this._app.create_icon_texture(iconSize);
        }

        popupContextMenu() {
            if (this._app && this.contextMenu === undefined) {
                this.contextMenu = new ApplicationContextMenu(this.actor, this._app, this._menuLayout);
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
    });

var SearchBox = class ArcMenuSearchBox {
    constructor(menuLayout) {
        this.menuLayout = menuLayout;
        this.newSearch = this.menuLayout.newSearch;
        this.actor = new St.BoxLayout({
            x_expand: true,
            style_class: 'search-box search-box-padding',
        });
        this._stEntry = new St.Entry({
            hint_text: _('검색어를 입력하세요.'),
            track_hover: true,
            can_focus: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.START,
        });
        this.actor.style = 'margin: 0px; padding: 0px; width: 270px;';
        this._stEntry.style = 'border-radius:20px; padding: 7px 9px; background-color: rgb(255, 255, 255); color: rgb(0, 0, 0); margin: 6px 0px 3px 0px; font-weight: normal; height: 40px;';
        this._stEntry.get_hint_actor().style = 'color: rgb(0, 0, 0);';
        this._findIcon = new St.Icon({
            style_class: 'search-entry-icon',
            icon_name: 'edit-find-symbolic',
            icon_size: 16,
        });
        this._clearIcon = new St.Icon({
            style_class: 'search-entry-icon',
            icon_name: 'edit-clear-symbolic',
            icon_size: 16,
        });
        this._stEntry.set_primary_icon(this._findIcon);
        this.actor.add(this._stEntry);

        this._text = this._stEntry.get_clutter_text();
        this._textChangedId = this._text.connect('text-changed', this._onTextChanged.bind(this));
        this._keyPressId = this._text.connect('key-press-event', this._onKeyPress.bind(this));
        this._keyFocusInId = this._text.connect('key-focus-in', this._onKeyFocusIn.bind(this));
        this._text.connect('button-press-event', this._onButtonPress.bind(this));
        this._searchIconClickedId = 0;
        this._inputHistory = [];
        this._maxInputHistory = 5;

        this.actor.connect('destroy', this._onDestroy.bind(this));
    }

    _onButtonPress() {
        if (!this.menuLayout.searchMenu.isOpen)
            this.menuLayout.searchMenu.open();

    }

    updateStyle() {
        let style = this._stEntry.style;
        this._stEntry.style = style.replace('border-width: 0;', '');
    }

    _pushInput(searchString) {
        if (this._inputHistory.length === this._maxInputHistory)
            this._inputHistory.shift();

        this._inputHistory.push(searchString);
    }

    _lastInput() {
        if (this._inputHistory.length !== 0)
            return this._inputHistory[this._inputHistory.length - 1];

        return '';
    }

    _previousInput() {
        if (this._inputHistory.length > 1)
            return this._inputHistory[this._inputHistory.length - 2];

        return '';
    }

    getText() {
        return this._stEntry.get_text();
    }

    setText(text) {
        this._stEntry.set_text(text);
    }

    grabKeyFocus() {
        this._stEntry.grab_key_focus();
    }

    hasKeyFocus() {
        return this._stEntry.contains(global.stage.get_key_focus());
    }

    clear() {
        this._stEntry.set_text('');
        this.emit('cleared');
    }

    isEmpty() {
        return this._stEntry.get_text() === '';
    }

    _isActivated() {
        return this._stEntry.get_text() !== '';
    }

    _setClearIcon() {
        this._stEntry.set_secondary_icon(this._clearIcon);
        if (this._searchIconClickedId === 0) {
            this._searchIconClickedId = this._stEntry.connect('secondary-icon-clicked',
                this.clear.bind(this));
        }
    }

    _unsetClearIcon() {
        if (this._searchIconClickedId > 0)
            this._stEntry.disconnect(this._searchIconClickedId);

        this._searchIconClickedId = 0;
        this._stEntry.set_secondary_icon(null);
    }

    _onTextChanged(/* entryText*/) {
        let searchString = this._stEntry.get_text();
        this._pushInput(searchString);
        if (this._isActivated()) {
            this._setClearIcon();
        } else {
            this._unsetClearIcon();
            if (searchString === '' && this._previousInput() !== '')
                this.emit('cleared');


        }
        this.emit('changed', searchString);
    }

    _onKeyPress(actor, event) {
        let symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_Return ||
            symbol === Clutter.KEY_KP_Enter) {
            if (!this.isEmpty()) {
                if (this.newSearch.getTopResult())
                    this.newSearch.getTopResult().activate(event);

            }
            return Clutter.EVENT_STOP;
        }
        this.emit('key-press-event', event);
        return Clutter.EVENT_PROPAGATE;
    }

    _onKeyFocusIn(/* actor*/) {
        this.emit('key-focus-in');
        return Clutter.EVENT_PROPAGATE;
    }

    _onDestroy() {
        if (this._textChangedId > 0) {
            this._text.disconnect(this._textChangedId);
            this._textChangedId = 0;
        }
        if (this._keyPressId > 0) {
            this._text.disconnect(this._keyPressId);
            this._keyPressId = 0;
        }
        if (this._keyFocusInId > 0) {
            this._text.disconnect(this._keyFocusInId);
            this._keyFocusInId = 0;
        }
    }
};
Signals.addSignalMethods(SearchBox.prototype);
