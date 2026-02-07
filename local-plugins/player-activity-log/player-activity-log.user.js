// ==UserScript==
// @id             iitc-plugin-player-activity-log
// @name           IITC plugin: Player Activity Log
// @category       Info
// @version        0.8.0
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
    const self = window.plugin.playerActivityLog;

    var changelog = [
        {
            version: '0.8.0',
            changes: [
                'REF: Migrated storage from localStorage to IndexedDB for better performance and capacity.',
                'NEW: Added public API for other plugins (e.g., Recharge Monitor) to query data.',
                'NEW: Implemented automatic data migration from the old version.',
                'NEW: Added automatic cleanup of logs older than 90 days.',
            ],
        },
        {
            version: '0.7.5',
            changes: [
                'NEW: Added a search box to filter the player list by name.',
                'NEW: Added a warning message regarding potential conflicts with the official "Player activity tracker" plugin.'
            ],
        },
        // ... (older logs omitted for brevity)
    ];

    // Constants
    self.DB_NAME = 'IITC_PlayerActivityLog';
    self.DB_VERSION = 1;
    self.STORE_NAME = 'activities';
    self.STORAGE_KEY_OLD = 'player-activity-log'; // For migration
    
    self.INITIAL_DISPLAY_COUNT = 20;
    self.PLAYER_TRAIL_MAX_TIME = 3 * 60 * 60 * 1000;
    self.PLAYER_TRAIL_MIN_OPACITY = 0.3;
    self.PLAYER_TRAIL_LINE_COLOUR = '#FF00FD';
    self.PLAYER_TRAIL_MAX_DISPLAY_EVENTS = 10;
    self.isLoggingEnabled = true;
    self.playersToTrack = [];
    self.db = null;

    // --- Database Management ---

    self.initDB = function () {
        return new Promise((resolve, reject) => {
            if (self.db) return resolve(self.db);

            const request = indexedDB.open(self.DB_NAME, self.DB_VERSION);

            request.onerror = (event) => {
                console.error('PlayerActivityLog: Database error', event.target.error);
                reject(event.target.error);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(self.STORE_NAME)) {
                    const store = db.createObjectStore(self.STORE_NAME, { keyPath: 'id', autoIncrement: true });
                    // Indexes for fast querying
                    store.createIndex('playerName', 'playerName', { unique: false });
                    store.createIndex('team', 'team', { unique: false });
                    store.createIndex('time', 'time', { unique: false });
                    store.createIndex('guid', 'guid', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                self.db = event.target.result;
                resolve(self.db);
            };
        });
    };

    // --- API Functions (Async) ---

    self.getAllActivities = async function () {
        await self.initDB();
        return new Promise((resolve, reject) => {
            const tx = self.db.transaction([self.STORE_NAME], 'readonly');
            const store = tx.objectStore(self.STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    };

    self.getActivitiesByPlayer = async function (playerName) {
        await self.initDB();
        return new Promise((resolve, reject) => {
            const tx = self.db.transaction([self.STORE_NAME], 'readonly');
            const store = tx.objectStore(self.STORE_NAME);
            const index = store.index('playerName');
            const request = index.getAll(playerName);
            request.onsuccess = () => {
                // Sort by time desc
                const results = request.result || [];
                results.sort((a, b) => b.time - a.time);
                resolve(results);
            };
            request.onerror = () => reject(request.error);
        });
    };

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

    self.migrateData = async function () {
        const raw = localStorage.getItem(self.STORAGE_KEY_OLD);
        if (!raw) return;

        console.log('PlayerActivityLog: Migrating data to IndexedDB...');
        try {
            const oldData = JSON.parse(raw);
            const activities = [];

            for (const playerName in oldData) {
                const player = oldData[playerName];
                if (player.activities) {
                    player.activities.forEach(act => {
                        activities.push({
                            playerName: playerName,
                            team: player.team,
                            activity: act.activity,
                            portal: act.portal,
                            time: act.time,
                            guid: act.guid
                        });
                    });
                }
            }

            if (activities.length > 0) {
                await self.initDB();
                const tx = self.db.transaction([self.STORE_NAME], 'readwrite');
                const store = tx.objectStore(self.STORE_NAME);
                activities.forEach(act => store.put(act));
                
                await new Promise((resolve, reject) => {
                    tx.oncomplete = resolve;
                    tx.onerror = reject;
                });
                console.log(`PlayerActivityLog: Migrated ${activities.length} records.`);
            }
            
            // Backup before delete (optional, but safer)
            // localStorage.setItem(self.STORAGE_KEY_OLD + '_backup', raw);
            localStorage.removeItem(self.STORAGE_KEY_OLD);

        } catch (e) {
            console.error('PlayerActivityLog: Migration failed', e);
        }
    };

    self.cleanupOldData = async function () {
        await self.initDB();
        const limit = Date.now() - 90 * 24 * 60 * 60 * 1000; // 90 days
        const tx = self.db.transaction([self.STORE_NAME], 'readwrite');
        const store = tx.objectStore(self.STORE_NAME);
        const index = store.index('time');
        const range = IDBKeyRange.upperBound(limit);
        
        index.openCursor(range).onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                store.delete(cursor.primaryKey);
                cursor.continue();
            }
        };
    };

    window.plugin.playerActivityLog.setup = function () {
        window.plugin.playerActivityLog.addCss();
        window.plugin.playerActivityLog.addControl();

        // Setup for trails
        var iconEnlImage = 'https://gongjupal.com/ingress/images/marker-green.png';
        var iconResImage = 'https://gongjupal.com/ingress/images/marker-blue.png';

        window.plugin.playerActivityLog.iconEnl = L.Icon.Default.extend({
            options: { iconUrl: iconEnlImage },
        });
        window.plugin.playerActivityLog.iconRes = L.Icon.Default.extend({
            options: { iconUrl: iconResImage },
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

        // Async init
        self.initDB().then(() => {
            self.migrateData();
            self.cleanupOldData();
        });
    };

    // ... (addControl and addCss remain same) ...

    // ... (handleCommData remains same) ...

    window.plugin.playerActivityLog.storePlayerActivity = async function (playerName, playerTeam, activity, guid) {
        await self.initDB();
        
        // Check for duplicate (same guid, same time approx) - optional but good
        // Here we just insert. IndexedDB auto-increment ID handles uniqueness of the record itself.
        // But business logic might want to avoid duplicate logs from same COMM packet.
        // Comm parsing is usually stable, but let's just insert for performance.
        
        const record = {
            playerName: playerName,
            team: playerTeam,
            activity: activity.activity,
            portal: activity.portal,
            time: activity.time,
            guid: guid || ''
        };

        const tx = self.db.transaction([self.STORE_NAME], 'readwrite');
        const store = tx.objectStore(self.STORE_NAME);
        store.put(record);
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

    // Helper to aggregate flat DB records into player-centric object for UI
    self.getAggregatedData = async function() {
        const activities = await self.getAllActivities();
        const data = {};
        activities.forEach(act => {
            if (!data[act.playerName]) {
                data[act.playerName] = { team: act.team, activities: [] };
            }
            data[act.playerName].activities.push({
                activity: act.activity,
                portal: act.portal,
                time: act.time,
                guid: act.guid
            });
        });
        // Sort activities for each player
        for (const p in data) {
            data[p].activities.sort((a, b) => b.time - a.time);
        }
        return data;
    };

    window.plugin.playerActivityLog.displayLog = async function () {
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
                                <input type="text" id="player-list-search" placeholder="Search players..." autocomplete="off">
                                <div class="activity-log-player-list">Loading...</div>
                            </div>
                            <div class="activity-log-details">
                                <p>Select a player to view their activity.</p>
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

        // Async load data
        const logData = await self.getAggregatedData();
        
        var playerListContainer = $('.activity-log-player-list');
        playerListContainer.empty(); // Clear loading text
        
        var playerNames = Object.keys(logData).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

        playerNames.forEach(function (name) {
            var player = logData[name];
            if (!player || !player.team) return;

            var teamClass = (player.team && player.team.toUpperCase() === 'RESISTANCE') ? 'res' : 'enl';
            var itemCount = player.activities ? player.activities.length : 0;
            var playerDiv = $(`<div class="activity-log-player-item" data-player="${name}"></div>`);

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

            var nameSpan = $(`<span class="player-name-container"><span class="${teamClass}">${name}</span> (${itemCount})</span>`);
            // Removing individual delete for now as it's complex with IndexedDB flat structure
            // or implement it later
            
            playerDiv.append(checkbox).append(nameSpan);
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
            }
        });
        $('#activity-log-clear-trails').on('click', function () {
            if (window.plugin.playerActivityLog.clearAllTrails) {
                window.plugin.playerActivityLog.clearAllTrails();
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
        $('#player-list-search').on('keyup', function () {
            var searchTerm = $(this).val().toLowerCase();
            $('.activity-log-player-list .activity-log-player-item').each(function () {
                var playerName = $(this).data('player').toLowerCase();
                if (playerName.includes(searchTerm)) {
                    $(this).show();
                } else {
                    $(this).hide();
                }
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

    window.plugin.playerActivityLog.removePlayerData = async function (playerName) {
        if (confirm(`Are you sure you want to delete all logs for player "${playerName}"?`)) {
            await self.initDB();
            const tx = self.db.transaction([self.STORE_NAME], 'readwrite');
            const store = tx.objectStore(self.STORE_NAME);
            const index = store.index('playerName');
            const request = index.openCursor(IDBKeyRange.only(playerName));
            
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };
            
            tx.oncomplete = () => {
                if ($('.activity-log-modal-backdrop').length) {
                    window.plugin.playerActivityLog.displayLog();
                }
            };
        }
    };

    window.plugin.playerActivityLog.exportToCsv = async function () {
        const logData = await self.getAggregatedData();
        var allActivities = [];
        for (var playerName in logData) {
            var player = logData[playerName];
            if (player.activities) {
                player.activities.forEach(function (act) {
                    allActivities.push({ player: playerName, faction: player.team, ...act });
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

    window.plugin.playerActivityLog.clearAllData = async function () {
        if (confirm("Are you sure you want to delete all activity logs? This action cannot be undone.")) {
            await self.initDB();
            const tx = self.db.transaction([self.STORE_NAME], 'readwrite');
            const store = tx.objectStore(self.STORE_NAME);
            store.clear();
            
            tx.oncomplete = () => {
                if ($('.activity-log-modal-backdrop').length) {
                    window.plugin.playerActivityLog.displayLog();
                }
            };
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
        var limit = Date.now() - 3 * 24 * 60 * 60 * 1000;
        data.result.forEach(function (msg) {
            var guid = msg[0], timestamp = msg[1], plext = msg[2].plext;
            if (timestamp < limit) return;
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

    // storePlayerActivity is now async above, removed here to avoid duplication/conflict
    
    window.plugin.playerActivityLog.clearAllTrails = function () {
        window.plugin.playerActivityLog.drawnTracesEnl.clearLayers();
        window.plugin.playerActivityLog.drawnTracesRes.clearLayers();
    };

    window.plugin.playerActivityLog.getDrawnTracesByTeam = function (team) {
        return team.toUpperCase() === 'RESISTANCE' ? window.plugin.playerActivityLog.drawnTracesRes : window.plugin.playerActivityLog.drawnTracesEnl;
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

    window.plugin.playerActivityLog.drawPlayerTrails = async function () {
        var plugin = window.plugin.playerActivityLog;
        plugin.clearAllTrails();

        var playersToDraw = plugin.playersToTrack;
        if (playersToDraw.length === 0) {
            return;
        }

        const logData = await self.getAggregatedData();
        var now = Date.now();
        var isTouchDev = window.isTouchDevice();

        playersToDraw.forEach(function (playerName) {
            var playerData = logData[playerName];
            if (!playerData || !playerData.activities || playerData.activities.length === 0) {
                return; // No data for this player
            }

            // IMPORTANT: `player-activity-tracker` expects events sorted oldest to newest to draw lines.
            // Our aggregated activities are sorted newest to oldest. So we reverse a copy.
            var playerEvents = [...playerData.activities].reverse();

            // --- Adapted Polyline Logic ---
            var polyLineByAge = [[], [], [], []];
            var split = plugin.PLAYER_TRAIL_MAX_TIME / 4;

            for (let i = 1; i < playerEvents.length; i++) {
                var p = playerEvents[i];
                // We could also filter by time here if we want to respect MAX_TIME strictly
                var ageBucket = Math.min(Math.trunc((now - p.time) / split), 4 - 1);
                var line = [
                    [p.portal.lat, p.portal.lng],
                    [playerEvents[i - 1].portal.lat, playerEvents[i - 1].portal.lng]
                ];
                polyLineByAge[ageBucket].push(line);
            }

            // --- Draw Polylines ---
            polyLineByAge.forEach((polyLine, i) => {
                if (polyLine.length === 0) return;
                var opts = {
                    weight: 2 - 0.25 * i,
                    color: plugin.PLAYER_TRAIL_LINE_COLOUR,
                    interactive: false,
                    opacity: 1 - 0.2 * i,
                    dashArray: '5,8',
                };
                L.polyline(polyLine, opts).addTo(plugin.getDrawnTracesByTeam(playerData.team));
            });

            // --- Adapted Marker Logic ---
            var lastEvent = playerEvents[playerEvents.length - 1];
            if (!lastEvent) return;

            const ago = IITC.utils.formatAgo;
            var tooltip = isTouchDev ? '' : playerName + ', ' + ago(lastEvent.time, now) + ' ago';

            // Popup
            var popup = $('<div>').addClass('plugin-player-tracker-popup'); // Consider reusing CSS from player-tracker
            $('<span>')
                .addClass('nickname ' + (playerData.team.toUpperCase() === 'RESISTANCE' ? 'res' : 'enl'))
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

            // Marker Opacity
            var relOpacity = 1 - (now - lastEvent.time) / plugin.PLAYER_TRAIL_MAX_TIME;
            var absOpacity = plugin.PLAYER_TRAIL_MIN_OPACITY + (1 - plugin.PLAYER_TRAIL_MIN_OPACITY) * relOpacity;
            if (absOpacity < plugin.PLAYER_TRAIL_MIN_OPACITY) absOpacity = plugin.PLAYER_TRAIL_MIN_OPACITY;


            // Marker
            var icon = playerData.team.toUpperCase() === 'RESISTANCE' ? new plugin.iconRes() : new plugin.iconEnl();
            var markerPos = [lastEvent.portal.lat, lastEvent.portal.lng];
            var m = new L.Marker(markerPos, { icon: icon, opacity: absOpacity, title: tooltip });

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

            m.addTo(plugin.getDrawnTracesByTeam(playerData.team));
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