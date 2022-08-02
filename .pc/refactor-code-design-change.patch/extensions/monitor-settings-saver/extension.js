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

    let monitorInfo = xrandrParse(runXrandr(''));

    let outputStream = confFile.replace('', false, 0, null);
    outputStream.write(monitorInfo, null);
    outputStream.close(null);
}

function xrandrParse(stdout) {
    if (!stdout)
        return;

    let ret = '';
    ByteArray.toString(stdout).split('\n').forEach(line => {
        if (line.includes(' connected')) {
            log('connected');
            let tok = line.split(' ');
            ret += `--output ${tok[0]} `;
            if (tok[2] === 'primary') {
                ret += '--primary ';
                tok.splice(2, 1);
            }
            let temp = tok[2].split('+');
            ret += `--mode ${temp[0]} `;
            ret += `--pos ${temp[1]}x${temp[2]} `;
            if (tok[3] !== '(normal')
                ret += `--rotate ${tok[4]} `;
            else
                ret += '--rotate normal ';
        }
    });
    return ret;
}
