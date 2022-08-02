imports.gi.versions.Gtk = '3.0';
const Gtk = imports.gi.Gtk;

imports.searchPath.unshift('..');
const Logging = imports.logging;

function getCurrentPath() {
    try {
        throw new Error();
    } catch (e) {
        let currentFileInfo = e.stack.split('\n')[0];
        let filePath = currentFileInfo.split(':')[0].split('@')[1];
        if (!filePath.includes('/'))
            return '.';

        return filePath.substr(0, filePath.lastIndexOf('/'));
    }
}

Gtk.init(null);

let debug = new Logging.Debugger(`${getCurrentPath()}/logging.json`);

let win = new Gtk.Window({
    type: Gtk.WindowType.TOPLEVEL,
    title: 'A default title',
    default_width: 300,
    default_height: 250,
    window_position: Gtk.WindowPosition.CENTER,
});

win.title = 'Hello World!';

function onDeleteEvent() {
    debug.printBacktrace('ALL', 'INFO');
    return false;
}

win.connect('delete-event', onDeleteEvent);

win.connect('destroy', () => {
    debug.logging('ALL', 'INFO', 'Destory message is entered');
    Gtk.main_quit();
});

// Create a button to close the window
let button = new Gtk.Button({
    label: 'Logging test',
    visible: true,
    valign: Gtk.Align.CENTER,
    halign: Gtk.Align.CENTER,
});

button.connect('clicked', () => {
    debug.logging('ALL', 'INFO', 'Button is clicked');
});

win.add(button);

win.show();

Gtk.main();
