// ==UserScript==
// @author         mordenkainen
// @name           Portal DB
// @category       Database
// @version        0.1.2
// @description    Save portal basic information (GUID, Lat, Lng, Team) to IndexedDB for cross-plugin use.
// @id             portal-db@mordenkainen
// @namespace      https://github.com/mordenkainennn/ingress-intel-total-conversion
// @updateURL      https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/portal-db/portal-db.meta.js
// @downloadURL    https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/portal-db/portal-db.user.js
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
  // ensure plugin framework is there, even if iitc is not yet loaded
  if (typeof window.plugin !== 'function') window.plugin = function () {};

  // PLUGIN START --------------------------------------------------------

  // use own namespace for plugin
  window.plugin.portalDB = function () {};
  const self = window.plugin.portalDB;

  self.changelog = [
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
            lastSeen: now,
          });
          resolve(true);
          return;
        }

        const record = existing;
        let needsUpdate = false;

        // Check content changes
        if (data.latE6 !== undefined && record.latE6 !== data.latE6) {
          record.latE6 = data.latE6;
          needsUpdate = true;
        }
        if (data.lngE6 !== undefined && record.lngE6 !== data.lngE6) {
          record.lngE6 = data.lngE6;
          needsUpdate = true;
        }
        if (data.team !== undefined && record.team !== data.team) {
          record.team = data.team;
          needsUpdate = true;
        }

        // Check age threshold
        if (needsUpdate || now - record.lastSeen > self.UPDATE_THRESHOLD) {
          record.lastSeen = now;
          store.put(record);
          resolve(true);
        } else {
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
              lastSeen: now,
            });
            return;
          }

          const record = existing;
          let needsUpdate = false;

          // Check content changes
          if (data.latE6 !== undefined && record.latE6 !== data.latE6) {
            record.latE6 = data.latE6;
            needsUpdate = true;
          }
          if (data.lngE6 !== undefined && record.lngE6 !== data.lngE6) {
            record.lngE6 = data.lngE6;
            needsUpdate = true;
          }
          if (data.team !== undefined && record.team !== data.team) {
            record.team = data.team;
            needsUpdate = true;
          }

          // Check age threshold
          if (needsUpdate || now - record.lastSeen > self.UPDATE_THRESHOLD) {
            record.lastSeen = now;
            store.put(record);
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
      // dataArr for portal: ['p', teamStr, latE6, lngE6]
      if (ent[2][0] === 'p') {
        const guid = ent[0];
        const dataArr = ent[2];
        const teamStr = dataArr[1]; // 'E', 'R', 'N', 'M'
        const latE6 = dataArr[2];
        const lngE6 = dataArr[3];

        portalsToUpdate.push({
          guid: guid,
          latE6: latE6,
          lngE6: lngE6,
          team: teamStr,
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
      });
    }
  };

  // --- UI Functions ---

  self.showDialog = async function () {
    const stats = await self.getStats();
    const html = `
      <div id="portal-db-dialog">
        <p>Total Portals in DB: <strong>${stats.count}</strong></p>
        <div style="margin-top: 15px;">
          <button onclick="window.plugin.portalDB.exportData()">Export JSON</button>
          <button onclick="window.plugin.portalDB.importData()">Import JSON</button>
        </div>
        <div style="margin-top: 20px; border-top: 1px solid #444; padding-top: 10px;">
          <button style="color: #ff6666;" onclick="window.plugin.portalDB.resetDB()">RESET DATABASE</button>
        </div>
      </div>
    `;

    window.dialog({
      title: 'Portal DB Management',
      html: html,
      id: 'portal-db-mgmt',
    });
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
          link.textContent = 'Portal DB';
          link.title = 'Manage local Portal database';
          link.href = '#';
          link.onclick = (e) => {
            e.preventDefault();
            self.showDialog();
          };
          sidebar.appendChild(link);
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
