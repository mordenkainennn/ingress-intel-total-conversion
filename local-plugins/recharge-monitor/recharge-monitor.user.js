// ==UserScript==
// @id             iitc-plugin-recharge-monitor
// @name           IITC plugin: Recharge Monitor & Decay Predictor
// @category       Info
// @version        0.5.1
// @namespace      https://github.com/mordenkainennn/ingress-intel-total-conversion
// @updateURL      https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/recharge-monitor/recharge-monitor.meta.js
// @downloadURL    https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/recharge-monitor/recharge-monitor.user.js
// @description    Monitors Portal energy, predicts decay for out-of-view Portals, and allows manual correction of deployment time.
// @include        https://*.ingress.com/intel*
// @match          https://intel.ingress.com/*
// @match          https://intel-x.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {

    if (typeof window.plugin !== 'function') window.plugin = function () { };

    plugin_info.buildName = 'RechargeMonitor';
    plugin_info.dateTimeVersion = '202603271300';
    plugin_info.pluginId = 'recharge-monitor';

    var changelog = [
        {
            version: '0.5.1',
            changes: [
                'UPD: Widened the watchlist dialog and prevented time columns from wrapping onto two lines.',
            ],
        },
        {
            version: '0.5.0',
            changes: [
                'NEW: Added bookmark-style groups for the recharge watchlist, including create, rename, delete, collapse, and portal move actions.',
                'FIX: Removed a stray browser-incompatible import that could prevent the plugin from loading.',
            ],
        },
        {
            version: '0.4.4',
            changes: [
                'UPD: Improved user feedback during the sync process, including a summary of how many portals were updated.',
            ],
        },
        {
            version: '0.4.3',
            changes: [
                'NEW: Added total XM required to fully recharge all monitored portals.',
                'NEW: Added total daily decay (15%) estimate for the watchlist.',
                'FIX: Now estimates max XM using map data (Portal Level/Resonators) if detailed portal data is not yet loaded.',
            ],
        },
        {
            version: '0.4.2',
            changes: [
                'NEW: Added "About" button to the watchlist dialog.',
                'DOC: Added explicit dependency documentation in the About dialog.',
            ],
        },
        {
            version: '0.4.1',
            changes: [
                'REF: Migrated history sync to use the new asynchronous API of "Player Activity Log" (IndexedDB).',
                'UPD: Improved reliability of data synchronization between plugins.',
            ],
        },
        {
            version: '0.3.2',
            changes: [
                'FIX: Corrected UserScript update/download URLs to point to the correct `master` branch.',
            ],
        }
    ];

    window.plugin.rechargeMonitor = function () { };
    const self = window.plugin.rechargeMonitor;

    const STORAGE_KEY = 'iitc-plugin-recharge-monitor-data';
    self.DEFAULT_GROUP = 'idOthers';
    self.data = {};
    self.groups = {};

    /* ---------------- Data Storage ---------------- */

    self.createDefaultGroups = function () {
        return {
            [self.DEFAULT_GROUP]: { label: 'Others', state: 1 }
        };
    };

    self.generateGroupId = function () {
        return 'id' + Date.now().toString() + Math.floor(Math.random() * 1000).toString();
    };

    self.ensureDataModel = function () {
        self.groups = self.groups || self.createDefaultGroups();
        if (!self.groups[self.DEFAULT_GROUP]) {
            self.groups[self.DEFAULT_GROUP] = { label: 'Others', state: 1 };
        }

        Object.keys(self.data).forEach(function (guid) {
            const portal = self.data[guid];
            if (!portal || typeof portal !== 'object') return;
            if (!portal.groupId || !self.groups[portal.groupId]) {
                portal.groupId = self.DEFAULT_GROUP;
            }
        });
    };

    self.save = function () {
        self.ensureDataModel();
        localStorage[STORAGE_KEY] = JSON.stringify({
            version: 2,
            portals: self.data,
            groups: self.groups
        });
    };

    self.load = function () {
        try {
            if (localStorage[STORAGE_KEY]) {
                const parsed = JSON.parse(localStorage[STORAGE_KEY]);
                if (parsed && parsed.version === 2 && parsed.portals) {
                    self.data = parsed.portals || {};
                    self.groups = parsed.groups || self.createDefaultGroups();
                } else {
                    self.data = parsed || {};
                    self.groups = self.createDefaultGroups();
                }
            }
            self.ensureDataModel();
        } catch (e) {
            console.error('Recharge Monitor: load failed', e);
            self.data = {};
            self.groups = self.createDefaultGroups();
        }
    };

    self.escapeHtml = function (text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    self.getGroupEntries = function () {
        const entries = [];
        Object.keys(self.groups).forEach(function (groupId) {
            entries.push({ id: groupId, label: self.groups[groupId].label || 'Unnamed', state: self.groups[groupId].state ? 1 : 0 });
        });
        entries.sort(function (a, b) {
            if (a.id === self.DEFAULT_GROUP) return 1;
            if (b.id === self.DEFAULT_GROUP) return -1;
            return a.label.localeCompare(b.label);
        });
        return entries;
    };

    self.toggleGroup = function (groupId) {
        if (!self.groups[groupId]) return;
        self.groups[groupId].state = self.groups[groupId].state ? 0 : 1;
        self.save();
        self.showList(true);
    };

    self.createGroup = function () {
        const label = prompt('Enter new group name');
        if (!label) return;
        const safeLabel = label.trim();
        if (!safeLabel) return;

        const id = self.generateGroupId();
        self.groups[id] = { label: safeLabel, state: 1 };
        self.save();
        self.showList(true);
    };

    self.renameGroup = function (groupId) {
        if (!self.groups[groupId] || groupId === self.DEFAULT_GROUP) return;
        const label = prompt('Rename group', self.groups[groupId].label || '');
        if (!label) return;
        const safeLabel = label.trim();
        if (!safeLabel) return;

        self.groups[groupId].label = safeLabel;
        self.save();
        self.showList(true);
    };

    self.deleteGroup = function (groupId) {
        if (!self.groups[groupId] || groupId === self.DEFAULT_GROUP) return;
        if (!confirm('Delete this group and move its portals to Others?')) return;

        Object.keys(self.data).forEach(function (guid) {
            if (self.data[guid] && self.data[guid].groupId === groupId) {
                self.data[guid].groupId = self.DEFAULT_GROUP;
            }
        });

        delete self.groups[groupId];
        self.save();
        self.showList(true);
    };

    self.movePortalToGroup = function (guid, groupId) {
        if (!self.data[guid] || !self.groups[groupId]) return;
        self.data[guid].groupId = groupId;
        self.save();
        self.showList(true);
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
            if (data && typeof data.level === 'number') {
                pData.level = data.level;
            }
            if (data && typeof data.resCount === 'number') {
                pData.resCount = data.resCount;
            }

            const details = window.portalDetail.get(guid);
            if (details) {
                if (details.captured && details.captured.time) {
                    pData.captureTime = details.captured.time;
                }
                if (details.resonators) {
                    let max = 0;
                    details.resonators.forEach(r => { if (r) max += r.energyTotal; });
                    if (max > 0) pData.energyMax = max;
                }
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

    self.estimateDecay = function (currentHealth, lastSeenTime, captureTime) {
        if (currentHealth <= 0) return 'Decayed';

        // Accurate prediction aligned to Ingress Decay Ticks
        if (captureTime && captureTime > 0) {
            const msPerDay = 24 * 60 * 60 * 1000;
            const now = Date.now();

            // Calculate the most recent decay tick (in the past)
            const elapsed = now - captureTime;
            const daysSinceCapture = Math.floor(elapsed / msPerDay);
            const lastTick = captureTime + (daysSinceCapture * msPerDay);

            // The next decay tick (in the future)
            let nextTick = lastTick + msPerDay;
            if (nextTick <= now) nextTick += msPerDay; // Safety for edge case

            // Calculate remaining ticks
            // Health 15% -> dies on 1st tick (ticksLeft=1) -> date = nextTick
            // Health 100% -> dies on 7th tick (ticksLeft=7) -> date = nextTick + 6 days
            const ticksLeft = Math.ceil(currentHealth / 15);

            const depletionTime = nextTick + (ticksLeft - 1) * msPerDay;
            return self.formatTime(depletionTime);
        }

        // Fallback: Linear estimation if capture time is unknown
        if (!lastSeenTime) return '-';
        const daysLeft = currentHealth / 15;
        const depletionTime = lastSeenTime + (daysLeft * 24 * 3600 * 1000);
        return '~ ' + self.formatTime(depletionTime); // Prefix with ~ to indicate approximation
    };

    self.getEstimatedMaxEnergy = function (guid) {
        const p = self.data[guid];
        if (!p) return { value: 0, exact: false };

        // Tier 1: Exact
        if (p.energyMax) return { value: p.energyMax, exact: true };

        // Tier 2: Map Summary
        if (typeof p.level === 'number' && typeof p.resCount === 'number') {
            const RESONATOR_CAPACITY = [0, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000];
            const cap = RESONATOR_CAPACITY[p.level] || 3000;
            return { value: p.resCount * cap, exact: false };
        }

        // Tier 3: Fallback (Assume standard 8 Res L5 portal)
        return { value: 24000, exact: false };
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

    self.scanActivityLog = async function (targetGuid) {
        self.scanCommHistory(targetGuid);

        const logPlugin = window.plugin.playerActivityLog;
        if (!logPlugin || typeof logPlugin.getAllActivities !== 'function') {
            return targetGuid ? null : alert('Scanned Comm History. (Player Activity Log plugin/API not found)');
        }

        console.log('Recharge Monitor: Syncing with Player Activity Log API...');
        const activities = await logPlugin.getAllActivities();

        if (!activities || activities.length === 0) {
            return targetGuid ? null : alert('Sync Complete.\nNo records found in Activity Log.');
        }

        const events = activities.map(act => ({
            time: act.time,
            type: self.parseActivityType(act.activity),
            guid: act.guid,
            lat: act.portal.lat,
            lng: act.portal.lng
        })).filter(e => e.type !== null);

        events.sort((a, b) => a.time - b.time);

        // Modified to return true if the capture time was updated
        const processPortal = (guid, pData) => {
            if (!pData || !pData.latlng) return false;
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
                    return true; // Successfully updated
                }
            }
            return false; // No update needed or found
        };

        let updatedCount = 0;

        if (targetGuid) {
            if (processPortal(targetGuid, self.data[targetGuid])) {
                updatedCount++;
            }
        } else {
            for (const guid in self.data) {
                if (processPortal(guid, self.data[guid])) {
                    updatedCount++;
                }
            }

            // Display the summary report to the user
            if (updatedCount > 0) {
                alert(`Sync Complete.\nSuccessfully corrected the capture time for ${updatedCount} portal(s).`);
            } else {
                alert(`Sync Complete.\nNo new capture times were found or updated for the portals in your watchlist.`);
            }
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
                if (details) {
                    if (details.captured && details.captured.time) self.data[guid].captureTime = details.captured.time;
                    if (details.resonators) {
                        let max = 0;
                        details.resonators.forEach(r => { if (r) max += r.energyTotal; });
                        if (max > 0) self.data[guid].energyMax = max;
                    }
                }
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
                lastSeenTime: Date.now(),
                level: p.options.data.level,
                resCount: p.options.data.resCount,
                groupId: self.DEFAULT_GROUP
            };
            const details = window.portalDetail.get(guid);
            if (details && details.resonators) {
                let max = 0;
                details.resonators.forEach(r => { if (r) max += r.energyTotal; });
                if (max > 0) self.data[guid].energyMax = max;
            }
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

    self.showAbout = function () {
        const html = `
            <div style="font-size:14px; line-height:1.5;">
                <p><strong>Recharge Monitor</strong> helps you track Portal energy states and predict neutralization times.</p>
                <ul style="list-style-type:disc; padding-left:20px;">
                    <li><strong>Health Monitoring:</strong> Tracks energy levels visible on the map.</li>
                    <li><strong>Decay Prediction:</strong> Calculates exact neutralization time based on Ingress 24h decay cycles anchored to the deployment time.</li>
                </ul>
                <hr style="border:0; border-top:1px solid #444; margin:10px 0;">
                <p style="color:#ffce00"><strong>Dependency Note:</strong></p>
                <p>The <em>"Sync History"</em> feature requires the <strong style="color:#fff">Player Activity Log</strong> plugin to be installed and enabled.</p>
                <p>It queries the local IndexedDB database to retrieve past capture times for Portals in your watchlist, ensuring accurate decay predictions even if you didn't see the deployment happen live.</p>
            </div>
        `;
        window.dialog({
            html: html,
            title: 'About Recharge Monitor',
            id: 'recharge-monitor-about',
            width: 400
        });
    };

    self.showList = function () {
        if ($('#recharge-monitor-dialog').length === 0 && arguments.length === 0) return;
        try {
            self.ensureDataModel();

            const groupEntries = self.getGroupEntries();
            const portalsByGroup = {};
            let totalMissingXM = 0, totalDailyDecay = 0, exactCount = 0, usedEstimates = false;

            for (const guid in self.data) {
                const p = self.data[guid];
                if (!p || !p.latlng) continue;

                const groupId = p.groupId && self.groups[p.groupId] ? p.groupId : self.DEFAULT_GROUP;
                if (!portalsByGroup[groupId]) portalsByGroup[groupId] = [];

                const h = self.calculateHealth(guid);
                const c = h <= 30 ? '#f00' : '#0f0';
                const lat = typeof p.latlng.lat !== 'undefined' ? p.latlng.lat : (Array.isArray(p.latlng) ? p.latlng[0] : 0);
                const lng = typeof p.latlng.lng !== 'undefined' ? p.latlng.lng : (Array.isArray(p.latlng) ? p.latlng[1] : 0);
                portalsByGroup[groupId].push({
                    guid: guid,
                    name: p.name || 'Unknown',
                    health: h || 0,
                    healthColor: c,
                    captureTime: p.captureTime,
                    lastSeenTime: p.lastSeenTime,
                    lat: lat,
                    lng: lng
                });

                const maxEng = self.getEstimatedMaxEnergy(guid);
                if (maxEng.value > 0) {
                    totalMissingXM += maxEng.value * (1 - h / 100);
                    totalDailyDecay += maxEng.value * 0.15;
                    if (maxEng.exact) exactCount++;
                    else usedEstimates = true;
                }
            }

            let html = '<div class="recharge-groups-toolbar"><a onclick="window.plugin.rechargeMonitor.createGroup();return false;">+ Group</a></div>';

            groupEntries.forEach(function (group) {
                const portals = portalsByGroup[group.id] || [];
                const isOpen = group.state;
                const safeLabel = self.escapeHtml(group.label);
                const arrow = isOpen ? '&#9660;' : '&#9658;';

                html += `<div class="recharge-group">
                    <div class="recharge-group-header">
                        <a class="recharge-group-toggle" onclick="window.plugin.rechargeMonitor.toggleGroup('${group.id}');return false;">${arrow} ${safeLabel}</a>
                        <span class="recharge-group-count">${portals.length}</span>`;

                if (group.id !== self.DEFAULT_GROUP) {
                    html += `<span class="recharge-group-actions">
                        <a onclick="window.plugin.rechargeMonitor.renameGroup('${group.id}');return false;">Rename</a>
                        <a onclick="window.plugin.rechargeMonitor.deleteGroup('${group.id}');return false;">Delete</a>
                    </span>`;
                }

                html += '</div>';

                if (isOpen) {
                    html += `<table class="recharge-table" style="width:100%"><tr><th>Portal</th><th>Health</th><th class="recharge-time-col">Deploy Time</th><th class="recharge-time-col">Est. Decay</th><th>Group</th><th>Action</th></tr>`;

                    if (portals.length === 0) {
                        html += `<tr><td colspan="6" class="recharge-empty">No portals in this group</td></tr>`;
                    } else {
                        portals.sort(function (a, b) {
                            return a.health - b.health || a.name.localeCompare(b.name);
                        });

                        portals.forEach(function (portal) {
                            const safeName = self.escapeHtml(portal.name);
                            const selectOptions = groupEntries.map(function (entry) {
                                const selected = entry.id === group.id ? ' selected' : '';
                                return `<option value="${entry.id}"${selected}>${self.escapeHtml(entry.label)}</option>`;
                            }).join('');

                            html += `<tr>
                                <td><a onclick="window.zoomToAndShowPortal('${portal.guid}',[${portal.lat},${portal.lng}]);">${safeName}</a></td>
                                <td style="color:${portal.healthColor};font-weight:bold">${portal.health.toFixed(0)}%</td>
                                <td class="recharge-time-col">${self.formatTime(portal.captureTime)}</td>
                                <td class="recharge-time-col">${self.estimateDecay(portal.health, portal.lastSeenTime, portal.captureTime)}</td>
                                <td>
                                    <select onchange="window.plugin.rechargeMonitor.movePortalToGroup('${portal.guid}', this.value)">
                                        ${selectOptions}
                                    </select>
                                </td>
                                <td><a onclick="window.plugin.rechargeMonitor.toggleWatch('${portal.guid}'); setTimeout(window.plugin.rechargeMonitor.showList, 100);">Del</a></td>
                            </tr>`;
                        });
                    }

                    html += '</table>';
                }

                html += '</div>';
            });

            const countAll = Object.keys(self.data).length;
            if (countAll > 0) {
                const prefix = usedEstimates ? '~' : '';
                html += `<div style="margin-top:10px; padding:8px; border:1px solid #20A8B1; background:rgba(32,168,177,0.1); border-radius:4px;">`;
                html += `<div style="display:flex; justify-content:space-between;"><span>Total XM Needed:</span><strong style="color:#ffce00">${prefix}${Math.round(totalMissingXM).toLocaleString()}</strong></div>`;
                html += `<div style="display:flex; justify-content:space-between;"><span>Total Daily Decay (15%):</span><strong style="color:#ffce00">${prefix}${Math.round(totalDailyDecay).toLocaleString()}</strong></div>`;
                if (usedEstimates) {
                    html += `<div style="font-size:10px; color:#aaa; margin-top:5px; text-align:right;">* Totals include estimated XM for portals without exact resonator data.</div>`;
                }
                html += `</div>`;
            }

            window.dialog({
                html: html,
                title: 'Recharge Watchlist',
                id: 'recharge-monitor-dialog',
                width: 760,
                buttons: {
                    'Sync History': function () { window.plugin.rechargeMonitor.scanActivityLog(); },
                    'About': function () { window.plugin.rechargeMonitor.showAbout(); },
                    'OK': function () { $(this).dialog('close'); }
                }
            });
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
        $('<style>').text('.recharge-table td,.recharge-table th{padding:4px;text-align:center;border-bottom:1px solid #20A8B1}.recharge-time-col{white-space:nowrap;min-width:130px}.recharge-group{margin-bottom:10px;border:1px solid #20A8B1;border-radius:4px;overflow:hidden}.recharge-group-header{display:flex;align-items:center;gap:8px;padding:6px 8px;background:rgba(32,168,177,0.12)}.recharge-group-toggle{font-weight:bold;flex:1}.recharge-group-count{color:#ffce00}.recharge-group-actions a{margin-left:8px}.recharge-groups-toolbar{margin-bottom:10px;text-align:right}.recharge-empty{color:#aaa;padding:10px 4px}.recharge-table select{width:100%;max-width:140px;background:#111;color:#ddd;border:1px solid #20A8B1}').appendTo('head');
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
