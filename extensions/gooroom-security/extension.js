/* exported init, enable, disable */
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { getSettings } = imports.misc.extensionUtils;

const SecurityUtils = Me.imports.securityUtils;

const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const ByteArray = imports.byteArray;
const PanelMenu = imports.ui.panelMenu;

const { Gio, GObject, St } = imports.gi;

const systemVulnerablePath = '/var/tmp/GOOROOM-SECURITY-STATUS-VULNERABLE';

var menuButton;
var vulnerableMonitor;

var vulnerableHistory = 0;

// var jsonLogObject;
var vulnerableUpdateId = 0;

var settings;
var settingsChangedId = 0;

var GooroomSecurityButton = GObject.registerClass(class GooroomSecurityButton extends PanelMenu.Button {
    _init() {
        super._init(0.5, 'goorooom-security');

        this.imageItem = new PopupMenu.PopupSubMenuMenuItem('보안상태: ', true);
        this.statusLabel = new St.Label();
        this.imageItem.insert_child_at_index(this.statusLabel, 3);

        this.menu.addMenuItem(this.imageItem);
        this.imageItem.menu.addSettingsAction('구름 보안상태 도구', 'gooroom-security-status-tool.desktop');
        this.measure = this.imageItem.menu.addAction('안전 조치 실행', safetyMeasureHandler);
        this.measure.set_reactive(false);

        this.trayIcon = new St.Icon({ icon_size: 20 });
        this.add_child(this.trayIcon);
        this.update(-1);
    }

    update(vulnerableBit) {
        if (vulnerableBit < 0) {
            this.statusLabel.text = '알수없음';
            this.statusLabel.style = '';
            this.measure.set_reactive(false);
            this.trayIcon.icon_name = 'security-status-unknown';
            this.imageItem.icon.icon_name = 'security-status-unknown';
        } else if (vulnerableBit === 0) {
            this.statusLabel.text = '안전';
            this.statusLabel.style = 'color: green';
            this.measure.set_reactive(false);
            this.trayIcon.icon_name = 'security-status-safety';
            this.imageItem.icon.icon_name = 'security-status-safety';

        } else if (vulnerableBit >= 0) {
            this.statusLabel.text = '취약';
            this.statusLabel.style =  'color: red';
            this.measure.set_reactive(true);
            this.trayIcon.icon_name = 'security-status-vulnerable';
            this.imageItem.icon.icon_name = 'security-status-vulnerable';

        }

    }
});

function updateSecurityStatus() {
    let [jsonVulnerable, jsonObject_]  = SecurityUtils.runLogparser();

    /* this code is test code for parsing variable case json object parsing
    if(!jsonLogObject){
        global.log("initial test setting");
        jsonLogObject = jsonObject_;
    } else {
        global.log("already initialized");
        jsonVulnerable = SecurityUtils.parseJsonObject(jsonLogObject);
    }
    */

    if (jsonVulnerable < 0) {
        global.log('error happened during run logparser');
        menuButton.update(jsonVulnerable);
        return;
    }

    let file = Gio.File.new_for_path(systemVulnerablePath);

    let lastVulnerable = 0;
    try {
        let [result, outputByteArray] = file.load_contents(null);

        if (result) {
            let output = ByteArray.toString(outputByteArray);
            let outputInt = parseInt(output);
            lastVulnerable = outputInt;
        }
    } catch (e) {
        global.log('something happened');
        global.log(e);
    }
    if (jsonVulnerable === 0 && lastVulnerable === 0) {
        menuButton.update(0);
        // global.log("It is safe")
    } else if (jsonVulnerable > 0) {
        SecurityUtils.sendNotification(jsonVulnerable);
        menuButton.update(jsonVulnerable);
        vulnerableHistory |= jsonVulnerable;
        SecurityUtils.setLastVulnerable(vulnerableHistory);
    }

}

function safetyMeasureHandler() {

    if (SecurityUtils.isGooroomAgentServiceActive())
        SecurityUtils.sendTakingMeasureSignalToAgent();
    else
        SecurityUtils.sendTakingMeasureSignalToSelf(); // send taking mesure singal to self
    SecurityUtils.setLastVulnerable(0);
}

function vulnerableUpdateHandler(obj, file, otherfile, eventType) {
    if (eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT)
        updateSecurityStatus();

}

function init() {
    global.log('init');

    settings = getSettings();
    let vulnerableFile = Gio.File.new_for_path(systemVulnerablePath);

    vulnerableMonitor = vulnerableFile.monitor_file(Gio.FileMonitorFlags.NONE, null);
}

function enable() {
    global.log('enable');

    vulnerableUpdateId = vulnerableMonitor.connect('changed', vulnerableUpdateHandler);
    settingsChangedId = settings.connect('changed::cycle-time', updateSecurityStatus.bind(this));

    menuButton = new GooroomSecurityButton();

    Main.panel.addToStatusArea('gooroom-security', menuButton, null, 'right');
    updateSecurityStatus();

}

function disable() {
    global.log('disable');

    settings.disconnect(settingsChangedId);
    settingsChangedId = 0;

    vulnerableMonitor.disconnect(vulnerableUpdateId);
    vulnerableUpdateId = 0;

    SecurityUtils.setLastVulnerable(0);
    menuButton.destroy();
}
