const ByteArray = imports.byteArray;

const { Gio, GLib } = imports.gi;

const Main = imports.ui.main;

var filename = `${GLib.get_home_dir()}/.config/monitorsettings`;
var confFile = Gio.File.new_for_path(filename);

function init(metadata) { // eslint-disable-line no-unused-vars
}

function enable() { // eslint-disable-line no-unused-vars
    let ok, cmdLine;

    // check settings saved before
    if (confFile.query_exists(null))
        [ok, cmdLine] = confFile.load_contents(null);

    // if settings are loaded and with multi-monitor environment, apply primary monitor setting
    if (Main.layoutManager.monitors.length >= 2 && ok)
        runXrandr(ByteArray.toString(cmdLine));

    this._primaryMonitorId = Main.layoutManager.connect('monitors-changed', () => {
        saveSettings();
    });
    saveSettings();
}

function disable() { // eslint-disable-line no-unused-vars
    Main.layoutManager.disconnect(this._primaryMonitorId);
}

function runXrandr(cmdLine) {
    let success, stdout, status;
    try {
        [success, stdout,, status] = GLib.spawn_command_line_sync(`xrandr ${cmdLine}`);
    } catch (e) {
        log('xrandr is not available');
        return;
    }

    if (!success || status)
        return;

    return stdout;
}

function saveSettings() {
    // only single monitor, no need to select primary monitor
    if (Main.layoutManager.monitors.length < 2)
        return;

    let outputStream = confFile.replace('', false, 0, null);
    outputStream.close(null);

    let primaryMonitor = xrandrGetPrimary(runXrandr(''));
    if (primaryMonitor)
        writePrimary(primaryMonitor);
}

function xrandrGetPrimary(stdout) {
    if (!stdout)
        return;

    let ret;
    let str = ByteArray.toString(stdout).split('\n');
    str.forEach(line => {
        if (line.includes('primary'))
            ret = line.split(' ')[0];
    });
    return ret;
}

function writePrimary(monitor) {
    let outputStream = confFile.append_to(0, null);
    outputStream.write(`--output ${monitor} --primary `, null);
    outputStream.close(null);
}
