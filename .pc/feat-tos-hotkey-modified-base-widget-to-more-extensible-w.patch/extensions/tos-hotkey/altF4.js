const { GObject } = imports.gi;

const _ = imports.gettext.gettext;

const SystemActions = imports.misc.systemActions;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const BaseWidget = Me.imports.baseWidget;

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


var SystemWidget = GObject.registerClass(// eslint-disable-line no-unused-vars
class SystemWidget extends BaseWidget.BaseWidget {
    _init() {
        super._init();
        this.systemActions = SystemActions.getDefault();
        this._setTitle(_('원하는 작업을 선택해 주세요.'));
        this._addActionToButtons();
    }

    _createHandler(handler) {
        if (!handler)
            return;

        let func = function func() {
            this.close();
            handler();
        }.bind(this, handler);

        return func;
    }

    _addActionToButtons() {
        let button;
        let bindFlags = GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE;

        button = this.addButton(LOGOUT_LABEL_TEXT, Me.path + LOGOUT_IMG_FILE_PATH,
            { handler: this._createHandler(this.systemActions.activateLogout.bind(this.systemActions)) });
        this.systemActions.bind_property('can-logout', button, 'reactive', bindFlags);
        this.systemActions.bind_property('can-logout', button, 'can-focus', bindFlags);

        button = this.addButton(USER_SWITCH_LABEL_TEXT, Me.path + USER_SWITCH_IMAGE_PATH,
            { handler: this._createHandler(this.systemActions.activateSwitchUser.bind(this.systemActions)) });
        this.systemActions.bind_property('can-switch-user', button, 'reactive', bindFlags);
        this.systemActions.bind_property('can-switch-user', button, 'can-focus', bindFlags);

        button = this.addButton(SLEEP_LABEL_TEXT, Me.path + SLEEP_IMAGE_PATH,
            { handler: this._createHandler(this.systemActions.activateSuspend.bind(this.systemActions)) });
        this.systemActions.bind_property('can-suspend', button, 'reactive', bindFlags);
        this.systemActions.bind_property('can-suspend', button, 'can-focus', bindFlags);

        button = this.addButton(RESTART_LABEL_TEXT, Me.path + RESTART_IMAGE_PATH,
            { handler: this._createHandler(this.systemActions.activateRestart.bind(this.systemActions)) });
        this.systemActions.bind_property('can-restart', button, 'reactive', bindFlags);
        this.systemActions.bind_property('can-restart', button, 'can-focus', bindFlags);

        button = this.addButton(POWEROFF_LABEL_TEXT, Me.path + POWEROFF_IMAGE_PATH,
            { handler: this._createHandler(this.systemActions.activatePowerOff.bind(this.systemActions)) }
        );
        this.systemActions.bind_property('can-power-off', button, 'reactive', bindFlags);
        this.systemActions.bind_property('can-power-off', button, 'can-focus', bindFlags);
    }
});
