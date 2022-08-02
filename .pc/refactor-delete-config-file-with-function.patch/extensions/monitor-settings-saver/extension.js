const ByteArray = imports.byteArray;

const { Gio, GLib } = imports.gi;

const Main = imports.ui.main;

var sysconfdir = '/usr/share/X11/xorg.conf.d/';
// var confdir = '/etc/X11/xorg.conf.d/';
var filename = '10-primary.conf';
var confFile = Gio.File.new_for_path(GLib.build_filenamev([sysconfdir, filename]));

function init(metadata) { // eslint-disable-line no-unused-vars
}

function enable() { // eslint-disable-line no-unused-vars
    this._primaryMonitorId = Main.layoutManager.connect('monitor-changed', () => {
        savePrimary();
    });
    savePrimary();
}

function disable() { // eslint-disable-line no-unused-vars
    Main.layoutManager.disconnect(this._primaryMonitorId);
}

function savePrimary() {
    if (Main.layoutManager.monitors.length < 2) {
        if (confFile.query_exists(null))
            confFile.delete(null);
        return;
    }
    let success, stdout, status;
    try {
        [success, stdout,, status] = GLib.spawn_command_line_sync('xrandr');
    } catch (e) {
        return;
    }

    if (!success || status)
        return;

    writeConf(xrandrGetPrimary(stdout));
}

function writeConf(primary) {
    let outputStream = confFile.replace('', false, 0, null);

    outputStream.write('Section "Monitor"\n', null);
    outputStream.write(`  Identifier "${primary}"\n`, null);
    outputStream.write('  Option "Primary" "true"\n', null);
    outputStream.write('EndSection\n', null);

    outputStream.close(null);
}

function xrandrGetPrimary(stdout) {
    let ret;
    let str = ByteArray.toString(stdout).split('\n');
    str.forEach(line => {
        if (line.includes('primary'))
            ret = line.split(' ')[0];
    });
    return ret;
}
