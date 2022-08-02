// Credits:
// Some code was adapted from the upstream Gnome Shell source code.

const { Atk, Clutter, GObject, Gio, Shell, St } = imports.gi;

const Layout = imports.ui.layout;
const Main = imports.ui.main;
const Params = imports.misc.params;

const GrabHelper = imports.ui.grabHelper;

var OPEN_AND_CLOSE_TIME = 100;

var State = {
    OPENED: 0,
    CLOSED: 1,
    OPENING: 2,
    CLOSING: 3,
    FADED_OUT: 4,
};

var IconLabelButton = GObject.registerClass(
class IconLabelButton extends St.BoxLayout {
    _init(params) {
        params = Params.parse(params, {
            style_class: 'system-widget-button',
            reactive: true,
            track_hover: true,
            can_focus: true,
            handler: null,
            accessible_role: Atk.Role.TOGGLE_BUTTON,
        });
        super._init({ style_class: params.style_class,
            reactive: params.reactive,
            track_hover: params.reactive,
            can_focus: params.can_focus,
            accessible_role: params.accessible_role });

        this._delegate = this;

        if (params.handler)
            this._handler = params.handler;

        this.connect('notify::reactive', () => {
            if (this.reactive)
                this.set_opacity(255);
            else
                this.set_opacity(31); // #1f
        });
    }

    vfunc_key_focus_in() {
        this.add_style_pseudo_class('focus');
    }

    vfunc_key_focus_out() {
        this.remove_style_pseudo_class('focus');
    }

    vfunc_button_press_event() {
        this.add_style_pseudo_class('active');
    }

    vfunc_button_release_event() {
        this.remove_style_pseudo_class('active');
        this._handler();
    }

    vfunc_key_release_event(event) {
        if (event.keyval === Clutter.KEY_Return)
            this._handler();


        return Clutter.EVENT_PROPAGATE;
    }
});

