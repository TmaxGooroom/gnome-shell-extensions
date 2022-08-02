const { Atk, Clutter, GObject, Gio, St } = imports.gi;

const _ = imports.gettext.gettext;

// const ModalDialog = imports.ui.modalDialog;

const SystemActions = imports.misc.systemActions;
const Params = imports.misc.params;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const ModalDialog = Me.imports.modalDialog;

const LOGOUT_IMG_FILE_PATH = '/assets/tos_desktop_ic_windowf4_logout.svg';
const USER_SWITCH_IMAGE_PATH = '/assets/tos_desktop_ic_windowf4_user.svg';
const SLEEP_IMAGE_PATH = '/assets/tos_desktop_ic_windowf4_sleep.svg';
const RESTART_IMAGE_PATH = '/assets/tos_desktop_ic_windowf4_restart.svg';
const POWEROFF_IMAGE_PATH = '/assets/tos_desktop_ic_windowf4_power.svg';

const LOGOUT_LABEL_TEXT = _('로그아웃');
const USER_SWITCH_LABEL_TEXT = _('사용자 전환');
const SLEEP_LABEL_TEXT = _('잠자기');
const RESTART_LABEL_TEXT = _('다시 시작');
const POWEROFF_LABEL_TEXT = _('시스템 종료');

var SystemDialogButton = GObject.registerClass(
class SystemDialogButton extends St.BoxLayout {
    _init(params) {
        params = Params.parse(params, {
            reactive: true,
            activate: true,
            hover: true,
            style_class: null,
            can_focus: true,
            x_expand: true,
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER,
            handler: null,
            systemDialog: null,
        });
        super._init({ style_class: 'system-dialog-button',
            reactive: params.reactive,
            track_hover: params.reactive,
            can_focus: params.can_focus,
            accessible_role: Atk.Role.TOGGLE_BUTTON });



        this._delegate = this;

        if (params.handler)
            this._handler = params.handler;


        if (params.systemDialog)
            this._systemDialog = params.systemDialog;
    }

    vfunc_button_press_event() {
        this.add_style_pseudo_class('active');
    }

    vfunc_button_release_event() {
        this.remove_style_pseudo_class('active');
        if (!this._handler)
            return Clutter.EVENT_PROPAGATE;

        this._systemDialog.close();
        this._handler();

        return Clutter.EVENT_STOP;
    }

    vfunc_key_release_event(event) {
        if (event.keyval === Clutter.KEY_Return)
            return this.vfunc_button_release_event();


        return Clutter.EVENT_PROPAGATE;
    }
});

var SystemDialog = GObject.registerClass( // eslint-disable-line no-unused-vars
class SystemDialog extends ModalDialog.ModalDialog {
    _init() {
        super._init({
            styleClass: 'system-dialog',
            destroyOnClose: false,
            shellReactive: true,
        });

        let _title = _('원하는 작업을 선택해 주세요.');
        let label = new St.Label({ style_class: 'system-dialog-title',
            text: _title });


        this.contentLayout.set_style_class_name('system-dialog-content-box');
        this.contentLayout.add_actor(label);

        this.systemActions = SystemActions.getDefault();

        this.buttonLayout.set_style_class_name('system-dialog-button-container');
        this._buttons = [];

        let iconPath = Me.path + LOGOUT_IMG_FILE_PATH;
        let button = this._createButton({
            handler: this.systemActions.activateLogout.bind(this.systemActions),
            systemDialog: this,
        }, iconPath, LOGOUT_LABEL_TEXT);
        button.add_style_pseudo_class('focus');
        this.buttonLayout.add_child(button);

        iconPath = Me.path + USER_SWITCH_IMAGE_PATH;
        button = this._createButton({
            handler: this.systemActions.activateSwitchUser.bind(this.systemActions),
            systemDialog: this,
        }, iconPath, USER_SWITCH_LABEL_TEXT);
        this.buttonLayout.add_child(button);

        iconPath = Me.path + SLEEP_IMAGE_PATH;
        button = this._createButton({
            handler: this.systemActions.activateSuspend.bind(this.systemActions),
            systemDialog: this,
        }, iconPath, SLEEP_LABEL_TEXT);
        this.buttonLayout.add_child(button);

        iconPath = Me.path + RESTART_IMAGE_PATH;
        button = this._createButton({
            handler: this.systemActions.activateRestart.bind(this.systemActions),
            systemDialog: this,
        }, iconPath, RESTART_LABEL_TEXT);
        this.buttonLayout.add_child(button);

        iconPath = Me.path + POWEROFF_IMAGE_PATH;
        button = this._createButton({
            handler: this.systemActions.activatePowerOff.bind(this.systemActions),
            systemDialog: this,
        }, iconPath, POWEROFF_LABEL_TEXT);
        this.buttonLayout.add_child(button);
    }

    _createButton(params, iconName, labelText) {
        let icon = new St.Icon({ style_class: 'system-dialog-button-image',
            y_align: Clutter.ActorAlign.CENTER,
            gicon: Gio.icon_new_for_string(iconName),
            icon_size: 38 });
        let label = new St.Label({ style_class: 'system-dialog-button-label',
            text: labelText,
            y_align: Clutter.ActorAlign.CENTER });
        let button = new SystemDialogButton(params);

        button.add_child(icon);
        button.add_child(label);

        button.vertical = true;

        this._buttons.push(button);

        return button;
    }
});
