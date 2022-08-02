/* exported xrandrParse */
/* parse xrandr --verbose, parse EDID, calculate refresh rate
 * see details from xrandr manpage */

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
            if (infoline.includes('primary')) {
                monitor.isPrimary = true;
                let pos = infoline.find(e => e.includes('+') && e.includes('x')).split('+');
                monitor.x = `${pos[1]}`;
                monitor.y = `${pos[2]}`;
                let res = pos[0].split('x');
                monitor.width = `${res[0]}`;
                monitor.height = `${res[1]}`;
                // parsing transform option - not necessary
            /* if (infoline[5] === 'left' || infoline[5] === 'right')
                    monitor.rotation = `${infoline[5]}`;
              if (infoline[5] === 'inverted')
                    monitor.rotation = 'upside_down';*/
            } else {
                monitor.isPrimary = false;
                let pos = infoline.find(e => e.includes('+') && e.includes('x')).split('+');
                monitor.x = `${pos[1]}`;
                monitor.y = `${pos[2]}`;
                let res = pos[0].split('x');
                monitor.width = `${res[0]}`;
                monitor.height = `${res[1]}`;
            /* if (infoline[4] === 'left' || infoline[4] === 'right')
                    monitor.rotation = `${infoline[4]}`;
              if (infoline[4] === 'inverted')
                    monitor.rotation = 'upside_down';*/
            }

            let edid = '';
            for (let j = i + 1; j < lines.length; j++) {
                // EDID parsing
                if (lines[j].includes('EDID:')) {
                    for (let k = 1; k <= 8; k++)
                        edid += lines[j + k].replace('\n', '').replace('\t\t', '');
                    // vendor, serial, product
                    let vendor = '';
                    let bin = parseInt(edid.substr(16, 4), 16).toString(2).padStart(16, '0');
                    vendor += String.fromCharCode(64 + parseInt(bin.substr(1, 5), 2));
                    vendor += String.fromCharCode(64 + parseInt(bin.substr(6, 5), 2));
                    vendor += String.fromCharCode(64 + parseInt(bin.substr(11, 5), 2));
                    monitor.vendor = vendor;
                    monitor.product = `0x${edid.substr(20, 4)}`;
                    monitor.serial = `0x${edid.substr(24, 8)}`;
                    // if serial, product information is in display descriptor, use it
                    for (let k = 0; k < 4; k++) {
                        let descriptor = edid.substr(108 + 36 * k, 36);
                        if (descriptor.substr(0, 10) === '000000ff00') {
                            let dscSerial = '';
                            for (let l = 10; l < descriptor.length; l += 2)
                                dscSerial += String.fromCharCode(parseInt(descriptor.substr(l, 2), 16)).replace('\n', '').trim();
                            if (dscSerial !== '')
                                monitor.serial = dscSerial;
                        }
                        if (descriptor.substr(0, 10) === '000000fc00') {
                            let dscProduct = '';
                            for (let l = 10; l < descriptor.length; l += 2)
                                dscProduct += String.fromCharCode(parseInt(descriptor.substr(l, 2), 16)).replace('\n', '').trim();
                            if (dscProduct !== '')
                                monitor.product = dscProduct;
                        }
                    }
                } else if (lines[j].includes('*current')) {
                    // rate parsing, rate = pixel clock / ( total height pixel * total width pixel)
                    let pixelClock = Number(lines[j].split(' ').filter(word => word.length > 1)[2].split('MHz')[0]);
                    let totalHeightPixel = Number(lines[j + 1].split(' ').filter(word => word.length > 1)[8]);
                    let totalWidthPixel = Number(lines[j + 2].split(' ').filter(word => word.length > 1)[8]);
                    monitor.rate = String(pixelClock * 1000000 / totalHeightPixel / totalWidthPixel);
                } else if (lines[j].includes('connected')) { // another connector, end
                    if (!edid) { // edid info not found
                        monitor.vendor = 'unknown';
                        monitor.serial = 'unknown';
                        monitor.product = 'unknown';
                    }
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
