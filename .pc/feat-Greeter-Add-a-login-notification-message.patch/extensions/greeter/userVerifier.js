/* exported ShellUserVerifier */

const GdmUtil = imports.gdm.util;

var ShellUserVerifier = class ShellUserVerifier extends GdmUtil.ShellUserVerifier {
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
