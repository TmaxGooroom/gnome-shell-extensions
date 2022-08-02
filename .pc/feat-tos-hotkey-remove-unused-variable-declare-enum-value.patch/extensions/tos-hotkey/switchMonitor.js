const { GObject, GLib, Meta } = imports.gi;

const SystemActions = imports.misc.systemActions;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const BaseWidget = Me.imports.baseWidget;
const Utils = Me.imports.utils;

const PRIMARY_ONLY_FILE_PATH = '/assets/tos_img_dualmonitor01.svg';
const MIRROR_MODE_FILE_PATH = '/assets/tos_img_dualmonitor02.svg';
const JOIN_MODE_FILE_PATH = '/assets/tos_img_dualmonitor03.svg';
const SECONDARY_ONLY_FILE_PATH = '/assets/tos_img_dualmonitor04.svg';

const _ = imports.gettext.domain(Utils.TRANSLATION_DOMAIN).gettext;

const PRIMARY_ONLY_LABEL_TEXT = _('Screen 1 only');
const MIRROR_MODE_LABEL_TEXT = _('Duplicate');
const JOIN_MODE_LABEL_TEXT = _('Expand');
const SECONDARY_MODE_LABEL_TEXT = _('Screen 2 only');

var DisplayConfig = class { // eslint-disable-line no-unused-vars
    constructor(resources, currentState) {
        this._outputs = {}; // physical monitors
        if (resources)
            this.setResources(resources);
        if (currentState)
            this.setCurrentState(currentState);
    }

    setResources(resources) {
        this._serial = resources[0];
        this._crtcs = [];
        for (let crtc of resources[1]) {
            this._crtcs.push({
                'width': crtc[4],
                'height': crtc[5],
                'currentMode': crtc[6],
                'currentTransform': crtc[7],
                'possibleTransforms': crtc[8],

                // default scale and transform
                'scale': 1.0,
                'transform': 0,
            });
        }
        this._outputs = new Map();
        for (let output of resources[2]) {
            let productSerial = output[7]['serial'].deepUnpack();
            this._outputs.set(productSerial, {
                'currentCrtc': output[2],
                'isPrimary': output[7]['primary'] ? output[7]['primary'].deepUnpack() : false,
                'underscanning': output[7]['underscanning'] ? output[7]['underscanning'] : false,
                'supportsUnderscanning': output[7]['supportsUnderscanning'] ? output[7]['supportsUnderscanning'] : false,
            });

            if (this._outputs.get(productSerial)['isPrimary'])
                this._primaryMonitor = this._outputs.get(productSerial);
        }
        this._availableModes = resources[3];
        this._maxScreenWidth = resources[4];
        this._maxScreenHeight = resources[5];
    }

    setCurrentState(current) {
        this._serial = current[0];
        for (let monitor of current[1]) {
            let serial = monitor[0][3];

            let temp = this._outputs.has(serial) ? this._outputs.get(serial) : {};
            temp['connector'] = monitor[0][0];
            temp['possibleModes'] = [];
            for (let mode of monitor[1]) {
                temp['possibleModes'].push({
                    'modeID': mode[0],
                    'preferredScale': mode[4],
                    'possibleScale': mode[5],
                    'isCurrent': mode[6]['is-current'] ? mode[6]['is-current'].deepUnpack() : false,
                    'isPreferred': mode[6]['is-preferred'] ? mode[6]['is-preferred'].deepUnpack() : false,
                });
                if (mode[6]['is-current'] && mode[6]['is-current'].deepUnpack() === true)
                    temp['currentMode'] = mode[0];
                if (mode[6]['is-preferred'] && mode[6]['is-preferred'].deepUnpack() === true)
                    temp['preferredMode'] = mode[0];
            }
            temp['is-builtin'] = monitor[2]['is-builtin'] ? monitor[2]['is-builtin'].deepUnpack() : false;
            this._outputs.set(serial, temp);
        }

        for (let monitor of current[2]) {
            let serial = monitor[5][0][3];
            let logicalMonitor = this._outputs.get(serial);

            let crtcID = logicalMonitor['currentCrtc'];

            // validate scale
            let modeID = logicalMonitor['currentMode'] ? logicalMonitor['currentMode'] : logicalMonitor['preferredMode'];
            for (let mode of logicalMonitor['possibleModes']) {
                if (mode['modeID'] !== modeID)
                    continue;

                if (mode['possibleScale'].includes(monitor[2]))
                    this._crtcs[crtcID]['scale'] = monitor[2];
            }

            // validate transform
            if (monitor[3] >= 0 && monitor[3] < this._crtcs[crtcID]['possibleTransforms'].length)
                this._crtcs[crtcID]['transform'] = monitor[3];
        }
    }
};

var SwitchMonitorManager = class { // eslint-disable-line no-unused-vars
    constructor() {
        this._proxy = new Utils.MutterDisplayConfigProxy();
        this._monitorManager = Meta.MonitorManager.get();
    }

    canSwitchConfig() {
        return this._monitorManager.can_switch_config();
    }

    async setDisplayMirrored() {
        let resources = await this._proxy.call('GetResources');
        let currentState = await this._proxy.call('GetCurrentState');

        let displayConfig = new DisplayConfig(resources, currentState);

        let serial = displayConfig._serial;
        let method = 2;
        let scale, transform;

        let logicalMonitor = [];
        displayConfig._outputs.forEach(output => {
            if (output['isPrimary']) {
                let crtcID = output['currentCrtc'];
                scale = displayConfig._crtcs[crtcID]['scale'];
                transform = displayConfig._crtcs[crtcID]['transform'];
            }

            let modeID = output['currentMode'] ? output['currentMode'] : output['preferredMode'];

            let properties = {
                'enable_underscanning': output['underscanning'] ? output['underscanning'] : new GLib.Variant('b', false),
            };

            let monitor = [output['connector'], modeID, properties];

            logicalMonitor.push(monitor);

        });

        let logicalMonitors = [0, 0, scale, transform, true]; // x, y, scale, transform, is primary
        logicalMonitors.push(logicalMonitor);

        try {
            await this._proxy.call('ApplyMonitorsConfig', [serial, method, [logicalMonitors], [new GLib.Variant('a{sv}', {})]]);
        } catch (e) {
            log(e);
        }
    }

    async setDisplayJoined() {
        let resources = await this._proxy.call('GetResources');
        let currentState = await this._proxy.call('GetCurrentState');

        let displayConfig = new DisplayConfig(resources, currentState);

        let serial = displayConfig._serial;
        let method = 2;

        let logicalMonitors = [];
        displayConfig._outputs.forEach(output => {
            let x, y = 0, scale, transform;
            let crtcID = output['currentCrtc'];
            if (output['isPrimary'])
                x = 0;
            else
                x = displayConfig._crtcs[crtcID]['width'];

            scale = displayConfig._crtcs[crtcID]['scale'];
            transform = displayConfig._crtcs[crtcID]['transform'];

            let modeID = output['currentMode'] ? output['currentMode'] : output['preferredMode'];

            let properties = {
                'enable_underscanning': output['underscanning'] ? output['underscanning'] : new GLib.Variant('b', false),
            };

            let monitor = [output['connector'], modeID, properties];

            let logicalMonitor = [x, y, scale, transform, output['isPrimary'], [monitor]];
            logicalMonitors.push(logicalMonitor);

        });

        try {
            await this._proxy.call('ApplyMonitorsConfig', [serial, method, logicalMonitors, [new GLib.Variant('a{sv}', {})]]);
        } catch (e) {
            log(e);
        }
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
            text: _('select a display mode.') });

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
