/* exported GetByteLengthOfUtf8String, RenameArea, RenameBuffer */
const { GObject, Gdk, Gtk } = imports.gi;

const Prefs = imports.preferences;

var RenameArea = GObject.registerClass(class RenameArea extends Gtk.TextView {
    _init(fileItem) {
        super._init();
        let editableAreaStyleContext = this.get_style_context();
        editableAreaStyleContext.add_class('edit-area-style');
        this.get_style_context().add_class(Prefs.getEditableAreaStyle());
        this.set_border_width(2);
        this.set_size_request(Prefs.getDesiredWidth(), -1);
        this.set_wrap_mode(Gtk.WrapMode.WORD_CHAR);
        this.set_can_focus(true);
        this._editableBuffer = new RenameBuffer(fileItem);
        this.set_buffer(this._editableBuffer);
        this._fileItem = fileItem;

        this._editableBuffer.connect('changed', () => {
            log('changed');
        });
    }

    get text() {
        let start = this._editableBuffer.get_start_iter();
        let end = this._editableBuffer.get_end_iter();
        let text = this._editableBuffer.get_text(start, end, false);
        return text;
    }

    setText(name, length) {
        this._editableBuffer.set_text(name, length);
    }

    selectText() {
        let start = this._editableBuffer.get_start_iter();
        let end = this._editableBuffer.get_end_iter();

        this._editableBuffer.select_range(start, end);
    }

    vfunc_focus_out_event(event) {
        this._fileItem.doRename();
        super.vfunc_focus_out_event(event);
        this._fileItem._eventBox.grab_focus();
        this._fileItem.setSelected();
        return false;
    }

    vfunc_button_press_event(event) {
        super.vfunc_button_press_event(event);
        return true;
    }

    vfunc_key_press_event(event) {
        log('container key press');
        if (!this.has_focus)
            return false;


        let symbol = event.keyval;
        log(`key-press-event = ${symbol}`);
        if (symbol === Gdk.KEY_Return) {
            this._fileItem.doRename();
            this._fileItem._eventBox.grab_focus();
            return true;
        } else if (symbol === Gdk.KEY_Escape) {
            this._editableBuffer.set_text(this._fileItem.fileName, this._fileItem.fileNameLength);
            this._fileItem.clear();
            return true;
        }
        super.vfunc_key_press_event(event);
        return true;
    }

    vfunc_size_allocate(alloc) {
        log(`size allocation alloc = ${alloc.width} ${alloc.height}`);
        return super.vfunc_size_allocate(alloc);
    }
});

var RenameBuffer = GObject.registerClass(class RenameBuffer extends Gtk.TextBuffer {
    _init(fileItem) {
        super._init();
        this._fileItem = fileItem;
    }

    vfunc_insert_text(pos, text, length) {
        let start = this.get_start_iter();
        let end = this.get_end_iter();
        let currentText = this.get_text(start, end, false);
        let newText = currentText.slice(0, pos) + text + currentText.slice(pos);

        if (!this._validate(newText))
            return true;

        return super.vfunc_insert_text(pos, text, length);
    }

    _validate(text) {
        // FIXME : add bubble after inspecting regex. It must be done with nemo at the same time

        if (text.indexOf('/') !== -1) {
            this._fileItem.showError('cannot contain /');
            return false;
        }

        if (text.length >= 255) {
            this._fileItem.showError('too long');
            return false;
        }
        return true;
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
