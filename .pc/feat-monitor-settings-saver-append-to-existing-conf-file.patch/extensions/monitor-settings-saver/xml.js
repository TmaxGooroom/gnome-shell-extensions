/* exported writeXml */

const ByteArray = imports.byteArray;
const { Gio, GLib } = imports.gi;

var monitorsXml = `${GLib.get_home_dir()}/.config/monitors.xml`;
var xmlFile = Gio.File.new_for_path(`${monitorsXml}`);

function writeXml(monitors) {
    let savedConfigurations = getSavedconf(monitorsXml);
    // if monitor.xml already has config, then exit
    if (compareSpec(savedConfigurations, monitors))
        return;

    // write configuration
    let outputStream = xmlFile.replace('', false, 0, null);

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
                    let monitor = new class {}();
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
