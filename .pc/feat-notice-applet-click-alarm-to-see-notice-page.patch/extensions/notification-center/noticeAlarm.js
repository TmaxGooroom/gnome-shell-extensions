const { Notify, Gio } = imports.gi;

/*
ARGV[0] - title
ARGV[1] - url
ARGV[2] - signing
ARGV[3] - sessionId
ARGV[4] - clientId
*/

var NOTIFICATION_TIMEOUT = 5000;

function onNotificationPopupOpened(data) {
    log(data);
    if (!ARGV[1] || !ARGV[2] || !ARGV[3] || !ARGV[4])
        return;

    let window = new Gio.Subprocess({ argv: ['gjs', '/usr/share/gnome-shell/extensions/notification-center@tmax-shell-extensions/noticeView.js', ARGV[1], ARGV[2], ARGV[3], ARGV[4]] });
    window.init(null);
}

Notify.init('notice');
let notification = new Notify.Notification({ summary: ARGV[0], body: '' });
notification.add_action('default', 'detail view', data => onNotificationPopupOpened(data));
notification.set_urgency(Notify.Urgency.NORMAL);
notification.set_timeout(NOTIFICATION_TIMEOUT);
notification.show();
