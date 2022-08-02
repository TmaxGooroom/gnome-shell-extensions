/* exported makeKey */
const { Clutter, GObject, St } = imports.gi;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { QwertyMap } = Me.imports.qwertyMap;

function makeKey(key, groupname) {
    let button = key.keyButton;
    if (!button.get_label())
        return;

    let label = button.get_label();

    if (!QwertyMap[label])
        return;

    let newButton = new KeyButton();
    button.set_child(newButton);

    let [englishLabel, koreanLabel] = groupname === 'us' ? [label, QwertyMap[label]] : [QwertyMap[label], label];

    newButton.setEnglishLabel(englishLabel, groupname === 'us');
    newButton.setKoreanLabel(koreanLabel, groupname === 'kr');
}

var KeyButton = GObject.registerClass(
class KeyButton extends St.Widget {
    _init() {
        super._init({
            style_class: 'key-button',
            layout_manager: new Clutter.BoxLayout({ orientation: Clutter.Orientation.VERTICAL }),
            x_expand: false,
            y_expand: false,
        });

        this.englishLabelActor = new St.Label({ text: '',
            style_class: 'lower',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.FILL });

        this.koreanLabelActor = new St.Label({ text: '',
            style_class: 'upper',
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.FILL });

        this.add_child(this.koreanLabelActor);
        this.add_child(this.englishLabelActor);
    }

    setKoreanLabel(label, highlight) {
        this.koreanLabelActor.set_text(label);
        if (highlight)
            this.koreanLabelActor.add_style_class_name('highlight');
    }

    setEnglishLabel(label, highlight) {
        this.englishLabelActor.set_text(label);
        if (highlight)
            this.englishLabelActor.add_style_class_name('highlight');
    }
});
