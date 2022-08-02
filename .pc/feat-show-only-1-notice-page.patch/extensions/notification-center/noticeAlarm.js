const { Notify, GLib } = imports.gi;
// const Mainloop = imports.mainloop;

/*
ARGV[0] - title
ARGV[1] - url
ARGV[2] - signing
ARGV[3] - sessionId
ARGV[4] - clientId
*/

var NOTIFICATION_TIMEOUT = 5000;

Notify.init(ARGV[0]);
let loop = GLib.MainLoop.new(null, false);
let notification = new Notify.Notification({ summary: 'Notice', body: ARGV[0] });
notification.add_action('default', ' ', () => {
    GLib.spawn_command_line_async(`gjs /usr/share/gnome-shell/extensions/notification-center@tmax-shell-extensions/noticeView.js ${ARGV[1]} ${ARGV[2]} ${ARGV[3]} ${ARGV[4]}`);
});
let closeId = notification.connect('closed', () => {
    notification.clear_actions();
    notification.disconnect(closeId);
    // Notify.uninit();
    loop.quit();
});
notification.set_urgency(Notify.Urgency.NORMAL);
notification.set_timeout(NOTIFICATION_TIMEOUT);
notification.show();
loop.run();
