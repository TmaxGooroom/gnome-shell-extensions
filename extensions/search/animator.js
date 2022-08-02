// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
/* exported Animator, SearchAnimator */

const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Clutter, Cogl, GdkPixbuf, GLib, GObject, St } = imports.gi;

var FRAME_SIZE = 30;
var ICON_SIZE = 64;
var ANIMATED_ICON_UPDATE_TIMEOUT = 30;

var AnimationLoader = class {
    _createImage(pixbuf) {
        // Create Clutter.Image and set updated image
        let image = Clutter.Image.new();
        image.set_data(pixbuf.get_pixels(),
            pixbuf.get_has_alpha() ? Cogl.PixelFormat.RGBA_8888
                : Cogl.PixelFormat.RGB_888,
            pixbuf.get_width(),
            pixbuf.get_height(),
            pixbuf.get_rowstride());
        return image;
    }

    _createAnimation(image) {
        // Create box layout and put updated image in it
        let animation = new St.BoxLayout({
            vertical: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        animation.set_content(image);
        animation.hide();
        animation.set_size(ICON_SIZE, ICON_SIZE);
        return animation;
    }

    loadFiles() {
        let animations = new St.BoxLayout({
            vertical: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        for (let i = 1; i <= FRAME_SIZE; i++) {
            // Load file
            try {
                let fileName = `${Me.path}/media/tos_searching_ic-${i}.png`;
                let pixbuf = GdkPixbuf.Pixbuf.new_from_file(fileName);
                let image = this._createImage(pixbuf);
                let animation = this._createAnimation(image);
                animations.add_actor(animation);
            } catch (e) {
                // No such file error
                log('Error occurs because there is no image to load.');
                continue;
            }
        }

        return animations;
    }
};

var SearchAnimator = GObject.registerClass(
class SearchAnimator extends St.Bin {
    _init() {
        super._init({
            style: `width: ${ICON_SIZE}px; height: ${ICON_SIZE}px;`,
        });

        this.connect('destroy', this._onDestroy.bind(this));

        this._frame = 0;
        this._isPlaying = false;
        this._timeoutId = 0;

        let animationLoader = new AnimationLoader();
        this._animations = animationLoader.loadFiles();
        this.set_child(this._animations);

        this._isLoaded = this._animations.get_n_children() > 0;
    }

    play() {
        if (!this._isLoaded)
            return;

        if (this._timeoutId !== 0)
            return;

        this.show();

        if (this._frame === 0)
            this._showFirstFrame();

        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_LOW,
            ANIMATED_ICON_UPDATE_TIMEOUT, this._update.bind(this));

        this._isPlaying = true;
    }

    stop() {
        if (this._timeoutId === 0)
            return;

        this.hide();

        GLib.source_remove(this._timeoutId);
        this._timeoutId = 0;

        this._isPlaying = false;
    }

    _update() {
        this._showNextFrame();
        return GLib.SOURCE_CONTINUE;
    }

    _showFirstFrame() {
        let firstFrameActor = this._animations.get_child_at_index(0);
        if (firstFrameActor)
            firstFrameActor.show();
    }

    _showNextFrame() {
        let oldFrameActor = this._animations.get_child_at_index(this._frame);
        if (oldFrameActor)
            oldFrameActor.hide();

        // Get next frame
        this._frame = (this._frame + 1) % this._animations.get_n_children();

        let newFrameActor = this._animations.get_child_at_index(this._frame);
        if (newFrameActor)
            newFrameActor.show();
    }

    _onDestroy() {
        this.stop();
    }
});
