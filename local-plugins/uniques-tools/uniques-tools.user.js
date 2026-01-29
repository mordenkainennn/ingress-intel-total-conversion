// ==UserScript==
/* global IITC */
// @author         3ch01c, mordenkainennn
// @name           Uniques Tools
// @category       Misc
// @version        1.6.1
// @description    Modified version of the stock Uniques plugin to add support for Drone view, manual entry, and import of portal history.
// @id             uniques-tools
// @namespace      https://github.com/mordenkainennn/ingress-intel-total-conversion
// @updateURL      https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/main/local-plugins/uniques-tools/uniques-tools.meta.js
// @downloadURL    https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/main/local-plugins/uniques-tools/uniques-tools.user.js
// @match          https://intel.ingress.com/*
// @match          https://intel-x.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
    // ensure plugin framework is there, even if iitc is not yet loaded
    if (typeof window.plugin !== 'function') {
        window.plugin = function () { };
    }

    //PLUGIN AUTHORS: writing a plugin outside of the IITC build environment? if so, delete these lines!!
    //(leaving them in place might break the 'About IITC' page or break update checks)
    plugin_info.buildName = 'local';
    plugin_info.dateTimeVersion = '20260113.180002';
    plugin_info.pluginId = 'uniques-tools';
    //END PLUGIN AUTHORS NOTE

    /* exported setup, changelog --eslint */

    var changelog = [
        {
            version: '1.6.1',
            changes: [
                'UPD: Plugin renamed to "Uniques Tools" (from "uniques-drone-final").',
                'UPD: Internal IDs, namespaces, and localStorage keys updated to reflect new name.',
                'FIX: Existing user data will not be migrated and new data will be stored under new keys.',
            ],
        },
        {
            version: '1.6.0',
            changes: [
                'NEW: Added a 550m drone range circle around the selected portal to visualize max flight distance.',
                'UPD: Added a descriptive note for the new feature in the "Uniques Tools" dialog.',
            ],
        },
        {
            version: '1.5.1',
            changes: [
                'NEW: Added a "Find Last Location" button to the Uniques Tools dialog to zoom to the last drone-visited portal.',
                'FIX: Corrected the zoom-to-portal logic to be more reliable by using portal details API for off-screen portals.',
            ],
        },
        {
            version: '1.5.0',
            changes: [
                'NEW: Drone location history now tracks the last 3 visited portals.',
                'NEW: Added separate markers for the 2nd and 3rd most recent drone locations.',
                'NEW: Drone location history is now synchronized across devices.',
                'FIX: Refactored drone location sync logic to prevent plugin crashes.',
            ],
        },
        {
            version: '1.4.1',
            changes: ['FIX: Shortened the warning message for stock "Uniques" plugin conflict to improve dialog aesthetics.'],
        },
        {
            version: '1.4.0',
            changes: [
                'NEW: Added Drone Location Marker feature.',
                'NEW: Marker is automatically set when "Drone" checkbox is checked.',
                'NEW: Marker is persistent across sessions (local storage).',
                'NEW: Marker can be manually removed via "Uniques Tools" dialog.',
                'FIX: Resolved issue where stock "Uniques" plugin caused duplicate UI elements on mobile.',
                'FIX: Added a warning and visual indicator (red toolbox button) if the stock "Uniques" plugin is active.',
                'FIX: Addressed critical bug that caused the plugin to fail loading and the toolbox button to be missing.'
            ],
        },
        {
            version: '1.3.0',
            changes: ['UPD: Renamed plugin to "Uniques Tools" and updated description.'],
        },
        {
            version: '1.2.0',
            changes: [
                'UPD: Refactored "Import History" button into a "Uniques Tools" dialog.',
                'FIX: Moved the toolbox button to a more appropriate location using the correct API.',
            ],
        },
        {
            version: '1.1.0',
            changes: [
                'NEW: Added full support for "Scanned" (Scout Controlled) status and an "Import from Official History" feature.',
                'UPD: Reworked map highlighter color scheme and priority for all states to align with Niantic standards where possible.',
                'FIX: Corrected a subtle syntax error in a helper function that caused the entire script to fail parsing in Tampermonkey.',
                'FIX: Ensured all internal feature names (highlighter, storage keys, sync tasks, hooks) are unique to prevent conflicts.',
            ],
        },
        {
            version: '1.0.0',
            changes: ['NEW: Complete rewrite to add Drone support and initial standalone plugin functionality.'],
        },
    ];

    // use own namespace for plugin
    window.plugin.uniquesTools = function () { };
    var self = window.plugin.uniquesTools;

    self.SYNC_PLUGIN_NAME = 'uniquesTools';
    self.SYNC_FIELD_NAME = 'uniques';
    self.SYNC_DELAY = 5000;

    self.FIELDS = {
        uniques: 'plugin-uniques-tools-data',
        updateQueue: 'plugin-uniques-tools-data-queue',
        updatingQueue: 'plugin-uniques-tools-data-updating-queue',
    };

    self.uniques = {};
    self.updateQueue = {};
    self.updatingQueue = {};
    self.enableSync = false;
    self.disabledMessage = null;
    self.contentHTML = null;
    self.isHighlightActive = false;

    self.DRONE_HISTORY_SYNC_KEY = '__drone_history__';
    self.droneLocationHistory = [];
    self.droneLayer = null;
    self.droneIcons = [];

    self.addDroneLocation = function (guid) {
        setTimeout(function () {
            // Remove from array if it exists
            var index = self.droneLocationHistory.indexOf(guid);
            if (index > -1) {
                self.droneLocationHistory.splice(index, 1);
            }
            // Add to the front
            self.droneLocationHistory.unshift(guid);
            // Trim to max 3
            self.droneLocationHistory = self.droneLocationHistory.slice(0, 3);

            self.uniques[self.DRONE_HISTORY_SYNC_KEY] = self.droneLocationHistory;
            self.sync(self.DRONE_HISTORY_SYNC_KEY);
            self.updateDroneMarkers();
        }, 0);
    };

    self.clearDroneHistory = function () {
        setTimeout(function () {
            self.droneLocationHistory = [];
            delete self.uniques[self.DRONE_HISTORY_SYNC_KEY];
            self.sync(self.DRONE_HISTORY_SYNC_KEY);
            self.updateDroneMarkers();
        }, 0);
    };

    self.zoomToLastDroneLocation = function () {
        if (self.droneLocationHistory.length > 0) {
            var guid = self.droneLocationHistory[0];
            var portal = window.portals[guid];
            if (portal) {
                // portal is visible on screen
                window.map.setView(portal.getLatLng(), 17);
                if (window.selectedPortal !== guid) window.selectPortal(guid);
            } else {
                // portal not on screen, request details
                window.portalDetail.request(guid).then(function (details) {
                    if (details) {
                        window.map.setView([details.latE6 / 1E6, details.lngE6 / 1E6], 17);
                        if (window.selectedPortal !== guid) window.selectPortal(guid);
                    }
                });
            }
        } else {
            alert('No drone history found.');
        }
    };

    self.updateDroneMarkers = function () {
        if (!self.droneLayer) return;
        self.droneLayer.clearLayers();

        self.droneLocationHistory.forEach(function (guid, index) {
            var portal = window.portals[guid];
            if (portal) {
                self.drawDroneMarker(portal, index);
            } else {
                // if portal details are not available, request them
                window.portalDetail.request(guid).then(function () {
                    var p = window.portals[guid];
                    if (p) self.drawDroneMarker(p, index);
                });
            }
        });
    };

    self.drawDroneMarker = function (portal, index) {
        // check if portal is still in our history
        if (!portal || self.droneLocationHistory.indexOf(portal.options.guid) === -1) {
            return;
        }

        var latlng = portal.getLatLng();
        var title = portal.options.data.title;
        var recency = ['(Last)', '(Previous)', '(Oldest)'][index];
        var icon = self.droneIcons[index];
        if (!icon) return;

        var marker = L.marker(latlng, {
            icon: icon,
            title: 'Drone Location ' + recency + ': ' + title,
            guid: portal.options.guid,
            interactive: false,
        });
        marker.addTo(self.droneLayer);
    };

    self.onPortalDetailsUpdated = function () {
        if (typeof Storage === 'undefined') {
            $('#portaldetails > .imgpreview').after(self.disabledMessage);
            return;
        }
        $('#portaldetails > .imgpreview').after(self.contentHTML);
        self.updateCheckedAndHighlight(window.selectedPortal);

        // --- NEW DRONE RANGE CIRCLE LOGIC ---
        if (self.droneRangeLayer) {
            self.droneRangeLayer.clearLayers(); // Always clear previous circles
        }

        if (window.selectedPortal) {
            var portal = window.portals[window.selectedPortal];
            if (portal) {
                var latlng = portal.getLatLng();
                var circle = L.circle(latlng, {
                    radius: 550, // 550 meters
                    color: 'cyan', // Visible drone color
                    fillColor: 'cyan',
                    fillOpacity: 0.1,
                    weight: 2,
                    interactive: false,
                    title: 'Drone Max Range (550m)'
                });
                circle.addTo(self.droneRangeLayer);
            }
        }
        // --- END NEW DRONE RANGE CIRCLE LOGIC ---
    };

    self.updateCheckedAndHighlight = function (guid) {
        window.runHooks('pluginUniquesToolsUpdate', { guid: guid });

        if (guid === window.selectedPortal) {
            var uniqueInfo = self.uniques[guid] || {};
            $('#visited').prop('checked', !!uniqueInfo.visited);
            $('#captured').prop('checked', !!uniqueInfo.captured);
            $('#scoutControlled').prop('checked', !!uniqueInfo.scoutControlled);
            $('#drone').prop('checked', !!uniqueInfo.droneVisited);
        }

        if (self.isHighlightActive && window.portals[guid]) {
            window.setMarkerStyle(window.portals[guid], guid === window.selectedPortal);
        }
    };

    self.ensureUniqueInfo = function (guid) {
        if (!self.uniques[guid]) {
            self.uniques[guid] = {
                visited: false,
                captured: false,
                scoutControlled: false,
                droneVisited: false,
            };
        }
        return self.uniques[guid];
    };

    self.updateStatus = function (guid, property, value) {
        var uniqueInfo = self.ensureUniqueInfo(guid);
        if (uniqueInfo[property] === value) return;

        uniqueInfo[property] = value;

        if (property === 'captured' && value) uniqueInfo.visited = true;
        if (property === 'visited' && !value) uniqueInfo.captured = false;

        if (property === 'droneVisited' && value === true) {
            self.addDroneLocation(guid);
        }

        self.updateCheckedAndHighlight(guid);
        self.sync(guid);
    };

    self.updateVisited = (checked, guid) => self.updateStatus(guid || window.selectedPortal, 'visited', checked);
    self.updateCaptured = (checked, guid) => self.updateStatus(guid || window.selectedPortal, 'captured', checked);
    self.updateScoutControlled = (checked, guid) => self.updateStatus(guid || window.selectedPortal, 'scoutControlled', checked);
    self.updateDroneVisited = (checked, guid) => self.updateStatus(guid || window.selectedPortal, 'droneVisited', checked);

    self.sync = function (guid) {
        self.updateQueue[guid] = true;
        self.storeLocal('uniques');
        self.storeLocal('updateQueue');
        self.syncQueue();
    };

    self.syncQueue = function () {
        if (!self.enableSync) return;
        clearTimeout(self.syncTimer);
        self.syncTimer = setTimeout(function () {
            self.syncTimer = null;
            $.extend(self.updatingQueue, self.updateQueue);
            self.updateQueue = {};
            self.storeLocal('updatingQueue');
            self.storeLocal('updateQueue');
            const ok = window.plugin.sync.updateMap(self.SYNC_PLUGIN_NAME, self.SYNC_FIELD_NAME, Object.keys(self.updatingQueue));
            if (!ok) {
                console.warn(`[${self.SYNC_PLUGIN_NAME}] sync updateMap failed: RegisteredMap not found`);
            }
        }, self.SYNC_DELAY);
    };

    self.registerFieldForSyncing = function () {
        if (!window.plugin.sync) return;
        window.plugin.sync.registerMapForSync(self.SYNC_PLUGIN_NAME, self.SYNC_FIELD_NAME, self.syncCallback, self.syncInitialed);
    };

    self.syncCallback = function (pluginName, fieldName, e, fullUpdated) {
        if (fieldName !== self.SYNC_FIELD_NAME) return;
        self.storeLocal('uniques'); // store the merged uniques data

        // Drone History specific logic
        var droneHistoryData = self.uniques[self.DRONE_HISTORY_SYNC_KEY];
        self.droneLocationHistory = (Array.isArray(droneHistoryData) && droneHistoryData) || [];

        if (fullUpdated) {
            // Full sync, redraw everything
            self.updateDroneMarkers();
            if (window.selectedPortal) self.updateCheckedAndHighlight(window.selectedPortal);
            if (self.isHighlightActive) window.resetHighlightedPortals();
            window.runHooks('pluginUniquesToolsRefreshAll');
            return;
        }

        if (!e) return;

        if (e.property === self.DRONE_HISTORY_SYNC_KEY) {
            // just the drone history was updated
            self.updateDroneMarkers();
            return;
        }

        if (e.isLocal) {
            // a portal unique status was updated locally
            delete self.updatingQueue[e.property];
        } else {
            // a portal unique status was updated from sync
            delete self.updateQueue[e.property];
            self.storeLocal('updateQueue');
            self.updateCheckedAndHighlight(e.property);
            window.runHooks('pluginUniquesToolsUpdate', { guid: e.property });
        }
    };

    self.syncInitialed = function (pluginName, fieldName) {
        if (fieldName !== self.SYNC_FIELD_NAME) return;
        self.enableSync = true;
        if (Object.keys(self.updateQueue).length > 0) {
            self.syncQueue();
        }
    };

    self.storeLocal = function (name) {
        var key = self.FIELDS[name];
        if (key) localStorage[key] = JSON.stringify(self[name]);
    };

    self.loadLocal = function (name) {
        var key = self.FIELDS[name];
        if (key && localStorage[key]) {
            self[name] = JSON.parse(localStorage[key]);
        }
    };

    self.highlighter = {
        highlight: function (data) {
            var guid = data.portal.options.guid;
            var uniqueInfo = self.uniques[guid];
            var style = {};

            if (uniqueInfo) {
                if (uniqueInfo.captured) {
                    // No highlight
                } else if (uniqueInfo.visited) {
                    style.fillColor = 'purple';
                    style.fillOpacity = 0.6;
                } else if (uniqueInfo.droneVisited) {
                    style.fillColor = 'cyan';
                    style.fillOpacity = 0.6;
                } else if (uniqueInfo.scoutControlled) {
                    style.fillColor = '#FFC107'; // Deep Yellow
                    style.fillOpacity = 0.6;
                } else {
                    style.fillColor = 'red';
                    style.fillOpacity = 0.5;
                }
            } else {
                style.fillColor = 'red';
                style.fillOpacity = 0.7;
            }
            data.portal.setStyle(style);
        },
        setSelected: function (active) {
            self.isHighlightActive = active;
        },
    };

    self.importFromOfficialHistory = function () {
        if (!confirm('Import from Official History?\n\nThis will update your personal uniques data with the official visited/captured/scanned status for all currently loaded portals. This may overwrite some of your manual marks.')) {
            return;
        }
        var count = 0;
        for (var guid in window.portals) {
            var portal = window.portals[guid];
            var details = portal.getDetails();
            if (details && details.history) {
                var uniqueInfo = self.ensureUniqueInfo(guid);
                var changed = false;
                // Process in priority order of official data to ensure correctness
                if (details.history.captured && !uniqueInfo.captured) {
                    self.updateStatus(guid, 'captured', true);
                    changed = true;
                } else if (details.history.visited && !uniqueInfo.visited) {
                    self.updateStatus(guid, 'visited', true);
                    changed = true;
                }
                // Scout Controlled is independent, not mutually exclusive, but we update only if not already there
                if (details.history.scoutControlled && !uniqueInfo.scoutControlled) {
                    self.updateStatus(guid, 'scoutControlled', true);
                    changed = true;
                }
                if (changed) count++;
            }
        }
        alert('Imported official history for ' + count + ' portals.');
        // force a full redraw of all highlighters
        if (self.isHighlightActive) window.resetHighlightedPortals();
    };

    self.openUniquesToolsDialog = function () {
        var warningHTML = '';
        if (window.plugin.uniques) {
            warningHTML = '<div style="color: red; margin-bottom: 10px;">'
                + '<b>Warning:</b> Conflicting "Uniques" plugin active.<br>Disable it to prevent issues.'
                + '</div>';
        }

        var isHistoryEmpty = self.droneLocationHistory.length === 0;

        var html = '<div class="uniques-tools-dialog" style="text-align: center;">' +
            warningHTML +
            '<p style="margin: 5px 0 10px;">Select a portal on the map to display a 550m drone range circle.</p>'
            + '<button type="button" class="import-history" style="margin: 5px;">Import History</button>'
            + '<button type="button" class="clear-drone-history" style="margin: 5px;">Clear Drone History</button>'
            + '<br>'
            + '<button type="button" class="zoom-last-drone" style="margin: 5px;"' + (isHistoryEmpty ? ' disabled' : '') + '>Find Last Location</button>'
            + '</div>';

        var dialog = window.dialog({
            title: 'Uniques Tools',
            html: html,
            width: 'auto',
            modal: true,
        });

        // find the button inside the dialog and attach the click handler
        dialog.find('button.import-history').on('click', function () {
            self.importFromOfficialHistory();
            dialog.dialog('close');
        });
        dialog.find('button.clear-drone-history').on('click', function () {
            self.clearDroneHistory();
            dialog.dialog('close');
        });
        dialog.find('button.zoom-last-drone').on('click', function () {
            self.zoomToLastDroneLocation();
            dialog.dialog('close');
        });
    };

    self.setupCSS = function () {
        $('<style>').prop('type', 'text/css').html(
            '#uniques-container{display:block;text-align:center;margin:6px 3px 1px}#uniques-container label{margin:0 .5em}#uniques-container input{vertical-align:middle}#uniques-import-link{display:block;text-align:center;margin:5px 0}.portal-list-uniques input[type=checkbox]{padding:0;height:auto;margin-top:-5px;margin-bottom:-5px}'
        ).appendTo('head');
    };

    self.setupContent = function () {
        self.contentHTML =
            '<div id="uniques-container">'
            + '<label><input type="checkbox" id="visited" onclick="window.plugin.uniquesTools.updateVisited($(this).prop(\'checked\'))"> Visited</label>'
            + '<label><input type="checkbox" id="captured" onclick="window.plugin.uniquesTools.updateCaptured($(this).prop(\'checked\'))"> Captured</label>'
            + '<br>'
            + '<label><input type="checkbox" id="scoutControlled" onclick="window.plugin.uniquesTools.updateScoutControlled($(this).prop(\'checked\'))"> Scanned</label>'
            + '<label><input type="checkbox" id="drone" onclick="window.plugin.uniquesTools.updateDroneVisited($(this).prop(\'checked\'))"> Drone</label>'
            + '</div>'; // Removed the import link from here
        self.disabledMessage = '<div id="uniques-container" class="help" title="Your browser does not support localStorage">Plugin Uniques disabled</div>';
    };

    self.setupPortalsList = function () {
        function addHook(name, guid) {
            var info = self.uniques[guid] || {};
            $(`[data-list-uniques="${guid}"].visited`).prop('checked', !!info.visited);
            $(`[data-list-uniques="${guid}"].captured`).prop('checked', !!info.captured);
            $(`[data-list-uniques="${guid}"].scoutControlled`).prop('checked', !!info.scoutControlled);
            $(`[data-list-uniques="${guid}"].drone`).prop('checked', !!info.droneVisited);
        }

        window.addHook('pluginUniquesToolsUpdate', (data) => addHook('Update', data.guid));
        window.addHook('pluginUniquesToolsRefreshAll', () => {
            $('[data-list-uniques]').each((i, el) => addHook('Refresh', el.getAttribute('data-list-uniques')));
        });

        function uniqueValue(guid) {
            var info = self.uniques[guid];
            if (!info) return 0;
            if (info.captured) return 4;
            if (info.visited) return 3;
            if (info.droneVisited) return 2;
            if (info.scoutControlled) return 1;
            return 0;
        }

        window.plugin.portalslist.fields.push({
            title: 'U.History',
            value: (portal) => portal.options.guid,
            sort: (guidA, guidB) => uniqueValue(guidA) - uniqueValue(guidB),
            format: function (cell, portal, guid) {
                var info = self.uniques[guid] || {};
                $(cell).addClass('portal-list-uniques');

                function createBox(cls, title, checked, changeFunc) {
                    $('<input>').prop({ type: 'checkbox', className: cls, title: title, checked: checked })
                        .attr('data-list-uniques', guid)
                        .appendTo(cell)[0]
                        .addEventListener('change', (ev) => {
                            changeFunc(ev.target.checked, guid);
                            ev.preventDefault();
                            return false;
                        }, false);
                }

                createBox('visited', 'Visited?', !!info.visited, self.updateVisited);
                createBox('captured', 'Captured?', !!info.captured, self.updateCaptured);
                $(cell).append('<br>');
                createBox('scoutControlled', 'Scanned?', !!info.scoutControlled, self.updateScoutControlled);
                createBox('drone', 'Drone Visited?', !!info.droneVisited, self.updateDroneVisited);
            },
        });
    };

    var setup = function () {
        self.setupCSS();
        self.setupContent();
        self.loadLocal('uniques');
        window.addPortalHighlighter('Uniques (Drone)', self.highlighter);
        window.addHook('portalDetailsUpdated', self.onPortalDetailsUpdated);
        self.registerFieldForSyncing();

        // Drone marker setup
        var iconSize = [40, 40];
        var iconAnchor = [20, 40];
        self.droneIcons = [
            L.icon({ iconUrl: 'https://gongjupal.com/ingress/drone-marker.png', iconSize: iconSize, iconAnchor: iconAnchor }),
            L.icon({ iconUrl: 'https://gongjupal.com/ingress/Drone1.png', iconSize: iconSize, iconAnchor: iconAnchor }),
            L.icon({ iconUrl: 'https://gongjupal.com/ingress/Drone2.png', iconSize: iconSize, iconAnchor: iconAnchor }),
        ];

        self.droneLayer = new L.LayerGroup();
        window.addLayerGroup('Drone Location', self.droneLayer, true);

        // Add a new layer group for the drone range circle
        self.droneRangeLayer = new L.LayerGroup();
        window.addLayerGroup('Drone Range (550m)', self.droneRangeLayer, true);

        // Add a hook to draw markers when portal details are loaded
        window.addHook('portalAdded', function (data) {
            var index = self.droneLocationHistory.indexOf(data.portal.options.guid);
            if (index !== -1) {
                self.drawDroneMarker(data.portal, index);
            }
        });

        // Defer initial draw to ensure all other setup is complete
        setTimeout(() => self.updateDroneMarkers(), 1000);

        if (window.plugin.portalslist) {
            self.setupPortalsList();
        }

        IITC.toolbox.addButton({
            label: 'Uniques Tools',
            id: 'uniques-tools-button',
            action: self.openUniquesToolsDialog,
            title: 'Show Uniques Tools',
        });

        // Add a check for the stock 'uniques' plugin and modify the button style if active
        setTimeout(function () {
            if (window.plugin.uniques) {
                $('#uniques-tools-button a').css('color', 'red');
            }
        }, 1000); // delay to allow other plugins to load
    };

    setup.info = plugin_info; //add the script info data to the function as a property
    if (typeof changelog !== 'undefined') setup.info.changelog = changelog;
    if (!window.bootPlugins) window.bootPlugins = [];
    window.bootPlugins.push(setup);
    if (window.iitcLoaded && typeof setup === 'function') setup();
} // wrapper end
// inject code into site context
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
    info.script = { version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description };
}
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);
