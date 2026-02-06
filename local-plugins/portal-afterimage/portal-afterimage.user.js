// ==UserScript==
// @author         mordenkainen
// @name           Portal Afterimage
// @category       Layer
// @version        0.1.5
// @description    Draw a subtle afterimage of portals you've seen when official portals are hidden by zoom.
// @id             portal-afterimage@mordenkainen
// @namespace      https://github.com/mordenkainennn/ingress-intel-total-conversion
// @updateURL      https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/portal-afterimage/portal-afterimage.meta.js
// @downloadURL    https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/portal-afterimage/portal-afterimage.user.js
// @match          https://intel.ingress.com/*
// @match          https://intel-x.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
    if (typeof window.plugin !== 'function') window.plugin = function () { };

    window.plugin.portalAfterimage = function () { };
    const self = window.plugin.portalAfterimage;

    self.changelog = [
        {
            version: '0.1.5',
            changes: [
                'REF: Removed local name storage. Now fully relies on Portal DB for portal names.',
                'UPD: Name scavenging now updates Portal DB directly instead of local storage.',
            ],
        },
        {
            version: '0.1.4',
            changes: [
                'UPD: Improved performance of portal rendering.',
                'UPD: Added support for portal name scavenging.',
            ],
        },
        {
            version: '0.1.3',
            changes: [
                'NEW: Toolbox button warns when Portal DB is missing and auto-updates once the dependency loads.',
                'NEW: Maintenance dialog adds an explicit dependency note if Portal DB is not enabled.',
                'FIX: Robust dependency detection for Portal DB with retry mechanism.',
            ],
        },
        {
            version: '0.1.2',
            changes: [
                'NEW: Rendering settings for S2 level and per-cell count in the maintenance UI.',
                'NEW: About dialog explaining selection rules and settings.',
                'UPD: Maintenance filter defaults to an integer day value on open.',
                'UPD: Added console helper to refresh maintenance list with fractional days.',
            ],
        },
        {
            version: '0.1.1',
            changes: [
                'UPD: Use Portal DB API for portal coordinates and last-seen timestamps.',
                'UPD: Afterimage database now stores only GUID and portal name.',
                'UPD: Maintenance list now resolves coordinates and last-seen via Portal DB.',
            ],
        },
        {
            version: '0.1.0',
            changes: ['NEW: Initial release.'],
        },
    ];

    self.DB_NAME = 'portal-afterimage';
    self.DB_VERSION = 1;
    self.STORE_NAME = 'portals';

    self.S2_LEVEL = 15;
    self.S2_LEVEL_MIN = 15;
    self.S2_LEVEL_MAX = 18;
    self.PER_CELL_MIN = 1;
    self.PER_CELL_MAX = 3;
    self.MAX_DRAWN_ELEMENTS = 5000;
    self.REPRESENTATIVE_STRATEGY = 'recent';

    self.db = null;
    self.dbPromise = null;
    self.layerGroup = null;
    self.pending = {};
    self.flushTimer = null;
    self.renderTimer = null;
    self.rendering = false;
    self.DEFAULT_MIN_DAYS = 180;
    self.ui = {
        minDays: 180,
        list: [],
    };
    self.guidCache = new Set();
    self.guidCacheLoaded = false;
    self.settings = {
        s2Level: self.S2_LEVEL,
        perCell: 1,
    };
    self.toolboxButtonId = 'portal-afterimage-btn';
    self.portalDBAvailable = false;

    self.formatGuid = function (guid) {
        if (!guid) return 'Unknown';
        if (guid.length <= 10) return guid;
        return guid.substring(0, 6) + '...' + guid.substring(guid.length - 4);
    };

    self.escapeHtml = function (text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    self.formatTime = function (t) {
        if (!t) return '-';
        const d = new Date(t);
        if (isNaN(d.getTime())) return '-';
        const pad = (n) => (n < 10 ? '0' + n : n);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    self.clampInt = function (value, min, max, fallback) {
        const v = parseInt(value, 10);
        if (isNaN(v)) return fallback;
        return Math.min(max, Math.max(min, v));
    };

    self.loadSettings = function () {
        let stored = null;
        try {
            stored = JSON.parse(localStorage.getItem('portal-afterimage-settings') || 'null');
        } catch (e) {
            stored = null;
        }

        const base = stored || {};
        self.settings.s2Level = self.clampInt(base.s2Level, self.S2_LEVEL_MIN, self.S2_LEVEL_MAX, self.S2_LEVEL);
        self.settings.perCell = self.clampInt(base.perCell, self.PER_CELL_MIN, self.PER_CELL_MAX, 1);
    };

    self.saveSettings = function () {
        localStorage.setItem('portal-afterimage-settings', JSON.stringify(self.settings));
    };

    self.applySettingsFromUI = function () {
        const levelInput = $('#portal-afterimage-s2level');
        const perCellInput = $('#portal-afterimage-percell');

        const nextLevel = self.clampInt(levelInput.val(), self.S2_LEVEL_MIN, self.S2_LEVEL_MAX, self.settings.s2Level);
        const nextPerCell = self.clampInt(perCellInput.val(), self.PER_CELL_MIN, self.PER_CELL_MAX, self.settings.perCell);

        const changed = nextLevel !== self.settings.s2Level || nextPerCell !== self.settings.perCell;
        self.settings.s2Level = nextLevel;
        self.settings.perCell = nextPerCell;
        self.saveSettings();

        levelInput.val(self.settings.s2Level);
        perCellInput.val(self.settings.perCell);

        if (changed) self.scheduleRender();
    };

    self.initDB = function () {
        if (self.db) return Promise.resolve(self.db);
        if (self.dbPromise) return self.dbPromise;

        self.dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(self.DB_NAME, self.DB_VERSION);

            request.onerror = (event) => {
                console.error('Portal Afterimage: DB open failed', event.target.error);
                reject(event.target.error);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(self.STORE_NAME)) {
                    db.createObjectStore(self.STORE_NAME, { keyPath: 'guid' });
                }
            };

            request.onsuccess = (event) => {
                self.db = event.target.result;
                resolve(self.db);
            };
        });

        return self.dbPromise;
    };

    self.getMiniS2 = function () {
        if (self._miniS2) return self._miniS2;

        const LatLngToXYZ = function (lat, lng) {
            const d2r = Math.PI / 180;
            const phi = lat * d2r;
            const theta = lng * d2r;
            const cosphi = Math.cos(phi);
            return [Math.cos(theta) * cosphi, Math.sin(theta) * cosphi, Math.sin(phi)];
        };

        const largestAbsComponent = function (xyz) {
            const temp = [Math.abs(xyz[0]), Math.abs(xyz[1]), Math.abs(xyz[2])];
            if (temp[0] > temp[1]) {
                return temp[0] > temp[2] ? 0 : 2;
            }
            return temp[1] > temp[2] ? 1 : 2;
        };

        const faceXYZToUV = function (face, xyz) {
            switch (face) {
                case 0: return [xyz[1] / xyz[0], xyz[2] / xyz[0]];
                case 1: return [-xyz[0] / xyz[1], xyz[2] / xyz[1]];
                case 2: return [-xyz[0] / xyz[2], -xyz[1] / xyz[2]];
                case 3: return [xyz[2] / xyz[0], xyz[1] / xyz[0]];
                case 4: return [xyz[2] / xyz[1], -xyz[0] / xyz[1]];
                case 5: return [-xyz[1] / xyz[2], -xyz[0] / xyz[2]];
                default: return [0, 0];
            }
        };

        const XYZToFaceUV = function (xyz) {
            let face = largestAbsComponent(xyz);
            if (xyz[face] < 0) face += 3;
            const uv = faceXYZToUV(face, xyz);
            return [face, uv];
        };

        const UVToST = function (uv) {
            const single = (v) => {
                if (v >= 0) {
                    return 0.5 * Math.sqrt(1 + 3 * v);
                }
                return 1 - 0.5 * Math.sqrt(1 - 3 * v);
            };
            return [single(uv[0]), single(uv[1])];
        };

        const STToIJ = function (st, order) {
            const maxSize = 1 << order;
            const toIJ = (v) => {
                const ij = Math.floor(v * maxSize);
                return Math.max(0, Math.min(maxSize - 1, ij));
            };
            return [toIJ(st[0]), toIJ(st[1])];
        };

        self._miniS2 = {
            cellId: function (lat, lng, level) {
                const xyz = LatLngToXYZ(lat, lng);
                const faceuv = XYZToFaceUV(xyz);
                const st = UVToST(faceuv[1]);
                const ij = STToIJ(st, level);
                return 'F' + faceuv[0] + 'ij[' + ij[0] + ',' + ij[1] + ']@' + level;
            },
        };

        return self._miniS2;
    };

    self.getS2CellId = function (lat, lng) {
        if (window.S2 && window.S2.S2Cell) {
            return window.S2.S2Cell.FromLatLng(L.latLng(lat, lng), self.settings.s2Level).toString();
        }
        const mini = self.getMiniS2();
        return mini.cellId(lat, lng, self.settings.s2Level);
    };

    self.queuePortalUpdate = function (guid) {
        if (!guid) return;
        self.pending[guid] = true;

        if (!self.flushTimer) {
            self.flushTimer = setTimeout(self.flushPending, 500);
        }
    };

    self.flushPending = function () {
        const guids = Object.keys(self.pending);
        self.pending = {};
        self.flushTimer = null;

        if (!guids.length) return;

        self.upsertBatch(guids)
            .then(() => self.scheduleRender())
            .catch((err) => console.error('Portal Afterimage: batch update failed', err));
    };

    self.upsertBatch = function (guids) {
        if (!guids || !guids.length) return Promise.resolve();

        return self.initDB().then(
            () =>
                new Promise((resolve, reject) => {
                    const tx = self.db.transaction([self.STORE_NAME], 'readwrite');
                    const store = tx.objectStore(self.STORE_NAME);

                    guids.forEach((guid) => {
                        if (self.guidCache) self.guidCache.add(guid);
                        store.put({ guid: guid });
                    });

                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                })
        );
    };

    self.processEntities = function (entities) {
        if (!entities) return;
        for (const i in entities) {
            const ent = entities[i];
            if (!ent || !ent[2] || ent[2][0] !== 'p') continue;
            const guid = ent[0];
            self.queuePortalUpdate(guid);
        }
    };

    self.onPortalDetailLoaded = function (data) {
        if (!data || !data.success || !data.details) return;
        self.queuePortalUpdate(data.guid);
    };

    self.getPortalDB = function () {
        if (!window.plugin || !window.plugin.portalDB) return null;
        const api = window.plugin.portalDB;
        if (typeof api.getPortalsInBounds !== 'function' || typeof api.getPortal !== 'function') return null;
        return api;
    };

    self.warnPortalDB = function () {
        if (self._warnedPortalDB) return;
        self._warnedPortalDB = true;
        console.warn('Portal Afterimage: Portal DB not available. Afterimage rendering is disabled.');
        self.updateToolboxStatus();
    };

    self.updateToolboxStatus = function () {
        const missing = !self.getPortalDB();
        const wasAvailable = self.portalDBAvailable;
        const label = missing ? '⚠ Afterimage (Portal DB)' : 'Afterimage';
        const title = missing ? 'Portal DB required for Portal Afterimage' : 'Portal Afterimage maintenance';

        const link = document.getElementById(self.toolboxButtonId) || document.getElementById('portal-afterimage-toolbox');
        if (link) {
            link.textContent = label;
            link.title = title;
            link.style.color = missing ? '#ff4500' : '';
            link.style.fontWeight = missing ? 'bold' : '';
        }

        self.portalDBAvailable = !missing;
        if (!missing && !wasAvailable) self.scheduleRender();
    };

    self.arePortalsVisible = function () {
        if (window.getMapZoomTileParameters) {
            const params = window.getMapZoomTileParameters(window.map.getZoom());
            return params && params.hasPortals;
        }
        return window.map.getZoom() >= 15;
    };

    self.shouldRender = function () {
        if (!self.layerGroup || !window.map) return false;
        if (!window.map.hasLayer(self.layerGroup)) return false;
        if (self.arePortalsVisible()) return false;
        return true;
    };

    self.scheduleRender = function () {
        if (self.renderTimer) return;
        self.renderTimer = setTimeout(() => {
            self.renderTimer = null;
            self.render();
        }, 200);
    };

    self.clearLayer = function () {
        if (self.layerGroup) self.layerGroup.clearLayers();
    };

    self.getPortalsInBounds = function (bounds) {
        if (!bounds) return Promise.resolve([]);
        const portalDB = self.getPortalDB();
        if (!portalDB) {
            self.warnPortalDB();
            return Promise.resolve([]);
        }

        return portalDB.getPortalsInBounds(bounds).then((records) =>
            (records || []).map((rec) => ({
                guid: rec.guid,
                lat: typeof rec.latE6 === 'number' ? rec.latE6 / 1e6 : null,
                lng: typeof rec.lngE6 === 'number' ? rec.lngE6 / 1e6 : null,
                lastSeen: rec.lastSeen || 0,
            }))
        );
    };

    self.selectRepresentatives = function (records) {
        const map = new Map();
        const perCell = self.settings.perCell || 1;

        records.forEach((rec) => {
            if (!rec || typeof rec.lat !== 'number' || typeof rec.lng !== 'number') return;
            const cellId = self.getS2CellId(rec.lat, rec.lng);
            const list = map.get(cellId) || [];
            list.push(rec);
            map.set(cellId, list);
        });

        const results = [];
        map.forEach((list) => {
            list.sort((a, b) => {
                const aSeen = a.lastSeen || 0;
                const bSeen = b.lastSeen || 0;
                if (self.REPRESENTATIVE_STRATEGY === 'oldest') return aSeen - bSeen;
                return bSeen - aSeen;
            });

            for (let i = 0; i < list.length && i < perCell; i += 1) {
                results.push(list[i]);
            }
        });

        return results;
    };

    self.getMarkerStyle = function () {
        return {
            radius: 3,
            weight: 1,
            color: '#9aa3b2',
            opacity: 0.45,
            fillColor: '#9aa3b2',
            fillOpacity: 0.2,
            interactive: false,
        };
    };

    self.render = function () {
        if (self.rendering) return;

        if (!self.shouldRender()) {
            self.clearLayer();
            return;
        }

        if (!self.guidCacheLoaded) {
            self.loadGuidCache()
                .then(() => self.scheduleRender())
                .catch((err) => console.error('Portal Afterimage: failed to load guid cache', err));
            return;
        }

        self.rendering = true;

        const bounds = window.map.getBounds();
        self.getPortalsInBounds(bounds)
            .then((records) => {
                if (!self.shouldRender()) {
                    self.clearLayer();
                    return;
                }

                const filtered = records.filter((rec) => self.guidCache.has(rec.guid));
                const reps = self.selectRepresentatives(filtered);
                self.layerGroup.clearLayers();

                let count = 0;
                reps.forEach((rec) => {
                    if (count >= self.MAX_DRAWN_ELEMENTS) return;
                    if (typeof rec.lat !== 'number' || typeof rec.lng !== 'number') return;
                    const marker = L.circleMarker([rec.lat, rec.lng], self.getMarkerStyle());
                    self.layerGroup.addLayer(marker);
                    count += 1;
                });
            })
            .catch((err) => console.error('Portal Afterimage: render failed', err))
            .finally(() => {
                self.rendering = false;
            });
    };

    self.loadMaintenanceList = function (minDays, limit) {
        const days = typeof minDays === 'number' ? minDays : self.ui.minDays;
        const maxItems = limit || 300;
        const cutoff = days > 0 ? Date.now() - days * 24 * 60 * 60 * 1000 : null;

        return self.getAfterimageRecords()
            .then((records) => {
                if (!records.length) return [];
                const guids = records.map((rec) => rec.guid);
                return self.fetchPortalDBRecords(guids).then((portalMap) => {
                    const enriched = records.map((rec) => {
                        const portal = portalMap[rec.guid];
                        const lastSeen = portal && typeof portal.lastSeen === 'number' ? portal.lastSeen : 0;
                        const lat = portal && typeof portal.latE6 === 'number' ? portal.latE6 / 1e6 : null;
                        const lng = portal && typeof portal.lngE6 === 'number' ? portal.lngE6 / 1e6 : null;

                        let name = portal ? portal.title : null;

                        // Name Scavenging: If name is missing in Portal DB, try to get it from current IITC memory
                        if (!name && window.portals[rec.guid] && window.portals[rec.guid].options.data.title) {
                            name = window.portals[rec.guid].options.data.title;
                            // Backfill Portal DB directly
                            if (window.plugin.portalDB.refreshPortal) {
                                window.plugin.portalDB.refreshPortal(rec.guid, { title: name });
                            }
                        }

                        return {
                            guid: rec.guid,
                            name: name || '',
                            lastSeen: lastSeen,
                            lat: lat,
                            lng: lng,
                        };
                    });

                    const filtered = cutoff
                        ? enriched.filter((rec) => rec.lastSeen === 0 || rec.lastSeen <= cutoff)
                        : enriched;

                    filtered.sort((a, b) => (a.lastSeen || 0) - (b.lastSeen || 0));
                    return filtered.slice(0, maxItems);
                });
            });
    };

    self.renderMaintenanceList = function (records) {
        self.ui.list = records || [];

        const rows = self.ui.list
            .map((rec) => {
                const name = self.escapeHtml(rec.name || self.formatGuid(rec.guid));
                const lastSeen = self.formatTime(rec.lastSeen);
                const ageDays = rec.lastSeen ? Math.floor((Date.now() - rec.lastSeen) / 86400000) : '-';
                const hasCoords = typeof rec.lat === 'number' && typeof rec.lng === 'number';
                const portalCell = hasCoords
                    ? `<a onclick="window.plugin.portalAfterimage.jumpToPortal('${rec.guid}', ${rec.lat}, ${rec.lng})">${name}</a>`
                    : `<span>${name}</span>`;

                return `
          <tr>
            <td><input type="checkbox" data-guid="${rec.guid}"></td>
            <td>${portalCell}</td>
            <td>${lastSeen}</td>
            <td style="text-align:right;">${ageDays}</td>
          </tr>
        `;
            })
            .join('');

        const html = `
      <div style="margin-bottom:6px; color:#888; font-size:0.85em;">
        Showing ${self.ui.list.length} portals (oldest first).
      </div>
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="text-align:left; border-bottom:1px solid #444;">
            <th style="width:24px;"></th>
            <th>Portal</th>
            <th>Last Seen</th>
            <th style="text-align:right;">Age (d)</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="4" style="color:#888;">No portals match this filter.</td></tr>'}
        </tbody>
      </table>
    `;

        $('#portal-afterimage-list').html(html);
    };

    self.refreshMaintenance = function () {
        if (!self.getPortalDB()) {
            self.warnPortalDB();
            $('#portal-afterimage-list').html('<div style="color:#f66;">Portal DB is required for maintenance data.</div>');
            return;
        }

        const input = $('#portal-afterimage-days');
        const value = input.length ? parseInt(input.val(), 10) : self.ui.minDays;
        self.ui.minDays = isNaN(value) ? self.DEFAULT_MIN_DAYS : Math.max(0, value);
        if (input.length) input.val(self.ui.minDays);

        self.loadMaintenanceList(self.ui.minDays)
            .then((records) => self.renderMaintenanceList(records))
            .catch((err) => {
                console.error('Portal Afterimage: failed to load maintenance list', err);
                $('#portal-afterimage-list').html('<div style="color:#f66;">Failed to load data.</div>');
            });
    };

    self.refreshMaintenanceWithDays = function (days) {
        if (!self.getPortalDB()) {
            self.warnPortalDB();
            return;
        }

        const value = parseFloat(days);
        if (isNaN(value)) return;
        const safeDays = Math.max(0, value);

        self.loadMaintenanceList(safeDays)
            .then((records) => self.renderMaintenanceList(records))
            .catch((err) => {
                console.error('Portal Afterimage: failed to load maintenance list', err);
                $('#portal-afterimage-list').html('<div style="color:#f66;">Failed to load data.</div>');
            });
    };

    self.showAboutDialog = function () {
        const selectionRule = self.REPRESENTATIVE_STRATEGY === 'oldest' ? 'oldest last-seen first' : 'most recent last-seen first';
        const html = `
      <div style="line-height:1.4;">
        <p><strong>Portal Afterimage</strong> draws a subtle memory layer of portals you have previously seen when official portal markers are hidden by zoom.</p>
        <p><strong>S2 Level:</strong> Portals are grouped by S2 cells at the selected level. Higher levels show more detail.</p>
        <p><strong>Per Cell:</strong> For each S2 cell, you can display <strong>${self.PER_CELL_MIN}–${self.PER_CELL_MAX}</strong> portals. Current: <strong>${self.settings.perCell}</strong>.</p>
        <p><strong>Selection:</strong> Portals are chosen by last-seen time from Portal DB (${selectionRule}).</p>
        <p><strong>Tip:</strong> For fractional days, use the console: <code>window.plugin.portalAfterimage.refreshMaintenanceWithDays(0.1)</code></p>
      </div>
    `;

        window.dialog({
            title: 'About Portal Afterimage',
            html: html,
            id: 'portal-afterimage-about',
            width: 420,
        });
    };

    self.toggleSelectAll = function (checked) {
        $('#portal-afterimage-list input[type=checkbox]').prop('checked', checked);
    };

    self.deletePortals = function (guids) {
        if (!guids || !guids.length) return Promise.resolve();

        if (self.guidCache) {
            guids.forEach((guid) => self.guidCache.delete(guid));
        }

        return self.initDB().then(
            () =>
                new Promise((resolve, reject) => {
                    const tx = self.db.transaction([self.STORE_NAME], 'readwrite');
                    const store = tx.objectStore(self.STORE_NAME);

                    guids.forEach((guid) => {
                        store.delete(guid);
                    });

                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                })
        );
    };

    self.deleteSelected = function () {
        const guids = [];
        $('#portal-afterimage-list input[type=checkbox]:checked').each(function () {
            guids.push(this.getAttribute('data-guid'));
        });

        if (!guids.length) {
            alert('No portals selected.');
            return;
        }

        if (!confirm(`Delete ${guids.length} portals from local storage?`)) return;

        self.deletePortals(guids)
            .then(() => self.refreshMaintenance())
            .catch((err) => {
                console.error('Portal Afterimage: delete failed', err);
                alert('Delete failed. See console for details.');
            });
    };

    self.jumpToPortal = function (guid, lat, lng) {
        const hasCoords = typeof lat === 'number' && typeof lng === 'number';
        if (hasCoords) {
            if (window.zoomToAndShowPortal) {
                window.zoomToAndShowPortal(guid, [lat, lng]);
            } else {
                window.map.setView([lat, lng], 16);
            }
            return;
        }

        const portalDB = self.getPortalDB();
        if (!portalDB) {
            self.warnPortalDB();
            return;
        }

        portalDB.getPortal(guid).then((record) => {
            if (!record || typeof record.latE6 !== 'number' || typeof record.lngE6 !== 'number') return;
            const target = [record.latE6 / 1e6, record.lngE6 / 1e6];
            if (window.zoomToAndShowPortal) {
                window.zoomToAndShowPortal(guid, target);
            } else {
                window.map.setView(target, 16);
            }
        });
    };

    self.getAfterimageRecords = function () {
        return self.initDB().then(
            () =>
                new Promise((resolve, reject) => {
                    const tx = self.db.transaction([self.STORE_NAME], 'readonly');
                    const store = tx.objectStore(self.STORE_NAME);
                    const results = [];

                    store.openCursor().onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            results.push(cursor.value);
                            cursor.continue();
                        } else {
                            resolve(results);
                        }
                    };

                    tx.onerror = () => reject(tx.error);
                })
        );
    };

    self.loadGuidCache = function () {
        return self.getAfterimageRecords().then((records) => {
            self.guidCache = new Set();
            records.forEach((rec) => {
                if (rec && rec.guid) self.guidCache.add(rec.guid);
            });
            self.guidCacheLoaded = true;
        });
    };

    self.fetchPortalDBRecords = function (guids) {
        const portalDB = self.getPortalDB();
        if (!portalDB) {
            self.warnPortalDB();
            return Promise.resolve({});
        }

        const results = {};
        const batchSize = 50;
        let index = 0;

        const next = function () {
            if (index >= guids.length) return Promise.resolve(results);
            const slice = guids.slice(index, index + batchSize);
            index += batchSize;

            return Promise.all(slice.map((guid) => portalDB.getPortal(guid).catch(() => null))).then((records) => {
                records.forEach((record, idx) => {
                    if (record) results[slice[idx]] = record;
                });
                return next();
            });
        };

        return next();
    };

    self.showMaintenanceDialog = function () {
        self.ui.minDays = self.DEFAULT_MIN_DAYS;
        const missingPortalDB = !self.getPortalDB();
        const dependencyNote = missingPortalDB
            ? '<div style="margin-bottom:10px; padding:8px; border:1px solid #ff4500; color:#ffb366;">Portal Afterimage requires the <strong>Portal DB</strong> plugin. Install and enable it to use this feature.</div>'
            : '';
        const html = `
      <div id="portal-afterimage-maint">
        ${dependencyNote}
        <div style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px dashed #444;">
          <label for="portal-afterimage-s2level">S2 Level</label>
          <input id="portal-afterimage-s2level" type="number" min="${self.S2_LEVEL_MIN}" max="${self.S2_LEVEL_MAX}" value="${self.settings.s2Level}" style="width:70px; margin:0 6px;">
          <label for="portal-afterimage-percell">Per Cell</label>
          <input id="portal-afterimage-percell" type="number" min="${self.PER_CELL_MIN}" max="${self.PER_CELL_MAX}" value="${self.settings.perCell}" style="width:70px; margin:0 6px;">
          <button onclick="window.plugin.portalAfterimage.applySettingsFromUI()">Apply</button>
        </div>
        <div style="margin-bottom:8px;">
          <label for="portal-afterimage-days">Show portals not seen for</label>
          <input id="portal-afterimage-days" type="number" min="0" step="1" value="${self.ui.minDays}" style="width:70px; margin:0 6px;">
          <span>days</span>
          <button onclick="window.plugin.portalAfterimage.refreshMaintenance()">Refresh</button>
        </div>
        <div style="margin-bottom:8px;">
          <button onclick="window.plugin.portalAfterimage.toggleSelectAll(true)">Select All</button>
          <button onclick="window.plugin.portalAfterimage.toggleSelectAll(false)">Clear Selection</button>
          <button style="color:#ff6666;" onclick="window.plugin.portalAfterimage.deleteSelected()">Delete Selected</button>
        </div>
        <div id="portal-afterimage-list">Loading...</div>
      </div>
    `;

        window.dialog({
            title: 'Portal Afterimage Maintenance',
            html: html,
            id: 'portal-afterimage-maint',
            width: 540,
            buttons: {
                About: function () {
                    window.plugin.portalAfterimage.showAboutDialog();
                },
                OK: function () {
                    $(this).dialog('close');
                },
            },
        });

        self.refreshMaintenance();
    };

    self.onOverlayChange = function (e) {
        if (e.layer === self.layerGroup) self.scheduleRender();
    };

    const setup = function () {
        self.loadSettings();
        self.ui.minDays = self.DEFAULT_MIN_DAYS;

        self.layerGroup = L.layerGroup();
        window.addLayerGroup('Portal Afterimage', self.layerGroup, false);

        window.map.on('zoomend moveend', self.scheduleRender);
        window.map.on('overlayadd', self.onOverlayChange);
        window.map.on('overlayremove', self.onOverlayChange);
        window.addHook('mapDataRefreshEnd', self.scheduleRender);
        window.addHook('portalDetailLoaded', self.onPortalDetailLoaded);

        if (window.Render && window.Render.prototype && window.Render.prototype.processGameEntities) {
            const originalProcessGameEntities = window.Render.prototype.processGameEntities;
            window.Render.prototype.processGameEntities = function (entities, details) {
                self.processEntities(entities);
                return originalProcessGameEntities.call(this, entities, details);
            };
        } else {
            console.warn('Portal Afterimage: Render.processGameEntities not available.');
        }

        if (window.IITC && IITC.toolbox && IITC.toolbox.addButton) {
            IITC.toolbox.addButton({
                id: self.toolboxButtonId,
                label: 'Afterimage',
                title: 'Portal Afterimage maintenance',
                action: self.showMaintenanceDialog,
            });
        } else {
            const toolbox = document.getElementById('toolbox');
            if (toolbox && !document.getElementById('portal-afterimage-toolbox')) {
                const link = document.createElement('a');
                link.id = 'portal-afterimage-toolbox';
                link.textContent = 'Afterimage';
                link.title = 'Portal Afterimage maintenance';
                link.href = '#';
                link.onclick = (e) => {
                    e.preventDefault();
                    self.showMaintenanceDialog();
                };
                toolbox.appendChild(link);
            }
        }

        self.updateToolboxStatus();
        if (!self.portalDBAvailable) {
            let tries = 0;
            const t = setInterval(() => {
                tries += 1;
                self.updateToolboxStatus();
                if (self.portalDBAvailable || tries > 20) clearInterval(t);
            }, 500);
        }

        self.initDB().catch((err) => console.error('Portal Afterimage: DB init failed', err));
        self.scheduleRender();
        console.log('Portal Afterimage: loaded');
    };

    setup.info = plugin_info;
    if (!window.bootPlugins) window.bootPlugins = [];
    window.bootPlugins.push(setup);
    if (window.iitcLoaded && typeof setup === 'function') setup();
}

const script = document.createElement('script');
const info = typeof GM_info !== 'undefined' && GM_info && GM_info.script ? GM_info.script : {};
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);