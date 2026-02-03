// ==UserScript==
// @author         mordenkainen
// @name           Portal Afterimage
// @category       Layer
// @version        0.1.0
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
  if (typeof window.plugin !== 'function') window.plugin = function () {};

  window.plugin.portalAfterimage = function () {};
  const self = window.plugin.portalAfterimage;

  self.changelog = [
    {
      version: '0.1.0',
      changes: ['NEW: Initial release.'],
    },
  ];

  self.DB_NAME = 'portal-afterimage';
  self.DB_VERSION = 1;
  self.STORE_NAME = 'portals';

  self.S2_LEVEL = 15;
  self.MAX_DRAWN_ELEMENTS = 5000;
  self.REPRESENTATIVE_STRATEGY = 'recent';

  self.db = null;
  self.dbPromise = null;
  self.layerGroup = null;
  self.pending = {};
  self.flushTimer = null;
  self.renderTimer = null;
  self.rendering = false;
  self.ui = {
    minDays: 180,
    list: [],
  };

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
          const store = db.createObjectStore(self.STORE_NAME, { keyPath: 'guid' });
          store.createIndex('lat', 'lat', { unique: false });
          store.createIndex('lng', 'lng', { unique: false });
          store.createIndex('lastSeen', 'lastSeen', { unique: false });
          store.createIndex('s2cell', 's2cell', { unique: false });
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
      return window.S2.S2Cell.FromLatLng(L.latLng(lat, lng), self.S2_LEVEL).toString();
    }
    const mini = self.getMiniS2();
    return mini.cellId(lat, lng, self.S2_LEVEL);
  };

  self.queuePortalUpdate = function (update) {
    if (!update || !update.guid) return;
    const guid = update.guid;
    const now = Date.now();

    const pending = self.pending[guid] || { guid: guid };
    if (typeof update.lat === 'number') pending.lat = update.lat;
    if (typeof update.lng === 'number') pending.lng = update.lng;
    if (update.name) pending.name = update.name;
    pending.lastSeen = update.lastSeen || now;

    self.pending[guid] = pending;

    if (!self.flushTimer) {
      self.flushTimer = setTimeout(self.flushPending, 500);
    }
  };

  self.flushPending = function () {
    const batch = Object.values(self.pending);
    self.pending = {};
    self.flushTimer = null;

    if (!batch.length) return;

    self.upsertBatch(batch)
      .then(() => self.scheduleRender())
      .catch((err) => console.error('Portal Afterimage: batch update failed', err));
  };

  self.upsertBatch = function (updates) {
    if (!updates || !updates.length) return Promise.resolve();

    return self.initDB().then(
      () =>
        new Promise((resolve, reject) => {
          const tx = self.db.transaction([self.STORE_NAME], 'readwrite');
          const store = tx.objectStore(self.STORE_NAME);

          updates.forEach((update) => {
            const getReq = store.get(update.guid);

            getReq.onsuccess = () => {
              const existing = getReq.result || {};
              const lat = typeof update.lat === 'number' ? update.lat : existing.lat;
              const lng = typeof update.lng === 'number' ? update.lng : existing.lng;

              if (typeof lat !== 'number' || typeof lng !== 'number') return;

              const record = {
                guid: update.guid,
                lat: lat,
                lng: lng,
                name: update.name || existing.name || '',
                lastSeen: Math.max(existing.lastSeen || 0, update.lastSeen || Date.now()),
                s2cell: self.getS2CellId(lat, lng),
              };

              store.put(record);
            };

            getReq.onerror = () => {
              console.error('Portal Afterimage: read failed', getReq.error);
            };
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
      const data = ent[2];
      const lat = data[2] / 1e6;
      const lng = data[3] / 1e6;
      let name = null;
      if (window.portals && window.portals[guid] && window.portals[guid].options.data.title) {
        name = window.portals[guid].options.data.title;
      }

      self.queuePortalUpdate({
        guid: guid,
        lat: lat,
        lng: lng,
        name: name,
        lastSeen: Date.now(),
      });
    }
  };

  self.onPortalDetailLoaded = function (data) {
    if (!data || !data.success || !data.details) return;
    const guid = data.guid;
    const lat = data.details.latE6 / 1e6;
    const lng = data.details.lngE6 / 1e6;
    const name = data.details.title;
    self.queuePortalUpdate({
      guid: guid,
      lat: lat,
      lng: lng,
      name: name,
      lastSeen: Date.now(),
    });
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

    return self.initDB().then(
      () =>
        new Promise((resolve, reject) => {
          const sw = bounds.getSouthWest();
          const ne = bounds.getNorthEast();
          const minLat = sw.lat;
          const maxLat = ne.lat;
          const minLng = sw.lng;
          const maxLng = ne.lng;
          const crosses = minLng > maxLng;

          const tx = self.db.transaction([self.STORE_NAME], 'readonly');
          const store = tx.objectStore(self.STORE_NAME);
          const index = store.index('lat');
          const range = IDBKeyRange.bound(minLat, maxLat);
          const results = [];

          index.openCursor(range).onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
              const rec = cursor.value;
              const inLng = crosses ? rec.lng >= minLng || rec.lng <= maxLng : rec.lng >= minLng && rec.lng <= maxLng;
              if (inLng) results.push(rec);
              cursor.continue();
            } else {
              resolve(results);
            }
          };

          tx.onerror = () => reject(tx.error);
        })
    );
  };

  self.selectRepresentatives = function (records) {
    const map = new Map();
    records.forEach((rec) => {
      if (!rec || !rec.s2cell) return;
      const existing = map.get(rec.s2cell);
      if (!existing) {
        map.set(rec.s2cell, rec);
        return;
      }
      const recSeen = rec.lastSeen || 0;
      const exSeen = existing.lastSeen || 0;
      if (self.REPRESENTATIVE_STRATEGY === 'oldest') {
        if (recSeen < exSeen) map.set(rec.s2cell, rec);
      } else {
        if (recSeen > exSeen) map.set(rec.s2cell, rec);
      }
    });
    return Array.from(map.values());
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

    self.rendering = true;

    const bounds = window.map.getBounds();
    self.getPortalsInBounds(bounds)
      .then((records) => {
        if (!self.shouldRender()) {
          self.clearLayer();
          return;
        }

        const reps = self.selectRepresentatives(records);
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

    return self.initDB().then(
      () =>
        new Promise((resolve, reject) => {
          const tx = self.db.transaction([self.STORE_NAME], 'readonly');
          const store = tx.objectStore(self.STORE_NAME);
          const index = store.index('lastSeen');

          const range = cutoff ? IDBKeyRange.upperBound(cutoff) : null;
          const results = [];

          index.openCursor(range, 'next').onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
              results.push(cursor.value);
              if (results.length >= maxItems) {
                resolve(results);
                return;
              }
              cursor.continue();
            } else {
              resolve(results);
            }
          };

          tx.onerror = () => reject(tx.error);
        })
    );
  };

  self.renderMaintenanceList = function (records) {
    self.ui.list = records || [];

    const rows = self.ui.list
      .map((rec) => {
        const name = self.escapeHtml(rec.name || self.formatGuid(rec.guid));
        const lastSeen = self.formatTime(rec.lastSeen);
        const ageDays = rec.lastSeen ? Math.floor((Date.now() - rec.lastSeen) / 86400000) : '-';
        const lat = typeof rec.lat === 'number' ? rec.lat : 0;
        const lng = typeof rec.lng === 'number' ? rec.lng : 0;

        return `
          <tr>
            <td><input type="checkbox" data-guid="${rec.guid}"></td>
            <td><a onclick="window.plugin.portalAfterimage.jumpToPortal('${rec.guid}', ${lat}, ${lng})">${name}</a></td>
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
    const input = $('#portal-afterimage-days');
    const value = input.length ? parseInt(input.val(), 10) : self.ui.minDays;
    self.ui.minDays = isNaN(value) ? 180 : Math.max(0, value);
    localStorage.setItem('portal-afterimage-min-days', String(self.ui.minDays));

    self.loadMaintenanceList(self.ui.minDays)
      .then((records) => self.renderMaintenanceList(records))
      .catch((err) => {
        console.error('Portal Afterimage: failed to load maintenance list', err);
        $('#portal-afterimage-list').html('<div style="color:#f66;">Failed to load data.</div>');
      });
  };

  self.toggleSelectAll = function (checked) {
    $('#portal-afterimage-list input[type=checkbox]').prop('checked', checked);
  };

  self.deletePortals = function (guids) {
    if (!guids || !guids.length) return Promise.resolve();

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
    if (window.zoomToAndShowPortal) {
      window.zoomToAndShowPortal(guid, [lat, lng]);
    } else {
      window.map.setView([lat, lng], 16);
    }
  };

  self.showMaintenanceDialog = function () {
    const html = `
      <div id="portal-afterimage-maint">
        <div style="margin-bottom:8px;">
          <label for="portal-afterimage-days">Show portals not seen for</label>
          <input id="portal-afterimage-days" type="number" min="0" value="${self.ui.minDays}" style="width:70px; margin:0 6px;">
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
    });

    self.refreshMaintenance();
  };

  self.onOverlayChange = function (e) {
    if (e.layer === self.layerGroup) self.scheduleRender();
  };

  const setup = function () {
    const storedDays = parseInt(localStorage.getItem('portal-afterimage-min-days'), 10);
    if (!isNaN(storedDays)) self.ui.minDays = storedDays;

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
        id: 'portal-afterimage-btn',
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
