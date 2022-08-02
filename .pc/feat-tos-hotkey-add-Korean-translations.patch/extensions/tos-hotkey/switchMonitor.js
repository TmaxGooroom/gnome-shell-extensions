const { GObject, GLib, Meta } = imports.gi;

const _ = imports.gettext.gettext;

const SystemActions = imports.misc.systemActions;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const BaseWidget = Me.imports.baseWidget;
const Utils = Me.imports.utils;

const PRIMARY_ONLY_FILE_PATH = '/assets/tos_img_dualmonitor01.svg';
const MIRROR_MODE_FILE_PATH = '/assets/tos_img_dualmonitor02.svg';
const JOIN_MODE_FILE_PATH = '/assets/tos_img_dualmonitor03.svg';
const SECONDARY_ONLY_FILE_PATH = '/assets/tos_img_dualmonitor04.svg';

const PRIMARY_ONLY_LABEL_TEXT = _('1번 화면만');
const MIRROR_MODE_LABEL_TEXT = _('복제');
const JOIN_MODE_LABEL_TEXT = _('확장');
const SECONDARY_MODE_LABEL_TEXT = _('2번 화면만');

var SwitchMonitorManager = class { // eslint-disable-line no-unused-vars
    constructor() {
        this._proxy = new Utils.MutterDisplayConfigProxy();
        this._monitorManager = Meta.MonitorManager.get();
    }

    canSwitchConfig() {
        return this._monitorManager.can_switch_config();
    }

    setDisplayMirrored() {
        this._monitorManager.switch_config(Meta.MonitorSwitchConfigType.ALL_MIRROR);
    }

    setDisplayJoined() {
        this._monitorManager.switch_config(Meta.MonitorSwitchConfigType.ALL_LINEAR);
    }

    async setSingleDisplay(index = 1) {
        let resources = await this._proxy.call('GetResources');
        let currentState = await this._proxy.call('GetCurrentState');

        try {
            let crtcId = resources[2][index] ? resources[2][index][2] : -1;
            let transform, scale, currentMode;
            if (crtcId !== -1) {
                transform = resources[1][crtcId][7];
                currentMode = resources[1][crtcId][6];

                // check whether that the given mode actually exist. If not, set `currentMode` to null
                if (currentState[1][index][1][currentMode] && currentState[1][index][1][currentMode][6]['is-current'])
                    // use preferred scale for given mode
                    scale = currentState[1][index][1][currentMode][4];
                else
                    currentMode = null;
            }

            // if there is no crtc for given index, use default transform(0), preferred mode
            if (!transform)
                transform = 0;

            if (!currentMode) {
                let possibleModes = currentState[1][index][1];

                for (let idx in possibleModes) {
                    if (possibleModes[idx][6]['is-preferred'] && possibleModes[idx][6]['is-preferred'].get_boolean()) {
                        currentMode = idx;
                        scale = possibleModes[idx][4];
                    }
                }
                if (!currentMode) {
                    currentMode = 0;
                    scale = 1.0;
                }
            }

            let properties = {};
            if (!currentState[1][index][2]['is-underscanning'])
                properties['underscanning'] = new GLib.Variant('b', false);
            else
                properties['underscanning'] = new GLib.Variant('b', true);

            let logicalMonitor = [currentState[1][index][0][0], currentState[1][index][1][currentMode][0], properties]; // connector id, mode id(e.g. 1920x1080@60)
            let logicalMonitors = [0, 0, scale, transform, true]; // x, y, scale, transform, is primary
            logicalMonitors.push([logicalMonitor]);
            await this._proxy.call('ApplyMonitorsConfig', [currentState[0], 2, [logicalMonitors], [new GLib.Variant('a{sv}', {})]]);
        } catch (e) {
            log(e);
        }
    }
};


var SwitchMonitorWidget = GObject.registerClass({ // eslint-disable-line no-unused-vars
    Properties: {
        'can-switch-config': GObject.ParamSpec.boolean('can-switch-config', 'can-switch-config', 'can-switch-config',
            GObject.ParamFlags.READABLE,
            false),
    },
}, class SwitchMonitorWidget extends BaseWidget.BaseWidget {
    _init() {
        super._init({ style_class: 'switch-monitor-widget' });
        this.systemActions = SystemActions.getDefault();
        this._setTitle({ style_class: 'system-widget-title',
            text: _('디스플레이 방식을 선택해 주세요') });

        this._monitorManager = new SwitchMonitorManager();
        this._canSwitchConfig = this._monitorManager.canSwitchConfig();
        this._addActionToButtons();
    }

    get canSwitchConfig() {
        return this._canSwitchConfig;
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

        button = this.addButton({ style_class: 'switch-monitor-widget',
            labelText: PRIMARY_ONLY_LABEL_TEXT,
            iconName: Me.path + PRIMARY_ONLY_FILE_PATH,
            handler: this._createHandler(this._monitorManager.setSingleDisplay.bind(this._monitorManager, 0)) });

        // display mirror
        button = this.addButton({ style_class: 'switch-monitor-widget',
            labelText: MIRROR_MODE_LABEL_TEXT,
            iconName: Me.path + MIRROR_MODE_FILE_PATH,
            handler: this._createHandler(this._monitorManager.setDisplayMirrored.bind(this._monitorManager)) });
        this.bind_property('can-switch-config', button, 'reactive', bindFlags);
        this.bind_property('can-switch-config', button, 'can_focus', bindFlags);

        // display join
        button = this.addButton({ style_class: 'switch-monitor-widget',
            labelText: JOIN_MODE_LABEL_TEXT,
            iconName: Me.path + JOIN_MODE_FILE_PATH,
            handler: this._createHandler(this._monitorManager.setDisplayJoined.bind(this._monitorManager)) });
        this.bind_property('can-switch-config', button, 'reactive', bindFlags);
        this.bind_property('can-switch-config', button, 'can_focus', bindFlags);

        button = this.addButton({ style_class: 'switch-monitor-widget',
            labelText: SECONDARY_MODE_LABEL_TEXT,
            iconName: Me.path + SECONDARY_ONLY_FILE_PATH,
            handler: this._createHandler(this._monitorManager.setSingleDisplay.bind(this._monitorManager, 1)) });
        this.bind_property('can-switch-config', button, 'reactive', bindFlags);
        this.bind_property('can-switch-config', button, 'can_focus', bindFlags);
    }

    open(onPrimary) {
        this._canSwitchConfig = this._monitorManager.canSwitchConfig();
        this.notify('can-switch-config');
        super.open(onPrimary);
    }
});
