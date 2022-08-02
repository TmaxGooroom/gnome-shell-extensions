const { Notify, Gio } = imports.gi;

/*
ARGV[0] - title
ARGV[1] - url
*/

function onNotificationPopupOpened(data) {
    let window = new Gio.Subprocess({ argv: ['gjs', '/usr/share/gnome-shell/extensions/notification-center@tmax-shell-extensions/noticeView.js', data, 'empty', 'empty', 'empty'] });
    window.init(null);
}

var NOTIFICATION_TIMEOUT = 5000;

Notify.init('notice');
let notification = new Notify.Notification({ summary: ARGV[0], body: '' });
notification.add_action('default', 'detail view', data => onNotificationPopupOpened(data));
notification.set_urgency(Notify.Urgency.NORMAL);
notification.set_timeout(NOTIFICATION_TIMEOUT);
notification.show();
