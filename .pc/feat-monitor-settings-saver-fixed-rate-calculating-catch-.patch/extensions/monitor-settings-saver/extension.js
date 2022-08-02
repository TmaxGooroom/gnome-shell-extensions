const ByteArray = imports.byteArray;

const { Gio, GLib, Meta } = imports.gi;

const Main = imports.ui.main;

var monitorManager = Meta.MonitorManager.get();
var monitorsXml = `${GLib.get_home_dir()}/.config/monitors.xml`;
// var xmlFile = Gio.File.new_for_path(monitorsXml);
var xmlFile1 = Gio.File.new_for_path(`${monitorsXml}1`);

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
    // find connector line
        if (lines[i].includes(' connected')) {
            let monitor = new monitorInfo();
            // monitor info parsing
            let infoline = lines[i].split(' ');
            monitor.connector = `${infoline[0]}`;
            if (infoline[2] === 'primary') {
                monitor.isPrimary = true;
                infoline.splice(2, 1);
            } else {
                monitor.isPrimary = false;
            }
            let pos = infoline[2].split('+');
            monitor.x = `${pos[1]}`;
            monitor.y = `${pos[2]}`;
            let res = pos[0].split('x');
            monitor.width = `${res[0]}`;
            monitor.height = `${res[1]}`;
            if (infoline[3] !== '(normal') {
                if (infoline[3] === 'inverted')
                    monitor.rotation = 'upside_down';
                else
                    monitor.rotation = `${infoline[3]}`;
            }

            for (let j = i + 1; j < lines.length; j++) {
                // EDID parsing
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
                            monitor.serial = serial.trim();
                        }
                        if (descriptor.substr(0, 10) === '000000fc00') {
                            let product = '';
                            for (let l = 10; l < descriptor.length; l += 2)
                                product += String.fromCharCode(parseInt(descriptor.substr(l, 2), 16)).replace('\n', '');
                            monitor.product = product.trim();
                        }
                    }
                } else if (lines[j].includes(`${monitor.width}x${monitor.height}`)) { // rate parsing
                    let rateline = lines[j].split(' ').filter(word => word.length > 1);
                    monitor.rate = rateline.find(element => element.includes('*')).split('*')[0];
                } else if (lines[j].includes('connected')) { // another connector, end
                    break;
                }
            }
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
    let savedConfigurations = getSavedconf(monitorsXml);
    // if monitor.xml already has config, then exit
    // if (compareSpec(savedConfigurations, monitors))
    if (!compareSpec(savedConfigurations, monitors))
        return;

    // write configuration
    let outputStream = xmlFile1.replace('', false, 0, null);

    outputStream.write('<monitors version="2">\n', null);
    outputStream.write('  <configuration>\n', null);

    monitors.forEach(monitor => {
        outputStream.write('    <logicalmonitor>\n', null);
        outputStream.write(`      <x>${monitor.x}</x>\n`, null);
        outputStream.write(`      <y>${monitor.y}</y>\n`, null);
        outputStream.write('      <scale>1</scale>\n', null);
        if (monitor.isPrimary)
            outputStream.write('      <primary>yes</primary>\n', null);

        if (monitor.rotation) {
            outputStream.write('      <transform>\n', null);
            outputStream.write(`        <rotation>${monitor.rotation}</rotation>\n`, null);
            outputStream.write('        <flipped>no</flipped>\n', null);
            outputStream.write('      </transform>\n', null);
        }
        outputStream.write('      <monitor>\n', null);
        outputStream.write('        <monitorspec>\n', null);
        outputStream.write(`          <connector>${monitor.connector}</connector>\n`, null);
        outputStream.write(`          <vendor>${monitor.vendor}</vendor>\n`, null);
        outputStream.write(`          <product>${monitor.product}</product>\n`, null);
        outputStream.write(`          <serial>${monitor.serial}</serial>\n`, null);
        outputStream.write('        </monitorspec>\n', null);
        outputStream.write('        <mode>\n', null);
        outputStream.write(`          <width>${monitor.width}</width>\n`, null);
        outputStream.write(`          <height>${monitor.height}</height>\n`, null);
        outputStream.write(`          <rate>${monitor.rate}</rate>\n`, null);
        outputStream.write('        </mode>\n', null);
        outputStream.write('      </monitor>\n', null);

        outputStream.write('    </logicalmonitor>\n', null);
    });

    outputStream.write('  </configuration>\n', null);
    outputStream.write('</monitors>\n', null);

    outputStream.close(null);
}

function getSavedconf(file) {
    // read xml
    let [res, content] = GLib.file_get_contents(file);
    if (!res)
        return;

    // get monitorspec info from xml
    let configurations = [];
    let lines = ByteArray.toString(content).split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('<configuration>')) {
            let monitors = [];
            for (let j = i + 1; j < lines.length; j++) {
                if (lines[j].includes('<logicalmonitor>')) {
                    let monitor = new monitorInfo();
                    for (let k = j + 1; k < lines.length; k++) {
                        if (lines[k].includes('<connector>'))
                            monitor.x = lines[k].replace('<connector>').replace('</connector>');
                        if (lines[k].includes('<vendor>'))
                            monitor.x = lines[k].replace('<vendor>').replace('</vendor>');
                        if (lines[k].includes('<product>'))
                            monitor.x = lines[k].replace('<product>').replace('</product>');
                        if (lines[k].includes('<serial>'))
                            monitor.x = lines[k].replace('<serial>').replace('</serial>');
                    }
                    monitors.push(monitor);
                } else if (lines[j].includes('</configuration>')) {
                    break;
                }
            }
            configurations.push(monitors);
        }
    }

    return configurations;
}

function compareSpec(configurations, monitors) {
    if (!configurations || !monitors)
        return false;

    configurations.forEach(configuration => {
        if (configuration.length !== monitors.length)
            return false;
        for (let i = 0; i < monitors.length; i++) {
            let specDiff = configuration[i].connector !== monitors[i].connector ||
        configuration[i].vendor !== monitors[i].vendor ||
        configuration[i].product !== monitors[i].product ||
        configuration[i].serial !== monitors[i].serial;
            if (specDiff)
                return false;
        }
    });
    return true;
}
