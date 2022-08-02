/* exported Tray */
const { Clutter } = imports.gi;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

const Signals = imports.signals;

class Tray {
    enable(aggregateMenu) {
        this._originalTray = aggregateMenu;
        this._menu = this._originalTray.menu;
        this._indicators = this._originalTray._indicators;
        this._originalMenuItems = this._menu._getMenuItems();

        this._originalEventFunc = this._originalTray.vfunc_event;
        // remove original event function when aggregateMenu is pressed
        Utils.hookVfunc(Object.getPrototypeOf(this._originalTray), 'event', () => {
            return Clutter.EVENT_PROPAGATE;
        });

        let indicators = this._indicators.get_children();
        indicators.forEach(indicator => {
            let id = indicator.connect('event', this._onTrayClicked.bind(this));
            indicator.track_hover = true;

            this.connect('disabled', () => {
                indicator.disconnect.bind(indicator, id);
                indicator.track_hover = false;
            });
        });

        // make synchronize the visibility of menu item with icon
        let power = this._originalTray._power;
        power._oldSync = power._sync;
        power._sync = () => {
            power.visible = power._item.visible;
            power._oldSync();
        };

        power._sync();
    }

    disable() {
        Utils.hookVfunc(Object.getPrototypeOf(this._originalTray), 'event', this._originalEventFunc);
        this._restoreOriginalMenu();

        let power = this._originalTray._power;
        power._sync = power._oldSync;
        power.visible = true;

        this._originalTray = null;
        this._menu = null;
        this._indicators = null;
        this._originalMenuItems = null;
        this._originalEventFunc = null;


        this.emit('disabled');
    }

    _restoreOriginalMenu() {
        this._clearMenu();
        this._originalMenuItems.forEach(menuItem => {
            this._menu.addMenuItem(menuItem);
        });
        this._menu.sourceActor = this._originalTray;
    }

    _clearMenu() {
        let menus = this._menu._getMenuItems();
        menus.forEach(menu => {
            this._menu.box.remove_child(menu.actor);
        });
    }

    _changeSourceIndicator(actor) {
        this._clearMenu();
        this._menu.addMenuItem(actor.menu);
        this._menu.sourceActor = actor;
    }

    _onTrayClicked(actor, event) {
        if (actor.menu &&
          (event.type() === Clutter.EventType.TOUCH_BEGIN ||
           event.type() === Clutter.EventType.BUTTON_PRESS)) {
            this._changeSourceIndicator(actor);
            this._menu.toggle(true);
        } else if (actor.menu && (event.type() === Clutter.EventType.MOTION ||
                    event.type() === Clutter.EventType.ENTER ||
                    event.type() === Clutter.EventType.LEAVE)) {
            if (this._menu.isOpen && this._menu.sourceActor !== actor) {
                this._menu.close();
                this._changeSourceIndicator(actor);
                this._menu.open();
            }
        }

        return Clutter.EVENT_STOP;
    }
}

Signals.addSignalMethods(Tray.prototype);
