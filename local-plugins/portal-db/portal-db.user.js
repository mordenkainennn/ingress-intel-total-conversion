// ==UserScript==
// @author         cloverjune
// @name           Portal DB
// @category       Database
// @version        0.4.0
// @description    Save portal basic information (GUID, Lat, Lng, Team) to IndexedDB for cross-plugin use.
// @id             portal-db@cloverjune
// @namespace      https://github.com/mordenkainennn/ingress-intel-total-conversion
// @updateURL      https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/portal-db/portal-db.meta.js
// @downloadURL    https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/portal-db/portal-db.user.js
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
    // ensure plugin framework is there, even if iitc is not yet loaded
    if (typeof window.plugin !== 'function') window.plugin = function () { };

    // PLUGIN START --------------------------------------------------------

    // use own namespace for plugin
    window.plugin.portalDB = function () { };
    const self = window.plugin.portalDB;

    self.changelog = [
        {
            version: '0.4.0',
            changes: [
                'NEW: Added support for storing Portal names (titles) in the database.',
                'UPD: API methods (getPortal, getPortalsInBounds) now return the `title` field if available.',
                'UPD: Data collection hooks updated to capture portal titles from both map entities and portal details.',
            ],
        },
        {
            version: '0.3.0',
            changes: [
                'NEW: Portal Move Detection. Automatically tracks if a portal is moved > 3 meters.',
                'NEW: Toolbox notification. Sidebar link turns orange when portal movements are detected.',
                'NEW: Moved Portals dashboard. View movement history and jump to portal locations.',
                'UPD: Intelligent name resolution. Displays portal name if available, otherwise truncated GUID.',
            ],
        },
        {
            version: '0.2.0',
            changes: [
                'NEW: Added Update Statistics system with Hourly Buckets.',
                'NEW: Persistent statistics using localStorage (no DB migration needed).',
                'NEW: Real-time stats dashboard in management UI (refresh every 2s).',
                'UPD: Refactored core update logic to track reasons (New, Changed, Refreshed, Skipped).',
            ],
        },
        {
            version: '0.1.2',
            changes: [
                'UPD: Implemented update threshold to reduce database writes. Data is only updated if changed or older than 24 hours.',
            ],
        },
        {
            version: '0.1.1',
            changes: [
                'UPD: Refactored data collection to capture raw entities via processGameEntities hook for better performance.',
                'UPD: Implemented batch database updates.',
            ],
        },
        {
            version: '0.1.0',
            changes: [
                'NEW: Initial release.',
                'NEW: Persistent storage for portal basic info (GUID, Lat, Lng, Team) using IndexedDB.',
                'NEW: Auto-capture data from map via portalAdded and portalDetailLoaded hooks.',
                'NEW: Management UI for export/import and database reset.',
                'NEW: Public API window.plugin.portalDB for other plugins.',
            ],
        },
    ];

    self.DB_NAME = 'IITC_PortalDB';
    self.DB_VERSION = 1;
    self.STORE_NAME = 'portals';
    self.db = null;

    // --- Configuration ---
    // Time threshold to skip updating 'lastSeen' if no other data changed.
    // Default: 24 hours (24 * 60 * 60 * 1000 ms).
    // Set to 0 to force update every time (not recommended for high density areas).
    self.UPDATE_THRESHOLD = 24 * 60 * 60 * 1000;
    self.MOVE_DISTANCE_THRESHOLD = 3; // 3 meters

    // --- Helpers ---
    self.getDistance = function (lat1E6, lng1E6, lat2E6, lng2E6) {
        const R = 6371e3; // Earth radius in meters
        const dLat = (lat2E6 - lat1E6) / 1e6 * Math.PI / 180;
        const dLng = (lng2E6 - lng1E6) / 1e6 * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1E6 / 1e6 * Math.PI / 180) * Math.cos(lat2E6 / 1e6 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    self.formatGuid = function (guid) {
        if (!guid) return 'Unknown';
        return guid.substring(0, 6) + '...' + guid.substring(guid.length - 4);
    };

    // --- Moves System ---
    self.moves = {
        STORAGE_KEY: 'portal-db-moved-portals',
        list: [], // [{ guid, name, oldLatE6, oldLngE6, newLatE6, newLngE6, time, distance, unread }]

        load: function () {
            try {
                const stored = localStorage.getItem(this.STORAGE_KEY);
                if (stored) this.list = JSON.parse(stored);
            } catch (e) {
                console.error('PortalDB: Failed to load moves', e);
            }
        },

        save: function () {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.list));
            this.updateToolbox();
        },

        record: function (guid, oldLatE6, oldLngE6, newLatE6, newLngE6) {
            const distance = self.getDistance(oldLatE6, oldLngE6, newLatE6, newLngE6);
            if (distance < self.MOVE_DISTANCE_THRESHOLD) return;

            // Try to get name from IITC
            let name = null;
            if (window.portals[guid]) {
                name = window.portals[guid].options.data.title;
            }

            // Check if we already have this move recorded recently (avoid duplicates)
            const existing = this.list.find(m => m.guid === guid && Math.abs(m.time - Date.now()) < 60000);
            if (existing) return;

            this.list.unshift({
                guid: guid,
                name: name || self.formatGuid(guid),
                oldLatE6: oldLatE6,
                oldLngE6: oldLngE6,
                newLatE6: newLatE6,
                newLngE6: newLngE6,
                time: Date.now(),
                distance: Math.round(distance * 10) / 10,
                unread: true
            });

            // Keep only last 50 moves
            if (this.list.length > 50) this.list.pop();
            this.save();
        },

        markAllRead: function () {
            this.list.forEach(m => m.unread = false);
            this.save();
        },

        clear: function () {
            this.list = [];
            this.save();
        },

        updateToolbox: function () {
            const unreadCount = this.list.filter(m => m.unread).length;
            const link = $('#portal-db-toolbox-link');
            if (!link.length) return;

            if (unreadCount > 0) {
                link.text(`⚠️ Portal Moved (${unreadCount})`)
                    .css('color', '#ff4500')
                    .css('font-weight', 'bold');
            } else {
                link.text('Portal DB')
                    .css('color', '')
                    .css('font-weight', '');
            }
        }
    };

    // --- Statistics System ---
    self.UpdateReason = {
        NEW_PORTAL: 'new_portal',
        TEAM_CHANGED: 'team_changed',
        COORD_CHANGED: 'coord_changed',
        BOTH_CHANGED: 'both_changed',
        LASTSEEN_REFRESH: 'lastseen_refresh',
        SKIPPED_FRESH: 'skipped_fresh',
    };

    self.debug = {
        showStats: false,
        refreshInterval: 2000,
    };

    self.stats = {
        STORAGE_KEY: 'portal-db-update-stats',
        buckets: {}, // format: { 'YYYY-MM-DDTHH': { reason: count } }

        getHourKey: function (date) {
            const d = date || new Date();
            const Y = d.getFullYear();
            const M = String(d.getMonth() + 1).padStart(2, '0');
            const D = String(d.getDate()).padStart(2, '0');
            const H = String(d.getHours()).padStart(2, '0');
            return `${Y}-${M}-${D}T${H}`;
        },

        initBucket: function (key) {
            if (!this.buckets[key]) {
                this.buckets[key] = {};
            }
            Object.values(self.UpdateReason).forEach(r => {
                if (this.buckets[key][r] === undefined) this.buckets[key][r] = 0;
            });
        },

        record: function (reason) {
            const key = this.getHourKey();
            this.initBucket(key);
            this.buckets[key][reason]++;
        },

        load: function () {
            try {
                const stored = localStorage.getItem(this.STORAGE_KEY);
                if (stored) {
                    const data = JSON.parse(stored);
                    if (data && data.buckets) {
                        this.buckets = data.buckets;
                        this.housekeeping();
                    }
                }
            } catch (e) {
                console.error('PortalDB: Failed to load stats', e);
            }
        },

        flush: function () {
            this.housekeeping();
            try {
                const data = {
                    version: 1,
                    buckets: this.buckets,
                    lastFlushAt: Date.now()
                };
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
            } catch (e) {
                console.error('PortalDB: Failed to flush stats', e);
            }
        },

        _keyToTime: function (key) {
            const normalized = key.replace('T', ' ') + ':00:00';
            return new Date(normalized).getTime();
        },

        housekeeping: function () {
            const now = Date.now();
            const limit = now - 48 * 60 * 60 * 1000;
            let changed = false;
            Object.keys(this.buckets).forEach(key => {
                if (this._keyToTime(key) < limit) {
                    delete this.buckets[key];
                    changed = true;
                }
            });
            return changed;
        },

        getSummary: function (hours) {
            const results = {};
            Object.values(self.UpdateReason).forEach(r => results[r] = 0);

            const limit = Date.now() - hours * 60 * 60 * 1000;
            Object.keys(this.buckets).forEach(key => {
                if (this._keyToTime(key) >= limit) {
                    const b = this.buckets[key];
                    Object.keys(results).forEach(r => {
                        results[r] += (b[r] || 0);
                    });
                }
            });
            return results;
        }
    };

    // --- Team Helper ---
    self.TEAM_MAP = {
        0: 'N', // Neutral
        1: 'R', // Resistance
        2: 'E', // Enlightened
        3: 'M', // Machina
    };

    self.getTeamChar = function (team) {
        return self.TEAM_MAP[team] || 'N';
    };

    // --- Database Management ---

    self.initDB = function () {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(self.DB_NAME, self.DB_VERSION);

            request.onerror = (event) => {
                console.error('PortalDB: Database error', event.target.error);
                reject(event.target.error);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(self.STORE_NAME)) {
                    const store = db.createObjectStore(self.STORE_NAME, { keyPath: 'guid' });
                    store.createIndex('latE6', 'latE6', { unique: false });
                    store.createIndex('lngE6', 'lngE6', { unique: false });
                    store.createIndex('team', 'team', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                self.db = event.target.result;
                resolve(self.db);
            };
        });
    };

    // --- API Functions ---

    self.getPortal = async function (guid) {
        if (!self.db) await self.initDB();
        return new Promise((resolve, reject) => {
            const transaction = self.db.transaction([self.STORE_NAME], 'readonly');
            const store = transaction.objectStore(self.STORE_NAME);
            const request = store.get(guid);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    };

    self.getPortalsInBounds = async function (bounds) {
        if (!self.db) await self.initDB();
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        const minLat = Math.round(sw.lat * 1e6);
        const maxLat = Math.round(ne.lat * 1e6);
        const minLng = Math.round(sw.lng * 1e6);
        const maxLng = Math.round(ne.lng * 1e6);

        return new Promise((resolve, reject) => {
            const transaction = self.db.transaction([self.STORE_NAME], 'readonly');
            const store = transaction.objectStore(self.STORE_NAME);
            const latIndex = store.index('latE6');
            const range = IDBKeyRange.bound(minLat, maxLat);
            const results = [];

            latIndex.openCursor(range).onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const record = cursor.value;
                    if (record.lngE6 >= minLng && record.lngE6 <= maxLng) {
                        results.push(record);
                    }
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
        });
    };

    self.refreshPortal = async function (guid, data) {
        if (!self.db) await self.initDB();
        return new Promise((resolve, reject) => {
            const transaction = self.db.transaction([self.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(self.STORE_NAME);

            const getRequest = store.get(guid);
            getRequest.onsuccess = () => {
                const existing = getRequest.result;
                const now = Date.now();

                if (!existing) {
                    // New record
                    store.put({
                        guid: guid,
                        latE6: data.latE6,
                        lngE6: data.lngE6,
                        team: data.team,
                        title: data.title || null, // Store title if available
                        lastSeen: now,
                    });
                    self.stats.record(self.UpdateReason.NEW_PORTAL);
                    resolve(true);
                    return;
                }

                const record = existing;
                let coordChanged = false;
                let teamChanged = false;
                let titleChanged = false;

                // Check content changes
                if (data.latE6 !== undefined && record.latE6 !== data.latE6) {
                    record.latE6 = data.latE6;
                    coordChanged = true;
                }
                if (data.lngE6 !== undefined && record.lngE6 !== data.lngE6) {
                    record.lngE6 = data.lngE6;
                    coordChanged = true;
                }
                if (data.team !== undefined && record.team !== data.team) {
                    record.team = data.team;
                    teamChanged = true;
                }
                // Only update title if provided and different. Don't overwrite with null/undefined.
                if (data.title && record.title !== data.title) {
                    record.title = data.title;
                    titleChanged = true;
                }

                const needsUpdate = coordChanged || teamChanged || titleChanged;
                const isExpired = now - record.lastSeen > self.UPDATE_THRESHOLD;

                if (needsUpdate || isExpired) {
                    let reason;
                    if (coordChanged && teamChanged) reason = self.UpdateReason.BOTH_CHANGED;
                    else if (coordChanged) reason = self.UpdateReason.COORD_CHANGED;
                    else if (teamChanged) reason = self.UpdateReason.TEAM_CHANGED;
                    else reason = self.UpdateReason.LASTSEEN_REFRESH;

                    // Record move if coordinate changed
                    if (coordChanged) {
                        self.moves.record(guid, existing.latE6, existing.lngE6, data.latE6, data.lngE6);
                    }

                    record.lastSeen = now;
                    store.put(record);
                    self.stats.record(reason);
                    resolve(true);
                } else {
                    self.stats.record(self.UpdateReason.SKIPPED_FRESH);
                    resolve(false);
                }
            };

            getRequest.onerror = () => reject(getRequest.error);
        });
    };

    self.bulkUpdatePortals = async function (portals) {
        if (!self.db) await self.initDB();
        return new Promise((resolve, reject) => {
            const transaction = self.db.transaction([self.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(self.STORE_NAME);
            const now = Date.now();

            portals.forEach((data) => {
                const getRequest = store.get(data.guid);
                getRequest.onsuccess = () => {
                    const existing = getRequest.result;

                    if (!existing) {
                        // New record
                        store.put({
                            guid: data.guid,
                            latE6: data.latE6,
                            lngE6: data.lngE6,
                            team: data.team,
                            title: data.title || null,
                            lastSeen: now,
                        });
                        self.stats.record(self.UpdateReason.NEW_PORTAL);
                        return;
                    }

                    const record = existing;
                    let coordChanged = false;
                    let teamChanged = false;
                    let titleChanged = false;

                    // Check content changes
                    if (data.latE6 !== undefined && record.latE6 !== data.latE6) {
                        record.latE6 = data.latE6;
                        coordChanged = true;
                    }
                    if (data.lngE6 !== undefined && record.lngE6 !== data.lngE6) {
                        record.lngE6 = data.lngE6;
                        coordChanged = true;
                    }
                    if (data.team !== undefined && record.team !== data.team) {
                        record.team = data.team;
                        teamChanged = true;
                    }
                    // Only update title if provided and different
                    if (data.title && record.title !== data.title) {
                        record.title = data.title;
                        titleChanged = true;
                    }

                    const needsUpdate = coordChanged || teamChanged || titleChanged;
                    const isExpired = now - record.lastSeen > self.UPDATE_THRESHOLD;

                    if (needsUpdate || isExpired) {
                        let reason;
                        if (coordChanged && teamChanged) reason = self.UpdateReason.BOTH_CHANGED;
                        else if (coordChanged) reason = self.UpdateReason.COORD_CHANGED;
                        else if (teamChanged) reason = self.UpdateReason.TEAM_CHANGED;
                        else reason = self.UpdateReason.LASTSEEN_REFRESH;

                        // Record move if coordinate changed
                        if (coordChanged) {
                            self.moves.record(data.guid, existing.latE6, existing.lngE6, data.latE6, data.lngE6);
                        }

                        record.lastSeen = now;
                        store.put(record);
                        self.stats.record(reason);
                    } else {
                        self.stats.record(self.UpdateReason.SKIPPED_FRESH);
                    }
                };
            });

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    };

    self.getStats = async function () {
        if (!self.db) await self.initDB();
        return new Promise((resolve, reject) => {
            const transaction = self.db.transaction([self.STORE_NAME], 'readonly');
            const store = transaction.objectStore(self.STORE_NAME);
            const request = store.count();
            request.onsuccess = () => resolve({ count: request.result });
            request.onerror = () => reject(request.error);
        });
    };

    // --- Hooks ---

    self.processEntities = function (entities) {
        const portalsToUpdate = [];
        for (const i in entities) {
            const ent = entities[i];
            // ent format: [guid, timestamp, dataArr]
            // dataArr for portal: ['p', teamStr, latE6, lngE6, level, health, resCount, image, title, ...]
            if (ent[2][0] === 'p') {
                const guid = ent[0];
                const dataArr = ent[2];
                const teamStr = dataArr[1]; // 'E', 'R', 'N', 'M'
                const latE6 = dataArr[2];
                const lngE6 = dataArr[3];
                const title = dataArr[8]; // Title is usually at index 8

                portalsToUpdate.push({
                    guid: guid,
                    latE6: latE6,
                    lngE6: lngE6,
                    team: teamStr,
                    title: title || null,
                });
            }
        }

        if (portalsToUpdate.length > 0) {
            self.bulkUpdatePortals(portalsToUpdate).catch((err) => {
                console.error('PortalDB: Bulk update failed', err);
            });
        }
    };

    self.onPortalDetailLoaded = function (data) {
        if (data.success && data.details) {
            const guid = data.guid;
            const team = self.getTeamChar(data.details.team === 'R' ? 1 : data.details.team === 'E' ? 2 : data.details.team === 'M' ? 3 : 0);

            self.refreshPortal(guid, {
                latE6: data.details.latE6,
                lngE6: data.details.lngE6,
                team: team,
                title: data.details.title,
            });
        }
    };

    // --- UI Functions ---

    self.updateStatsUI = function () {
        const container = $('#portal-db-stats-container');
        if (!container.length) return;

        const summary1h = self.stats.getSummary(1);
        const summary24h = self.stats.getSummary(24);

        const renderBlock = (title, stats) => {
            const updated = stats[self.UpdateReason.NEW_PORTAL] + stats[self.UpdateReason.TEAM_CHANGED] + stats[self.UpdateReason.COORD_CHANGED] + stats[self.UpdateReason.BOTH_CHANGED];
            return `
        <div style="margin-bottom: 10px;">
          <h4 style="margin: 5px 0; color: #ffce00; font-size: 0.9em;">${title}</h4>
          <ul style="margin: 0; padding-left: 15px; font-size: 0.85em; list-style: none;">
            <li>Core Data Updated: <strong style="color: #00ff00;">${updated}</strong></li>
            <li>Activity Refreshed: <strong style="color: #aaa;">${stats[self.UpdateReason.LASTSEEN_REFRESH]}</strong></li>
            <li>Skipped (Redundant): <strong style="color: #aaa;">${stats[self.UpdateReason.SKIPPED_FRESH]}</strong></li>
          </ul>
        </div>
      `;
        };

        const html = `
      <div style="margin-top: 15px; padding-top: 10px; border-top: 1px dashed #555;">
        <h3 style="margin: 0 0 10px 0; font-size: 1em; color: #0ff;">Update Statistics</h3>
        ${renderBlock('Past 1 Hour', summary1h)}
        ${renderBlock('Past 24 Hours', summary24h)}
      </div>
    `;
        container.html(html);
    };

    self.showDialog = async function () {
        const stats = await self.getStats();

        // Moved Portals Section
        let movesHtml = '<p style="color:#aaa; font-style:italic; font-size:0.9em;">No portal movements detected recently.</p>';
        if (self.moves.list.length > 0) {
            movesHtml = `
        <div style="max-height: 150px; overflow-y: auto; background: #111; padding: 5px; border: 1px solid #333;">
          <table style="width: 100%; font-size: 0.85em; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 1px solid #444; color: #ffce00;">
                <th style="text-align: left;">Portal</th>
                <th style="text-align: right;">Dist.</th>
                <th style="text-align: right;">Time</th>
              </tr>
            </thead>
            <tbody>
              ${self.moves.list.map((m, idx) => `
                <tr style="border-bottom: 1px solid #222; cursor: pointer; ${m.unread ? 'background: #2a1a00;' : ''}" 
                    onclick="window.plugin.portalDB.jumpToMove(${idx})">
                  <td style="padding: 4px 0;" title="${m.guid}">${m.name}</td>
                  <td style="text-align: right; color: #ff6666;">${m.distance}m</td>
                  <td style="text-align: right; color: #888;">${new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div style="margin-top: 5px; text-align: right;">
          <a href="#" onclick="event.preventDefault(); window.plugin.portalDB.moves.markAllRead(); window.plugin.portalDB.showDialog();" style="font-size: 0.8em; color: #0ff;">Mark all read</a> | 
          <a href="#" onclick="event.preventDefault(); if(confirm('Clear all move logs?')) { window.plugin.portalDB.moves.clear(); window.plugin.portalDB.showDialog(); }" style="font-size: 0.8em; color: #ff6666;">Clear</a>
        </div>
      `;
        }

        const html = `
      <div id="portal-db-dialog">
        <p>Total Portals in DB: <strong>${stats.count}</strong></p>
        <div style="margin-top: 15px;">
          <button onclick="window.plugin.portalDB.exportData()">Export JSON</button>
          <button onclick="window.plugin.portalDB.importData()">Import JSON</button>
        </div>

        <div style="margin-top: 15px; padding-top: 10px; border-top: 1px dashed #555;">
          <h3 style="margin: 0 0 10px 0; font-size: 1em; color: #ffce00;">⚠️ Moved Portals</h3>
          ${movesHtml}
        </div>

        <div id="portal-db-stats-container">
          ${self.debug.showStats ? '<p style="font-size:0.8em; color:#666;">Loading statistics...</p>' : ''}
        </div>
        <div style="margin-top: 20px; border-top: 1px solid #444; padding-top: 10px;">
          <button style="color: #ff6666;" onclick="window.plugin.portalDB.resetDB()">RESET DATABASE</button>
        </div>
      </div>
    `;

        const dialog = window.dialog({
            title: 'Portal DB Management',
            html: html,
            id: 'portal-db-mgmt',
            width: 400,
            closeCallback: function () {
                if (self._uiRefreshTimer) {
                    clearInterval(self._uiRefreshTimer);
                    self._uiRefreshTimer = null;
                }
                self.stats.flush();
                self.moves.save();
            }
        });

        if (self.debug.showStats) {
            setTimeout(() => {
                self.updateStatsUI();
                self._uiRefreshTimer = setInterval(self.updateStatsUI, self.debug.refreshInterval);
            }, 100);
        }
    };

    self.jumpToMove = function (index) {
        const move = self.moves.list[index];
        if (!move) return;

        move.unread = false;
        self.moves.save();

        const latlng = [move.newLatE6 / 1e6, move.newLngE6 / 1e6];
        window.map.setView(latlng, 17);

        // Select portal if it's already on map
        if (window.portals[move.guid]) {
            window.renderPortalDetails(move.guid);
        } else {
            // Try to load details to get name if it was truncated GUID
            window.portalDetail.request(move.guid).then(details => {
                if (details && details.title) {
                    move.name = details.title;
                    self.moves.save();
                }
            });
        }
    };

    self.exportData = async function () {
        if (!self.db) await self.initDB();
        const transaction = self.db.transaction([self.STORE_NAME], 'readonly');
        const store = transaction.objectStore(self.STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const data = JSON.stringify(request.result);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `portal-db-export-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        };
    };

    self.importData = function () {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    if (!Array.isArray(data)) throw new Error('Invalid format: expected array');

                    if (!self.db) await self.initDB();
                    const transaction = self.db.transaction([self.STORE_NAME], 'readwrite');
                    const store = transaction.objectStore(self.STORE_NAME);

                    let count = 0;
                    data.forEach((item) => {
                        if (item.guid && item.latE6 && item.lngE6) {
                            store.put(item);
                            count++;
                        }
                    });

                    transaction.oncomplete = () => {
                        alert(`Imported ${count} portals successfully.`);
                        self.showDialog(); // Refresh stats
                    };
                } catch (err) {
                    alert('Error importing data: ' + err.message);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    self.resetDB = function () {
        if (confirm('Are you sure you want to PERMANENTLY delete all stored portal data? This cannot be undone.')) {
            const transaction = self.db.transaction([self.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(self.STORE_NAME);
            const request = store.clear();
            request.onsuccess = () => {
                alert('Database cleared.');
                self.showDialog(); // Refresh stats
            };
        }
    };

    const setup = function () {
        self.stats.load();
        self.moves.load();

        // Periodically save stats to localStorage
        setInterval(() => self.stats.flush(), 5 * 60 * 1000);

        // Save on exit
        window.addEventListener('beforeunload', () => {
            self.stats.flush();
            self.moves.save();
        });

        self.initDB()
            .then(() => {
                // Implement Monkey Patch for entity injection (mapDataEntityInject equivalent)
                const originalProcessGameEntities = window.Render.prototype.processGameEntities;
                window.Render.prototype.processGameEntities = function (entities, details) {
                    self.processEntities(entities);
                    if (originalProcessGameEntities) {
                        originalProcessGameEntities.call(this, entities, details);
                    }
                };

                window.addHook('portalDetailLoaded', self.onPortalDetailLoaded.bind(self));

                // Add to sidebar
                const sidebar = document.getElementById('toolbox');
                if (sidebar) {
                    const link = document.createElement('a');
                    link.id = 'portal-db-toolbox-link';
                    link.textContent = 'Portal DB';
                    link.title = 'Manage local Portal database';
                    link.href = '#';
                    link.onclick = (e) => {
                        e.preventDefault();
                        self.showDialog();
                    };
                    sidebar.appendChild(link);

                    // Initial toolbox update
                    self.moves.updateToolbox();
                }
            })
            .catch((err) => {
                console.error('PortalDB: Failed to initialize', err);
            });
    };

    // PLUGIN END ----------------------------------------------------------

    setup.info = plugin_info; //add the script info data to the function as a property
    if (!window.bootPlugins) window.bootPlugins = [];
    window.bootPlugins.push(setup);
    // if IITC has already booted, immediately run the 'setup' function
    if (window.iitcLoaded && typeof setup === 'function') setup();
} // wrapper end

// inject code into site context
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) info = GM_info.script;
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);
