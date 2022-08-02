/* exported sendTakingMeasureSignalToAgent, sendTakingMeasureSignalToSelf,
isGooroomAgentServiceActive, setLastVulnerable, parseJsonObject, runLogparser, sendNotification */
/* this is API that uses Gooroom-security-utils package */
const Me = imports.misc.extensionUtils.getCurrentExtension();

const { GLib, Gio } = imports.gi;
const ByteArray = imports.byteArray;

const systemNextSeekTimePath = '/var/tmp/GOOROOM-SECURITY-LOGPARSER-NEXT-SEEKTIME';

const gooroomAgentServiceName = 'gooroom-agent.service';


const OS_VULNERABLE = 1 << 0;
const EXE_VULNERABLE = 1 << 1;
const BOOT_VULNERABLE = 1 << 2;
const MEDIA_VULNERABLE = 1 << 3;

function setLastVulnerable(value) {
    let pkexecPath = GLib.find_program_in_path('pkexec');
    if (pkexecPath === null) {
        global.log('there are no program path');
        return;
    }
    let cmdArray = [pkexecPath];

    cmdArray.push('/usr/lib/gooroom-security-utils/gooroom-security-status-vulnerable-helper');
    cmdArray.push(`${value}`);

    GLib.spawn_sync(null, cmdArray, null, null, null);
}

function sendTakingMeasureSignalToAgent() {
    let agentProxy = Gio.DBusProxy.new_for_bus_sync(imports.gi.Gio.BusType.SYSTEM, imports.gi.Gio.DBusProxyFlags.NONE, null, 'kr.gooroom.agent', '/kr/gooroom/agent', 'kr.gooroom.agent', null);
    let arg = new GLib.Variant('(s)', '{"module":{"module_name":"log","task":{"task_name":"clear_security_alarm","in":{}}}}');

    let variant = agentProxy.call_sync('do_task', arg, Gio.DBusCallFlags.NONE, -1, null);

    return variant;
}

function sendTakingMeasureSignalToSelf() {
    let pkexecPath = GLib.find_program_in_path('pkexec');
    if (pkexecPath === null) {
        global.log('there are no program path');
        return;
    }
    let cmdArray = [pkexecPath];

    cmdArray.push('/usr/lib/gooroom-security-utils/gooroom-logparser-seektime-helper');

    GLib.spawn_async(null, cmdArray, null, null, null);
}

function isGooroomAgentServiceActive() {
    let [ok, standardOutput] = GLib.spawn_command_line_sync(`systemctl show --value ${gooroomAgentServiceName} -p  ActiveState`);
    if (!ok) {
        global.log('Something happened during systemctl');
        return false;
    }

    let ouputString = imports.byteArray.toString(standardOutput);

    if (ouputString.includes('inactive'))
        return false;
    else
        return true;
}

function parseLog(logString) {
    let outputJSONIndex = logString.indexOf('JSON-ANCHOR=');
    let output = logString.slice(outputJSONIndex + 12);

    let JsonOutput = JSON.parse(output);

    let vulnerableBit = 0;
    if (!JsonOutput.os_status)
        global.log('os_status is not existed');
    else if (JsonOutput.os_status === 'vulnerable')
        vulnerableBit |= OS_VULNERABLE;
    if (!JsonOutput.exe_status)
        global.log('exe_status is not existed');
    else if (JsonOutput.exe_status === 'vulnerable')
        vulnerableBit |= EXE_VULNERABLE;
    if (!JsonOutput.boot_status)
        global.log('boot_status is not existed');
    else if (JsonOutput.boot_status === 'vulnerable')
        vulnerableBit |= BOOT_VULNERABLE;
    if (!JsonOutput.media_status)
        global.log('media_status is not existed');
    else if (JsonOutput.media_status === 'vulnerable')
        vulnerableBit |= OS_VULNERABLE;

    return [vulnerableBit, JsonOutput];
}

function parseJsonObject(JsonOutput) {
    let vulnerableBit = 0;
    if (!JsonOutput.os_status)
        global.log('os_status is not existed');
    else if (JsonOutput.os_status === 'vulnerable')
        vulnerableBit |= OS_VULNERABLE;
    if (!JsonOutput.exe_status)
        global.log('exe_status is not existed');
    else if (JsonOutput.exe_status === 'vulnerable')
        vulnerableBit |= EXE_VULNERABLE;
    if (!JsonOutput.boot_status)
        global.log('boot_status is not existed');
    else if (JsonOutput.boot_status === 'vulnerable')
        vulnerableBit |= BOOT_VULNERABLE;
    if (!JsonOutput.media_status)
        global.log('media_status is not existed');
    else if (JsonOutput.media_status === 'vulnerable')
        vulnerableBit |= MEDIA_VULNERABLE;

    return vulnerableBit;
}

function runLogparser() {
    if (!GLib.find_program_in_path('pkexec')) {
        global.log('there is problem with polkit (pkexec)');
        return [-1, null];
    }
    if (!GLib.find_program_in_path('gooroom-security-logparser')) {
        global.log('there is problrem with gooroom-security-utils, check gooroom-security-utils package');
        return [-1, null];
    }
    let cmdArray = ['/usr/bin/pkexec', '/usr/lib/gooroom-security-utils/gooroom-security-logparser-wrapper'];

    let nextSeekTimeFile = Gio.File.new_for_path(systemNextSeekTimePath);

    if (nextSeekTimeFile.query_exists(null)) {
        let [ok, output] = nextSeekTimeFile.load_contents(null);
        if (ok) {
            output = ByteArray.toString(output);
            // global.log("output: "+ output);
            cmdArray.push(output);
        }
    }

    // global.log(cmdArray);

    let [ok, output, error, exitStatus_] = GLib.spawn_sync(null, cmdArray, null, null, null);
    if (!ok) {
        global.log('there is something error occured');
        global.log(error);

    } else {
        output = ByteArray.toString(output);
        return parseLog(output);
    }
}

function sendNotification(vulnerableBit) {
    let path = GLib.build_filenamev([Me.path, 'notify.gjs']);
    let cmdArray = ['gjs', path, vulnerableBit];
    GLib.spawn_command_line_async(cmdArray.join(' '));
}
