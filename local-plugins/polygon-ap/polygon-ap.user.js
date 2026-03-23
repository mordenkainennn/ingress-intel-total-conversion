// ==UserScript==
// @id             iitc-plugin-polygon-ap
// @name           IITC Plugin: Polygon AP
// @version        0.5.0
// @description    Plugin for calculating portal count and AP of polygons
// @author         Cloverjune
// @category       Layer
// @namespace      https://github.com/mordenkainennn/ingress-intel-total-conversion
// @updateURL      https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/polygon-ap/polygon-ap.meta.js
// @downloadURL    https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/polygon-ap/polygon-ap.user.js
// @include        https://intel.ingress.com/*
// @include        http://intel.ingress.com/*
// @match          https://intel.ingress.com/*
// @match          http://intel.ingress.com/*
// @include        https://*.ingress.com/intel*
// @include        http://*.ingress.com/intel*
// @match          https://*.ingress.com/intel*
// @match          http://*.ingress.com/intel*
// @include        https://*.ingress.com/mission/*
// @include        http://*.ingress.com/mission/*
// @match          https://*.ingress.com/mission/*
// @match          http://*.ingress.com/mission/*
// @grant        none
// ==/UserScript==

pluginName = "Polygon AP Counter";
version = "0.5.0";
changeLog = [
    {
        version: '0.5.0',
        changes: [
            'NEW: Added AP calculation for both ENL and RES factions inside polygons.',
            'NEW: Map bubble now shows portal count and AP for both factions.',
            'NEW: Table updated with ENL AP and RES AP columns.',
            'UPD: AP algorithm follows the same logic as the ap-stats plugin.',
        ],
    },
    {
        version: '0.4.0',
        changes: [
            'Initial release',
        ],
    },
];

