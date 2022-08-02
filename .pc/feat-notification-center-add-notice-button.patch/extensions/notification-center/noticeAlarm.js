const { Notify, Gio } = imports.gi;

function onNotificationPopupOpened(data) {
    let window = new Gio.Subprocess({ argv: ['gjs', '/usr/share/gnome-shell/extensions/notification-center@tmax-shell-extensions/noticeView.js', data, 'empty', 'empty', 'empty'] });
    window.init(null);
}

Notify.init('notice');
let notification = new Notify.Notification({ summary: ARGV[1], body: '' });
notification.add_action('default', 'detail view', data => onNotificationPopupOpened(data));
notification.set_urgency(Notify.Urgency.NORMAL);
notification.set_timeout(5);
if (ARGV[0] === 'show')
    notification.show();
