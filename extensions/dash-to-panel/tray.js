/* exported Tray */
const { Clutter, GObject, Gio, St } = imports.gi;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

const { loadInterfaceXML } = imports.misc.fileUtils;
const DisplayDeviceInterface = loadInterfaceXML('org.freedesktop.UPower.Device');
const PowerManagerProxy = Gio.DBusProxy.makeProxyWrapper(DisplayDeviceInterface);
const BrightnessInterface = loadInterfaceXML('org.gnome.SettingsDaemon.Power.Screen');
const BrightnessProxy = Gio.DBusProxy.makeProxyWrapper(BrightnessInterface);

class Tray {
    enable(aggregateMenu) {
        this._originalTray = aggregateMenu;
        this._menu = this._originalTray.menu;
        this._indicators = this._originalTray._indicators;

        this._originalEventFunc = this._originalTray.vfunc_event;
        // remove original event function when aggregateMenu is pressed
        Utils.hookVfunc(Object.getPrototypeOf(this._originalTray), 'event', () => {
            return Clutter.EVENT_PROPAGATE;
        });

        let brightness = this._originalTray._brightness;
        let brightnessIndicator = brightness._addIndicator();
        brightnessIndicator.icon_name = 'display-brightness-symbolic';
        brightness._indicator = brightnessIndicator;

        this._indicators.add_child(brightness);
        this._indicators.set_child_at_index(brightness, 0);

        new BrightnessProxy(
            Gio.DBus.session,
            'org.gnome.SettingsDaemon.Power',
            '/org/gnome/SettingsDaemon/Power',
            (proxy, error) => {
                if (error) {
                    log('error connecting to org.gnome.SettingsDaemon.Power');
                    return;
                }

                // Sometimes Brightness becomes null value for some reason, so it needs to be checked.
                // e.g. gnome-settings-daemon is initialized after tray construction.
                proxy.connect('g-properties-changed', () => {
                    brightness.visible = proxy.Brightness !== null ? proxy.Brightness >= 0 : false;
                });

                brightness.visible = proxy.Brightness !== null ? proxy.Brightness >= 0 : false;
            }
        );

        let power = this._originalTray._power;
        new PowerManagerProxy(
            Gio.DBus.system,
            'org.freedesktop.UPower',
            '/org/freedesktop/UPower/devices/DisplayDevice',
            (proxy, error) => {
                if (error) {
                    log('error connecting to org.freedesktop.UPower');
                    return;
                }

                proxy.connect('g-properties-changed', () => {
                    power.visible = proxy.IsPresent;
                });

                power.visible = proxy.IsPresent;
            }
        );

        this._changeOutputVolumeIcon();

        let indicators = this._indicators.get_children();

        this._connectedSignals = [];
        indicators.forEach(indicator => {
            let id = indicator.connect('event', this._onTrayEvent.bind(this));
            this._connectedSignals.push(id);
            indicator.track_hover = true;
        });

        this._indicators.get_last_child().visible = false;
        this._clearMenu();
    }

    disable() {
        Utils.hookVfunc(Object.getPrototypeOf(this._originalTray), 'event', this._originalEventFunc);
        this._restoreOriginalMenu();

        this._indicators.get_last_child().visible = true;

        this._revertOutputVolumeIcon();

        let power = this._originalTray._power;
        power.visible = true;

        let brightness = this._originalTray._brightness;
        brightness._indicator.destroy();
        brightness._indicator = null;
        brightness.visible = false;

        let indicators = this._indicators.get_children();
        for (let i = 0; i < this._connectedSignals.length; i++) {
            let indicator = indicators[i];
            let id = this._connectedSignals[i];

            indicator.disconnect(id);
            indicator.track_hover = false;
        }
        this._connectedSignals = [];

        this._originalTray = null;
        this._menu = null;
        this._indicators = null;
        this._originalEventFunc = null;
    }

    _restoreOriginalMenu() {
        let menus = this._menu._getMenuItems();
        menus.forEach(menu => {
            menu.actor.show();
        });
        this._menu.sourceActor = this._originalTray;
    }

    _clearMenu() {
        let menus = this._menu._getMenuItems();
        menus.forEach(menu => {
            menu.actor.hide();
        });
    }

    _changeSourceIndicator(actor) {
        this._menu.sourceActor.menu.actor.hide();
        actor.menu.actor.show();
        this._menu.sourceActor = actor;
    }

    _onTrayEvent(actor, event) {
        if (actor.menu &&
          (event.type() === Clutter.EventType.TOUCH_BEGIN ||
           event.type() === Clutter.EventType.BUTTON_PRESS)) {
            // when tray menu item is clicked
            if (this._menu.sourceActor === actor) {
                this._menu.toggle();
            } else {
                this._menu.close();
                this._changeSourceIndicator(actor);
                this._menu.open();
            }
        } else if (!Me.settings.get_boolean('stockgs-panelbtn-click-only')) {
            if (actor.menu && event.type() === Clutter.EventType.ENTER) {
                // when tray menu item is hovered and another menu is already opened, change the opened menu with tray menu
                if (this._menu.isOpen && this._menu.sourceActor !== actor) {
                    this._menu.close();
                    this._changeSourceIndicator(actor);
                    this._menu.open();
                }
            }
        }

        return Clutter.EVENT_STOP;
    }

    _changeOutputVolumeIcon() {
        let volume = this._originalTray._volume;
        let output = volume._volumeMenu._output;

        let icon = new St.Icon({ style_class: 'popup-menu-icon' });
        let originalIcon = output._icon;

        output.item.add(icon);
        output.item.set_child_below_sibling(icon, originalIcon);

        icon.visible = true;
        originalIcon.visible = false;

        icon.icon_name = output.getIcon();
        let id = output.connect('stream-updated', () => {
            if (icon.icon_name !== output.getIcon())
                icon.icon_name = output.getIcon();

        });

        // block volume menu item event
        let handlerId = GObject.signal_handler_find(output.item, { signalId: 'button-press-event' });
        GObject.signal_handler_block(output.item, handlerId);
        icon.reactive = true;
        icon.connect('button-press-event', () => {
            let isMuted = output.stream.is_muted;
            output.stream.change_is_muted(!isMuted);
        });

        icon.connect('destroy', () => {
            output.disconnect(id);
            GObject.signal_handler_unblock(output.item, handlerId);
        });


        this._volumeMenuIcon = icon;
    }

    _revertOutputVolumeIcon() {
        this._originalTray._volume._volumeMenu._output._icon.visible = true;
        this._volumeMenuIcon.destroy();
    }
}