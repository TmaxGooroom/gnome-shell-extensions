/* exported xrandrParse */

const ByteArray = imports.byteArray;
const GLib = imports.gi.GLib;

function xrandrParse() {
    let monitorProps = runXrandr();
    if (!monitorProps)
        return;

    let monitors = [];
    let lines = ByteArray.toString(monitorProps).split('\n');
    for (let i = 0; i < lines.length; i++) {
    // find connector line
        if (lines[i].includes(' connected')) {
            let monitor = new class {}();
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
            if (infoline[4] !== 'normal') {
                if (infoline[4] === 'inverted')
                    monitor.rotation = 'upside_down';
                else
                    monitor.rotation = `${infoline[4]}`;
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
                } else if (lines[j].includes('*current')) {
                    // rate parsing, rate = pixel clock / ( total height pixel * total width pixel)
                    let pixelClock = Number(lines[j].split(' ').filter(word => word.length > 1)[2].split('MHz')[0]);
                    let totalHeightPixel = Number(lines[j + 1].split(' ').filter(word => word.length > 1)[8]);
                    let totalWidthPixel = Number(lines[j + 2].split(' ').filter(word => word.length > 1)[8]);
                    monitor.rate = String(pixelClock * 1000000 / totalHeightPixel / totalWidthPixel);
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
    [success, stdout,, status] = GLib.spawn_command_line_sync('xrandr --verbose');

    if (!success || status)
        return;

    return stdout;
}
