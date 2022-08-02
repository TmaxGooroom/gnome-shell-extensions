/* exported XrandrFinder, findPanelConnectorArray */
const ByteArray = imports.byteArray;

const GLib = imports.gi.GLib;

class XrandrFinder {
    constructor() {
        let [ret, output] = GLib.spawn_command_line_sync('xrandr');
        if (ret === false) {
            global.log('something error happend');
        } else {
            let outString = ByteArray.toString(output);
            let outStringArray = outString.split('\n');
            this.result = outStringArray.filter(line => {
                return line.includes('connected') && !line.includes('disconnected');
            });
            this.panelConnector = this.result.filter(line => {
                let connector = line.split(' ')[0];
                return connector.includes('eDP') || connector.includes('DSI') || connector.includes('LVDS');
            }).map(line => {
                return line.split(' ')[0];
            });
        }
    }
}

function findPanelConnectorArray() {
    let [ret, output] = GLib.spawn_command_line_sync('xrandr');
    if (ret === false) {
        global.log('something error happend');
        return null;
    } else {
        let outString = ByteArray.toString(output);
        let outStringArray = outString.split('\n');
        this.result = outStringArray.filter(line => {
            return line.includes('connected') && !line.includes('disconnected');
        });
        return this.result.filter(line => {
            let connector = line.split(' ')[0];
            return connector.includes('eDP') || connector.includes('DSI') || connector.includes('LVDS');
        }).map(line => {
            return line.split(' ')[0];
        });
    }
}
