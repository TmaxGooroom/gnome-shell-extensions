const { Gtk, Gdk, Soup, WebKit2 } = imports.gi;

function onNotificationWindowClosed() {
    [offsetX, offsetY] = window.get_position();
    // send offset?

    // window.destroy();
    Gtk.main_quit();
}

function getLanguage() {
    let language = Gtk.get_default_language();
    if (!language)
        return;

    if (language.to_string() === 'ko-kr')
        return 'ko';
    else
        return 'en';
}

function getDomain(url) {
    let urlToken = url.split('/');
    if (urlToken)
        return urlToken[2];
}

function addCookie(manager, key, value, domain) {
    let cookie = new Soup.Cookie(key, value, domain, '/', -1);
    manager.add_cookie(cookie, null, null);
}

let offsetX, offsetY;

Gtk.init(null);

let window = new Gtk.Window({ type: Gtk.WindowType.TOPLEVEL });
window.set_border_width(5);
window.set_type_hint(Gdk.WindowTypeHint.DIALOG);
window.set_skip_taskbar_hint(true);
window.set_title('Notice');
window.set_default_size(600, 550);

let mainVbox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 5 });
window.add(mainVbox);
mainVbox.show();

let scrollWindow = new Gtk.ScrolledWindow();
scrollWindow.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC);
mainVbox.pack_start(scrollWindow, true, true, 0);
scrollWindow.show();

let view = new WebKit2.WebView();
scrollWindow.add(view);

window.connect('delete-event', () => onNotificationWindowClosed());
view.connect('close', () => onNotificationWindowClosed());

view.load_uri(ARGV[0]);

let context = view.get_context();
let manager = context.get_cookie_manager();

let lang = getLanguage();
let domain = getDomain(ARGV[0]);

if (ARGV[1] !== 'emtpy')
    addCookie(manager, 'SIGNING', ARGV[1], domain);
if (ARGV[2] !== 'emtpy')
    addCookie(manager, 'SESSION_ID', ARGV[2], domain);
if (ARGV[3] !== 'emtpy')
    addCookie(manager, 'CLIENT_ID', ARGV[3], domain);
addCookie(manager, 'LANG_CODE', lang, domain);

view.grab_focus();
view.show();

let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 0 });
mainVbox.pack_end(hbox, false, true, 0);
hbox.show();

let button = new Gtk.Button({ label: 'Close' });
button.set_can_focus(true);
hbox.pack_end(button, false, false, 0);
button.connect('clicked', () => onNotificationWindowClosed());
button.show();
window.show_all();

if (offsetX !== 0 && offsetY !== 0)
    window.move(offsetX, offsetY);
else
    window.set_position(Gtk.WIN_POS_CENTER);

Gtk.main();
