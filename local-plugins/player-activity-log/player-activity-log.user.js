// ==UserScript==
// @id             iitc-plugin-player-activity-log
// @name           IITC plugin: Player Activity Log
// @category       Info
// @version        0.7.10
// @namespace      https://github.com/mordenkainennn/ingress-intel-total-conversion
// @updateURL      https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/player-activity-log/player-activity-log.meta.js
// @downloadURL    https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/player-activity-log/player-activity-log.user.js
// @description    Logs player activities and stores them in localStorage.
// @include        https://intel.ingress.com/*
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
    // Ensure plugin framework is there, even if iitc is not yet loaded
    if (typeof window.plugin !== 'function') window.plugin = function () { };

    // PLUGIN START ////////////////////////////////////////////////////////

    // use own namespace for plugin
    window.plugin.playerActivityLog = function () { };

    var changelog = [
        {
            version: '0.7.10',
            changes: [
                'FIX: Restored dashed trail rendering to match player-activity-tracker style.',
            ],
        },
        {
            version: '0.7.9',
            changes: [
                'UPD: Removed the 3-day cutoff and now records all activity messages provided by Intel COMM.',
            ],
        },
        {
            version: '0.7.8',
            changes: [
                'UPD: Draw player trails by connecting all loaded portal events in chronological order.',
                'UPD: Disabled marker age-based fading; trail markers now stay fully visible.',
            ],
        },
        {
            version: '0.7.7',
            changes: [
                'FIX: Added backward-compatible log data normalization so legacy stored player logs are visible again.',
            ],
        },
        {
            version: '0.7.6',
            changes: [
                'FIX: Repaired player ID filter by normalizing filter values as strings and handling input events reliably.',
            ],
        },
        {
            version: '0.7.5',
            changes: [
                'NEW: Added a search box to filter the player list by name.',
                'NEW: Added a warning message regarding potential conflicts with the official "Player activity tracker" plugin.'
            ],
        },
        {
            version: '0.7.4',
            changes: [
                'NEW: Integrated player activity trails feature from player-activity-tracker.',
                'NEW: Added UI to select and display player movement trails on the map (max 3 players).',
                'NEW: Added "Draw Trails" and "Clear Trails" buttons to activity log modal.',
                'FIX: Corrected portal logging for "linked from" activities (records origin portal).',
                'UPD: Resolved marker display issue by adjusting icon URL handling (removed retina URL for compatibility).',
            ],
        },
        {
            version: '0.7.3',
            changes: [
                'FIX: Restored standard IITC wrapper injection to fix missing toolbox link.',
            ],
        },
        {
            version: '0.7.0',
            changes: [
                'FIX: Reverted to legacy plugin structure to permanently fix toolbox link loading issue.',
                'NEW: All features (pause, delete, export, etc.) have been retained in the new structure.',
            ],
        },
        {
            version: '0.5.5',
            changes: ['FIX: Attempted to fix toolbox link using vanilla JS.'],
        },
    ];

    window.plugin.playerActivityLog.STORAGE_KEY = 'player-activity-log';
    window.plugin.playerActivityLog.INITIAL_DISPLAY_COUNT = 20;

    // Constants for trail drawing
    window.plugin.playerActivityLog.PLAYER_TRAIL_MAX_TIME = 3 * 60 * 60 * 1000;
    window.plugin.playerActivityLog.PLAYER_TRAIL_MIN_OPACITY = 0.3;
    window.plugin.playerActivityLog.PLAYER_TRAIL_LINE_COLOUR = '#FF00FD';
    window.plugin.playerActivityLog.PLAYER_TRAIL_MAX_DISPLAY_EVENTS = 10;
    window.plugin.playerActivityLog.isLoggingEnabled = true;
    window.plugin.playerActivityLog.playersToTrack = [];

    // Helper function for zero-padding
    function pad(number) {
        return (number < 10 ? '0' : '') + number;
    }

    // Function to format timestamp to YYYYMMDD HHMMSS
    function formatTimestamp(timestamp) {
        var d = new Date(timestamp);
        var year = d.getFullYear();
        var month = pad(d.getMonth() + 1);
        var day = pad(d.getDate());
        var hours = pad(d.getHours());
        var minutes = pad(d.getMinutes());
        var seconds = pad(d.getSeconds());
        return `${year}${month}${day} ${hours}${minutes}${seconds}`;
    }

    window.plugin.playerActivityLog.normalizeTeam = function (team) {
        if (team === 'RESISTANCE' || team === 'RES' || team === 1 || team === '1') return 'RESISTANCE';
        if (team === 'ENLIGHTENED' || team === 'ENL' || team === 2 || team === '2') return 'ENLIGHTENED';
        return '';
    };

    window.plugin.playerActivityLog.normalizeActivity = function (act) {
        if (!act || typeof act !== 'object' || !act.portal || typeof act.portal !== 'object') return null;
        var lat = Number(act.portal.lat);
        var lng = Number(act.portal.lng);
        var time = Number(act.time);
        if (!isFinite(lat) || !isFinite(lng) || !isFinite(time)) return null;

        return {
            activity: String(act.activity || ''),
            portal: {
                name: String(act.portal.name || '(unknown portal)'),
                address: String(act.portal.address || ''),
                lat: lat,
                lng: lng,
            },
            time: time,
            guid: act.guid,
        };
    };

    window.plugin.playerActivityLog.normalizeLogData = function (rawLogData) {
        var changed = false;
        var normalizedLogData = {};

        if (!rawLogData || typeof rawLogData !== 'object' || Array.isArray(rawLogData)) {
            return { logData: normalizedLogData, changed: true };
        }

        Object.keys(rawLogData).forEach(function (playerName) {
            var rawRecord = rawLogData[playerName];
            var team = '';
            var rawActivities = [];

            if (Array.isArray(rawRecord)) {
                // legacy format: { playerName: [activities...] }
                rawActivities = rawRecord;
                changed = true;
            } else if (rawRecord && typeof rawRecord === 'object') {
                var normalizedTeam = window.plugin.playerActivityLog.normalizeTeam(rawRecord.team);
                if (normalizedTeam !== rawRecord.team) changed = true;
                team = normalizedTeam;

                if (Array.isArray(rawRecord.activities)) {
                    rawActivities = rawRecord.activities;
                } else if (Array.isArray(rawRecord.events)) {
                    // fallback if events were stored under another key
                    rawActivities = rawRecord.events;
                    changed = true;
                } else {
                    rawActivities = [];
                    if (rawRecord.activities !== undefined || rawRecord.events !== undefined) changed = true;
                }
            } else {
                changed = true;
                return;
            }

            var activities = rawActivities
                .map(window.plugin.playerActivityLog.normalizeActivity)
                .filter(Boolean)
                .sort((a, b) => b.time - a.time);

            if (activities.length !== rawActivities.length) changed = true;
            normalizedLogData[playerName] = { team: team, activities: activities };
        });

        return { logData: normalizedLogData, changed: changed };
    };

    window.plugin.playerActivityLog.loadLogData = function () {
        var rawLogData = JSON.parse(localStorage.getItem(window.plugin.playerActivityLog.STORAGE_KEY) || '{}');
        var normalized = window.plugin.playerActivityLog.normalizeLogData(rawLogData);
        if (normalized.changed) {
            localStorage.setItem(window.plugin.playerActivityLog.STORAGE_KEY, JSON.stringify(normalized.logData));
        }
        return normalized.logData;
    };

    window.plugin.playerActivityLog.setup = function () {
        window.plugin.playerActivityLog.addCss();
        window.plugin.playerActivityLog.addControl();

        // Setup for trails
        var iconEnlImage = 'https://gongjupal.com/ingress/images/marker-green.png';
        // var iconEnlRetImage = 'https://gongjupal.com/ingress/images/marker-green-2x.png';
        var iconResImage = 'https://gongjupal.com/ingress/images/marker-blue.png';
        // var iconResRetImage = 'https://gongjupal.com/ingress/images/marker-blue-2x.png';

        window.plugin.playerActivityLog.iconEnl = L.Icon.Default.extend({
            options: {
                iconUrl: iconEnlImage,
                // iconRetinaUrl: iconEnlRetImage,
            },
        });
        window.plugin.playerActivityLog.iconRes = L.Icon.Default.extend({
            options: {
                iconUrl: iconResImage,
                // iconRetinaUrl: iconResRetImage,
            },
        });

        window.plugin.playerActivityLog.drawnTracesEnl = new L.LayerGroup();
        window.plugin.playerActivityLog.drawnTracesRes = new L.LayerGroup();
        if (window.PLAYER.team === 'RESISTANCE') {
            window.layerChooser.addOverlay(window.plugin.playerActivityLog.drawnTracesRes, 'Player Trails (RES)');
            window.layerChooser.addOverlay(window.plugin.playerActivityLog.drawnTracesEnl, 'Player Trails (ENL)');
        } else {
            window.layerChooser.addOverlay(window.plugin.playerActivityLog.drawnTracesEnl, 'Player Trails (ENL)');
            window.layerChooser.addOverlay(window.plugin.playerActivityLog.drawnTracesRes, 'Player Trails (RES)');
        }

        // Setup the hook for chat data
        window.addHook('publicChatDataAvailable', window.plugin.playerActivityLog.handleCommData);
    };

    window.plugin.playerActivityLog.addControl = function () {
        var link = document.createElement('a');
        link.textContent = 'Activity Log';
        link.onclick = function () { window.plugin.playerActivityLog.displayLog(); return false; };
        link.title = 'Display player activity log.';
        var toolbox = document.getElementById('toolbox');
        if (toolbox) {
            toolbox.appendChild(link);
        } else {
            console.warn('IITC Player Activity Log: Toolbox not found');
        }
    };

    window.plugin.playerActivityLog.addCss = function () {
        $('<style>').prop('type', 'text/css').html(`
            .activity-log-modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 2000; display: flex; align-items: center; justify-content: center; }
            .activity-log-modal-content { background: #202124; color: #f1f1f1; padding: 20px; border-radius: 8px; width: 80%; max-width: 800px; height: 80vh; display: flex; flex-direction: column; box-shadow: 0 5px 15px rgba(0,0,0,0.5); }
            .activity-log-modal-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 10px; margin-bottom: 10px; }
            .activity-log-modal-header h2 { margin: 0; font-size: 1.2em; flex-grow: 1; }
            .activity-log-header-buttons { display: flex; align-items: center; }
            .activity-log-header-button { margin-left: 10px; padding: 4px 8px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; }
            .activity-log-header-button:hover { background-color: #45a049; }
            .activity-log-header-button.clear-all { background-color: #f44336; }
            .activity-log-header-button.clear-all:hover { background-color: #d32f2f; }
            .activity-log-header-button.paused { background-color: #FBC02D; }
            .activity-log-modal-close { cursor: pointer; font-size: 1.5em; line-height: 1; font-weight: bold; margin-left: 15px; }
            .activity-log-modal-body { display: flex; flex-grow: 1; min-height: 0; }
            .activity-log-player-list-container { width: 35%; border-right: 1px solid #444; padding-right: 10px; display: flex; flex-direction: column; }
            #player-list-search { width: 100%; box-sizing: border-box; padding: 5px; margin-bottom: 10px; background: #000; color: #eee; border: 1px solid #555; border-radius: 4px; }
            .activity-log-player-list { flex-grow: 1; overflow-y: auto; padding-right: 5px; }
            .activity-log-player-item { display: flex; justify-content: space-between; align-items: center; padding: 5px; cursor: pointer; border-radius: 4px; }
            .activity-log-player-item:hover { background-color: #313235; }
            .activity-log-player-item.selected { background-color: #4CAF50; color: white; }
            .activity-log-player-item .player-name-container { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .activity-log-player-item .trail-checkbox { margin-right: 8px; vertical-align: middle; }
            .remove-player-icon { display: none; padding: 0 5px; color: #ff8888; font-weight: bold; }
            .activity-log-player-item:hover .remove-player-icon { display: inline; }
            .remove-player-icon:hover { color: #ff0000; }
            .activity-log-details { width: 65%; padding-left: 10px; overflow-y: auto; }
            .activity-log-entry { margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #333; }
            .activity-log-entry .portal-link { font-weight: bold; }
            .activity-log-entry .time { font-size: 0.9em; color: #ccc; }
            .activity-log-entry .activity-type { text-transform: uppercase; font-weight: bold; }
            .load-more-button { background-color: #4CAF50; color: white; padding: 10px 15px; border: none; border-radius: 4px; cursor: pointer; display: block; margin: 10px auto; }
            .load-more-button:hover { background-color: #45a049; }
            .res { color: #0088ff; }
            .enl { color: #00ff00; }
        `).appendTo('head');
    };

    window.plugin.playerActivityLog.displayLog = function () {
        $('.activity-log-modal-backdrop').remove();

        var modal = `
                <div class="activity-log-modal-backdrop">
                    <div class="activity-log-modal-content">
                        <div class="activity-log-modal-header">
                            <h2>Player Activity Log</h2>
                            <div class="activity-log-header-buttons">
                                <button class="activity-log-header-button" id="activity-log-draw-trails">Draw Trails</button>
                                <button class="activity-log-header-button" id="activity-log-clear-trails">Clear Trails</button>
                                <button class="activity-log-header-button" id="activity-log-toggle-logging"></button>
                                <button class="activity-log-header-button" id="activity-log-export">Export CSV</button>
                                <button class="activity-log-header-button clear-all" id="activity-log-clear">Clear All</button>
                                <span class="activity-log-modal-close">&times;</span>
                            </div>
                        </div>
                        <div class="activity-log-modal-body">
                            <div class="activity-log-player-list-container">
                                <input type="text" id="player-list-search" placeholder="Search player ID/name..." autocomplete="off">
                                <div class="activity-log-player-list"></div>
                            </div>
                            <div class="activity-log-details">
                                <p>Select a player to view their activity.</p>
                                <br>
                                <p style="color:#ffce00;">Note: Data is volatile. Please export it regularly!</p>
                                <br>
                                <p style="color:#F88; font-style:italic;">
                                    Reminder: The 'Draw Trails' feature may conflict with the official 'Player activity tracker' plugin.
                                    For best results, please disable the official plugin from the layer chooser while using trails here.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        $(document.body).append(modal);

        window.plugin.playerActivityLog.updateToggleLoggingButton();

        var logData = window.plugin.playerActivityLog.loadLogData();
        var playerListContainer = $('.activity-log-player-list');
        var playerNames = Object.keys(logData).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

        playerNames.forEach(function (name) {
            var player = logData[name];
            if (!player || !Array.isArray(player.activities)) return;

            var team = window.plugin.playerActivityLog.normalizeTeam(player.team);
            var teamClass = team === 'RESISTANCE' ? 'res' : (team === 'ENLIGHTENED' ? 'enl' : '');
            var itemCount = player.activities ? player.activities.length : 0;
            var playerDiv = $('<div class="activity-log-player-item"></div>');
            playerDiv.attr('data-player', name);
            playerDiv.data('player', name);

            var checkbox = $(`<input type="checkbox" class="trail-checkbox" title="Track this player on map">`);
            checkbox.prop('checked', window.plugin.playerActivityLog.playersToTrack.includes(name));
            checkbox.on('click', function (e) {
                e.stopPropagation(); // prevent player log from opening
                var checked = $(this).prop('checked');
                var currentTracked = window.plugin.playerActivityLog.playersToTrack;
                if (checked) {
                    if (currentTracked.length >= 3) {
                        alert('You can only track up to 3 players at a time.');
                        $(this).prop('checked', false);
                    } else {
                        currentTracked.push(name);
                    }
                } else {
                    var index = currentTracked.indexOf(name);
                    if (index > -1) {
                        currentTracked.splice(index, 1);
                    }
                }
            });

            var nameSpan = $('<span class="player-name-container"></span>');
            var playerNameText = $('<span></span>').text(name);
            if (teamClass) playerNameText.addClass(teamClass);
            nameSpan.append(playerNameText).append(` (${itemCount})`);
            var removeIcon = $('<span class="remove-player-icon" title="Delete this player\'s logs">&times;</span>');

            removeIcon.on('click', function (e) {
                e.stopPropagation();
                window.plugin.playerActivityLog.removePlayerData(name);
            });

            playerDiv.append(checkbox).append(nameSpan).append(removeIcon);
            playerDiv.on('click', function () {
                $('.activity-log-player-item.selected').removeClass('selected');
                $(this).addClass('selected');
                window.plugin.playerActivityLog.renderPlayerLog(name, logData);
            });
            playerListContainer.append(playerDiv);
        });

        $('#activity-log-draw-trails').on('click', function () {
            if (window.plugin.playerActivityLog.drawPlayerTrails) {
                window.plugin.playerActivityLog.drawPlayerTrails();
            } else {
                console.warn('drawPlayerTrails function not yet implemented');
            }
        });
        $('#activity-log-clear-trails').on('click', function () {
            if (window.plugin.playerActivityLog.clearAllTrails) {
                window.plugin.playerActivityLog.clearAllTrails();
            } else {
                console.warn('clearAllTrails function not yet implemented');
            }
        });

        $('#activity-log-toggle-logging').on('click', window.plugin.playerActivityLog.toggleLogging);
        $('#activity-log-export').on('click', window.plugin.playerActivityLog.exportToCsv);
        $('#activity-log-clear').on('click', window.plugin.playerActivityLog.clearAllData);
        $('.activity-log-modal-backdrop, .activity-log-modal-close').on('click', function (e) {
            if ($(e.target).is('.activity-log-modal-backdrop, .activity-log-modal-close')) {
                $('.activity-log-modal-backdrop').remove();
            }
        });

        // search filter
        $('#player-list-search').on('input', function () {
            var searchTerm = String($(this).val() || '').trim().toLowerCase();
            $('.activity-log-player-list .activity-log-player-item').each(function () {
                var playerName = String($(this).data('player') || $(this).attr('data-player') || '').toLowerCase();
                $(this).toggle(playerName.includes(searchTerm));
            });
        });
    };
    window.plugin.playerActivityLog.toggleLogging = function () {
        var plugin = window.plugin.playerActivityLog;
        plugin.isLoggingEnabled = !plugin.isLoggingEnabled;
        plugin.updateToggleLoggingButton();
    };

    window.plugin.playerActivityLog.updateToggleLoggingButton = function () {
        var plugin = window.plugin.playerActivityLog;
        var button = $('#activity-log-toggle-logging');
        if (plugin.isLoggingEnabled) {
            button.text('Pause Logging').removeClass('paused');
        } else {
            button.text('Resume Logging').addClass('paused');
        }
    };

    window.plugin.playerActivityLog.removePlayerData = function (playerName) {
        if (confirm(`Are you sure you want to delete all logs for player "${playerName}"?`)) {
            var logData = window.plugin.playerActivityLog.loadLogData();
            delete logData[playerName];
            localStorage.setItem(window.plugin.playerActivityLog.STORAGE_KEY, JSON.stringify(logData));
            if ($('.activity-log-modal-backdrop').length) {
                window.plugin.playerActivityLog.displayLog();
            }
        }
    };

    window.plugin.playerActivityLog.exportToCsv = function () {
        var logData = window.plugin.playerActivityLog.loadLogData();
        var allActivities = [];
        for (var playerName in logData) {
            var player = logData[playerName];
            if (player.activities) {
                player.activities.forEach(function (act) {
                    allActivities.push({ player: playerName, faction: window.plugin.playerActivityLog.normalizeTeam(player.team), ...act });
                });
            }
        }
        allActivities.sort((a, b) => a.time - b.time);
        var csvContent = "Timestamp,Player,Faction,Activity,Portal Name,Portal Lat,Portal Lng\n";
        function escapeCsvField(field) {
            if (field === undefined || field === null) return '';
            var str = String(field);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        }
        allActivities.forEach(function (act) {
            var row = [
                formatTimestamp(act.time),
                escapeCsvField(act.player),
                escapeCsvField(act.faction),
                escapeCsvField(act.activity),
                escapeCsvField(act.portal.name),
                act.portal.lat,
                act.portal.lng
            ].join(',');
            csvContent += row + "\n";
        });
        var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        var link = document.createElement("a");
        var url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "iitc-activity-log.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    window.plugin.playerActivityLog.clearAllData = function () {
        if (confirm("Are you sure you want to delete all activity logs? This action cannot be undone.")) {
            localStorage.removeItem(window.plugin.playerActivityLog.STORAGE_KEY);
            if ($('.activity-log-modal-backdrop').length) {
                window.plugin.playerActivityLog.displayLog();
            }
        }
    };

    window.plugin.playerActivityLog.renderPlayerLog = function (playerName, logData, offset = 0) {
        var detailsContainer = $('.activity-log-details');
        if (offset === 0) {
            detailsContainer.empty();
        }
        detailsContainer.find('.load-more-button').remove();
        var player = logData[playerName];
        if (!player || !player.activities || player.activities.length === 0) {
            detailsContainer.html('<p>No activities logged for this player.</p>');
            return;
        }
        var activitiesToRender = player.activities.slice(offset, offset + window.plugin.playerActivityLog.INITIAL_DISPLAY_COUNT);
        activitiesToRender.forEach(function (act) {
            var entryDiv = $('<div class="activity-log-entry"></div>');
            var portalLink = $(`<a class="portal-link">${act.portal.name}</a>`).on('click', function () {
                window.selectPortalByLatLng(act.portal.lat, act.portal.lng);
            });
            var formattedTime = formatTimestamp(act.time);
            entryDiv.append($('<div class="activity-type">').text(act.activity));
            entryDiv.append(portalLink);
            entryDiv.append($('<div class="time">').text(formattedTime));
            detailsContainer.append(entryDiv);
        });
        var newOffset = offset + window.plugin.playerActivityLog.INITIAL_DISPLAY_COUNT;
        if (player.activities.length > newOffset) {
            var loadMoreButton = $('<button class="load-more-button">Load More</button>');
            loadMoreButton.on('click', function () {
                window.plugin.playerActivityLog.renderPlayerLog(playerName, logData, newOffset);
            });
            detailsContainer.append(loadMoreButton);
        }
    };

    window.plugin.playerActivityLog.getActivityType = function (plainText) {
        if (plainText.includes('captured')) return 'captured';
        if (plainText.includes('deployed a Resonator')) return 'deployed';
        if (plainText.includes('destroyed a Resonator')) return 'destroyed';
        if (plainText.includes('linked from')) return 'linked';
        if (plainText.includes('created a Control Field')) return 'created field';
        if (plainText.includes('destroyed the Link')) return null;
        if (plainText.includes('destroyed a Control Field')) return null;
        return null;
    };

    window.plugin.playerActivityLog.handleCommData = function (data) {
        if (!window.plugin.playerActivityLog.isLoggingEnabled) return;
        data.result.forEach(function (msg) {
            var guid = msg[0], timestamp = msg[1], plext = msg[2].plext;
            var playerName, playerTeam, portalName, portalAddress, portalLat, portalLng, activityType;
            plext.markup.forEach(function (markup) {
                switch (markup[0]) {
                    case 'TEXT':
                        if (!activityType) activityType = window.plugin.playerActivityLog.getActivityType(markup[1].plain);
                        break;
                    case 'PLAYER':
                        playerName = markup[1].plain;
                        playerTeam = markup[1].team;
                        break;
                    case 'PORTAL':
                        portalName = portalName ? portalName : markup[1].name;
                        portalAddress = portalAddress ? portalAddress : markup[1].address;
                        portalLat = portalLat ? portalLat : markup[1].latE6 / 1E6;
                        portalLng = portalLng ? portalLng : markup[1].lngE6 / 1E6;
                        break;
                }
            });
            if (!playerName || !playerTeam || playerTeam === 'MACHINA' || !activityType || !portalName) {
                return;
            }
            var activity = {
                activity: activityType,
                portal: { name: portalName, address: portalAddress, lat: portalLat, lng: portalLng },
                time: timestamp
            };
            window.plugin.playerActivityLog.storePlayerActivity(playerName, playerTeam, activity, guid);
        });
    };

    window.plugin.playerActivityLog.storePlayerActivity = function (playerName, playerTeam, activity, guid) {
        var log = window.plugin.playerActivityLog.loadLogData();
        if (!log[playerName] || Array.isArray(log[playerName])) {
            log[playerName] = { team: playerTeam, activities: [] };
        }
        log[playerName].team = window.plugin.playerActivityLog.normalizeTeam(playerTeam);
        var activities = log[playerName].activities;
        if (activities.some(act => act.guid === guid)) return;
        activity.guid = guid;
        activities.push(activity);
        activities.sort((a, b) => b.time - a.time);
        localStorage.setItem(window.plugin.playerActivityLog.STORAGE_KEY, JSON.stringify(log));
    };

    window.plugin.playerActivityLog.clearAllTrails = function () {
        window.plugin.playerActivityLog.drawnTracesEnl.clearLayers();
        window.plugin.playerActivityLog.drawnTracesRes.clearLayers();
    };

    window.plugin.playerActivityLog.getDrawnTracesByTeam = function (team) {
        var normalizedTeam = window.plugin.playerActivityLog.normalizeTeam(team);
        return normalizedTeam === 'RESISTANCE' ? window.plugin.playerActivityLog.drawnTracesRes : window.plugin.playerActivityLog.drawnTracesEnl;
    };

    window.plugin.playerActivityLog.getPortalLinkFromActivity = function (act) {
        var position = [act.portal.lat, act.portal.lng];
        return $('<a>')
            .addClass('text-overflow-ellipsis')
            .css('max-width', '15em')
            .text(act.portal.name)
            .prop({
                title: act.portal.name,
                href: window.makePermalink(position),
            })
            .click(function (event) {
                window.selectPortalByLatLng(position);
                event.preventDefault();
                return false;
            });
    };

    window.plugin.playerActivityLog.drawPlayerTrails = function () {
        var plugin = window.plugin.playerActivityLog;
        plugin.clearAllTrails();

        var playersToDraw = plugin.playersToTrack;
        if (playersToDraw.length === 0) {
            return;
        }

        var logData = plugin.loadLogData();
        var now = Date.now();
        var isTouchDev = window.isTouchDevice();

        playersToDraw.forEach(function (playerName) {
            var playerData = logData[playerName];
            if (!playerData || !playerData.activities || playerData.activities.length === 0) {
                return; // No data for this player
            }
            var team = plugin.normalizeTeam(playerData.team);

            // Our stored activities are sorted newest to oldest. Reverse to chronological order.
            var playerEvents = [...playerData.activities].reverse();

            // Draw a single chronological path including all loaded activity portals.
            var pathPoints = playerEvents
                .map(function (ev) {
                    return ev && ev.portal ? [Number(ev.portal.lat), Number(ev.portal.lng)] : null;
                })
                .filter(function (point) {
                    return point && isFinite(point[0]) && isFinite(point[1]);
                });

            if (pathPoints.length >= 2) {
                L.polyline(pathPoints, {
                    weight: 2,
                    color: plugin.PLAYER_TRAIL_LINE_COLOUR,
                    interactive: false,
                    opacity: 1,
                    dashArray: '5,8',
                }).addTo(plugin.getDrawnTracesByTeam(team));
            }

            // --- Adapted Marker Logic ---
            var lastEvent = playerEvents[playerEvents.length - 1];
            if (!lastEvent) return;

            const ago = IITC.utils.formatAgo;
            var tooltip = isTouchDev ? '' : playerName + ', ' + ago(lastEvent.time, now) + ' ago';

            // Popup
            var popup = $('<div>').addClass('plugin-player-tracker-popup'); // Consider reusing CSS from player-tracker
            var popupNickClass = team === 'RESISTANCE' ? 'res' : (team === 'ENLIGHTENED' ? 'enl' : '');
            $('<span>')
                .addClass('nickname' + (popupNickClass ? ' ' + popupNickClass : ''))
                .css('font-weight', 'bold')
                .text(playerName)
                .appendTo(popup);

            popup.append('<br>')
                .append(document.createTextNode(ago(lastEvent.time, now)))
                .append('<br>')
                .append(plugin.getPortalLinkFromActivity(lastEvent));

            if (playerEvents.length >= 2) {
                popup.append('<br><br>').append(document.createTextNode('previous locations:')).append('<br>');
                var table = $('<table>').appendTo(popup).css('border-spacing', '0');
                for (let i = playerEvents.length - 2; i >= 0 && i >= playerEvents.length - plugin.PLAYER_TRAIL_MAX_DISPLAY_EVENTS; i--) {
                    var ev = playerEvents[i];
                    $('<tr>')
                        .append($('<td>').text(ago(ev.time, now) + ' ago'))
                        .append($('<td>').append(plugin.getPortalLinkFromActivity(ev)))
                        .appendTo(table);
                }
            }

            // Marker
            var icon = team === 'RESISTANCE' ? new plugin.iconRes() : new plugin.iconEnl();
            var markerPos = [lastEvent.portal.lat, lastEvent.portal.lng];
            var m = new L.Marker(markerPos, { icon: icon, opacity: 1, title: tooltip });

            // OMS-friendly popup handling
            m.options.desc = popup[0];
            m.on('spiderfiedclick', function (e) {
                if (!plugin.playerPopup) {
                    plugin.playerPopup = new L.Popup({ offset: new L.Point([1, -34]) });
                }
                plugin.playerPopup.setContent(e.target.options.desc);
                plugin.playerPopup.setLatLng(e.target.getLatLng());
                window.map.openPopup(plugin.playerPopup);
            });


            if (tooltip) {
                m.on('mouseout', function () { $(this._icon).tooltip('close'); });
            }

            m.addTo(plugin.getDrawnTracesByTeam(team));
            window.registerMarkerForOMS(m);
            if (!isTouchDev) {
                window.setupTooltips($(m._icon));
            }
        });
    };


    var setup = window.plugin.playerActivityLog.setup;
    setup.info = plugin_info; // Pass info to setup

    // This checks if we are running inside the wrapper injection already or need to queue it
    if (window.iitcLoaded && typeof setup === 'function') {
        setup();
    } else {
        if (!window.bootPlugins) window.bootPlugins = [];
        window.bootPlugins.push(setup);
    }

    // PLUGIN END //////////////////////////////////////////////////////////
}

// Inject plugin into page (Standard IITC Wrapper Injection)
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) info.script = { version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description };
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);
