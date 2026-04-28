// ==UserScript==
// @author         Cloverjune
// @name           IITC plugin: Portal Coverage Layers
// @category       Layer
// @version        0.1.1
// @description    Adds Unvisited and Uncaptured portal layers using data from Uniques Tools or the stock Uniques plugin.
// @id             portal-coverage-layers
// @namespace      https://github.com/mordenkainennn/ingress-intel-total-conversion
// @updateURL      https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/portal-coverage-layers/portal-coverage-layers.meta.js
// @downloadURL    https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/portal-coverage-layers/portal-coverage-layers.user.js
// @match          https://intel.ingress.com/*
// @match          https://intel-x.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
    if (typeof window.plugin !== 'function') {
        window.plugin = function () { };
    }

    plugin_info.buildName = 'local';
    plugin_info.dateTimeVersion = '20260428.010000';
    plugin_info.pluginId = 'portal-coverage-layers';

    var changelog = [
        {
            version: '0.1.1',
            changes: [
                'NEW: Fall back to the stock Uniques plugin when Uniques Tools is not installed.',
                'UPD: Refresh coverage layers when stock Uniques updates portal history.',
            ],
        },
        {
            version: '0.1.0',
            changes: [
                'NEW: Added separate Unvisited and Uncaptured portal layers based on local uniques history.',
            ],
        },
    ];

    window.plugin.portalCoverageLayers = function () { };
    var self = window.plugin.portalCoverageLayers;

    self.UNVISITED_LAYER_NAME = 'Unvisited Portals';
    self.UNCAPTURED_LAYER_NAME = 'Uncaptured Portals';
    self.HIGHLIGHTER_NAME = 'Unvisited/Uncaptured Filter';
    self.originalHighlighter = window._no_highlighter;
    self.unvisitedLayer = null;
    self.uncapturedLayer = null;

    self.getHistoryPlugin = function () {
        if (!window.plugin) return null;
        if (window.plugin.uniquesTools && window.plugin.uniquesTools.uniques) return window.plugin.uniquesTools;
        if (window.plugin.uniques && window.plugin.uniques.uniques) return window.plugin.uniques;
        return null;
    };

    self.getUniqueInfo = function (guid) {
        var plugin = self.getHistoryPlugin();
        if (!plugin || !plugin.uniques) return null;
        return plugin.uniques[guid] || null;
    };

    self.isUnvisited = function (guid) {
        var uniqueInfo = self.getUniqueInfo(guid);
        return !(uniqueInfo && (uniqueInfo.visited || uniqueInfo.captured));
    };

    self.isUncaptured = function (guid) {
        var uniqueInfo = self.getUniqueInfo(guid);
        return !(uniqueInfo && uniqueInfo.captured);
    };

    self.shouldDisplayPortal = function (guid) {
        var unvisitedActive = self.isUnvisitedLayerEnabled();
        var uncapturedActive = self.isUncapturedLayerEnabled();

        if (!unvisitedActive && !uncapturedActive) return true;

        if (unvisitedActive && self.isUnvisited(guid)) return true;
        if (uncapturedActive && self.isUncaptured(guid)) return true;

        return false;
    };

    self.highlighter = {
        highlight: function (data) {
            var guid = data.portal && data.portal.options ? data.portal.options.guid : null;
            if (!guid || self.shouldDisplayPortal(guid)) return;

            data.portal.setStyle({
                opacity: 0,
                fillOpacity: 0,
            });
        },
    };

    self.isUnvisitedLayerEnabled = function () {
        return !!(self.unvisitedLayer && window.map && window.map.hasLayer(self.unvisitedLayer));
    };

    self.isUncapturedLayerEnabled = function () {
        return !!(self.uncapturedLayer && window.map && window.map.hasLayer(self.uncapturedLayer));
    };

    self.isAnyLayerEnabled = function () {
        return self.isUnvisitedLayerEnabled() || self.isUncapturedLayerEnabled();
    };

    self.restoreHighlighter = function () {
        if (window._current_highlighter !== self.HIGHLIGHTER_NAME) return;

        var fallback = self.originalHighlighter;
        if (!fallback || fallback === self.HIGHLIGHTER_NAME) {
            fallback = window._no_highlighter;
        }

        $('#portal_highlight_select').val(fallback).trigger('change');
    };

    self.ensureHighlighter = function () {
        if (!self.isAnyLayerEnabled()) {
            self.restoreHighlighter();
            return;
        }

        if (window._current_highlighter !== self.HIGHLIGHTER_NAME) {
            self.originalHighlighter = window._current_highlighter || window._no_highlighter;
            $('#portal_highlight_select').val(self.HIGHLIGHTER_NAME).trigger('change');
            return;
        }

        window.resetHighlightedPortals();
    };

    self.refreshIfActive = function () {
        if (!self.isAnyLayerEnabled()) return;
        self.ensureHighlighter();
    };

    var setup = function () {
        self.unvisitedLayer = new L.LayerGroup();
        self.uncapturedLayer = new L.LayerGroup();

        window.addPortalHighlighter(self.HIGHLIGHTER_NAME, self.highlighter);
        window.addLayerGroup(self.UNVISITED_LAYER_NAME, self.unvisitedLayer, false);
        window.addLayerGroup(self.UNCAPTURED_LAYER_NAME, self.uncapturedLayer, false);

        window.map.on('overlayadd overlayremove', function (event) {
            if (event.layer === self.unvisitedLayer || event.layer === self.uncapturedLayer) {
                self.ensureHighlighter();
            }
        });

        window.addHook('mapDataRefreshEnd', self.refreshIfActive);
        window.addHook('requestFinished', self.refreshIfActive);
        window.addHook('pluginUniquesToolsUpdate', self.refreshIfActive);
        window.addHook('pluginUniquesToolsRefreshAll', self.refreshIfActive);
        window.addHook('pluginUniquesUpdateUniques', self.refreshIfActive);
    };

    setup.info = plugin_info;
    if (!window.bootPlugins) window.bootPlugins = [];
    window.bootPlugins.push(setup);
    if (window.iitcLoaded && typeof setup === 'function') setup();
}

var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
    info.script = {
        version: GM_info.script.version,
        name: GM_info.script.name,
        description: GM_info.script.description,
    };
}
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);
