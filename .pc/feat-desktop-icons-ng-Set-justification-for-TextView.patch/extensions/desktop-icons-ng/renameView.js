/* exported GetByteLengthOfUtf8String, RenameArea, RenameScrollView */
const { GObject, Gdk, Gtk } = imports.gi;

const Prefs = imports.preferences;

var RenameScrollView = GObject.registerClass(class RenameScrollView extends Gtk.ScrolledWindow {
    _init(fileItem) {
        super._init();
        this._fileItem = fileItem;
        this._renameArea = new RenameArea(fileItem);
        this.add(this._renameArea);
        this.set_max_content_width(90);
        this.set_min_content_width(90);
        this.set_policy(Gtk.PolicyType.EXTERNAL, Gtk.PolicyType.NEVER);

        this._vAdjustment = new Gtk.Adjustment();
        this.set_vadjustment(this._vAdjustment);

        this._vAdjustment.connect('value-changed', () => {
            // To remove the animation scroll effect
            this._vAdjustment.set_value(0);
        });
    }

    getText() {
        return this._renameArea.text;
    }

    setText(text, len) {
        this._renameArea.setText(text, len);
    }

    startRename() {
        this._renameArea.startRename();
    }

    setRenameComplete() {
        this._renameArea.setRenameComplete();
    }

    cancelRename() {
        this._renameArea.cancelRename();
    }
});


var RenameArea = GObject.registerClass(class RenameArea extends Gtk.TextView {
    _init(fileItem) {
        super._init();
        let editableAreaStyleContext = this.get_style_context();
        editableAreaStyleContext.add_class('edit-area-style');
        this.get_style_context().add_class(Prefs.getEditableAreaStyle());
        this.set_border_width(2);
        this.set_size_request(Prefs.getDesiredWidth(), -1);
        this.set_wrap_mode(Gtk.WrapMode.CHAR);
        this.set_can_focus(true);

        this._fileItem = fileItem;
        this._isRenaming = false;
        this._cachedWidth = 0;
    }

    startRename() {
        this.selectText();
        this.grab_focus();
        this._isRenaming = true;
    }

    setRenameComplete() {
        this._isRenaming = false;
    }

    cancelRename() {
        this.setText(this._fileItem.fileName, this._fileItem.fileNameLength);
        this._fileItem.finishRename();
        this._fileItem.setSelected();
        this._fileItem.focusItem();
        this.setRenameComplete();
    }

    setText(name, length) {
        this.get_buffer().set_text(name, length);
    }

    selectText() {
        let start = this.get_buffer().get_start_iter();
        let end = this.get_buffer().get_end_iter();

        this.get_buffer().select_range(start, end);
    }

    get text() {
        let start = this.get_buffer().get_start_iter();
        let end = this.get_buffer().get_end_iter();
        let text = this.get_buffer().get_text(start, end, false);
        return text;
    }

    vfunc_focus_out_event(event) {
        super.vfunc_focus_out_event(event);
        if (!this._isRenaming) {
            // After renaming, focus_out() is called before creating an icon, and if doRename() is called again, an error popup occurs and an exception is handled by placing a flag.
            return false;
        }

        if (!this._fileItem.doRename())
            return false;

        this._fileItem._eventBox.grab_focus();
        this._fileItem.setSelected();
        return false;
    }

    vfunc_button_press_event(event) {
        super.vfunc_button_press_event(event);
        return true;
    }

    vfunc_key_press_event(event) {
        if (!this.has_focus)
            return false;

        let symbol = event.keyval;
        if (symbol === Gdk.KEY_Return || symbol === Gdk.KEY_KP_Enter) {
            this._fileItem.finishRename();
            return true;
        } else if (symbol === Gdk.KEY_Escape) {
            this.cancelRename();
            return true;
        }

        super.vfunc_key_press_event(event);
        return true;
    }

    vfunc_get_preferred_width() {
        if (this._cachedWidth === super.vfunc_get_preferred_width()[0])
            return super.vfunc_get_preferred_width();


        // The size calculation of GTK's textview decreases each time it is called, and when it reaches an appropriate size, the internal cached value is used. Therefore, it is intended to force the calculation of width by always calling size_allocate() when the width changes.
        this._cachedWidth = super.vfunc_get_preferred_width()[0];
        let alloc = this.get_allocation();
        alloc.x = 0;
        alloc.y = 0;
        alloc.width = Prefs.getDesiredWidth();
        alloc.height = Prefs.getDesiredHeight();
        this.size_allocate(alloc);

        return super.vfunc_get_preferred_width();
    }
});

function GetByteLengthOfUtf8String(s) {
    if (s !== undefined && s !== '') {
        let c = null;
        let b = 0, i = 0;
        c = s.charCodeAt(i);
        for (i = 0; c; i) {
            if (c >> 11)
                b += 3;
            else if (c >> 7)
                b += 2;
            else
                b += 1;

            c = s.charCodeAt(++i);
        }
        return b;
    } else {
        return 0;
    }
}
