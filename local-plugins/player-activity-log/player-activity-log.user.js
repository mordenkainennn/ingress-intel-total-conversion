// ==UserScript==
// @id             iitc-plugin-player-activity-log
// @name           IITC plugin: Player Activity Log
// @category       Info
// @version        0.8.1
// @namespace      https://github.com/mordenkainennn/ingress-intel-total-conversion
// @updateURL      https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/player-activity-log/player-activity-log.meta.js
// @downloadURL    https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/player-activity-log/player-activity-log.user.js
// @description    Logs player activities and stores them in IndexedDB.
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
            version: '0.8.1',
            changes: [
                'FIX: Corrected IndexedDB initialization logic by upgrading version and adding schema verification.',
                'FIX: Database renamed to ensure a clean state for users with semi-initialized DBs.',
            ],
        },
        {
            version: '0.8.0',
            changes: [
                'REF: Migrated storage from localStorage to IndexedDB for better performance and capacity.',
                'NEW: Added public API for other plugins (e.g., Recharge Monitor) to query data.',
                'NEW: Implemented automatic data migration from the old version.',
                'NEW: Added automatic cleanup of logs older than 90 days.',
            ],
        }
    ];

    // Constants - Renamed and incremented version to fix semi-initialized DB issues
    self.DB_NAME = 'IITC_PlayerActivityLog_V2';
    self.DB_VERSION = 1; // Starting fresh with V2 name
    self.STORE_NAME = 'activities';
    self.STORAGE_KEY_OLD = 'player-activity-log';

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

            console.log('PlayerActivityLog: Attempting to open DB: ' + self.DB_NAME);
            const request = indexedDB.open(self.DB_NAME, self.DB_VERSION);

            request.onerror = (event) => {
                console.error('PlayerActivityLog: Database open error', event.target.error);
                reject(event.target.error);
            };

            request.onupgradeneeded = (event) => {
                console.log('PlayerActivityLog: Database upgrade needed (creating schema)');
                const db = event.target.result;
                if (!db.objectStoreNames.contains(self.STORE_NAME)) {
                    const store = db.createObjectStore(self.STORE_NAME, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('playerName', 'playerName', { unique: false });
                    store.createIndex('team', 'team', { unique: false });
                    store.createIndex('time', 'time', { unique: false });
                    store.createIndex('guid', 'guid', { unique: false });
                    console.log('PlayerActivityLog: ObjectStore created successfully');
                }
            };

            request.onsuccess = (event) => {
                const db = event.target.result;
                // EXTRA SAFETY CHECK: Ensure the store actually exists
                if (!db.objectStoreNames.contains(self.STORE_NAME)) {
                    console.error('PlayerActivityLog: DB success but Store missing! This indicates a failed initialization.');
                    db.close();
                    // We can't automatically delete/retry here easily without risk of loops, 
                    // but since we renamed the DB, this shouldn't happen.
                    reject('Store missing');
                    return;
                }
                console.log('PlayerActivityLog: Database ready');
                self.db = db;
                resolve(self.db);
            };
        });
    };

    // --- API Functions (Async) ---

    self.getAllActivities = async function () {
        const db = await self.initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([self.STORE_NAME], 'readonly');
            const store = tx.objectStore(self.STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    };

    self.getActivitiesByPlayer = async function (playerName) {
        const db = await self.initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([self.STORE_NAME], 'readonly');
            const store = tx.objectStore(self.STORE_NAME);
            const index = store.index('playerName');
            const request = index.getAll(playerName);
            request.onsuccess = () => {
                const results = request.result || [];
                results.sort((a, b) => b.time - a.time);
                resolve(results);
            };
            request.onerror = () => reject(request.error);
        });
    };

    self.getAggregatedData = async function () {
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
        for (const p in data) {
            data[p].activities.sort((a, b) => b.time - a.time);
        }
        return data;
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

        console.log('PlayerActivityLog: Migrating old localStorage data to V2 DB...');
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
                const db = await self.initDB();
                const tx = db.transaction([self.STORE_NAME], 'readwrite');
                const store = tx.objectStore(self.STORE_NAME);
                activities.forEach(act => store.put(act));

                await new Promise((resolve, reject) => {
                    tx.oncomplete = resolve;
                    tx.onerror = reject;
                });
                console.log(`PlayerActivityLog: Migrated ${activities.length} records.`);
            }
            localStorage.removeItem(self.STORAGE_KEY_OLD);
        } catch (e) {
            console.error('PlayerActivityLog: Migration failed', e);
        }
    };

    self.cleanupOldData = async function () {
        const db = await self.initDB();
        const limit = Date.now() - 90 * 24 * 60 * 60 * 1000; // 90 days
        const tx = db.transaction([self.STORE_NAME], 'readwrite');
        const store = tx.objectStore(self.STORE_NAME);
        const index = store.index('time');
        const range = IDBKeyRange.upperBound(limit);

        index.openCursor(range).onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
    };

    window.plugin.playerActivityLog.setup = function () {
        console.log('PlayerActivityLog: setup started');
        window.plugin.playerActivityLog.addCss();
        window.plugin.playerActivityLog.addControl();

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

        window.layerChooser.addOverlay(window.plugin.playerActivityLog.drawnTracesEnl, 'Player Activity Trails (ENL)');
        window.layerChooser.addOverlay(window.plugin.playerActivityLog.drawnTracesRes, 'Player Activity Trails (RES)');

        window.addHook('publicChatDataAvailable', window.plugin.playerActivityLog.handleCommData);

        // Async init
        self.initDB().then(() => {
            self.migrateData();
            self.cleanupOldData();
        }).catch(err => console.error('PlayerActivityLog: Failed to boot', err));
    };

    window.plugin.playerActivityLog.storePlayerActivity = async function (playerName, playerTeam, activity, guid) {
        try {
            const db = await self.initDB();
            const record = {
                playerName: playerName,
                team: playerTeam,
                activity: activity.activity,
                portal: activity.portal,
                time: activity.time,
                guid: guid || ''
            };

            const tx = db.transaction([self.STORE_NAME], 'readwrite');
            const store = tx.objectStore(self.STORE_NAME);
            store.put(record);
        } catch (e) {
            console.error('PlayerActivityLog: Write failed', e);
        }
    };

    window.plugin.playerActivityLog.addControl = function () {
        var link = document.createElement('a');
        link.textContent = 'Activity Log';
        link.onclick = function () { window.plugin.playerActivityLog.displayLog(); return false; };
        link.title = 'Display player activity log.';
        var toolbox = document.getElementById('toolbox');
        if (toolbox) toolbox.appendChild(link);
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
                            </div>
                        </div>
                    </div>
                </div>
            `;
        $(document.body).append(modal);

        window.plugin.playerActivityLog.updateToggleLoggingButton();

        const logData = await self.getAggregatedData();
        var playerListContainer = $('.activity-log-player-list');
        playerListContainer.empty();

        var playerNames = Object.keys(logData).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

        playerNames.forEach(function (name) {
            var player = logData[name];
            var teamClass = (player.team && player.team.toUpperCase() === 'RESISTANCE') ? 'res' : 'enl';
            var itemCount = player.activities.length;
            var playerDiv = $(`<div class="activity-log-player-item" data-player="${name}"></div>`);

            var checkbox = $(`<input type="checkbox" class="trail-checkbox" title="Track this player on map">`);
            checkbox.prop('checked', self.playersToTrack.includes(name));
            checkbox.on('click', function (e) {
                e.stopPropagation();
                if ($(this).prop('checked')) {
                    if (self.playersToTrack.length >= 3) {
                        alert('You can only track up to 3 players.');
                        $(this).prop('checked', false);
                    } else {
                        self.playersToTrack.push(name);
                    }
                } else {
                    const idx = self.playersToTrack.indexOf(name);
                    if (idx > -1) self.playersToTrack.splice(idx, 1);
                }
            });

            var nameSpan = $(`<span class="player-name-container"><span class="${teamClass}">${name}</span> (${itemCount})</span>`);
            var removeIcon = $('<span class="remove-player-icon" title="Delete this player\'s logs">&times;</span>');

            removeIcon.on('click', function (e) {
                e.stopPropagation();
                self.removePlayerData(name);
            });

            playerDiv.append(checkbox).append(nameSpan).append(removeIcon);
            playerDiv.on('click', function () {
                $('.activity-log-player-item.selected').removeClass('selected');
                $(this).addClass('selected');
                self.renderPlayerLog(name, logData);
            });
            playerListContainer.append(playerDiv);
        });

        $('#activity-log-draw-trails').on('click', () => self.drawPlayerTrails());
        $('#activity-log-clear-trails').on('click', () => self.clearAllTrails());
        $('#activity-log-toggle-logging').on('click', () => self.toggleLogging());
        $('#activity-log-export').on('click', () => self.exportToCsv());
        $('#activity-log-clear').on('click', () => self.clearAllData());

        $('.activity-log-modal-backdrop, .activity-log-modal-close').on('click', function (e) {
            if ($(e.target).is('.activity-log-modal-backdrop, .activity-log-modal-close')) {
                $('.activity-log-modal-backdrop').remove();
            }
        });

        $('#player-list-search').on('keyup', function () {
            var searchTerm = $(this).val().toLowerCase();
            $('.activity-log-player-list .activity-log-player-item').each(function () {
                if ($(this).data('player').toLowerCase().includes(searchTerm)) $(this).show();
                else $(this).hide();
            });
        });
    };

    window.plugin.playerActivityLog.toggleLogging = function () {
        self.isLoggingEnabled = !self.isLoggingEnabled;
        self.updateToggleLoggingButton();
    };

    window.plugin.playerActivityLog.updateToggleLoggingButton = function () {
        var button = $('#activity-log-toggle-logging');
        if (self.isLoggingEnabled) button.text('Pause Logging').removeClass('paused');
        else button.text('Resume Logging').addClass('paused');
    };

    window.plugin.playerActivityLog.removePlayerData = async function (playerName) {
        if (confirm(`Delete all logs for "${playerName}"?`)) {
            const db = await self.initDB();
            const tx = db.transaction([self.STORE_NAME], 'readwrite');
            const store = tx.objectStore(self.STORE_NAME);
            const index = store.index('playerName');
            const range = IDBKeyRange.only(playerName);
            index.openCursor(range).onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) { cursor.delete(); cursor.continue(); }
            };
            tx.oncomplete = () => { if ($('.activity-log-modal-backdrop').length) self.displayLog(); };
        }
    };

    window.plugin.playerActivityLog.exportToCsv = async function () {
        const logData = await self.getAggregatedData();
        var allActivities = [];
        for (var playerName in logData) {
            logData[playerName].activities.forEach(act => allActivities.push({ player: playerName, faction: logData[playerName].team, ...act }));
        }
        allActivities.sort((a, b) => a.time - b.time);
        var csv = "Timestamp,Player,Faction,Activity,Portal Name,Portal Lat,Portal Lng\n";
        allActivities.forEach(act => {
            const row = [formatTimestamp(act.time), act.player, act.faction, act.activity, `"${act.portal.name.replace(/"/g, '""')}"`, act.portal.lat, act.portal.lng];
            csv += row.join(',') + "\n";
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "iitc-activity-log.csv";
        link.click();
    };

    window.plugin.playerActivityLog.clearAllData = async function () {
        if (confirm("Delete all activity logs permanently?")) {
            const db = await self.initDB();
            const tx = db.transaction([self.STORE_NAME], 'readwrite');
            tx.objectStore(self.STORE_NAME).clear();
            tx.oncomplete = () => { if ($('.activity-log-modal-backdrop').length) self.displayLog(); };
        }
    };

    window.plugin.playerActivityLog.renderPlayerLog = function (playerName, logData, offset = 0) {
        var container = $('.activity-log-details');
        if (offset === 0) container.empty();
        container.find('.load-more-button').remove();
        var player = logData[playerName];
        if (!player || player.activities.length === 0) {
            container.html('<p>No activities.</p>');
            return;
        }
        var renderBatch = player.activities.slice(offset, offset + self.INITIAL_DISPLAY_COUNT);
        renderBatch.forEach(act => {
            var entry = $('<div class="activity-log-entry"></div>');
            var portalLink = $(`<a class="portal-link">${act.portal.name}</a>`).on('click', () => window.selectPortalByLatLng(act.portal.lat, act.portal.lng));
            entry.append($('<div class="activity-type">').text(act.activity))
                .append(portalLink)
                .append($('<div class="time">').text(formatTimestamp(act.time)));
            container.append(entry);
        });
        if (player.activities.length > offset + self.INITIAL_DISPLAY_COUNT) {
            $('<button class="load-more-button">Load More</button>').on('click', () => self.renderPlayerLog(playerName, logData, offset + self.INITIAL_DISPLAY_COUNT)).appendTo(container);
        }
    };

    window.plugin.playerActivityLog.getActivityType = function (plainText) {
        if (plainText.includes('captured')) return 'captured';
        if (plainText.includes('deployed a Resonator')) return 'deployed';
        if (plainText.includes('destroyed a Resonator')) return 'destroyed';
        if (plainText.includes('linked from')) return 'linked';
        if (plainText.includes('created a Control Field')) return 'created field';
        return null;
    };

    window.plugin.playerActivityLog.handleCommData = function (data) {
        if (!self.isLoggingEnabled) return;
        var limit = Date.now() - 3 * 24 * 60 * 60 * 1000;
        data.result.forEach(function (msg) {
            var guid = msg[0], timestamp = msg[1], plext = msg[2].plext;
            if (timestamp < limit) return;
            var playerName, playerTeam, portalName, portalAddress, portalLat, portalLng, activityType;
            plext.markup.forEach(function (markup) {
                switch (markup[0]) {
                    case 'TEXT': if (!activityType) activityType = self.getActivityType(markup[1].plain); break;
                    case 'PLAYER': playerName = markup[1].plain; playerTeam = markup[1].team; break;
                    case 'PORTAL':
                        portalName = portalName || markup[1].name;
                        portalAddress = portalAddress || markup[1].address;
                        portalLat = portalLat || markup[1].latE6 / 1E6;
                        portalLng = portalLng || markup[1].lngE6 / 1E6;
                        break;
                }
            });
            if (playerName && playerTeam && playerTeam !== 'MACHINA' && activityType && portalName) {
                self.storePlayerActivity(playerName, playerTeam, {
                    activity: activityType,
                    portal: { name: portalName, address: portalAddress, lat: portalLat, lng: portalLng },
                    time: timestamp
                }, guid);
            }
        });
    };

    window.plugin.playerActivityLog.clearAllTrails = function () {
        self.drawnTracesEnl.clearLayers();
        self.drawnTracesRes.clearLayers();
    };

    window.plugin.playerActivityLog.drawPlayerTrails = async function () {
        self.clearAllTrails();
        if (self.playersToTrack.length === 0) return;

        const logData = await self.getAggregatedData();
        var now = Date.now();
        var isTouch = window.isTouchDevice();

        self.playersToTrack.forEach(name => {
            var player = logData[name];
            if (!player || player.activities.length === 0) return;

            var events = [...player.activities].reverse();
            var polyLineByAge = [[], [], [], []];
            var split = self.PLAYER_TRAIL_MAX_TIME / 4;

            for (let i = 1; i < events.length; i++) {
                var p = events[i];
                var ageBucket = Math.min(Math.trunc((now - p.time) / split), 3);
                polyLineByAge[ageBucket].push([[p.portal.lat, p.portal.lng], [events[i - 1].portal.lat, events[i - 1].portal.lng]]);
            }

            polyLineByAge.forEach((line, i) => {
                if (line.length === 0) return;
                L.polyline(line, { weight: 2 - 0.25 * i, color: self.PLAYER_TRAIL_LINE_COLOUR, opacity: 1 - 0.2 * i, dashArray: '5,8', interactive: false })
                    .addTo(player.team.toUpperCase() === 'RESISTANCE' ? self.drawnTracesRes : self.drawnTracesEnl);
            });

            var last = events[events.length - 1];
            var icon = player.team.toUpperCase() === 'RESISTANCE' ? new self.iconRes() : new self.iconEnl();
            var relOpacity = 1 - (now - last.time) / self.PLAYER_TRAIL_MAX_TIME;
            var absOpacity = Math.max(self.PLAYER_TRAIL_MIN_OPACITY, self.PLAYER_TRAIL_MIN_OPACITY + (1 - self.PLAYER_TRAIL_MIN_OPACITY) * relOpacity);

            var marker = new L.Marker([last.portal.lat, last.portal.lng], { icon: icon, opacity: absOpacity, title: isTouch ? '' : name });
            marker.addTo(player.team.toUpperCase() === 'RESISTANCE' ? self.drawnTracesRes : self.drawnTracesEnl);
        });
    };

    if (window.iitcLoaded) self.setup();
    else if (!window.bootPlugins) window.bootPlugins = [self.setup];
    else window.bootPlugins.push(self.setup);
}

var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) info.script = { version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description };
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);