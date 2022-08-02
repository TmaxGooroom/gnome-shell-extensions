const { GObject, GLib, Meta } = imports.gi;

const SystemActions = imports.misc.systemActions;
const Params = imports.misc.params;

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

const META_MONITORS_CONFIG_METHOD_PERSISTENT = 2;

class Monitor {
    _findClosestMode(width, height, refreshRate) {
        let closest = null;

        for (let mode of this.possibleModes) {
            if (mode.width !== width || mode.height !== height)
                continue;

            if (mode.refreshRate === refreshRate) {
                closest = mode;
                break;
            }

            if (!closest || mode.refreshRate < refreshRate)
                closest = mode;
        }

        return closest;
    }

    setConfig(config) {
        config = Params.parse(config, {}, true);

        let names = Object.getOwnPropertyNames(config);
        for (let name of names)
            this[`${name}`] = config[`${name}`];

    }
}

class DisplayConfig {
    constructor(resources, currentState) {
        this._outputs = []; // physical monitors
        if (resources)
            this._setResources(resources);
        if (currentState)
            this._setCurrentState(currentState);

        for (let output of this._outputs) {
            if (output['isPrimary']) {
                this.primaryOutput = output;
                break;
            }
        }
    }

    _setResources(resources) {
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

        // reverse the original array to fit the outputs order with gnome-settings
        // gnome-settings are numbering the physical monitor to the reverse order of the physical monitor list.
        // e.g) if the original list is [DP-1, DP-3, HDMI-1], then the number of each element would be 3, 2, 1.
        for (let output of resources[2].reverse()) {
            let productSerial = output[7]['serial'].deepUnpack();
            let monitor = new Monitor();
            monitor.setConfig({
                productSerial,
                'currentCrtc': output[2],
                'isPrimary': output[7]['primary'] ? output[7]['primary'].deepUnpack() : false,
                'underscanning': output[7]['underscanning'] ? output[7]['underscanning'] : false,
                'supportsUnderscanning': output[7]['supportsUnderscanning'] ? output[7]['supportsUnderscanning'] : false,
            });
            this._outputs.push(monitor);
        }
    }

    _setCurrentState(current) {
        this._serial = current[0];
        for (let monitor of current[1]) {
            let serial = monitor[0][3];

            let index = this._outputs.findIndex(output => output['productSerial'] === serial);
            if (index === -1)
                return;

            let config = {
                'connector': monitor[0][0],
                'possibleModes': [],
                'isBuiltin': monitor[2]['is-builtin'] ? monitor[2]['is-builtin'].deepUnpack() : false,
            };

            for (let mode of monitor[1]) {
                config['possibleModes'].push({
                    'modeID': mode[0],
                    'width': mode[1],
                    'height': mode[2],
                    'refreshRate': mode[3],
                    'preferredScale': mode[4],
                    'possibleScale': mode[5],
                    'isCurrent': mode[6]['is-current'] ? mode[6]['is-current'].deepUnpack() : false,
                    'isPreferred': mode[6]['is-preferred'] ? mode[6]['is-preferred'].deepUnpack() : false,
                });
                if (mode[6]['is-current'] && mode[6]['is-current'].deepUnpack() === true)
                    config['currentMode'] = mode[0];
                if (mode[6]['is-preferred'] && mode[6]['is-preferred'].deepUnpack() === true)
                    config['preferredMode'] = mode[0];
            }
            this._outputs[index].setConfig(config);
        }

        // built-in display is always 1.
        for (let i in this._outputs) {
            if (this._outputs[i]['isBuiltin']) {
                let output = this._outputs[i];
                this._outputs.splice(i, 1);
                this._outputs.unshift(output);
                break;
            }
        }

        for (let crtc of current[2]) {
            let serial = crtc[5][0][3];
            let output = this._outputs.find(ele => ele['productSerial'] === serial);

            let crtcID = output['currentCrtc'];

            // validate scale
            let modeID = output['currentMode'] ? output['currentMode'] : output['preferredMode'];
            for (let mode of output['possibleModes']) {
                if (mode['modeID'] !== modeID)
                    continue;

                if (mode['possibleScale'].includes(crtc[2]))
                    this._crtcs[crtcID]['scale'] = crtc[2];
            }

            // validate transform
            if (crtc[3] >= 0 && crtc[3] < this._crtcs[crtcID]['possibleTransforms'].length)
                this._crtcs[crtcID]['transform'] = crtc[3];
        }
    }

    _gatherMirrorModes() {
        if (this._outputs.length < 2)
            return null;

        let modesInCommon = [];
        for (let mode of this.primaryOutput.possibleModes) {
            let [width, height, refreshRate] = [mode.width, mode.height, mode.refreshRate];

            let possible = true;
            for (let output of this._outputs) {
                if (output.isPrimary)
                    continue;

                let closestMode = output._findClosestMode(width, height, refreshRate);

                if (!closestMode) {
                    possible = false;
                    break;
                }
            }

            if (possible)
                modesInCommon.push(mode);

        }

        return modesInCommon;
    }

    getModeForMirror() {
        // The mode priority is following.
        // currentMode > preferredMode > the first element of modes in common.
        // Remember that this is just the most resonable option at this point, so can be modified.
        let modesInCommon = this._gatherMirrorModes();
        if (!modesInCommon)
            return null;

        let best = modesInCommon[0] || null;

        for (let mode of modesInCommon) {
            if (mode.modeID === this.primaryOutput.currentMode)
                best = mode;

            if (mode.modeID === this.primaryOutput.preferredMode)
                best = best || mode;
        }

        return best;
    }

}

