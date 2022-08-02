/* exported writeXml */

const ByteArray = imports.byteArray;
const { Gio, GLib } = imports.gi;

var monitorsXml = `${GLib.get_home_dir()}/.config/monitors.xml`;
var xmlFile = Gio.File.new_for_path(`${monitorsXml}`);

function writeXml(monitors) {

    let [savedConf, savedSpec] = readMonitorSpec();

    if (savedConf) {
    // if monitor.xml already has valid config, then exit
        if (compareSpec(savedSpec, monitors))
            return;

        let outputStream = xmlFile.replace('', false, 0, null);
        let savedConfLines = ByteArray.toString(savedConf).split('\n');

        savedConfLines.forEach((line, i) => {
            // append configuration
            if (i === 1)
                writeConf(outputStream, monitors);
            outputStream.write(`${line}\n`, null);
        });

        outputStream.close(null);

    } else {
    // write configuration from scratch
        let outputStream = xmlFile.replace('', false, 0, null);

        outputStream.write('<monitors version="2">\n', null);
        writeConf(outputStream, monitors);
        outputStream.write('</monitors>\n', null);

        outputStream.close(null);

    }
}

function readMonitorSpec() {
    if (!xmlFile.query_exists(null))
        return [null, null];

    let [res, contents] = xmlFile.load_contents(null);

    if (!res)
        return [null, null];

    // get monitorspec info from xml
    let configurations = [];
    let lines = ByteArray.toString(contents).split('\n').filter(word => word.length > 0);

    if (lines[0].includes('<monitors version="') && lines[lines.length - 1].includes('</monitors>')) {

        for (let i = 1; i < lines.length - 1; i++) {
            if (lines[i].includes('<configuration>')) {
                let monitors = [];

                for (let j = i + 1; j < lines.length; j++) {
                    if (lines[j].includes('<logicalmonitor>')) {
                        let monitor = new class {}();

                        for (let k = j + 1; k < lines.length; k++) {
                            if (lines[k].includes('<monitorspec>')) {
                                monitor.connector = lines[k + 1].trim().replace('<connector>', '').replace('</connector>', '');
                                monitor.vendor = lines[k + 2].trim().replace('<vendor>', '').replace('</vendor>', '');
                                monitor.product = lines[k + 3].trim().replace('<product>', '').replace('</product>', '');
                                monitor.serial = lines[k + 4].trim().replace('<serial>', '').replace('</serial>', '');
                            } else if (lines[k].includes('</logicalmonitor>')) {
                                break;
                            }
                        }
                        if (monitor.connector && monitor.vendor && monitor.product && monitor.serial)
                            monitors.push(monitor);
                    } else if (lines[j].includes('</configuration>')) {
                        break;
                    }
                }

                if (monitors.length > 0)
                    configurations.push(monitors);

            }
        }

        return [contents, configurations];
    }

    return [null, null];
}

function compareSpec(configurations, monitors) {
    for (let i = 0; i < configurations.length; i++) {
        if (configurations[i].length !== monitors.length)
            return false;
        for (let j = 0; j < monitors.length; j++) {
            let specDiff = configurations[i][j].connector === monitors[i].connector &&
        configurations[i][j].vendor === monitors[i].vendor &&
        configurations[i][j].product === monitors[i].product &&
        configurations[i][j].serial === monitors[i].serial;
            return specDiff;
        }
    }
    return false;
}

function writeConf(outputStream, monitors) {
    outputStream.write('  <configuration>\n', null);
    monitors.forEach(monitor => {
        writeLogicalMonitor(outputStream, monitor);
    });
    outputStream.write('  </configuration>\n', null);
}

function writeLogicalMonitor(outputStream, monitor) {
    outputStream.write('    <logicalmonitor>\n', null);
    outputStream.write(`      <x>${monitor.x}</x>\n`, null);
    outputStream.write(`      <y>${monitor.y}</y>\n`, null);
    outputStream.write('      <scale>1</scale>\n', null);
    if (monitor.isPrimary)
        outputStream.write('      <primary>yes</primary>\n', null);
    if (monitor.rotation)
        writeTransform(outputStream, monitor);
    writeMonitor(outputStream, monitor);
    outputStream.write('    </logicalmonitor>\n', null);
}

function writeTransform(outputStream, monitor) {
    outputStream.write('      <transform>\n', null);
    outputStream.write(`        <rotation>${monitor.rotation}</rotation>\n`, null);
    outputStream.write('        <flipped>no</flipped>\n', null);
    outputStream.write('      </transform>\n', null);
}

function writeMonitor(outputStream, monitor) {
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
}
