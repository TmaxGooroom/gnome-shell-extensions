// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const GdmUtil = imports.gdm.util;

var ShellUserVerifier = class ShellUserVerifier extends GdmUtil.ShellUserVerifier { // eslint-disable-line no-unused-vars
    _verificationFailed(/* retry */) {
        let canRetry = true;
        if (!this.hasPendingMessages) {
            this._retry();
        } else {
            let signalId = this.connect('no-more-messages', () => {
                this.disconnect(signalId);
                if (this._cancellable && !this._cancellable.is_cancelled())
                    this._retry();
            });
        }

        this.emit('verification-failed', canRetry);
    }
};
