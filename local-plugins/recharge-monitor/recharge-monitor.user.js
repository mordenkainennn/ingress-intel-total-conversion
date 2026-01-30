// ==UserScript==
// @id             iitc-plugin-recharge-monitor
// @name           IITC plugin: Recharge Monitor & Decay Predictor
// @category       Info
// @version        0.2.1
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
    plugin_info.dateTimeVersion = '202401300004';
    plugin_info.pluginId = 'recharge-monitor';

    var changelog = [
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
            const health = p.options.data.health;
            pData.lastSeenHealth = health;
            pData.lastSeenTime = Date.now();
            pData.name = p.options.data.title;
            self.save();
            return health;
        }

        const hours = (Date.now() - pData.lastSeenTime) / 36e5;
        const days = Math.floor(hours / 24);
        const predicted = pData.lastSeenHealth - days * 15;
        return predicted > 0 ? predicted : 0;
    };

    /* ---------------- Portal Details Page ---------------- */

    self.setupPortals = function () {
        window.addHook('portalDetailsUpdated', function (data) {
            const guid = data.guid;
            $('#recharge-monitor-controls').remove();

            const watched = self.data[guid] !== undefined;
            const $box = $('<div id="recharge-monitor-controls" style="padding:5px;border-top:1px solid #20A8B1;"></div>');

            const $btn = $('<a>')
                .text(watched ? '🛑 Stop Monitoring' : '🛡️ Add to Watchlist')
                .css('cursor', 'pointer')
                .on('click', () => self.toggleWatch(guid));

            $box.append($btn);

            if (watched) {
                const $edit = $('<a>')
                    .text(' | 🕒 Edit Deploy Time')
                    .css('cursor', 'pointer')
                    .on('click', () => self.editTime(guid));
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
        }
        self.save();
        if (window.selectedPortal === guid) window.renderPortalDetails(guid);
    };

    self.editTime = function (guid) {
        const d = new Date(self.data[guid].captureTime);
        const input = prompt(
            'Please enter the deployment time (YYYY-MM-DD HH:MM)',
            d.toISOString().slice(0, 16).replace('T', ' ')
        );
        if (!input) return;
        const t = new Date(input).getTime();
        if (!isNaN(t)) {
            self.data[guid].captureTime = t;
            self.save();
            alert('Time updated');
        }
    };

    /* ---------------- List Window ---------------- */

    self.showList = function () {
        let html = `
      <table class="recharge-table" style="width:100%">
        <tr><th>Portal</th><th>Status</th><th>Health</th><th>Action</th></tr>
    `;

        for (const guid in self.data) {
            const p = self.data[guid];
            const h = self.calculateHealth(guid);
            const c = h <= 30 ? '#f00' : '#0f0';
            const lat = p.latlng.lat ?? p.latlng[0];
            const lng = p.latlng.lng ?? p.latlng[1];

            html += `
        <tr>
          <td><a onclick="window.zoomToAndShowPortal('${guid}',[${lat},${lng}]);">${p.name}</a></td>
          <td>${window.portals[guid] ? 'In View' : 'Predicted'}</td>
          <td style="color:${c};font-weight:bold">${h.toFixed(0)}%</td>
          <td><a onclick="window.plugin.rechargeMonitor.toggleWatch('${guid}')">Del</a></td>
        </tr>
      `;
        }

        html += '</table>';

        window.dialog({
            html,
            title: 'Recharge Watchlist',
            id: 'recharge-monitor-dialog',
            width: 420
        });
    };

    /* ---------------- Toolbox Button and Loop ---------------- */

    function addToolboxButton() {
        if (!window.IITC || !IITC.toolbox || !IITC.toolbox.addButton) return false;
        if ($('#recharge-monitor-btn').length) return true;

        IITC.toolbox.addButton({
            id: 'recharge-monitor-btn',
            label: 'Recharge Mon',
            title: 'Show Recharge Watchlist',
            action: self.showList
        });
        return true;
    }

    self.loop = function () {
        let count = 0;
        for (const guid in self.data) {
            if (self.calculateHealth(guid) <= 30) count++;
        }
        const $btn = $('#recharge-monitor-btn');
        if (!$btn.length) return;

        if (count > 0) {
            $btn.css('color', '#ff4500').text(`⚠️ Recharge (${count})`);
        } else {
            $btn.css('color', '').text('Recharge Mon');
        }
    };

    /* ---------------- Setup ---------------- */

    const setup = function () {
        self.load();
        self.setupPortals();

        let tries = 0;
        const t = setInterval(() => {
            tries++;
            if (addToolboxButton() || tries > 20) clearInterval(t);
        }, 500);

        self.loop();
        setInterval(self.loop, 60000);

        $('<style>')
            .text('.recharge-table td{padding:4px;text-align:center;border-bottom:1px solid #20A8B1}')
            .appendTo('head');

        console.log('Recharge Monitor: loaded');
    };

    setup.info = plugin_info;
    window.bootPlugins = window.bootPlugins || [];
    window.bootPlugins.push(setup);
    if (window.iitcLoaded) setup();
}

/* ---------------- Injection ---------------- */

const script = document.createElement('script');
script.appendChild(
    document.createTextNode('(' + wrapper + ')({});')
);
(document.body || document.head || document.documentElement).appendChild(script);
