/* exported ShellUserVerifier */

const GdmUtil = imports.gdm.util;

var ErrorType = {
    NONE: 0,
    EXCEED_MAX_LOGIN_COUNT: 1,
    NETWORK_DISCONNECTED: 2,
};

function _isJson(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

var ShellUserVerifier = class ShellUserVerifier extends GdmUtil.ShellUserVerifier {
    constructor(client, params) {
        super(client, params);

        this._errorType = ErrorType.NONE;
    }

    // Called only if som account.
    _parseError(error) {
        let json = JSON.parse(error);

        // eaten: whether an error has occurred
        // type : At what stage of authentication did an error occur
        let eaten = json['eaten'];
        let type = json['type'];
        let reason = json['reason'];

        if (!eaten) {
            log('Greeter: assert error. Eaten flag cannot be false.');
            return;
        }

        if (type === 'pam_authenticate' && reason === 'exceedMaxLoginCount')
            this._errorType = ErrorType.EXCEED_MAX_LOGIN_COUNT;
        else if (type === 'pam_authenticate' && reason === 'networkDisconnected')
            this._errorType = ErrorType.NETWORK_DISCONNECTED;
    }

    _onProblem(client, serviceName, problem) {
        if (!_isJson(problem)) {
            super._onProblem(client, serviceName, problem);
            return;
        }

        if (!this.serviceIsForeground(serviceName))
            return;

        this._parseError(problem);
    }

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