function wrapper(plugin_info) {
    if (typeof window.plugin !== 'function') window.plugin = function () { };

    plugin_info.buildName = '';
    plugin_info.dateTimeVersion = '2026-03-03-100000';
    plugin_info.pluginId = 'PolygonAPCounter';


    window.plugin.polygonPortalCounter = function () { };
    var self = window.plugin.polygonPortalCounter;

    self.layerGroup = null;

    // Helper: format large numbers
    self.formatAP = function (ap) {
        if (ap >= 1000000) return (ap / 1000000).toFixed(2) + 'M';
        if (ap >= 1000) return (ap / 1000).toFixed(1) + 'k';
        return String(ap);
    };

    self.isPointInPolygon = function (point, polygon) {
        // polygon may be nested (e.g. L.Polygon with holes), flatten to outer ring
        var ring = Array.isArray(polygon[0]) ? polygon[0] : polygon;
        var x = point.lat, y = point.lng;
        var inside = false;
        for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            var xi = ring[i].lat, yi = ring[i].lng;
            var xj = ring[j].lat, yj = ring[j].lng;
            var intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    };

    self.getPolygonCenter = function (polygon) {
        var lat = 0, lng = 0, numPoints = 0;
        var ring = Array.isArray(polygon[0]) ? polygon[0] : polygon;
        for (var i = 0; i < ring.length; i++) {
            lat += ring[i].lat;
            lng += ring[i].lng;
            numPoints++;
        }
        if (numPoints === 0) return null;
        return L.latLng(lat / numPoints, lng / numPoints);
    };

    /**
     * Compute portal count + AP stats for portals/links/fields inside a polygon.
     * Returns { count, enl: { AP, ... }, res: { AP, ... } }
     */
    self.computeStatsInPolygon = function (polygonLatLngs) {
        var result = {
            count: 0,
            enl: { AP: 0, destroyPortals: 0, capturePortals: 0, finishPortals: 0, destroyLinks: 0, destroyFields: 0, reclaimPortals: 0 },
            res: { AP: 0, destroyPortals: 0, capturePortals: 0, finishPortals: 0, destroyLinks: 0, destroyFields: 0, reclaimPortals: 0 },
        };

        var PORTAL_FULL_DEPLOY_AP = window.CAPTURE_PORTAL + 8 * window.DEPLOY_RESONATOR + window.COMPLETION_BONUS;

        // Portals
        $.each(window.portals, function (guid, portal) {
            var latlng = portal.getLatLng();
            if (!self.isPointInPolygon(latlng, polygonLatLngs)) return true;

            result.count++;
            var data = portal.options.data;

            var completePortalAp = 0;
            if ('resCount' in data && data.resCount < 8) {
                completePortalAp = (8 - data.resCount) * window.DEPLOY_RESONATOR + window.COMPLETION_BONUS;
            }

            var destroyAp = (data.resCount || 0) * window.DESTROY_RESONATOR;

            if (portal.options.team === window.TEAM_ENL) {
                result.res.AP += destroyAp + PORTAL_FULL_DEPLOY_AP;
                result.res.destroyPortals++;
                if (completePortalAp) {
                    result.enl.AP += completePortalAp;
                    result.enl.finishPortals++;
                }
            } else if (portal.options.team === window.TEAM_RES) {
                result.enl.AP += destroyAp + PORTAL_FULL_DEPLOY_AP;
                result.enl.destroyPortals++;
                if (completePortalAp) {
                    result.res.AP += completePortalAp;
                    result.res.finishPortals++;
                }
            } else if (portal.options.team === window.TEAM_MAC) {
                var reclaimAp = window.RECLAIM_PORTAL_FROM_MACHINA === undefined ? 1331 : window.RECLAIM_PORTAL_FROM_MACHINA;
                result.enl.AP += destroyAp + PORTAL_FULL_DEPLOY_AP + reclaimAp;
                result.res.AP += destroyAp + PORTAL_FULL_DEPLOY_AP + reclaimAp;
                result.enl.destroyPortals++;
                result.res.destroyPortals++;
                result.enl.reclaimPortals++;
                result.res.reclaimPortals++;
            } else {
                // Neutral portal
                result.enl.AP += PORTAL_FULL_DEPLOY_AP;
                result.res.AP += PORTAL_FULL_DEPLOY_AP;
                result.enl.capturePortals++;
                result.res.capturePortals++;
            }
        });

        // Links (if either endpoint is inside the polygon)
        $.each(window.links, function (guid, link) {
            var points = link.getLatLngs();
            if (self.isPointInPolygon(points[0], polygonLatLngs) || self.isPointInPolygon(points[1], polygonLatLngs)) {
                if (link.options.team !== window.TEAM_RES) {
                    result.res.AP += window.DESTROY_LINK;
                    result.res.destroyLinks++;
                }
                if (link.options.team !== window.TEAM_ENL) {
                    result.enl.AP += window.DESTROY_LINK;
                    result.enl.destroyLinks++;
                }
            }
        });

        // Fields (if any vertex is inside the polygon)
        $.each(window.fields, function (guid, field) {
            var points = field.getLatLngs();
            if (self.isPointInPolygon(points[0], polygonLatLngs) ||
                self.isPointInPolygon(points[1], polygonLatLngs) ||
                self.isPointInPolygon(points[2], polygonLatLngs)) {
                if (field.options.team !== window.TEAM_RES) {
                    result.res.AP += window.DESTROY_FIELD;
                    result.res.destroyFields++;
                }
                if (field.options.team !== window.TEAM_ENL) {
                    result.enl.AP += window.DESTROY_FIELD;
                    result.enl.destroyFields++;
                }
            }
        });

        return result;
    };

    self.updatePortalCounts = function () {
        self.layerGroup.clearLayers();

        var totalCount = 0;
        var totalEnlAP = 0;
        var totalResAP = 0;

        var rows = '';
        var polygonIndex = 1;

        for (var layerId in window.plugin.drawTools.drawnItems._layers) {
            var layer = window.plugin.drawTools.drawnItems._layers[layerId];
            if (!(layer instanceof L.Polygon)) continue;

            var polygonLatLngs = layer.getLatLngs();
            var stats = self.computeStatsInPolygon(polygonLatLngs);
            var center = self.getPolygonCenter(polygonLatLngs);

            totalCount += stats.count;
            totalEnlAP += stats.enl.AP;
            totalResAP += stats.res.AP;

            var linkToPosition = center
                ? '<a href="#" onclick="window.map.setView([' + center.lat + ',' + center.lng + '], 15); return false;">View</a>'
                : 'N/A';

            rows += '<tr>' +
                '<td>Polygon ' + polygonIndex + '</td>' +
                '<td class="pac-num">' + stats.count + '</td>' +
                '<td class="pac-enl">' + self.formatAP(stats.enl.AP) + '</td>' +
                '<td class="pac-res">' + self.formatAP(stats.res.AP) + '</td>' +
                '<td>' + linkToPosition + '</td>' +
                '</tr>';

            // Map bubble
            if (center) {
                var bubbleHtml =
                    '<div class="pac-bubble">' +
                    '<div class="pac-bubble-count">&#x1F3F4; ' + stats.count + ' portals</div>' +
                    '<div class="pac-bubble-enl">ENL: ' + self.formatAP(stats.enl.AP) + ' AP</div>' +
                    '<div class="pac-bubble-res">RES: ' + self.formatAP(stats.res.AP) + ' AP</div>' +
                    '</div>';

                L.marker(center, {
                    icon: L.divIcon({
                        className: '',
                        html: bubbleHtml,
                        iconSize: null,
                        iconAnchor: [60, 10]
                    }),
                    interactive: false
                }).addTo(self.layerGroup);
            }

            polygonIndex++;
        }

        var content =
            '<table class="pac-table">' +
            '<thead><tr>' +
            '<th>Polygon</th>' +
            '<th>Portals</th>' +
            '<th class="pac-enl">ENL AP</th>' +
            '<th class="pac-res">RES AP</th>' +
            '<th>Position</th>' +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
            '<tfoot><tr>' +
            '<td><b>TOTAL</b></td>' +
            '<td class="pac-num"><b>' + totalCount + '</b></td>' +
            '<td class="pac-enl"><b>' + self.formatAP(totalEnlAP) + '</b></td>' +
            '<td class="pac-res"><b>' + self.formatAP(totalResAP) + '</b></td>' +
            '<td></td>' +
            '</tr></tfoot>' +
            '</table>';

        $('#pac-content').html(content);
    };

    self.setupUI = function () {
        var container = $('<div id="pac-dialog">')
            .append('<div id="pac-content"></div>')
            .appendTo('body');

        var refreshButton = $('<button>')
            .text('Refresh')
            .click(self.updatePortalCounts);

        container.dialog({
            autoOpen: false,
            title: 'Polygon AP Counter',
            width: 460,
            position: { my: 'right top', at: 'right-10 top+10', of: '#map' }
        });

        container.parent().find('.ui-dialog-titlebar').append(refreshButton);

        var link = $('<a>')
            .html('Polygon AP Counter')
            .click(function () {
                self.updatePortalCounts();
                container.dialog('open');
            });

        if (window.useAppPanes()) {
            link.appendTo($('#sidebartoggle'));
        } else {
            link.appendTo($('#toolbox'));
        }

        // CSS styles
        $('<style>').prop('type', 'text/css').html([
            /* Bubble */
            '.pac-bubble {',
            '  background: rgba(0,0,0,0.72);',
            '  border: 1px solid #aaa;',
            '  border-radius: 6px;',
            '  padding: 4px 8px;',
            '  min-width: 120px;',
            '  font-size: 12px;',
            '  font-weight: bold;',
            '  white-space: nowrap;',
            '  line-height: 1.6;',
            '}',
            '.pac-bubble-count { color: #fff; }',
            '.pac-bubble-enl   { color: #03dc03; }',
            '.pac-bubble-res   { color: #0492d0; }',
            /* Table */
            '.pac-table { width: 100%; border-collapse: collapse; font-size: 12px; }',
            '.pac-table th, .pac-table td { padding: 3px 6px; border-bottom: 1px solid #444; text-align: left; }',
            '.pac-table thead th { background: #1a1a1a; color: #ffce00; }',
            '.pac-table tfoot td { background: #111; }',
            '.pac-table .pac-enl { color: #03dc03; }',
            '.pac-table .pac-res { color: #0492d0; }',
            '.pac-table .pac-num { color: #fff; }',
        ].join('\n')).appendTo('head');
    };

    self.setupLayer = function () {
        self.layerGroup = new L.LayerGroup();
        window.addLayerGroup('Polygon AP Counts', self.layerGroup, true);
    };

    var setup = function () {
        if (window.plugin.drawTools === undefined) {
            alert('Polygon AP Counter requires draw tools plugin. Please install it first.');
            return;
        }

        self.setupLayer();
        self.setupUI();
        window.addHook('drawTools', self.updatePortalCounts);
        window.map.on('zoom', self.updatePortalCounts);
    };

    setup.info = plugin_info;
    if (!window.bootPlugins) window.bootPlugins = [];
    window.bootPlugins.push(setup);
    if (window.iitcLoaded && typeof setup === 'function') setup();
}

var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) info.script = { version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description };
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);