var SwitchMonitorManager = class { // eslint-disable-line no-unused-vars
    constructor() {
        this._proxy = new Utils.MutterDisplayConfigProxy();
        this._monitorManager = Meta.MonitorManager.get();
    }

    canSwitchConfig() {
        return this._monitorManager.can_switch_config();
    }

    async _getDisplayConfig() {
        let resources = await this._proxy.call('GetResources');
        let currentState = await this._proxy.call('GetCurrentState');
        let displayConfig = new DisplayConfig(resources, currentState);

        return displayConfig;
    }

    async setDisplayMirrored() {
        let displayConfig = await this._getDisplayConfig();

        let serial = displayConfig._serial;
        let method = META_MONITORS_CONFIG_METHOD_PERSISTENT;

        let crtcID = displayConfig.primaryOutput['currentCrtc'];
        let scale = displayConfig._crtcs[crtcID]['scale'];
        let transform = displayConfig._crtcs[crtcID]['transform'];

        let mode = displayConfig.getModeForMirror();
        if (!mode)
            return;

        let logicalMonitor = [];
        displayConfig._outputs.forEach(output => {
            let modeID = output._findClosestMode(mode.width, mode.height, mode.refreshRate).modeID;

            let properties = {
                'enable_underscanning': output['underscanning'] ? output['underscanning'] : new GLib.Variant('b', false),
            };

            let monitor = [output['connector'], modeID, properties];

            logicalMonitor.push(monitor);

        });

        // x, y, scale, transform, is primary
        let logicalMonitors = [0, 0, scale, transform, true];
        logicalMonitors.push(logicalMonitor);
        try {
            await this._proxy.call('ApplyMonitorsConfig', [serial, method, [logicalMonitors], [new GLib.Variant('a{sv}', {})]]);
        } catch (e) {
            log(e);
        }
    }

    async setDisplayJoined() {
        try {
            let displayConfig = await this._getDisplayConfig();

            let serial = displayConfig._serial;
            let method = META_MONITORS_CONFIG_METHOD_PERSISTENT;

            let logicalMonitors = [];

            // 1. set primary monitor as the leftmost monitor
            let crtcID = displayConfig.primaryOutput['currentCrtc'];

            let x = 0;
            let y = 0;
            let scale = displayConfig._crtcs[crtcID]['scale'];
            let transform = displayConfig._crtcs[crtcID]['transform'];

            let modeID = displayConfig.primaryOutput['currentMode'];

            let properties = {
                'enable_underscanning': displayConfig.primaryOutput['underscanning'] ? displayConfig.primaryOutput['underscanning'] : new GLib.Variant('b', false),
            };

            let monitor = [displayConfig.primaryOutput['connector'], modeID, properties];

            let logicalMonitor = [x, y, scale, transform, true, [monitor]];
            logicalMonitors.push(logicalMonitor);

            x += displayConfig._crtcs[crtcID]['width'];
            let subMonitors = displayConfig._outputs.filter(output => !output['isPrimary']);

            // 2. X coordinates of other monitors should be determined by their order
            subMonitors.forEach(output => {
                transform = 0;
                modeID = output['currentMode'] ? output['currentMode'] : output['preferredMode'];

                let mode;
                for (let i in output['possibleModes']) {
                    if (output['possibleModes'][i]['modeID'] === modeID) {
                        mode = output['possibleModes'][i];
                        break;
                    }
                }
                scale = mode['preferredScale'];

                properties = {
                    'enable_underscanning': output['underscanning'] ? output['underscanning'] : new GLib.Variant('b', false),
                };

                monitor = [output['connector'], modeID, properties];
                logicalMonitor = [x, y, scale, transform, false, [monitor]];
                logicalMonitors.push(logicalMonitor);

                x += mode['width'];
            });

            await this._proxy.call('ApplyMonitorsConfig', [serial, method, logicalMonitors, [new GLib.Variant('a{sv}', {})]]);
        } catch (e) {
            log(e);
        }
    }

    async setSingleDisplay(index = 0) {
        try {
            let displayConfig = await this._getDisplayConfig();

            let serial = displayConfig._serial;
            let method = META_MONITORS_CONFIG_METHOD_PERSISTENT;

            let crtcID = displayConfig.primaryOutput['currentCrtc'];
            let scale = displayConfig._crtcs[crtcID]['scale'];
            let transform = displayConfig._crtcs[crtcID]['transform'];

            let logicalMonitor = [];

            let target = displayConfig._outputs[index];
            if (!target)
                return;

            let modeID = target['currentMode'] ? target['currentMode'] : target['preferredMode'];

            let properties = {
                'enable_underscanning': target['underscanning'] ? target['underscanning'] : new GLib.Variant('b', false),
            };

            let monitor = [target['connector'], modeID, properties];

            logicalMonitor.push(monitor);

            // x, y, scale, transform, is primary
            let logicalMonitors = [0, 0, scale, transform, true];
            logicalMonitors.push(logicalMonitor);

            await this._proxy.call('ApplyMonitorsConfig', [serial, method, [logicalMonitors], [new GLib.Variant('a{sv}', {})]]);
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
