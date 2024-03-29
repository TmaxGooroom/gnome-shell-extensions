/*
 * ArcMenu - A traditional application menu for GNOME 3
 *
 * ArcMenu Lead Developer and Maintainer
 * Andrew Zaech https://gitlab.com/AndrewZaech
 *
 * ArcMenu Founder, Former Maintainer, and Former Graphic Designer
 * LinxGem33 https://gitlab.com/LinxGem33 - (No Longer Active)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

const Me = imports.misc.extensionUtils.getCurrentExtension();
const { Clutter, Gio, GLib, GObject, Shell, St } = imports.gi;
const AppDisplay = imports.ui.appDisplay;
const appSys = Shell.AppSystem.get_default();
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const Text = imports.gettext;
const MW = Me.imports.menuWidgets;
const RemoteSearch = imports.ui.remoteSearch;
const Signals = imports.signals;
const SystemActions = imports.misc.systemActions;
const _ = Gettext.gettext;

const SEARCH_PROVIDERS_SCHEMA = 'org.gnome.desktop.search-providers';

var MAX_LIST_SEARCH_RESULTS_ROWS = 6;
var MAX_APPS_SEARCH_RESULTS_ROWS = 6;
var RESULT_ICON_SIZE = 27;

// not used search providers
var PREVENTED_SEARCH_PROVIDERS = ['org.gnome.clocks.desktop', 'org.gnome.Characters.desktop'];

var ListSearchResult = class ListSearchResult {
    constructor(provider, metaInfo, resultsView, terms) {
        this._menuLayout = resultsView._menuLayout;
        this._resultsView = resultsView;
        this.metaInfo = metaInfo;
        this.provider = provider;
        this._settings = this._menuLayout._settings;
        this._app = appSys.lookup_app(this.metaInfo['id']);

        if (this.provider.id === 'org.gnome.Nautilus.desktop')
            this.menuItem = new MW.SearchResultItem(this._menuLayout, terms, this.metaInfo, this.provider, appSys.lookup_app(this.provider.id), this.metaInfo['description']);
        else if (this._app)
            this.menuItem = new MW.SearchResultItem(this._menuLayout, terms, this.metaInfo, this.provider, this._app);
        else
            this.menuItem = new MW.SearchResultItem(this._menuLayout, terms, this.metaInfo, this.provider);

        this.label = new St.Label({
            text: this.metaInfo['name'],
            y_expand: false,
            y_align: Clutter.ActorAlign.CENTER,
        });
        let labelBox = new St.BoxLayout({
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        labelBox.add(this.label);

        let descriptionText = this._app ? this._app.get_description() : this.metaInfo['description'];
        if (descriptionText)
            descriptionText = descriptionText.split('\n')[0];

        let descriptionLabel = new St.Label({
            text: descriptionText,
            y_expand: false,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this.label.style = 'margin-left: 5px;';

        let icon = this.metaInfo['createIcon'](RESULT_ICON_SIZE);
        if (icon)
            this.menuItem.box.add_child(icon);

        this.menuItem.box.add_child(labelBox);
        if (this.metaInfo['description'] && this.provider.appInfo.get_name() === 'Calculator' && !labelBox.contains(descriptionLabel))
            this.label.text = `${this.metaInfo['name']}   ${this.metaInfo['description']}`;

        this.menuItem.connect('activate', this.activate.bind(this));
        this.menuItem.label = this.label;
        this.menuItem.description = descriptionText;
    }

    activate() {
        this.emit('activate', this.metaInfo.id);
    }

    _highlightTerms() {
        let markup = this._resultsView.highlightTerms(this.metaInfo['description'].split('\n')[0]);
        this._descriptionLabel.clutter_text.set_markup(markup);
    }
};
Signals.addSignalMethods(ListSearchResult.prototype);

var AppSearchResult = class AppSearchResult {
    constructor(provider, metaInfo, resultsView, terms) {
        this._menuLayout = resultsView._menuLayout;
        this.metaInfo = metaInfo;
        this.provider = provider;
        this._settings = this._menuLayout._settings;
        this._resultsView = resultsView;
        this._app = appSys.lookup_app(this.metaInfo['id']);
        this.label = new St.Label({
            text: this._app ? this._app.get_name() : this.metaInfo['name'],
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.FILL,
        });

        if (this._app)
            this.menuItem = new MW.SearchResultItem(this._menuLayout, terms, this.metaInfo, this.provider, this._app);
        else
            this.menuItem = new MW.SearchResultItem(this._menuLayout, terms, this.metaInfo, this.provider);

        this.icon = this.metaInfo['createIcon'](RESULT_ICON_SIZE);
        if (this.icon) {
            this.icon.icon_size = RESULT_ICON_SIZE;
            this.icon.y_align = Clutter.ActorAlign.CENTER;
            this.icon.x_align = Clutter.ActorAlign.CENTER;
            this.menuItem.box.add_child(this.icon);
        }
        this.label.style = 'margin-left: 5px;';
        this.menuItem.box.add_child(this.label);

        if (this.menuItem instanceof MW.SearchResultItem)
            this.menuItem.connect('activate', this.activate.bind(this));

        this.menuItem.label = this.label;
        this.menuItem.description = this._app ? this._app.get_description() : this.metaInfo['description'];
    }

    activate() {
        this.emit('activate', this.metaInfo.id);
    }

};
Signals.addSignalMethods(AppSearchResult.prototype);

var SearchResultsBase = class SearchResultsBase {
    constructor(provider, resultsView) {
        this.provider = provider;
        this._resultsView = resultsView;
        this._menuLayout = resultsView._menuLayout;
        this._terms = [];

        this.actor = new St.BoxLayout({
            vertical: true,
        });

        this._resultDisplayBin = new St.Bin({
            x_expand: true,
            y_expand: true,
        });

        this.actor.add(this._resultDisplayBin);

        this._resultDisplays = {};

        this._clipboard = St.Clipboard.get_default();

        this._cancellable = new Gio.Cancellable();
        this.actor.connect('destroy', this._onDestroy.bind(this));
    }

    _onDestroy() {
        this._terms = [];
    }

    _createResultDisplay(meta) {
        if (this.provider.createResultObject)
            return this.provider.createResultObject(meta, this._resultsView);

        return null;
    }

    clear() {
        this._cancellable.cancel();
        for (let resultId in this._resultDisplays)
            this._resultDisplays[resultId].menuItem.destroy();
        this._resultDisplays = {};
        this._clearResultDisplay();
        this.actor.hide();
    }

    _keyFocusIn(actor) {
        this.emit('key-focus-in', actor);
    }

    _activateResult(result, id) {
        if (this.provider.activateResult) {
            this.provider.activateResult(id, this._terms);
            if (result.metaInfo.clipboardText)
                this._clipboard.set_text(St.ClipboardType.CLIPBOARD, result.metaInfo.clipboardText);
            this._menuLayout.searchMenu.toggle();
        } else {
            this._menuLayout.searchMenu.toggle();
            if (id.endsWith('.desktop')) {
                let app = appSys.lookup_app(id);
                app.open_new_window(-1);
            } else {
                SystemActions.getDefault().activateAction(id);
            }
        }
    }

    _setMoreCount(count) {
        let count_ = count;
    }

    _ensureResultActors(results, callback) {
        let metasNeeded = results.filter(
            resultId => this._resultDisplays[resultId] === undefined
        );

        if (metasNeeded.length === 0) {
            callback(true);
        } else {
            this._cancellable.cancel();
            this._cancellable.reset();

            this.provider.getResultMetas(metasNeeded, metas => {
                if (this._cancellable.is_cancelled()) {
                    if (metas.length > 0)
                        log(`Search provider ${this.provider.id} returned results after the request was canceled`);
                    callback(false);
                    return;
                }
                if (metas.length !== metasNeeded.length) {
                    log(`Wrong number of result metas returned by search provider ${this.provider.id
                    }: expected ${metasNeeded.length} but got ${metas.length}`);
                    callback(false);
                    return;
                }
                if (metas.some(meta => !meta.name || !meta.id)) {
                    log(`Invalid result meta returned from search provider ${this.provider.id}`);
                    callback(false);
                    return;
                }

                metasNeeded.forEach((resultId, i) => {
                    let meta = metas[i];
                    let display = this._createResultDisplay(meta);
                    display.connect('activate', this._activateResult.bind(this));
                    display.menuItem.connect('key-focus-in', this._keyFocusIn.bind(this));
                    this._resultDisplays[resultId] = display;
                });
                callback(true);
            }, this._cancellable);
        }
    }

    updateSearch(providerResults, terms, callback) {
        this._terms = terms;
        if (providerResults.length === 0) {
            this._clearResultDisplay();
            this.actor.hide();
            callback();
        } else {
            let maxResults = this._getMaxDisplayedResults();
            let results = this.provider.filterResults(providerResults, maxResults);
            let moreCount = Math.max(providerResults.length - results.length, 0);

            this._ensureResultActors(results, successful => {
                if (!successful) {
                    this._clearResultDisplay();
                    callback();
                    return;
                }

                // To avoid CSS transitions causing flickering when
                // the first search result stays the same, we hide the
                // content while filling in the results.
                this.actor.hide();
                this._clearResultDisplay();
                results.forEach(resultId => {
                    this._addItem(this._resultDisplays[resultId]);
                });

                this._setMoreCount(this.provider.canLaunchSearch ? moreCount : 0);
                this.actor.show();
                callback();
            });
        }
    }
};

var ListSearchResults = class ListSearchResults extends SearchResultsBase {
    constructor(provider, resultsView) {
        super(provider, resultsView);
        this._menuLayout = resultsView._menuLayout;
        this._settings = this._menuLayout._settings;

        this._container = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            x_expand: true,
            y_expand: true,
            style_class: null,
        });

        this.providerInfo = new SearchProviderInfo(provider, this._menuLayout);
        this.providerInfo.connect('key-focus-in', this._keyFocusIn.bind(this));
        this.providerInfo.connect('activate', () => {
            this.providerInfo.animateLaunch();
            provider.launchSearch(this._terms);
            this._menuLayout.searchMenu.toggle();
        });

        this._container.add(this.providerInfo.actor);

        this._content = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });
        this._container.add(this._content);
        this._resultDisplayBin.set_child(this._container);
    }

    _setMoreCount(count) {
        this.providerInfo.setMoreCount(count);
    }

    _getMaxDisplayedResults() {
        return MAX_LIST_SEARCH_RESULTS_ROWS;
    }

    _clearResultDisplay() {
        this._content.remove_all_children();
    }

    _createResultDisplay(meta) {
        return super._createResultDisplay(meta, this._resultsView) ||
               new ListSearchResult(this.provider, meta, this._resultsView, this._terms);
    }

    _addItem(display) {
        this._content.add_actor(display.menuItem);
    }

    getFirstResult() {
        if (this._content.get_n_children() > 0)
            return this._content.get_child_at_index(0)._delegate;
        else
            return null;
    }

    destroy() {
        this._resultDisplayBin.destroy();
        this._resultDisplayBin = null;
    }
};
Signals.addSignalMethods(ListSearchResults.prototype);

var AppSearchResults = class AppSearchResults extends SearchResultsBase {
    constructor(provider, resultsView) {
        super(provider, resultsView);
        this._parentContainer = resultsView.actor;
        this._menuLayout = resultsView._menuLayout;

        this._container = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            x_expand: true,
            y_expand: true,
        });

        this.label = new St.Label({
            text: '앱',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.label.style = 'font-weight: bold; font-size: 15px; margin-top: 10px; padding-left: 20px; padding-bottom: 3px;';
        this._container.add(this.label);

        this._grid = new St.BoxLayout({
            vertical: true,
        });
        this._container.add(this._grid);
        this._resultDisplayBin.set_child(this._container);
    }

    _getMaxDisplayedResults() {
        return MAX_APPS_SEARCH_RESULTS_ROWS;
    }

    _clearResultDisplay() {
        this._grid.remove_all_children();
    }

    _createResultDisplay(meta) {
        return new AppSearchResult(this.provider, meta, this._resultsView, this._terms);
    }

    _addItem(display) {
        this._grid.add_actor(display.menuItem);
    }

    getFirstResult() {
        if (this._grid.get_n_children() > 0)
            return this._grid.get_child_at_index(0)._delegate;
        else
            return null;
    }

    destroy() {
        this._resultDisplayBin.destroy();
        this._resultDisplayBin = null;
    }
};
Signals.addSignalMethods(AppSearchResults.prototype);

var SearchResults = class SearchResults {
    constructor(menuLayout) {
        this._menuLayout = menuLayout;

        this.actor = new St.BoxLayout({
            vertical: true,
            y_expand: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,

        });
        this.actor._delegate = this.actor;

        this._content = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.FILL,
        });

        this.actor.add(this._content);

        this._statusText = new St.Label();
        this._statusBin = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
        });
        this._statusText.style_class = '';

        this.actor.add(this._statusBin);
        this._statusBin.add_actor(this._statusText);

        this._highlightDefault = false;
        this._defaultResult = null;
        this._startingSearch = false;

        this._terms = [];
        this._results = {};

        this._providers = [];

        this._highlightRegex = null;

        this._searchSettings = new Gio.Settings({ schema_id: SEARCH_PROVIDERS_SCHEMA });
        this.disabledID = this._searchSettings.connect('changed::disabled', this._reloadRemoteProviders.bind(this));
        this.enabledID =  this._searchSettings.connect('changed::enabled', this._reloadRemoteProviders.bind(this));
        this.disablExternalID = this._searchSettings.connect('changed::disable-external', this._reloadRemoteProviders.bind(this));
        this.sortOrderID = this._searchSettings.connect('changed::sort-order', this._reloadRemoteProviders.bind(this));

        this._searchTimeoutId = 0;
        this._cancellable = new Gio.Cancellable();

        this._registerProvider(new AppDisplay.AppSearchProvider());

        this.installChangedID = appSys.connect('installed-changed', this._reloadRemoteProviders.bind(this));

        this._reloadRemoteProviders();
    }

    setMaxDisplayedResults(rows) {
        MAX_APPS_SEARCH_RESULTS_ROWS = rows;
    }

    setStyle(style) {
        if (this._statusText)
            this._statusText.style_class = style;


    }

    destroy() {
        if (this._searchTimeoutId > 0) {
            GLib.source_remove(this._searchTimeoutId);
            this._searchTimeoutId = 0;
        }
        if (this.disabledID > 0) {
            this._searchSettings.disconnect(this.disabledID);
            this.disabledID = 0;
        }
        if (this.enabledID > 0) {
            this._searchSettings.disconnect(this.enabledID);
            this.enabledID = 0;
        }
        if (this.disablExternalID > 0) {
            this._searchSettings.disconnect(this.disablExternalID);
            this.disablExternalID = 0;
        }
        if (this.sortOrderID > 0) {
            this._searchSettings.disconnect(this.sortOrderID);
            this.sortOrderID = 0;
        }
        if (this.installChangedID > 0) {
            appSys.disconnect(this.installChangedID);
            this.installChangedID = 0;
        }
        this._providers.forEach(provider => {
            provider.display.clear();
            provider.display.destroy();
        });
        this.actor.destroy();
    }

    _reloadRemoteProviders() {
        let remoteProviders = this._providers.filter(p => p.isRemoteProvider);
        remoteProviders.forEach(provider => {
            this._unregisterProvider(provider);
        });

        RemoteSearch.loadRemoteSearchProviders(this._searchSettings, providers => {
            providers.forEach(this._registerProvider.bind(this));
        });
    }

    _registerProvider(provider) {
        var res = PREVENTED_SEARCH_PROVIDERS.some(element => {
            return element === provider.id;
        });

        if (res)
            return;


        provider.searchInProgress = false;
        this._providers.push(provider);
        this._ensureProviderDisplay(provider);
    }

    _unregisterProvider(provider) {
        let index = this._providers.indexOf(provider);
        this._providers.splice(index, 1);

        if (provider.display)
            provider.display.actor.destroy();

    }

    _gotResults(results, provider) {
        this._results[provider.id] = results;
        this._updateResults(provider, results);
    }

    _clearSearchTimeout() {
        if (this._searchTimeoutId > 0) {
            GLib.source_remove(this._searchTimeoutId);
            this._searchTimeoutId = 0;
        }
    }

    _reset() {
        this._terms = [];
        this._results = {};
        this._clearDisplay();
        this._clearSearchTimeout();
        this._defaultResult = null;
        this._startingSearch = false;

        this._updateSearchProgress();
    }

    _doSearch() {
        this._startingSearch = false;

        let previousResults = this._results;
        this._results = {};

        this._providers.forEach(provider => {
            provider.searchInProgress = true;

            let previousProviderResults = previousResults[provider.id];
            if (this._isSubSearch && previousProviderResults) {
                provider.getSubsearchResultSet(previousProviderResults,
                    this._terms,
                    results => {
                        this._gotResults(results, provider);
                    },
                    this._cancellable);
            } else {
                provider.getInitialResultSet(this._terms,
                    results => {
                        this._gotResults(results, provider);
                    },
                    this._cancellable);
            }
        });

        this._updateSearchProgress();

        this._clearSearchTimeout();
    }

    _onSearchTimeout() {
        this._searchTimeoutId = 0;
        this._doSearch();
        return GLib.SOURCE_REMOVE;
    }

    setTerms(terms) {
        // Check for the case of making a duplicate previous search before
        // setting state of the current search or cancelling the search.
        // This will prevent incorrect state being as a result of a duplicate
        // search while the previous search is still active.
        let searchString = terms.join(' ');
        let previousSearchString = this._terms.join(' ');
        if (searchString === previousSearchString)
            return;

        this._startingSearch = true;

        this._cancellable.cancel();
        this._cancellable.reset();

        if (terms.length === 0) {
            this._reset();
            return;
        }

        let isSubSearch = false;
        if (this._terms.length > 0)
            isSubSearch = searchString.indexOf(previousSearchString) === 0;

        this._terms = terms;
        this._isSubSearch = isSubSearch;
        this._updateSearchProgress();

        if (this._searchTimeoutId === 0)
            this._searchTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, this._onSearchTimeout.bind(this));

        let escapedTerms = this._terms.map(term => Shell.util_regex_escape(term));
        this._highlightRegex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');

        this.emit('terms-changed');
    }


    _ensureProviderDisplay(provider) {
        if (provider.display)
            return;

        let providerDisplay;
        if (provider.appInfo)
            providerDisplay = new ListSearchResults(provider, this);
        else
            providerDisplay = new AppSearchResults(provider, this);
        providerDisplay.actor.hide();
        this._content.add(providerDisplay.actor);
        provider.display = providerDisplay;
    }

    _clearDisplay() {
        this._providers.forEach(provider => {
            provider.display.clear();
        });
    }

    _maybeSetInitialSelection() {
        let newDefaultResult = null;

        let providers = this._providers;
        for (let i = 0; i < providers.length; i++) {
            let provider = providers[i];
            let display = provider.display;

            if (!display.actor.visible)
                continue;

            let firstResult = display.getFirstResult();
            if (firstResult) {
                newDefaultResult = firstResult;
                this._menuLayout.activeMenuItem = newDefaultResult;
                break; // select this one!
            }
        }

        if (newDefaultResult !== this._defaultResult) {
            this._setSelected(this._defaultResult, false);
            this._setSelected(newDefaultResult, this._highlightDefault);

            this._defaultResult = newDefaultResult;
        }
    }

    get searchInProgress() {
        if (this._startingSearch)
            return true;

        return this._providers.some(p => p.searchInProgress);
    }

    _updateSearchProgress() {
        let haveResults = this._providers.some(provider => {
            let display = provider.display;
            return display.getFirstResult() !== null;
        });

        this._statusBin.visible = !haveResults;

        if (!haveResults) {
            if (this.searchInProgress)
                this._statusText.set_text(_('Searching...'));
            else
                this._statusText.set_text(_('No results.'));

        }
    }

    _updateResults(provider, results) {
        let terms = this._terms;
        let display = provider.display;
        display.updateSearch(results, terms, () => {
            provider.searchInProgress = false;

            this._maybeSetInitialSelection();
            this._updateSearchProgress();
        });
    }

    highlightDefault(highlight) {
        this._highlightDefault = highlight;
        this._setSelected(this._defaultResult, highlight);
    }

    getTopResult() {
        return this._defaultResult;
    }

    _setSelected(result, selected) {
        if (!result || result === undefined || result === null)
            return;
        if (selected) {
            result.createDetailView();
            result.add_style_class_name('selected');
            result.add_style_pseudo_class('selected');
        } else {
            result.remove_style_class_name('selected');
            result.remove_style_pseudo_class('selected');
        }
    }

    highlightTerms(description) {
        if (!description)
            return '';

        if (!this._highlightRegex)
            return description;

        return description.replace(this._highlightRegex, '<b>$1</b>');
    }
};
Signals.addSignalMethods(SearchResults.prototype);

var SearchProviderInfo = GObject.registerClass(class SearchProviderInfo extends MW.SearchMenuPopupBaseMenuItem {
    _init(provider, menuLayout) {
        super._init(menuLayout);
        this.provider = provider;
        this._menuLayout = menuLayout;
        this._settings = this._menuLayout._settings;
        this.description = this.provider.appInfo.get_description();
        if (this.description)
            this.description = this.description.split('\n')[0];

        this.label = new St.Label({
            text: provider.appInfo.get_name(),
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'text-align: left;',
        });

        this.label.style = 'font-weight: bold; font-size: 15px; margin-top: 10px; padding-left: 20px;';
        this.actor.x_fill = true;
        this.actor.y_fill = false;
        this.actor.x_align = Clutter.ActorAlign.FILL;
        this.actor.y_align = Clutter.ActorAlign.START;
        this.actor.x_expand = true;
        this._moreText = '';
        this.actor.style = null;
        this.box.add_child(this.label);
        this.remove_child(this._ornamentLabel);
    }

    _onHover() {
        if (this.actor.hover && this._menuLayout.newSearch._highlightDefault)
            this._menuLayout.newSearch.highlightDefault(false);
        super._onHover();
    }

    animateLaunch() {
        let app_ = appSys.lookup_app(this.provider.appInfo.get_id());
    }

    setMoreCount(count) {
        this._moreText = Text.ngettext('%d more', '%d more', count).format(count);

        if (count > 0)
            this.label.text = `${this.provider.appInfo.get_name()}  (${this._moreText})`;

    }
});
