// MessageDialog for notify that File or Folder cannot not found

const Gtk = imports.gi.Gtk;

Gtk.init(null);

let messageDialog = new Gtk.MessageDialog({ window_position: Gtk.WindowPosition.CENTER_ALWAYS,
    transient_for: null,
    message_type: Gtk.MessageType.WARNING,
    buttons: Gtk.ButtonsType.NONE,
    text: '파일을 찾을수 없습니다.',
    secondary_text: '최근 기록에서 삭제합니다.' });

messageDialog.add_button('확인', Gtk.ResponseType.OK);
messageDialog.show_all();
messageDialog.run();
