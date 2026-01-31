// ==UserScript==
// @id             iitc-plugin-recharge-monitor
// @name           IITC plugin: Recharge Monitor & Decay Predictor
// @category       Info
// @version        0.3.1
// @namespace      https://github.com/mordenkainennn/ingress-intel-total-conversion
// @updateURL      https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/main/local-plugins/recharge-monitor/recharge-monitor.meta.js
// @downloadURL    https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/main/local-plugins/recharge-monitor/recharge-monitor.user.js
// @description    Monitors Portal energy, predicts decay for out-of-view Portals, and allows manual correction of deployment time.
// @include        https://*.ingress.com/intel*
// @match          https://intel.ingress.com/*
// @match          https://intel-x.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {

    if (typeof window.plugin !== 'function') window.plugin = function () { };

    plugin_info.buildName = 'RechargeMonitor';
    plugin_info.dateTimeVersion = '202401310002';
    plugin_info.pluginId = 'recharge-monitor';

    var changelog = [
        {
            version: '0.3.1',
            changes: [
                'UPD: Changed UI terminology from "Depletion" to "Decay" to match Ingress standards.',
            ],
        },
        {
            version: '0.3.0',
            changes: [
                'NEW: Added real-time Comm monitoring and retroactive history sync.',
                'NEW: Integrated history recovery from "Player Activity Log" plugin via GUID matching.',
                'NEW: Added "Est. Decay" column showing predicted time until 0% energy.',
                'UPD: All time displays are now in local time (YYYY-MM-DD HH:MM).',
                'UPD: Translated all UI texts and comments to English.',
                'FIX: Improved robustness of health calculation to prevent overwriting valid cache with incomplete map data.',
                'FIX: Added error handling and data validation to prevent UI crashes.',
            ],
        },
        {
            version: '0.2.1',
            changes: [
                'UPD: Translated UI texts in Portal details pane from Chinese to English.',
            ],
        },
        {
            version: '0.2.0',
            changes: [
                'FIX: Major structural refactoring to solve scope isolation issues, ensuring the plugin loads correctly and the toolbox link is always visible.',
                'FIX: Adopted a robust, retry-based pattern for adding the toolbox button to prevent race conditions.',
                'FIX: Added error handling for loading data from localStorage to prevent crashes on corrupted data.',
                'UPD: Added .meta.js file and updated UserScript header for Tampermonkey update checks.',
                'FIX: Corrected several minor UI bugs related to updating and closing the watchlist dialog.',
            ],
        },
        {
            version: '0.1.0',
            changes: ['Initial creation of the plugin.'],
        }
    ];

    window.plugin.rechargeMonitor = function () { };
    const self = window.plugin.rechargeMonitor;

    const STORAGE_KEY = 'iitc-plugin-recharge-monitor-data';
    self.data = {};

    /* ---------------- Data Storage ---------------- */

    self.save = function () {
        localStorage[STORAGE_KEY] = JSON.stringify(self.data);
    };

    self.load = function () {
        try {
            if (localStorage[STORAGE_KEY]) {
                self.data = JSON.parse(localStorage[STORAGE_KEY]);
            }
        } catch (e) {
            console.error('Recharge Monitor: load failed', e);
            self.data = {};
        }
    };

    /* ---------------- Core Logic ---------------- */

    self.calculateHealth = function (guid) {
        const pData = self.data[guid];
        if (!pData) return 0;

        if (window.portals[guid]) {
            const p = window.portals[guid];
            const data = p.options.data;

            if (data && typeof data.health === 'number') {
                pData.lastSeenHealth = data.health;
                pData.lastSeenTime = Date.now();
            }
            if (data && data.title) {
                pData.name = data.title;
            }
            
            const details = window.portalDetail.get(guid);
            if (details && details.captured && details.captured.time) {
                pData.captureTime = details.captured.time;
            }
            
            self.save();
            if (data && typeof data.health === 'number') {
                return data.health;
            }
        }

        const lastHealth = typeof pData.lastSeenHealth === 'number' ? pData.lastSeenHealth : 0;
        const lastTime = typeof pData.lastSeenTime === 'number' ? pData.lastSeenTime : Date.now();
        const hours = (Date.now() - lastTime) / 36e5;
        const days = Math.floor(hours / 24);
        const predicted = lastHealth - days * 15;
        return predicted > 0 ? predicted : 0;
    };

    self.formatTime = function (t) {
        if (!t) return '-';
        const d = new Date(t);
        if (isNaN(d.getTime())) return '-';
        
        const pad = (n) => n < 10 ? '0' + n : n;
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    self.estimateDecay = function (currentHealth, lastSeenTime) {
        if (currentHealth <= 0) return 'Decayed';
        if (!lastSeenTime) return '-';
        const daysLeft = currentHealth / 15;
        const depletionTime = lastSeenTime + (daysLeft * 24 * 3600 * 1000);
        return self.formatTime(depletionTime);
    };

    /* ---------------- History Integration ---------------- */

    self.parseActivityType = function (text) {
        if (!text) return null;
        if (text.includes('captured')) return 'captured';
        if (text.includes('deployed a Resonator')) return 'deployed';
        return null;
    };

    self.handleCommData = function (data) {
        data.result.forEach(function (msg) {
            const timestamp = msg[1];
            const plext = msg[2].plext;
            let portalGuid = null;
            let activityType = null;

            plext.markup.forEach(function (markup) {
                if (markup[0] === 'PORTAL') {
                    portalGuid = markup[1].guid;
                } else if (markup[0] === 'TEXT') {
                    const type = self.parseActivityType(markup[1].plain);
                    if (type) activityType = type;
                }
            });

            if (portalGuid && activityType && self.data[portalGuid]) {
                const pData = self.data[portalGuid];
                if (timestamp > pData.captureTime) {
                    pData.captureTime = timestamp;
                    self.save();
                }
            }
        });
    };

    self.scanCommHistory = function (targetGuid) {
        if (!window.chat) return;
        const scanChannel = (channelData) => {
            if (!channelData) return;
            for (const id in channelData) {
                const msg = channelData[id];
                const timestamp = msg[0];
                const plext = msg[2].plext;
                let guid = null, type = null;
                if (!plext || !plext.markup) continue;
                plext.markup.forEach(m => {
                    if (m[0] === 'PORTAL') guid = m[1].guid;
                    else if (m[0] === 'TEXT') type = self.parseActivityType(m[1].plain);
                });
                if (guid && type) {
                    if (targetGuid && guid !== targetGuid) continue;
                    if (!targetGuid && !self.data[guid]) continue;
                    const pData = self.data[guid];
                    if (pData) {
                        if (timestamp > pData.captureTime || Math.abs(Date.now() - pData.captureTime) < 5000) {
                            pData.captureTime = timestamp;
                            self.save();
                        }
                    }
                }
            }
        };
        scanChannel(window.chat._public ? window.chat._public.data : null);
        scanChannel(window.chat._faction ? window.chat._faction.data : null);
    };

    self.scanActivityLog = function (targetGuid) {
        self.scanCommHistory(targetGuid);
        const LOG_KEY = 'player-activity-log';
        const raw = localStorage[LOG_KEY];
        if (!raw) return targetGuid ? null : alert('Scanned Comm History. (Activity Log plugin data not found)');

        let logData;
        try { logData = JSON.parse(raw); } catch (e) { return; }

        const events = [];
        for (const playerName in logData) {
            const player = logData[playerName];
            if (!player.activities) continue;
            player.activities.forEach(act => {
                const type = self.parseActivityType(act.activity);
                if (type) events.push({ time: act.time, type: type, guid: act.guid, lat: act.portal.lat, lng: act.portal.lng });
            });
        }
        events.sort((a, b) => a.time - b.time);

        const processPortal = (guid, pData) => {
            if (!pData || !pData.latlng) return;
            const pLat = typeof pData.latlng.lat !== 'undefined' ? pData.latlng.lat : pData.latlng[0];
            const pLng = typeof pData.latlng.lng !== 'undefined' ? pData.latlng.lng : pData.latlng[1];
            let bestCaptureTime = 0, lastActivityTime = 0, foundMatch = false;

            events.forEach(ev => {
                let match = (ev.guid && ev.guid === guid) || (Math.abs(ev.lat - pLat) < 0.0002 && Math.abs(ev.lng - pLng) < 0.0002);
                if (match) {
                    foundMatch = true;
                    if (ev.type === 'captured') bestCaptureTime = ev.time;
                    else if (ev.time > lastActivityTime) lastActivityTime = ev.time;
                }
            });

            if (foundMatch) {
                let newTime = bestCaptureTime > 0 ? bestCaptureTime : lastActivityTime;
                if (newTime > 0 && (newTime !== pData.captureTime)) {
                    pData.captureTime = newTime;
                }
            }
        };

        if (targetGuid) {
            processPortal(targetGuid, self.data[targetGuid]);
        } else {
            for (const guid in self.data) processPortal(guid, self.data[guid]);
            alert('Sync Complete.');
        }
        self.save();
        self.showList();
    };

    /* ---------------- UI ---------------- */

    self.setupPortals = function () {
        window.addHook('portalDetailsUpdated', function (data) {
            const guid = data.guid;
            $('#recharge-monitor-controls').remove();
            const watched = self.data[guid] !== undefined;
            if (watched) {
                const details = data.portalDetails;
                if (details && details.captured && details.captured.time) self.data[guid].captureTime = details.captured.time;
                self.calculateHealth(guid);
            }
            const $box = $('<div id="recharge-monitor-controls" style="padding:5px;border-top:1px solid #20A8B1;"></div>');
            const $btn = $('<a>').text(watched ? '🛑 Stop Monitoring' : '🛡️ Add to Watchlist').css('cursor', 'pointer').on('click', () => self.toggleWatch(guid));
            $box.append($btn);
            if (watched) {
                const $edit = $('<a>').text(' | 🕒 Edit Deploy Time').css('cursor', 'pointer').on('click', () => self.editTime(guid));
                $box.append($edit);
            }
            $('#portaldetails').append($box);
        });
    };

    self.toggleWatch = function (guid) {
        if (self.data[guid]) {
            delete self.data[guid];
        } else {
            const p = window.portals[guid];
            if (!p) return alert('Please load the Portal first');
            self.data[guid] = {
                name: p.options.data.title,
                latlng: p.getLatLng(),
                captureTime: Date.now(),
                lastSeenHealth: p.options.data.health,
                lastSeenTime: Date.now()
            };
            self.scanActivityLog(guid);
        }
        self.save();
        if (window.selectedPortal === guid) window.renderPortalDetails(guid);
    };

    self.editTime = function (guid) {
        const input = prompt('Enter deployment time (YYYY-MM-DD HH:MM)', self.formatTime(self.data[guid].captureTime));
        if (!input) return;
        const t = new Date(input).getTime();
        if (!isNaN(t)) {
            self.data[guid].captureTime = t;
            self.save();
            self.showList();
        }
    };

    self.showList = function () {
        if ($('#recharge-monitor-dialog').length === 0 && arguments.length === 0) return; // Prevent auto-opening
        try {
            let html = `<div style="margin-bottom:10px;"><button onclick="window.plugin.rechargeMonitor.scanActivityLog()" style="cursor:pointer;background:#20A8B1;border:none;padding:5px 10px;color:white;">🔄 Sync History</button></div>`;
            html += `<table class="recharge-table" style="width:100%"><tr><th>Portal</th><th>Health</th><th>Deploy Time</th><th>Est. Decay</th><th>Action</th></tr>`;
            for (const guid in self.data) {
                const p = self.data[guid];
                if (!p || !p.latlng) continue;
                const h = self.calculateHealth(guid);
                const c = h <= 30 ? '#f00' : '#0f0';
                const lat = typeof p.latlng.lat !== 'undefined' ? p.latlng.lat : (Array.isArray(p.latlng) ? p.latlng[0] : 0);
                const lng = typeof p.latlng.lng !== 'undefined' ? p.latlng.lng : (Array.isArray(p.latlng) ? p.latlng[1] : 0);
                const safeName = (p.name || 'Unknown').replace(/"/g, '&quot;');
                html += `<tr><td><a onclick="window.zoomToAndShowPortal('${guid}',[${lat},${lng}]);">${safeName}</a></td><td style="color:${c};font-weight:bold">${(h || 0).toFixed(0)}%</td><td>${self.formatTime(p.captureTime)}</td><td>${self.estimateDecay(h, p.lastSeenTime)}</td><td><a onclick="window.plugin.rechargeMonitor.toggleWatch('${guid}'); setTimeout(window.plugin.rechargeMonitor.showList, 100);">Del</a></td></tr>`;
            }
            html += '</table>';
            window.dialog({ html, title: 'Recharge Watchlist', id: 'recharge-monitor-dialog', width: 550 });
        } catch (e) { console.error(e); }
    };

    function addToolboxButton() {
        if (!window.IITC || !IITC.toolbox || !IITC.toolbox.addButton) return false;
        if ($('#recharge-monitor-btn').length) return true;
        IITC.toolbox.addButton({ id: 'recharge-monitor-btn', label: 'Recharge Mon', title: 'Show Recharge Watchlist', action: () => self.showList(true) });
        return true;
    }

    self.loop = function () {
        let count = 0;
        for (const guid in self.data) { if (self.calculateHealth(guid) <= 30) count++; }
        const $btn = $('#recharge-monitor-btn');
        if (!$btn.length) return;
        if (count > 0) $btn.css('color', '#ff4500').text(`⚠️ Recharge (${count})`);
        else $btn.css('color', '').text('Recharge Mon');
    };

    const setup = function () {
        self.load();
        self.setupPortals();
        window.addHook('publicChatDataAvailable', self.handleCommData);
        let tries = 0;
        const t = setInterval(() => { if (addToolboxButton() || ++tries > 20) clearInterval(t); }, 500);
        self.loop();
        setInterval(self.loop, 60000);
        $('<style>').text('.recharge-table td{padding:4px;text-align:center;border-bottom:1px solid #20A8B1}').appendTo('head');
        console.log('Recharge Monitor: loaded');
    };

    setup.info = plugin_info;
    window.bootPlugins = window.bootPlugins || [];
    window.bootPlugins.push(setup);
    if (window.iitcLoaded) setup();
}

const script = document.createElement('script');
script.appendChild(document.createTextNode('(' + wrapper + ')({});'));
(document.body || document.head || document.documentElement).appendChild(script);