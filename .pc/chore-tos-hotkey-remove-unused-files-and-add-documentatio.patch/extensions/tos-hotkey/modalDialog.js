// Credits:
// Some code was adapted from the upstream Gnome Shell source code.

const { Atk, Clutter, GObject, Shell, St } = imports.gi;

const Dialog = imports.ui.dialog;
const Layout = imports.ui.layout;
const Main = imports.ui.main;
const Params = imports.misc.params;

const GrabHelper = imports.ui.grabHelper;

var OPEN_AND_CLOSE_TIME = 100;
var FADE_OUT_DIALOG_TIME = 1000;

var State = {
    OPENED: 0,
    CLOSED: 1,
    OPENING: 2,
    CLOSING: 3,
    FADED_OUT: 4,
};

var ModalDialog = GObject.registerClass({ // eslint-disable-line no-unused-vars
    Properties: {
        'state': GObject.ParamSpec.int('state', 'Dialog state', 'state',
            GObject.ParamFlags.READABLE,
            Math.min(...Object.values(State)),
            Math.max(...Object.values(State)),
            State.CLOSED),
    },
    Signals: { 'opened': {}, 'closed': {} },
}, class ModalDialog extends St.Widget {
    _init(params) {
        super._init({ visible: false,
            x: 0,
            y: 0,
            accessible_role: Atk.Role.DIALOG });

        params = Params.parse(params, { shellReactive: false,
            styleClass: null,
            actionMode: Shell.ActionMode.SYSTEM_MODAL,
            shouldFadeIn: true,
            shouldFadeOut: true,
            destroyOnClose: true });

        this._state = State.CLOSED;
        this._actionMode = params.actionMode;
        this._shellReactive = params.shellReactive;
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
        this._backgroundBin = new St.Bin({ child: this.backgroundStack });
        this._monitorConstraint = new Layout.MonitorConstraint();
        this._backgroundBin.add_constraint(this._monitorConstraint);
        this.add_actor(this._backgroundBin);

        this.dialogLayout = new Dialog.Dialog(this.backgroundStack, params.styleClass);
        this.contentLayout = this.dialogLayout.contentLayout;
        this.buttonLayout = this.dialogLayout.buttonLayout;

        global.focus_manager.add_group(this.dialogLayout);
        this._initialKeyFocus = null;
        this._initialKeyFocusDestroyId = 0;
        this._savedKeyFocus = null;

        this._grabHelper = new GrabHelper.GrabHelper(this);
    }

    get state() {
        return this._state;
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

        this.dialogLayout.opacity = 255;
        if (this._lightbox)
            this._lightbox.lightOn();
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
        this._savedKeyFocus = null;

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

    // This method is like close, but fades the dialog out much slower,
    // and leaves the lightbox in place. Once in the faded out state,
    // the dialog can be brought back by an open call, or the lightbox
    // can be dismissed by a close call.
    //
    // The main point of this method is to give some indication to the user
    // that the dialog response has been acknowledged but will take a few
    // moments before being processed.
    // e.g., if a user clicked "Log Out" then the dialog should go away
    // immediately, but the lightbox should remain until the logout is
    // complete.
    _fadeOutDialog() {
        if (this.state === State.CLOSED || this.state === State.CLOSING)
            return;

        if (this.state === State.FADED_OUT)
            return;

        this.dialogLayout.ease({
            opacity: 0,
            duration: FADE_OUT_DIALOG_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => (this.state = State.FADED_OUT),
        });
    }
});
