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
    if (typeof window.plugin !== 'function') window.plugin = function () { };

    window.plugin.playerActivityLog = function () { };
    const self = window.plugin.playerActivityLog;

    self.changelog = [
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

    // DB Constants
    self.DB_NAME = 'IITC_PlayerActivityLog_V2';
    self.DB_VERSION = 1;
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
            console.log('PlayerActivityLog: initDB called');

            const request = indexedDB.open(self.DB_NAME, self.DB_VERSION);

            request.onerror = (event) => {
                console.error('PlayerActivityLog: Database error', event.target.error);
                reject(event.target.error);
            };

            request.onupgradeneeded = (event) => {
                console.log('PlayerActivityLog: Database upgrade needed');
                const db = event.target.result;
                if (!db.objectStoreNames.contains(self.STORE_NAME)) {
                    const store = db.createObjectStore(self.STORE_NAME, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('playerName', 'playerName', { unique: false });
                    store.createIndex('team', 'team', { unique: false });
                    store.createIndex('time', 'time', { unique: false });
                    store.createIndex('guid', 'guid', { unique: false });
                    console.log('PlayerActivityLog: Store created');
                }
            };

            request.onsuccess = (event) => {
                console.log('PlayerActivityLog: Database ready');
                self.db = event.target.result;
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
        for (const p in data) {
            data[p].activities.sort((a, b) => b.time - a.time);
        }
        return data;
    };

    function pad(number) { return (number < 10 ? '0' : '') + number; }

    function formatTimestamp(timestamp) {
        var d = new Date(timestamp);
        return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    self.migrateData = async function () {
        const raw = localStorage.getItem(self.STORAGE_KEY_OLD);
        if (!raw) return;
        console.log('PlayerActivityLog: Migrating data...');
        try {
            const oldData = JSON.parse(raw);
            const db = await self.initDB();
            const tx = db.transaction([self.STORE_NAME], 'readwrite');
            const store = tx.objectStore(self.STORE_NAME);
            for (const name in oldData) {
                if (oldData[name].activities) {
                    oldData[name].activities.forEach(act => {
                        store.put({ playerName: name, team: oldData[name].team, ...act });
                    });
                }
            }
            tx.oncomplete = () => {
                console.log('PlayerActivityLog: Migration complete');
                localStorage.removeItem(self.STORAGE_KEY_OLD);
            };
        } catch (e) { console.error('PlayerActivityLog: Migration failed', e); }
    };

    self.cleanupOldData = async function () {
        const db = await self.initDB();
        const limit = Date.now() - 90 * 24 * 60 * 60 * 1000;
        const tx = db.transaction([self.STORE_NAME], 'readwrite');
        const store = tx.objectStore(self.STORE_NAME);
        const index = store.index('time');
        index.openCursor(IDBKeyRange.upperBound(limit)).onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) { cursor.delete(); cursor.continue(); }
        };
    };

    self.setup = function () {
        console.log('PlayerActivityLog: setup started');
        self.addCss();
        self.addControl();

        self.drawnTracesEnl = new L.LayerGroup();
        self.drawnTracesRes = new L.LayerGroup();
        window.layerChooser.addOverlay(self.drawnTracesEnl, 'Player Activity Trails (ENL)');
        window.layerChooser.addOverlay(self.drawnTracesRes, 'Player Activity Trails (RES)');

        window.addHook('publicChatDataAvailable', (data) => self.handleCommData(data));

        self.initDB().then(() => {
            self.migrateData();
            self.cleanupOldData();
        });
    };

    self.storePlayerActivity = async function (playerName, playerTeam, activity, guid) {
        const db = await self.initDB();
        const tx = db.transaction([self.STORE_NAME], 'readwrite');
        tx.objectStore(self.STORE_NAME).put({
            playerName: playerName,
            team: playerTeam,
            activity: activity.activity,
            portal: activity.portal,
            time: activity.time,
            guid: guid || ''
        });
    };

    self.addControl = function () {
        var link = document.createElement('a');
        link.textContent = 'Activity Log';
        link.onclick = function () { self.displayLog(); return false; };
        var toolbox = document.getElementById('toolbox');
        if (toolbox) toolbox.appendChild(link);
    };

    self.addCss = function () {
        $('<style>').prop('type', 'text/css').html(`
            .activity-log-modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 2000; display: flex; align-items: center; justify-content: center; }
            .activity-log-modal-content { background: #202124; color: #f1f1f1; padding: 20px; border-radius: 8px; width: 80%; max-width: 800px; height: 80vh; display: flex; flex-direction: column; box-shadow: 0 5px 15px rgba(0,0,0,0.5); }
            .activity-log-modal-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 10px; margin-bottom: 10px; }
            .activity-log-modal-header h2 { margin: 0; font-size: 1.2em; flex-grow: 1; }
            .activity-log-header-button { margin-left: 10px; padding: 4px 8px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; }
            .activity-log-modal-close { cursor: pointer; font-size: 1.5em; line-height: 1; font-weight: bold; margin-left: 15px; }
            .activity-log-modal-body { display: flex; flex-grow: 1; min-height: 0; }
            .activity-log-player-list-container { width: 35%; border-right: 1px solid #444; padding-right: 10px; display: flex; flex-direction: column; }
            #player-list-search { width: 100%; padding: 5px; margin-bottom: 10px; background: #000; color: #eee; border: 1px solid #555; }
            .activity-log-player-list { flex-grow: 1; overflow-y: auto; }
            .activity-log-player-item { display: flex; justify-content: space-between; align-items: center; padding: 5px; cursor: pointer; border-radius: 4px; }
            .activity-log-player-item.selected { background-color: #4CAF50; }
            .remove-player-icon { color: #ff8888; font-weight: bold; cursor: pointer; padding: 0 5px; }
            .activity-log-details { width: 65%; padding-left: 10px; overflow-y: auto; }
            .activity-log-entry { margin-bottom: 10px; border-bottom: 1px solid #333; padding-bottom: 5px; }
            .portal-link { font-weight: bold; cursor: pointer; color: #ffce00; }
            .res { color: #0088ff; }
            .enl { color: #00ff00; }
        `).appendTo('head');
    };

    self.displayLog = async function () {
        $('.activity-log-modal-backdrop').remove();
        var modal = `
            <div class="activity-log-modal-backdrop">
                <div class="activity-log-modal-content">
                    <div class="activity-log-modal-header">
                        <h2>Activity Log (V2)</h2>
                        <div>
                            <button class="activity-log-header-button" id="log-draw">Draw Trails</button>
                            <button class="activity-log-header-button" id="log-export">CSV</button>
                            <button class="activity-log-header-button" id="log-clear" style="background:#f44336">Clear All</button>
                            <span class="activity-log-modal-close">&times;</span>
                        </div>
                    </div>
                    <div class="activity-log-modal-body">
                        <div class="activity-log-player-list-container">
                            <input type="text" id="player-list-search" placeholder="Search...">
                            <div class="activity-log-player-list">Loading...</div>
                        </div>
                        <div class="activity-log-details">Select a player.</div>
                    </div>
                </div>
            </div>
        `;
        $(document.body).append(modal);

        const data = await self.getAggregatedData();
        const list = $('.activity-log-player-list').empty();
        Object.keys(data).sort().forEach(name => {
            const p = data[name];
            const item = $(`<div class="activity-log-player-item" data-player="${name}">
                <input type="checkbox" class="trail-chk" ${self.playersToTrack.includes(name)?'checked':''}>
                <span class="${p.team.toLowerCase().startsWith('res')?'res':'enl'}">${name}</span> (${p.activities.length})
                <span class="remove-player-icon">&times;</span>
            </div>`);
            
            item.find('.trail-chk').on('click', (e) => {
                e.stopPropagation();
                if (e.target.checked) {
                    if (self.playersToTrack.length >= 3) { alert('Max 3'); e.target.checked = false; }
                    else self.playersToTrack.push(name);
                } else self.playersToTrack = self.playersToTrack.filter(n => n !== name);
            });
            item.find('.remove-player-icon').on('click', (e) => { e.stopPropagation(); self.removePlayerData(name); });
            item.on('click', () => {
                $('.activity-log-player-item').removeClass('selected');
                item.addClass('selected');
                self.renderPlayerLog(name, data);
            });
            list.append(item);
        });

        $('#log-draw').on('click', () => self.drawPlayerTrails());
        $('#log-export').on('click', () => self.exportToCsv());
        $('#log-clear').on('click', () => self.clearAllData());
        $('.activity-log-modal-close').on('click', () => $('.activity-log-modal-backdrop').remove());
        $('#player-list-search').on('keyup', (e) => {
            const term = e.target.value.toLowerCase();
            $('.activity-log-player-item').each(function() {
                $(this).toggle($(this).data('player').toLowerCase().includes(term));
            });
        });
    };

    self.renderPlayerLog = function (name, data) {
        const container = $('.activity-log-details').empty();
        data[name].activities.forEach(act => {
            const div = $('<div class="activity-log-entry">');
            const link = $('<span class="portal-link">').text(act.portal.name).on('click', () => window.selectPortalByLatLng(act.portal.lat, act.portal.lng));
            div.append(`<div><b>${act.activity.toUpperCase()}</b></div>`).append(link).append(` <small>${formatTimestamp(act.time)}</small>`);
            container.append(div);
        });
    };

    self.removePlayerData = async function (name) {
        if (!confirm(`Delete ${name}?`)) return;
        const db = await self.initDB();
        const tx = db.transaction([self.STORE_NAME], 'readwrite');
        const index = tx.objectStore(self.STORE_NAME).index('playerName');
        index.openCursor(IDBKeyRange.only(name)).onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) { cursor.delete(); cursor.continue(); }
        };
        tx.oncomplete = () => self.displayLog();
    };

    self.exportToCsv = async function () {
        const data = await self.getAggregatedData();
        let csv = "Time,Player,Activity,Portal\n";
        for (const name in data) {
            data[name].activities.forEach(act => {
                csv += `${formatTimestamp(act.time)},${name},${act.activity},"${act.portal.name.replace(/