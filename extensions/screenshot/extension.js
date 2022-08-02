/* exported init, enable, disable */
const { Clutter, GObject } = imports.gi;

const Screenshot = imports.ui.screenshot;

/* Screenshot Extension
In selectArea screenshot,
When mouse button release during motion_event emit, Screenshot does not operate correctly.
Because, during motion event handling, SelectArea called queue_relayout, which blocked event handling until relayout finished.
In extensions, we solved that by setting NO_LAYOUT flag in SelectArea class.
NO_LAYOUT flag means that prevent Clutter from automatic
queueing of relayout and will defer all layouting to the actor itself
*/

// In case of disable screenshot extension, we don't need to restore to old SelectArea class which occurs error.
// So, we comment out OldSelectArea.
// var OldSelectArea = null;

var SelectArea = GObject.registerClass(
class SelectArea extends Screenshot.SelectArea {
    _init() {
        super._init();
        this.set_flags(Clutter.ActorFlags.NO_LAYOUT);
    }
});

function init() {
//    OldSelectArea = Screenshot.SelectArea;
}

function enable() {
    Screenshot.SelectArea = SelectArea;
}

function disable() {
    // Screenshot.SelectArea = OldSelectArea;
}
