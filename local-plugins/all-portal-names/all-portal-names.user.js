// ==UserScript==
// @author         ZasoGD (+ modified by cloverjune)
// @name           All Portal Names
// @category       Layer
// @version        0.5.0
// @description    Show all portal names on the map. Includes a setting to show all names regardless of overlap at a certain zoom level.
// @id             all-portal-names
// @namespace      https://github.com/mordenkainennn/ingress-intel-total-conversion
// @updateURL      https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/all-portal-name/all-portal-names.meta.js
// @downloadURL    https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/all-portal-name/all-portal-names.user.js
// @match          https://intel.ingress.com/*
// @match          https://intel-x.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
    // ensure plugin framework is there, even if iitc is not yet loaded
    if (typeof window.plugin !== 'function') window.plugin = function () { };

    //PLUGIN AUTHORS: writing a plugin outside of the IITC build environment? if so, delete these lines!!
    //(leaving them in place might break the 'About IITC' page or break update checks)
    plugin_info.buildName = 'local';
    plugin_info.dateTimeVersion = '2026-02-28-070836';
    plugin_info.pluginId = 'all-portal-names';
    //END PLUGIN AUTHORS NOTE

    /* exported setup, changelog --eslint */
    /* global L -- eslint */

    var changelog = [
        {
            version: '0.5.0',
            changes: ['Show all portal names on the map.'],
        },
        {
            version: '0.2.4',
            changes: ['Refactoring: fix eslint'],
        },
        {
            version: '0.2.3',
            changes: ['Version upgrade due to a change in the wrapper: plugin icons are now vectorized'],
        },
        {
            version: '0.2.2',
            changes: ['Version upgrade due to a change in the wrapper: added plugin icon'],
        },
    ];

    // use own namespace for plugin
    window.plugin.allPortalNames = function () { };

    window.plugin.allPortalNames.NAME_WIDTH = 80;
    window.plugin.allPortalNames.NAME_HEIGHT = 23;

    window.plugin.allPortalNames.labelLayers = {};
    window.plugin.allPortalNames.labelLayerGroup = null;

    window.plugin.allPortalNames.config = {
        enabled: false,
        minZoom: 16,
    };

    window.plugin.allPortalNames.setupCSS = function () {
        $('<style>')
            .prop('type', 'text/css')
            .html(
                '' +
                '.plugin-portal-names{' +
                'color:#FFFFBB;' +
                'font-size:11px;line-height:12px;' +
                'text-align:center;padding: 2px;' + // padding needed so shadow doesn't clip
                'overflow:hidden;' +
                // could try this if one-line names are used
                //    +'white-space: nowrap;text-overflow:ellipsis;'

                // webkit-only multiline ellipsis
                'display: -webkit-box;' +
                '-webkit-line-clamp: 2;' +
                '-webkit-box-orient: vertical;' +
                'text-shadow: 0 0 1px black, 0 0 1em black, 0 0 0.2em black;' +
                'pointer-events:none;' +
                '}'
            )
            .appendTo('head');
    };

    window.plugin.allPortalNames.removeLabel = function (guid) {
        var previousLayer = window.plugin.allPortalNames.labelLayers[guid];
        if (previousLayer) {
            window.plugin.allPortalNames.labelLayerGroup.removeLayer(previousLayer);
            delete window.plugin.allPortalNames.labelLayers[guid];
        }
    };

    window.plugin.allPortalNames.addLabel = function (guid, latLng) {
        var previousLayer = window.plugin.allPortalNames.labelLayers[guid];
        if (!previousLayer) {
            var d = window.portals[guid].options.data;
            var portalName = d.title;

            var label = new L.Marker(latLng, {
                icon: new L.DivIcon({
                    className: 'plugin-portal-names',
                    iconAnchor: [window.plugin.allPortalNames.NAME_WIDTH / 2, 0],
                    iconSize: [window.plugin.allPortalNames.NAME_WIDTH, window.plugin.allPortalNames.NAME_HEIGHT],
                    html: portalName,
                }),
                guid: guid,
                interactive: false,
            });
            window.plugin.allPortalNames.labelLayers[guid] = label;
            label.addTo(window.plugin.allPortalNames.labelLayerGroup);
        }
    };

    window.plugin.allPortalNames.clearAllPortalLabels = function () {
        for (var guid in window.plugin.allPortalNames.labelLayers) {
            window.plugin.allPortalNames.removeLabel(guid);
        }
    };

    window.plugin.allPortalNames.updatePortalLabels = function () {
        // as this is called every time layers are toggled, there's no point in doing it when the leyer is off
        if (!window.map.hasLayer(window.plugin.allPortalNames.labelLayerGroup)) {
            return;
        }

        var portalPoints = {};

        for (const guid in window.portals) {
            var p = window.portals[guid];
            if (p._map && p.options.data.title) {
                // only consider portals added to the map and with a title
                const point = window.map.project(p.getLatLng());
                portalPoints[guid] = point;
            }
        }

        var skipCollisionCheck = window.plugin.allPortalNames.config.enabled && window.map.getZoom() >= window.plugin.allPortalNames.config.minZoom;

        if (!skipCollisionCheck) {
            // for efficient testing of intersection, group portals into buckets based on the label size
            var buckets = {};
            for (const guid in portalPoints) {
                const point = portalPoints[guid];

                var bucketId = new L.Point([
                    Math.floor(point.x / (window.plugin.allPortalNames.NAME_WIDTH * 2)),
                    Math.floor(point.y / window.plugin.allPortalNames.NAME_HEIGHT),
                ]);
                // the guid is added to four buckets. this way, when testing for overlap we don't need to test
                // all 8 buckets surrounding the one around the particular portal, only the bucket it is in itself
                var bucketIds = [bucketId, bucketId.add([1, 0]), bucketId.add([0, 1]), bucketId.add([1, 1])];
                for (var i in bucketIds) {
                    var b = bucketIds[i].toString();
                    if (!buckets[b]) buckets[b] = {};
                    buckets[b][guid] = true;
                }
            }

            var coveredPortals = {};

            for (const bucket in buckets) {
                var bucketGuids = buckets[bucket];
                for (const guid in bucketGuids) {
                    var point = portalPoints[guid];
                    // the bounds used for testing are twice as wide as the portal name marker. this is so that there's no left/right
                    // overlap between two different portals text
                    var largeBounds = new L.Bounds(
                        point.subtract([window.plugin.allPortalNames.NAME_WIDTH, 0]),
                        point.add([window.plugin.allPortalNames.NAME_WIDTH, window.plugin.allPortalNames.NAME_HEIGHT])
                    );

                    for (var otherGuid in bucketGuids) {
                        if (guid !== otherGuid) {
                            var otherPoint = portalPoints[otherGuid];

                            if (largeBounds.contains(otherPoint)) {
                                // another portal is within the rectangle for this one's name - so no name for this one
                                coveredPortals[guid] = true;
                                break;
                            }
                        }
                    }
                }
            }

            for (const guid in coveredPortals) {
                delete portalPoints[guid];
            }
        }

        // remove any not wanted
        for (const guid in window.plugin.allPortalNames.labelLayers) {
            if (!(guid in portalPoints)) {
                window.plugin.allPortalNames.removeLabel(guid);
            }
        }

        // and add those we do
        for (const guid in portalPoints) {
            window.plugin.allPortalNames.addLabel(guid, window.portals[guid].getLatLng());
        }
    };

    // ass calculating portal marker visibility can take some time when there's lots of portals shown, we'll do it on
    // a short timer. this way it doesn't get repeated so much
    window.plugin.allPortalNames.delayedUpdatePortalLabels = function (wait) {
        if (window.plugin.allPortalNames.timer === undefined) {
            window.plugin.allPortalNames.timer = setTimeout(function () {
                window.plugin.allPortalNames.timer = undefined;
                window.plugin.allPortalNames.updatePortalLabels();
            }, wait * 1000);
        }
    };

    window.plugin.allPortalNames.saveConfig = function () {
        localStorage['plugin-all-portal-names'] = JSON.stringify(window.plugin.allPortalNames.config);
        window.plugin.allPortalNames.clearAllPortalLabels();
        window.plugin.allPortalNames.updatePortalLabels();
    };

    window.plugin.allPortalNames.showDialog = function () {
        var html =
            '<div>' +
            '<label><input type="checkbox" id="all-portal-names-enabled"' +
            (window.plugin.allPortalNames.config.enabled ? ' checked' : '') +
            '> Enable showing ALL portal names</label><br><br>' +
            '<label>Minimum Zoom Level: <input type="number" id="all-portal-names-minzoom" min="10" max="22" value="' +
            window.plugin.allPortalNames.config.minZoom +
            '"></label><br>' +
            '<small>When enabled and zoomed at or closer than this level, all portal names will be shown regardless of overlap.</small>' +
            '</div>';

        window.dialog({
            html: html,
            id: 'plugin-all-portal-names',
            title: 'All Portal Names Settings',
            buttons: {
                Save: function () {
                    window.plugin.allPortalNames.config.enabled = $('#all-portal-names-enabled').prop('checked');
                    window.plugin.allPortalNames.config.minZoom = parseInt($('#all-portal-names-minzoom').val(), 10) || 16;
                    window.plugin.allPortalNames.saveConfig();
                    $(this).dialog('close');
                },
                Cancel: function () {
                    $(this).dialog('close');
                },
            },
        });
    };

    var setup = function () {
        try {
            var configText = localStorage['plugin-all-portal-names'];
            if (configText) {
                var config = JSON.parse(configText);
                if (typeof config.enabled === 'boolean') window.plugin.allPortalNames.config.enabled = config.enabled;
                if (typeof config.minZoom === 'number') window.plugin.allPortalNames.config.minZoom = config.minZoom;
            }
        } catch (e) {
            console.warn('All Portal Names: Failed to load config', e);
        }

        window.plugin.allPortalNames.setupCSS();

        window.plugin.allPortalNames.labelLayerGroup = new L.LayerGroup();
        window.layerChooser.addOverlay(window.plugin.allPortalNames.labelLayerGroup, 'Portal Names');

        $('#toolbox').append(' <a tabindex="0" onclick="window.plugin.allPortalNames.showDialog();" title="Configure All Portal Names">All Portal Names</a>');

        window.addHook('requestFinished', function () {
            setTimeout(function () {
                window.plugin.allPortalNames.delayedUpdatePortalLabels(3.0);
            }, 1);
        });
        window.addHook('mapDataRefreshEnd', function () {
            window.plugin.allPortalNames.delayedUpdatePortalLabels(0.5);
        });
        window.map.on('overlayadd overlayremove', function () {
            setTimeout(function () {
                window.plugin.allPortalNames.delayedUpdatePortalLabels(1.0);
            }, 1);
        });
        window.map.on('zoomend', window.plugin.allPortalNames.clearAllPortalLabels);
    };

    setup.info = plugin_info; //add the script info data to the function as a property
    if (typeof changelog !== 'undefined') setup.info.changelog = changelog;
    if (!window.bootPlugins) window.bootPlugins = [];
    window.bootPlugins.push(setup);
    // if IITC has already booted, immediately run the 'setup' function
    if (window.iitcLoaded && typeof setup === 'function') setup();
} // wrapper end
// inject code into site context
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) info.script = { version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description };
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);