var BaseWidget = GObject.registerClass({ // eslint-disable-line no-unused-vars
    Properties: {
        'state': GObject.ParamSpec.int('state', 'Dialog state', 'state',
            GObject.ParamFlags.READABLE,
            Math.min(...Object.values(State)),
            Math.max(...Object.values(State)),
            State.CLOSED),
    },
    Signals: { 'opened': {}, 'closed': {} },
}, class BaseWidget extends St.Widget {
    _init(params) {
        super._init({ layout_manager: new Clutter.BinLayout(),
            visible: false,
            x: 0,
            y: 0,
            accessible_role: Atk.Role.DIALOG });

        params = Params.parse(params, { styleClass: null,
            actionMode: Shell.ActionMode.NORMAL,
            shouldFadeIn: true,
            shouldFadeOut: true,
            destroyOnClose: false });

        this._state = State.CLOSED;
        this._actionMode = params.actionMode;
        this._shouldFadeIn = params.shouldFadeIn;
        this._shouldFadeOut = params.shouldFadeOut;
        this._destroyOnClose = params.destroyOnClose;

        Main.uiGroup.add_actor(this);

        let constraint = new Clutter.BindConstraint({ source: global.stage,
            coordinate: Clutter.BindCoordinate.ALL });
        this.add_constraint(constraint);

        this.backgroundStack = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true,
        });

        // transparent background
        this._backgroundBin = new St.Bin({ child: this.backgroundStack });
        this._monitorConstraint = new Layout.MonitorConstraint();
        this._backgroundBin.add_constraint(this._monitorConstraint);
        this.add_actor(this._backgroundBin);

        this.box = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
        });
        this.add_actor(this.box);

        this.baseLayout = new St.BoxLayout({
            style_class: 'system-widget',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            vertical: true,
        });
        this.box.add_actor(this.baseLayout);

        this.contentLayout = new St.BoxLayout({
            style_class: 'system-widget-content-box',
            vertical: true,
            y_expand: true,
        });
        this.baseLayout.add_actor(this.contentLayout);

        this.buttonLayout = new St.Widget({
            layout_manager: new Clutter.BoxLayout({ homogeneous: true }),
            style_class: 'system-widget-button-box',
        });
        this.baseLayout.add_actor(this.buttonLayout);

        this._grabHelper = new GrabHelper.GrabHelper(this);
        Main.layoutManager.connect('system-modal-opened', () => this.close());
    }

    get state() {
        return this._state;
    }

    _setTitle(title) {
        let label = new St.Label({ style_class: 'system-widget-title',
            text: title });
        this.contentLayout.add_actor(label);
    }

    _setState(state) {
        if (this._state === state)
            return;

        this._state = state;
        this.notify('state');
    }

    _fadeOpen(onPrimary) {
        if (onPrimary)
            this._monitorConstraint.primary = true;
        else
            this._monitorConstraint.index = global.display.get_current_monitor();

        this._setState(State.OPENING);

        this.baseLayout.opacity = 255;

        this.opacity = 0;
        this.show();
        this.ease({
            opacity: 255,
            duration: this._shouldFadeIn ? OPEN_AND_CLOSE_TIME : 0,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._setState(State.OPENED);
                this.emit('opened');
            },
        });
    }

    open(onPrimary) {
        if (this.state === State.OPENED || this.state === State.OPENING)
            return true;

        this._fadeOpen(onPrimary);
        this._grabHelper.grab({ actor: this,
            focus: this.buttonLayout.get_children()[0],
            onUngrab: this.close.bind(this) });
        return true;
    }

    _closeComplete() {
        this._setState(State.CLOSED);
        this.hide();
        this.emit('closed');

        if (this._destroyOnClose)
            this.destroy();
    }

    close() {
        if (this.state === State.CLOSED || this.state === State.CLOSING)
            return;

        if (this._grabHelper._isWithinGrabbedActor(this))
            this._grabHelper.ungrab();

        this._setState(State.CLOSING);

        if (this._shouldFadeOut) {
            this.ease({
                opacity: 0,
                duration: OPEN_AND_CLOSE_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => this._closeComplete(),
            });
        } else {
            this._closeComplete();
        }
    }

    addButton(labelText, iconName, params) {
        let icon = new St.Icon({ style_class: 'system-widget-button-image',
            y_align: Clutter.ActorAlign.CENTER,
            gicon: Gio.icon_new_for_string(iconName),
            icon_size: 38 });
        let label = new St.Label({ style_class: 'system-widget-button-label',
            text: labelText,
            y_align: Clutter.ActorAlign.CENTER });

        let button = new IconLabelButton(params);

        button.add_child(icon);
        button.add_child(label);
        button.vertical = true;

        this.buttonLayout.add_child(button);

        return button;
    }

    _isWithinFocusGroup(actor) {
        if (this.buttonLayout.get_children().includes(actor))
            return true;

        return false;
    }

    _navigateFocus(event) {
        let keyval = event.keyval;
        let current = global.stage.key_focus;
        let direction;

        switch (keyval) {
        case Clutter.KEY_Down:
        case Clutter.KEY_Left:
        case Clutter.KEY_ISO_Left_Tab:
            direction = St.DirectionType.TAB_BACKWARD;
            break;
        case Clutter.KEY_Up:
        case Clutter.KEY_Right:
            direction = St.DirectionType.TAB_FORWARD;
            break;
        case Clutter.KEY_Tab:
            if (event.modifier_state & Clutter.SHIFT_MAST)
                direction = St.DirectionType.TAB_BACKWARD;
            else
                direction = St.DirectionType.TAB_FORWARD;
            break;
        default:
            break;
        }

        if (direction !== undefined)
            return this.buttonLayout.navigate_focus(current, direction, true);


        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_key_press_event(event) {
        if (this._isWithinFocusGroup(event.source))
            return this._navigateFocus(event);

    }
});
