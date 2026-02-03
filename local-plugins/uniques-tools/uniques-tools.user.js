// ==UserScript==
/* global IITC */
// @author         3ch01c, mordenkainennn
// @name           Uniques Tools
// @category       Misc
// @version        1.6.7
// @description    Modified version of the stock Uniques plugin to add support for Drone view, manual entry, and import of portal history.
// @id             uniques-tools
// @namespace      https://github.com/mordenkainennn/ingress-intel-total-conversion
// @updateURL      https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/uniques-tools/uniques-tools.meta.js
// @downloadURL    https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/uniques-tools/uniques-tools.user.js
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
    plugin_info.dateTimeVersion = '20260129.180000'; // Updated date
    plugin_info.pluginId = 'uniques-tools';
    //END PLUGIN AUTHORS NOTE

    /* exported setup, changelog --eslint */

    var changelog = [
        {
            version: '1.6.7',
            changes: [
                'FIX: Corrected UserScript update/download URLs to point to the correct `master` branch.',
            ],
        },
        {
            version: '1.6.6',
            changes: [
                'NEW: Added a persistent 550m range circle around the last drone location, displayed on the "Drone Location" layer.',
                'UPD: Renamed "Clear Drone History" button to "Clear Drone Last Location" for clarity.',
                'FIX: Corrected implementation of persistent drone range circle to use existing "Drone Location" layer.',
            ],
        },
        {
            version: '1.6.5',
            changes: [
                'FIX: Changed the layout of checkboxes in the portal list to a single row to improve compactness.',
            ],
        },
        {
            version: '1.6.4',
            changes: [
                'FIX: Resolved issue where Drone markers disappeared after page refresh.',
                'FIX: Drone markers now correctly render for off-screen portals (using raw coordinates instead of relying on loaded portal entities).',
                'FIX: "Find Last Location" now reliably works even if the portal is not currently loaded in the viewport.',
            ],
        },
        // ... (Previous changelogs omitted for brevity but preserved in structure) ...
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

    // --- HELPER TO LOAD HISTORY FROM UNIQUES OBJECT ---
    self.loadDroneHistoryFromUniques = function() {
        var droneHistoryData = self.uniques[self.DRONE_HISTORY_SYNC_KEY];
        self.droneLocationHistory = (Array.isArray(droneHistoryData) && droneHistoryData) || [];
    };

    self.addDroneLocation = function (guid) {
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
    };

    self.clearDroneHistory = function () {
        self.droneLocationHistory = [];
        delete self.uniques[self.DRONE_HISTORY_SYNC_KEY];
        self.sync(self.DRONE_HISTORY_SYNC_KEY);
        self.updateDroneMarkers();
    };

    self.zoomToLastDroneLocation = function () {
        // Ensure data is fresh
        self.loadLocal('uniques');
        self.loadDroneHistoryFromUniques();
        self.updateDroneMarkers();

        if (self.droneLocationHistory.length > 0) {
            var guid = self.droneLocationHistory[0];
            var portal = window.portals[guid];

            if (portal) {
                // Portal is loaded
                window.map.setView(portal.getLatLng(), 17);
                if (window.selectedPortal !== guid) window.selectPortal(guid);
            } else {
                // Portal is NOT loaded, fetch detail
                window.portalDetail.request(guid).then(function (details) {
                    if (details) {
                        var lat = details.latE6 / 1E6;
                        var lng = details.lngE6 / 1E6;
                        window.map.setView([lat, lng], 17);
                        if (window.selectedPortal !== guid) window.selectPortal(guid);
                    } else {
                         alert('Could not fetch details for the last drone location.');
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

        // Draw the persistent last drone location range circle
        if (self.droneLocationHistory.length > 0) {
            var guid = self.droneLocationHistory[0];

            var drawCircleForGuid = function(latlng, title) {
                 L.circle(latlng, {
                    radius: 550,
                    color: 'cyan',
                    fillColor: 'cyan',
                    fillOpacity: 0.15, // Higher opacity as requested
                    weight: 1.5, // slightly thinner to distinguish
                    interactive: false,
                    dashArray: '5,5', // Dashed line to distinguish
                    title: 'Last Drone Location Range (550m) for ' + title
                }).addTo(self.droneLayer); // Add to the existing droneLayer
            };

            var portal = window.portals[guid];
            if (portal) {
                drawCircleForGuid(portal.getLatLng(), portal.options.data.title);
            } else {
                window.portalDetail.request(guid).then(function (details) {
                    if (details) {
                        var latlng = L.latLng(details.latE6 / 1E6, details.lngE6 / 1E6);
                        drawCircleForGuid(latlng, details.title);
                    }
                });
            }
        }

        // Existing logic to draw drone markers
        self.droneLocationHistory.forEach(function (guid, index) {
            var portal = window.portals[guid];

            if (portal) {
                // Scenario A: Portal is visible on screen. Use existing object.
                var latlng = portal.getLatLng();
                var title = portal.options.data.title;
                self.drawDroneMarker(guid, latlng, title, index);
            } else {
                // Scenario B: Portal is off-screen. Fetch details to get coords.
                window.portalDetail.request(guid).then(function (details) {
                    if (details) {
                        var latlng = L.latLng(details.latE6 / 1E6, details.lngE6 / 1E6);
                        self.drawDroneMarker(guid, latlng, details.title, index);
                    }
                });
            }
        });
    };

    // REFACTORED: Now accepts raw data instead of requiring a Portal object
    self.drawDroneMarker = function (guid, latlng, title, index) {
        // Double check this guid is still in history (async requests might finish late)
        var verifyIndex = self.droneLocationHistory.indexOf(guid);
        if (verifyIndex === -1) return;

        // Ensure we use the correct icon for the *current* index of this guid
        // (Handles cases where array order changed while request was pending)
        var icon = self.droneIcons[verifyIndex];
        if (!icon) return;

        var recency = ['(Last)', '(Previous)', '(Oldest)'][verifyIndex];

        var marker = L.marker(latlng, {
            icon: icon,
            title: 'Drone Location ' + recency + ': ' + title,
            guid: guid,
            interactive: false,
        });

        // Prevent duplicate markers for the same GUID if multiple requests fire
        var existing = false;
        self.droneLayer.eachLayer(function(layer) {
            if (layer.options.guid === guid) existing = true;
        });

        if (!existing) {
            marker.addTo(self.droneLayer);
        }
    };

    self.onPortalDetailsUpdated = function () {
        if (typeof Storage === 'undefined') {
            $('#portaldetails > .imgpreview').after(self.disabledMessage);
            return;
        }
        $('#portaldetails > .imgpreview').after(self.contentHTML);
        self.updateCheckedAndHighlight(window.selectedPortal);

        if (self.droneRangeLayer) {
            self.droneRangeLayer.clearLayers();
        }

        if (window.selectedPortal) {
            var portal = window.portals[window.selectedPortal];
            // Fix: Calculate range even if portal object is incomplete/loading
            // (Though usually selectedPortal implies it's loaded, this is safer)
            if (portal) {
                var latlng = portal.getLatLng();
                self.drawDroneRange(latlng);
            } else {
                 // Fallback for detailed view where portal entity might be missing from map
                 window.portalDetail.request(window.selectedPortal).then(function(details) {
                     if(details) {
                         var latlng = L.latLng(details.latE6/1E6, details.lngE6/1E6);
                         self.drawDroneRange(latlng);
                     }
                 });
            }
        }
    };

    self.drawDroneRange = function(latlng) {
        if (!self.droneRangeLayer) return;
        L.circle(latlng, {
            radius: 550,
            color: 'cyan',
            fillColor: 'cyan',
            fillOpacity: 0.1,
            weight: 2,
            interactive: false,
            title: 'Drone Max Range (550m)'
        }).addTo(self.droneRangeLayer);
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
        self.storeLocal('uniques');

        // Always refresh local memory from the updated store
        self.loadDroneHistoryFromUniques();

        if (fullUpdated) {
            self.updateDroneMarkers();
            if (window.selectedPortal) self.updateCheckedAndHighlight(window.selectedPortal);
            if (self.isHighlightActive) window.resetHighlightedPortals();
            window.runHooks('pluginUniquesToolsRefreshAll');
            return;
        }

        if (!e) return;

        if (e.property === self.DRONE_HISTORY_SYNC_KEY) {
            self.updateDroneMarkers();
            return;
        }

        if (e.isLocal) {
            delete self.updatingQueue[e.property];
        } else {
            delete self.updateQueue[e.property];
            self.storeLocal('updateQueue');
            self.updateCheckedAndHighlight(e.property);
            window.runHooks('pluginUniquesToolsUpdate', { guid: e.property });
        }
    };

    self.syncInitialed = function (pluginName, fieldName) {
        if (fieldName !== self.SYNC_FIELD_NAME) return;
        self.enableSync = true;

        // Initial load from sync data
        self.loadDroneHistoryFromUniques();

        if (Object.keys(self.updateQueue).length > 0) {
            self.syncQueue();
        }

        // Force update markers after sync init
        self.updateDroneMarkers();
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

    // ... [Highlighters code omitted, unchanged from original] ...
    self.droneHighlighter = {
        highlight: function (data) {
            var guid = data.portal.options.guid;
            var uniqueInfo = self.uniques[guid];
            var style = {};
            if (uniqueInfo && uniqueInfo.droneVisited) {
                style.fillColor = 'cyan';
                style.fillOpacity = 0.6;
            } else {
                style.fillColor = 'red';
                style.fillOpacity = 0.7;
            }
            data.portal.setStyle(style);
        },
        setSelected: function (active) {},
    };

    self.scoutHighlighter = {
        highlight: function (data) {
            var guid = data.portal.options.guid;
            var uniqueInfo = self.uniques[guid];
            var style = {};
            if (uniqueInfo && uniqueInfo.scoutControlled) {
                style.fillColor = '#FFC107';
                style.fillOpacity = 0.6;
            } else {
                style.fillColor = 'red';
                style.fillOpacity = 0.7;
            }
            data.portal.setStyle(style);
        },
        setSelected: function (active) {},
    };

    self.highlighter = {
        highlight: function (data) {
            var guid = data.portal.options.guid;
            var uniqueInfo = self.uniques[guid];
            var style = {};
            if (uniqueInfo) {
                if (uniqueInfo.captured) {
                } else if (uniqueInfo.visited) {
                    style.fillColor = 'purple';
                    style.fillOpacity = 0.6;
                } else if (uniqueInfo.droneVisited) {
                    style.fillColor = 'cyan';
                    style.fillOpacity = 0.6;
                } else if (uniqueInfo.scoutControlled) {
                    style.fillColor = '#FFC107';
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
    // ... [End Highlighters] ...

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
                if (details.history.captured && !uniqueInfo.captured) {
                    self.updateStatus(guid, 'captured', true);
                    changed = true;
                } else if (details.history.visited && !uniqueInfo.visited) {
                    self.updateStatus(guid, 'visited', true);
                    changed = true;
                }
                if (details.history.scoutControlled && !uniqueInfo.scoutControlled) {
                    self.updateStatus(guid, 'scoutControlled', true);
                    changed = true;
                }
                if (changed) count++;
            }
        }
        alert('Imported official history for ' + count + ' portals.');
        if (self.isHighlightActive) window.resetHighlightedPortals();
    };

    self.importFromOldVersion = function () {
        var oldKey = 'plugin-uniques-drone-final-data';
        var oldData = localStorage[oldKey];
        if (!oldData) {
            alert('No data from old version (uniques-drone-final) found.');
            return;
        }
        var newKey = self.FIELDS.uniques;
        var newData = localStorage[newKey];
        if (newData) {
            if (!confirm('New data already exists for "Uniques Tools". Importing will OVERWRITE any new marks you have made. Continue?')) {
                return;
            }
        }
        try {
            localStorage[newKey] = oldData;
            var oldQueueKey = 'plugin-uniques-drone-final-data-queue';
            if (localStorage[oldQueueKey]) {
                localStorage[self.FIELDS.updateQueue] = localStorage[oldQueueKey];
            }
            var oldUpdatingKey = 'plugin-uniques-drone-final-data-updating-queue';
            if (localStorage[oldUpdatingKey]) {
                localStorage[self.FIELDS.updatingQueue] = localStorage[oldUpdatingKey];
            }
            self.loadLocal('uniques');
            self.loadLocal('updateQueue');
            self.loadLocal('updatingQueue');

            // Fix import: sync history too
            self.loadDroneHistoryFromUniques();

            self.updateDroneMarkers();
            if (window.selectedPortal) self.updateCheckedAndHighlight(window.selectedPortal);
            if (self.isHighlightActive) window.resetHighlightedPortals();
            window.runHooks('pluginUniquesToolsRefreshAll');
            alert('Successfully imported data from old version.');
            if (confirm('Delete old data to free up space and prevent this prompt from appearing again?')) {
                delete localStorage[oldKey];
                delete localStorage[oldQueueKey];
                delete localStorage[oldUpdatingKey];
                alert('Old data deleted.');
            }
        } catch (e) {
            console.error('Error importing old uniques data: ', e);
            alert('An error occurred during import. See console for details.');
        }
    };

    self.openUniquesToolsDialog = function () {
        var warningHTML = '';
        if (window.plugin.uniques) {
            warningHTML = '<div style="color: red; margin-bottom: 10px;">'
                + '<b>Warning:</b> Conflicting "Uniques" plugin active.<br>Disable it to prevent issues.'
                + '</div>';
        }

        var isHistoryEmpty = self.droneLocationHistory.length === 0;
        var hasOldData = !!localStorage['plugin-uniques-drone-final-data'];

        var html = '<div class="uniques-tools-dialog" style="text-align: center;">' +
            warningHTML +
            '<p style="margin: 5px 0 10px;">Select a portal on the map to display a 550m drone range circle.</p>'
            + '<button type="button" class="import-history" style="margin: 5px;">Import History</button>'
            + '<button type="button" class="clear-drone-history" style="margin: 5px;">Clear Drone Last Location</button>'
            + '<br>'
            + '<button type="button" class="zoom-last-drone" style="margin: 5px;"' + (isHistoryEmpty ? ' disabled' : '') + '>Find Last Location</button>'
            + (hasOldData ? '<br><button type="button" class="import-old-data" style="margin: 5px;">Import from Old Version</button>' : '')
            + '</div>';

        var dialog = window.dialog({
            title: 'Uniques Tools',
            html: html,
            width: 'auto',
            modal: true,
        });

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
        if (hasOldData) {
            dialog.find('button.import-old-data').on('click', function () {
                self.importFromOldVersion();
                dialog.dialog('close');
            });
        }
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
            + '</div>';
        self.disabledMessage = '<div id="uniques-container" class="help" title="Your browser does not support localStorage">Plugin Uniques disabled</div>';
    };

    // ... [setupPortalsList omitted, unchanged] ...
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
                createBox('scoutControlled', 'Scanned?', !!info.scoutControlled, self.updateScoutControlled);
                createBox('drone', 'Drone Visited?', !!info.droneVisited, self.updateDroneVisited);
            },
        });
    };

    var setup = function () {
        self.setupCSS();
        self.setupContent();

        // --- FIX INITIALIZATION ---
        self.loadLocal('uniques');
        self.loadDroneHistoryFromUniques(); // <-- Vital fix: Extract history immediately on load

        window.addPortalHighlighter('Uniques Tools', self.highlighter);
        window.addPortalHighlighter('Uniques: Drone', self.droneHighlighter);
        window.addPortalHighlighter('Uniques: Scout', self.scoutHighlighter);
        window.addHook('portalDetailsUpdated', self.onPortalDetailsUpdated);
        self.registerFieldForSyncing();

        // Drone marker setup
        var iconSize = [40, 40];
        var iconAnchor = [20, 40];
        self.droneIcons = [
            L.icon({ iconUrl: 'https://gongjupal.com/ingress/images/drone-marker.png', iconSize: iconSize, iconAnchor: iconAnchor }),
            L.icon({ iconUrl: 'https://gongjupal.com/ingress/images/drone1.png', iconSize: iconSize, iconAnchor: iconAnchor }),
            L.icon({ iconUrl: 'https://gongjupal.com/ingress/images/drone2.png', iconSize: iconSize, iconAnchor: iconAnchor }),
        ];

        self.droneLayer = new L.LayerGroup();
        window.addLayerGroup('Drone Location', self.droneLayer, true);

        self.droneRangeLayer = new L.LayerGroup();
        window.addLayerGroup('Drone Range (550m)', self.droneRangeLayer, true);

        // Add a hook to draw markers when portal details are loaded
        window.addHook('portalAdded', function (data) {
            var index = self.droneLocationHistory.indexOf(data.portal.options.guid);
            if (index !== -1) {
                // We pass raw data because we have the portal object now
                var p = data.portal;
                self.drawDroneMarker(p.options.guid, p.getLatLng(), p.options.data.title, index);
            }
        });

        setTimeout(() => {
            self.updateDroneMarkers();
        }, 1000);

        if (window.plugin.portalslist) {
            self.setupPortalsList();
        }

        IITC.toolbox.addButton({
            label: 'Uniques Tools',
            id: 'uniques-tools-button',
            action: self.openUniquesToolsDialog,
            title: 'Show Uniques Tools',
        });

        setTimeout(function () {
            if (window.plugin.uniques) {
                $('#uniques-tools-button a').css('color', 'red');
            }
        }, 1000);
    };

    setup.info = plugin_info;
    if (typeof changelog !== 'undefined') setup.info.changelog = changelog;
    if (!window.bootPlugins) window.bootPlugins = [];
    window.bootPlugins.push(setup);
    if (window.iitcLoaded && typeof setup === 'function') setup();
}
// inject code into site context
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
    info.script = { version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description };
}
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);