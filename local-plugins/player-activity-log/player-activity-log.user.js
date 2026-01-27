// ==UserScript==
// @id             iitc-plugin-player-activity-log
// @name           IITC plugin: Player Activity Log
// @category       Info
// @version        0.2.0
// @namespace      https://github.com/mordenkainennn/ingress-intel-total-conversion
// @updateURL      https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/player-activity-log/player-activity-log.user.js
// @downloadURL    https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/player-activity-log/player-activity-log.user.js
// @description    Logs player activities (capture, deploy, destroy) and stores the last 20 events for each player in localStorage.
// @include        https://intel.ingress.com/*
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
    if (typeof window.plugin !== 'function') window.plugin = function() {};

    // PLUGIN START ////////////////////////////////////////////////////////

    var changelog = [
      {
        version: '0.2.0',
        changes: [
            'NEW: Log tracking duration extended to 3 days.',
            'FIX: Implemented robust activity storage. Logs are now de-duplicated by GUID, sorted by time, and then truncated, ensuring the latest 20 activities are always correctly stored regardless of processing order.'
        ],
      },
      {
        version: '0.1.3',
        changes: [
            'FIX: Dialog content now auto-refreshes every 2 seconds.',
            'FIX: Corrected message filtering to avoid incorrectly skipping "destroy" events.'
        ],
      },
      {
        version: '0.1.2',
        changes: ['FIX: Always read from localStorage before writing to prevent stale data.'],
      },
      {
        version: '0.1.1',
        changes: ['FIX: Use standard IITC plugin bootstrap to ensure toolbox link is added correctly.'],
      },
      {
        version: '0.1.0',
        changes: ['Initial release', 'Added a toolbox link to show raw log data in a modern dialog.'],
      },
    ];

    // use own namespace for plugin
    window.plugin.playerActivityLog = function () {};

    window.plugin.playerActivityLog.STORAGE_KEY = 'player-activity-log';
    window.plugin.playerActivityLog.MAX_ACTIVITIES = 20;
    window.plugin.playerActivityLog.refreshTimer = null;

    window.plugin.playerActivityLog.setup = function () {
      window.plugin.playerActivityLog.addCss();
      window.plugin.playerActivityLog.addControl();

      window.addHook('publicChatDataAvailable', window.plugin.playerActivityLog.handleCommData);

      console.log('IITC plugin: Player Activity Log loaded.');
    };

    window.plugin.playerActivityLog.addControl = function() {
        $('#toolbox').append(' <a onclick="window.plugin.playerActivityLog.displayLog()" title="Display player activity log.">Activity Log</a>');
    };

    window.plugin.playerActivityLog.addCss = function() {
        $('<style>').prop('type', 'text/css').html(`
            .activity-log-modal-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.7);
                z-index: 2000;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .activity-log-modal-content {
                background: #202124;
                color: #f1f1f1;
                padding: 20px;
                border-radius: 8px;
                width: 80%;
                max-width: 800px;
                max-height: 80vh;
                display: flex;
                flex-direction: column;
                box-shadow: 0 5px 15px rgba(0,0,0,0.5);
            }
            .activity-log-modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid #444;
                padding-bottom: 10px;
                margin-bottom: 10px;
            }
            .activity-log-modal-header h2 {
                margin: 0;
                font-size: 1.2em;
            }
            .activity-log-modal-close {
                cursor: pointer;
                font-size: 1.5em;
                line-height: 1;
                font-weight: bold;
            }
            .activity-log-modal-body {
                overflow-y: auto;
                flex-grow: 1;
            }
            .activity-log-modal-body pre {
                white-space: pre-wrap;
                word-wrap: break-word;
                font-family: monospace;
                font-size: 0.9em;
                background: #2d2d2d;
                padding: 10px;
                border-radius: 4px;
            }
        `).appendTo('head');
    };

    window.plugin.playerActivityLog.displayLog = function() {
        // Clear any existing timer and remove modal
        if (window.plugin.playerActivityLog.refreshTimer) {
            clearInterval(window.plugin.playerActivityLog.refreshTimer);
            window.plugin.playerActivityLog.refreshTimer = null;
        }
        $('.activity-log-modal-backdrop').remove();

        var modal = `
            <div class="activity-log-modal-backdrop">
                <div class="activity-log-modal-content">
                    <div class="activity-log-modal-header">
                        <h2>Player Activity Log (Raw Data)</h2>
                        <span class="activity-log-modal-close">&times;</span>
                    </div>
                    <div class="activity-log-modal-body">
                        <pre><code></code></pre>
                    </div>
                </div>
            </div>
        `;
        $(document.body).append(modal);

        function refreshLog() {
            var logData = localStorage.getItem(window.plugin.playerActivityLog.STORAGE_KEY);
            var formattedData = "No activity logged yet.";
            if (logData) {
                try {
                    var parsedData = JSON.parse(logData);
                    formattedData = JSON.stringify(parsedData, null, 2);
                } catch (e) {
                    formattedData = "Error parsing log data:\n" + logData;
                }
            }
            $('.activity-log-modal-body pre code').text(formattedData);
        }

        refreshLog(); // Initial load
        window.plugin.playerActivityLog.refreshTimer = setInterval(refreshLog, 2000); // Refresh every 2 seconds

        $('.activity-log-modal-backdrop, .activity-log-modal-close').on('click', function(e) {
            if (e.target === this) {
                clearInterval(window.plugin.playerActivityLog.refreshTimer);
                window.plugin.playerActivityLog.refreshTimer = null;
                $('.activity-log-modal-backdrop').remove();
            }
        });

        $('.activity-log-modal-content').on('click', function(e) {
            e.stopPropagation();
        });
    };


    window.plugin.playerActivityLog.getActivityType = function(plainText) {
        if (plainText.includes('captured')) return 'captured';
        if (plainText.includes('deployed a Resonator')) return 'deployed';
        if (plainText.includes('destroyed a Resonator')) return 'destroyed';
        // Add more specific checks if needed
        if (plainText.includes('destroyed the Link')) return null; // Player is at source of link
        if (plainText.includes('destroyed a Control Field')) return null; // Player is at source of field

        return null;
    };


    window.plugin.playerActivityLog.handleCommData = function (data) {
      var limit = Date.now() - 3 * 24 * 60 * 60 * 1000; // Process data from the last 3 days

      data.result.forEach(function (msg) {
        // msg = [guid, timestamp, plext]
        var guid = msg[0];
        var timestamp = msg[1];
        if (timestamp < limit) return; // Skip old data

        var plext = msg[2].plext;
        var
          playerName,
          portalName,
          portalAddress,
          portalLat,
          portalLng,
          activityType;

        plext.markup.forEach(function (markup) {
          switch (markup[0]) {
            case 'TEXT':
              var plain = markup[1].plain;
              if (!activityType) { // Only set activity if not already found
                 activityType = window.plugin.playerActivityLog.getActivityType(plain);
              }
              break;
            case 'PLAYER':
              playerName = markup[1].plain;
              break;
            case 'PORTAL':
              portalName = markup[1].name;
              portalAddress = markup[1].address;
              portalLat = markup[1].latE6 / 1E6;
              portalLng = markup[1].lngE6 / 1E6;
              break;
          }
        });

        if (!playerName || !activityType || !portalName) {
          return;
        }

        var activity = {
          activity: activityType,
          portal: {
            name: portalName,
            address: portalAddress,
            lat: portalLat,
            lng: portalLng
          },
          time: timestamp
        };

        window.plugin.playerActivityLog.storePlayerActivity(playerName, activity, guid);
      });
    };

    window.plugin.playerActivityLog.storePlayerActivity = function(playerName, activity, guid) {
        var storedData = localStorage.getItem(window.plugin.playerActivityLog.STORAGE_KEY);
        var log = storedData ? JSON.parse(storedData) : {};

        if (!log[playerName]) {
            log[playerName] = [];
        }

        // 1. De-duplicate: Check if GUID already exists
        var alreadyExists = log[playerName].some(function(existingActivity) {
            return existingActivity.guid === guid;
        });

        if (alreadyExists) {
            return; // Don't add duplicate
        }

        // 2. Add new activity
        activity.guid = guid;
        log[playerName].push(activity);

        // 3. Sort by time, descending (newest first)
        log[playerName].sort(function(a, b) {
            return b.time - a.time;
        });

        // 4. Truncate to the latest MAX_ACTIVITIES
        if (log[playerName].length > window.plugin.playerActivityLog.MAX_ACTIVITIES) {
            log[playerName] = log[playerName].slice(0, window.plugin.playerActivityLog.MAX_ACTIVITIES);
        }

        // 5. Save back to localStorage
        localStorage.setItem(window.plugin.playerActivityLog.STORAGE_KEY, JSON.stringify(log));
    };

    var setup = window.plugin.playerActivityLog.setup;
    setup.info = plugin_info;
    plugin_info.changelog = changelog;

    // PLUGIN END //////////////////////////////////////////////////////////


    if (!window.bootPlugins) window.bootPlugins = [];
    window.bootPlugins.push(setup);
    // if IITC has already booted, immediately run the 'setup' function
    if (window.iitcLoaded && typeof setup === 'function') setup();

} // wrapper end


// inject plugin into page
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) info.script = { version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description };
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);
