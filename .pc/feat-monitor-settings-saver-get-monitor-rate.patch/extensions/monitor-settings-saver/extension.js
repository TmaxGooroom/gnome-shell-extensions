const ByteArray = imports.byteArray;

const { Gio, GLib, Meta } = imports.gi;

const Main = imports.ui.main;

var monitorManager = Meta.MonitorManager.get();
var monitorsXml = `${GLib.get_home_dir()}/.config/monitors.xml`;
var xmlFile = Gio.File.new_for_path(monitorsXml);

function init(metadata) { // eslint-disable-line no-unused-vars
}

function enable() { // eslint-disable-line no-unused-vars

    saveSettings();
    this._monitorChangeId = monitorManager.connect('monitors-changed', () => {
        // TODO check whether new monitor attached
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

    let monitorInfo = xrandrParse();
    if (monitorInfo)
        writeXml(monitorInfo);
}

let monitorInfo = class {
};

function xrandrParse() {
    let monitorProps = runXrandr();
    if (!monitorProps)
        return;

    let monitors = [];
    let lines = ByteArray.toString(monitorProps).split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(' connected')) {
            let monitor = new monitorInfo();

            // monitor info parsing
            let tok = lines[i].split(' ');
            monitor.connector = `${tok[0]}`;
            if (tok[2] === 'primary') {
                monitor.isPrimary = true;
                tok.splice(2, 1);
            } else {
                monitor.isPrimary = false;
            }
            let pos = tok[2].split('+');
            monitor.x = `${pos[1]}`;
            monitor.y = `${pos[2]}`;
            let res = pos[0].split('x');
            monitor.width = `${res[0]}`;
            monitor.height = `${res[1]}`;
            if (tok[3] !== '(normal')
                monitor.transform = `${tok[4]} `;

            // EDID parsing
            for (let j = i + 1; j < lines.length; j++) {
                if (lines[j].includes('EDID:')) {
                    let edid = '';
                    for (let k = 1; k <= 8; k++)
                        edid += lines[j + k].replace('\n', '').replace('\t\t', '');

                    // vendor
                    let vendor = '';
                    let bin = parseInt(edid.substr(16, 4), 16).toString(2).padStart(16, '0');
                    vendor += String.fromCharCode(64 + parseInt(bin.substr(1, 5), 2));
                    vendor += String.fromCharCode(64 + parseInt(bin.substr(6, 5), 2));
                    vendor += String.fromCharCode(64 + parseInt(bin.substr(11, 5), 2));
                    monitor.vendor = vendor;
                    // serial, product
                    for (let k = 0; k < 4; k++) {
                        let descriptor = edid.substr(108 + 36 * k, 36);
                        if (descriptor.substr(0, 10) === '000000ff00') {
                            let serial = '';
                            for (let l = 10; l < descriptor.length; l += 2)
                                serial += String.fromCharCode(parseInt(descriptor.substr(l, 2), 16)).replace('\n', '');
                            monitor.serial = serial;
                        }
                        if (descriptor.substr(0, 10) === '000000fc00') {
                            let product = '';
                            for (let l = 10; l < descriptor.length; l += 2)
                                product += String.fromCharCode(parseInt(descriptor.substr(l, 2), 16)).replace('\n', '');
                            monitor.product = product;
                        }
                    }
                    break;
                }
            }

            // rate parsing


            monitors.push(monitor);
        }
    }
    return monitors;
}

function runXrandr() {
    let success, stdout, status;
    try {
        [success, stdout,, status] = GLib.spawn_command_line_sync('xrandr --props');
    } catch (e) {
        log('xrandr is not available');
        return;
    }

    if (!success || status)
        return;

    return stdout;
}

function writeXml(monitors) {
    if (xmlFile.query_exists(null)) {
        readXml();
        // add compare monitorspec
        return;
    }

    // write configuration
    let outputStream = xmlFile.replace('', false, 0, null);
    outputStream.write(monitors, null);
    outputStream.close(null);
}

function readXml() {
    // read xml
}
