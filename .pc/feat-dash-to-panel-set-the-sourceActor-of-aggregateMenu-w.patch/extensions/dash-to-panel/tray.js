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
            this.connect('disabled', indicator.disconnect.bind(indicator, id));
            indicator.track_hover = true;
        });
    }

    disable() {
        Utils.hookVfunc(Object.getPrototypeOf(this._originalTray), 'event', this._originalEventFunc);
        this._restoreOriginalMenu();

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
    }

    _clearMenu() {
        let menus = this._menu._getMenuItems();
        menus.forEach(menu => {
            this._menu.box.remove_child(menu.actor);
        });
    }

    _onTrayClicked(actor, event) {
        if (event.type() === Clutter.EventType.TOUCH_BEGIN ||
           event.type() === Clutter.EventType.BUTTON_PRESS) {
            this._clearMenu();

            if (!actor.menu)
                return;

            this._menu.addMenuItem(actor.menu);
            if (actor === this._originalTray._power)
                this._menu.addMenuItem(this._originalTray._system.menu);

            this._menu.sourceActor = actor;
            this._menu.toggle(true);
        }
    }
}

Signals.addSignalMethods(Tray.prototype);
