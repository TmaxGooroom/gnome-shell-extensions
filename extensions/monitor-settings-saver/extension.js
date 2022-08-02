const Meta = imports.gi.Meta;
const Main = imports.ui.main;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const XrandrParser = Me.imports.xrandrParser;
const XmlWriter = Me.imports.xmlWriter;

var monitorManager = Meta.MonitorManager.get();

function init(metadata) { // eslint-disable-line no-unused-vars
}

function enable() { // eslint-disable-line no-unused-vars

    this.monitorNum = Main.layoutManager.monitors.length;
    saveSettings();

    this._monitorChangeId = monitorManager.connect('monitors-changed', () => {
        // check whether monitor attached or detached
        if (this.monitorNum === Main.layoutManager.monitors.length)
            return;
        this.monitorNum = Main.layoutManager.monitors.length;
        saveSettings();
    });
}

function disable() { // eslint-disable-line no-unused-vars
    monitorManager.disconnect(this._monitorChangeId);
}

function saveSettings() {
    // only single monitor, no need to select primary monitor
    if (Main.layoutManager.monitors.length < 2)
        return;

    let monitorInfo = XrandrParser.xrandrParse();
    if (monitorInfo)
        XmlWriter.writeXml(monitorInfo);
}
