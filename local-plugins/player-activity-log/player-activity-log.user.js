// ==UserScript==
// @id             iitc-plugin-player-activity-log
// @name           IITC plugin: Player Activity Log
// @category       Info
// @version        0.5.4
// @namespace      https://github.com/mordenkainennn/ingress-intel-total-conversion
// @updateURL      https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/player-activity-log/player-activity-log.meta.js
// @downloadURL    https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/player-activity-log/player-activity-log.user.js
// @description    Logs player activities and stores them in localStorage.
// @include        https://intel.ingress.com/*
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
    if (typeof window.plugin !== 'function') window.plugin = function() {};

    // PLUGIN START ////////////////////////////////////////////////////////

    var changelog = [
      {
        version: '0.5.4',
        changes: [
            'NEW: Added a "Pause/Resume" button to toggle log collection.',
        ],
      },
      {
        version: '0.5.3',
        changes: [
            'NEW: Added per-player log deletion functionality.',
        ],
      },
    ];

    // use own namespace for plugin
    window.plugin.playerActivityLog = function () {};

    window.plugin.playerActivityLog.STORAGE_KEY = 'player-activity-log';
    window.plugin.playerActivityLog.INITIAL_DISPLAY_COUNT = 20;
    window.plugin.playerActivityLog.isLoggingEnabled = true;


    // Helper function for zero-padding
    function pad(number) {
        return (number < 10 ? '0' : '') + number;
    }

    // Function to format timestamp to YYYYMMDD HHMMSS
    function formatTimestamp(timestamp) {
        var d = new Date(timestamp);
        var year = d.getFullYear();
        var month = pad(d.getMonth() + 1); // getMonth() is 0-indexed
        var day = pad(d.getDate());
        var hours = pad(d.getHours());
        var minutes = pad(d.getMinutes());
        var seconds = pad(d.getSeconds());
        return `${year}${month}${day} ${hours}${minutes}${seconds}`;
    }

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
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.7); z-index: 2000; display: flex;
                align-items: center; justify-content: center;
            }
            .activity-log-modal-content {
                background: #202124; color: #f1f1f1; padding: 20px;
                border-radius: 8px; width: 80%; max-width: 800px;
                height: 80vh; display: flex; flex-direction: column;
                box-shadow: 0 5px 15px rgba(0,0,0,0.5);
            }
            .activity-log-modal-header {
                display: flex; justify-content: space-between; align-items: center;
                border-bottom: 1px solid #444; padding-bottom: 10px; margin-bottom: 10px;
            }
            .activity-log-modal-header h2 { margin: 0; font-size: 1.2em; flex-grow: 1; }
            .activity-log-header-buttons { display: flex; align-items: center; }
            .activity-log-header-button {
                margin-left: 10px; padding: 4px 8px; background-color: #4CAF50;
                color: white; border: none; border-radius: 4px; cursor: pointer;
            }
            .activity-log-header-button:hover { background-color: #45a049; }
            .activity-log-header-button.clear-all { background-color: #f44336; }
            .activity-log-header-button.clear-all:hover { background-color: #d32f2f; }
            .activity-log-header-button.paused { background-color: #FBC02D; } /* Yellow for paused */
            .activity-log-modal-close { cursor: pointer; font-size: 1.5em; line-height: 1; font-weight: bold; margin-left: 15px; }
            .activity-log-modal-body { display: flex; flex-grow: 1; min-height: 0; }
            .activity-log-player-list { width: 35%; border-right: 1px solid #444; padding-right: 10px; overflow-y: auto; }
            .activity-log-player-item {
                display: flex; justify-content: space-between; align-items: center;
                padding: 5px; cursor: pointer; border-radius: 4px;
            }
            .activity-log-player-item:hover { background-color: #313235; }
            .activity-log-player-item.selected { background-color: #4CAF50; color: white; }
            .activity-log-player-item .player-name-container { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .remove-player-icon {
                display: none; padding: 0 5px; color: #ff8888; font-weight: bold;
            }
            .activity-log-player-item:hover .remove-player-icon { display: inline; }
            .remove-player-icon:hover { color: #ff0000; }
            .activity-log-details { width: 65%; padding-left: 10px; overflow-y: auto; }
            .activity-log-entry { margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #333; }
            .activity-log-entry .portal-link { font-weight: bold; }
            .activity-log-entry .time { font-size: 0.9em; color: #ccc; }
            .activity-log-entry .activity-type { text-transform: uppercase; font-weight: bold; }
            .load-more-button {
                background-color: #4CAF50; color: white; padding: 10px 15px;
                border: none; border-radius: 4px; cursor: pointer;
                display: block; margin: 10px auto;
            }
            .load-more-button:hover { background-color: #45a049; }
            .res { color: #0088ff; }
            .enl { color: #00ff00; }
        `).appendTo('head');
    };

    window.plugin.playerActivityLog.displayLog = function() {
        $('.activity-log-modal-backdrop').remove(); // Close any existing dialog

        var modal = `
            <div class="activity-log-modal-backdrop">
                <div class="activity-log-modal-content">
                    <div class="activity-log-modal-header">
                        <h2>Player Activity Log</h2>
                        <div class="activity-log-header-buttons">
                            <button class="activity-log-header-button" id="activity-log-toggle-logging"></button>
                            <button class="activity-log-header-button" id="activity-log-export">Export CSV</button>
                            <button class="activity-log-header-button clear-all" id="activity-log-clear">Clear All</button>
                            <span class="activity-log-modal-close">&times;</span>
                        </div>
                    </div>
                    <div class="activity-log-modal-body">
                        <div class="activity-log-player-list"></div>
                        <div class="activity-log-details"><p>Select a player to view their activity.</p><br><p style="color:#ffce00;">Note: Data is volatile. Please export it regularly!</p></div>
                    </div>
                </div>
            </div>
        `;
        $(document.body).append(modal);

        window.plugin.playerActivityLog.updateToggleLoggingButton(); // Set initial button state

        var logData = JSON.parse(localStorage.getItem(window.plugin.playerActivityLog.STORAGE_KEY) || '{}');
        var playerListContainer = $('.activity-log-player-list');

        var playerNames = Object.keys(logData).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

        playerNames.forEach(function(name) {
            var player = logData[name];
            if (!player || !player.team) return;

            var teamClass = (player.team && player.team.toUpperCase() === 'RESISTANCE') ? 'res' : 'enl';
            var itemCount = player.activities ? player.activities.length : 0;

            var playerDiv = $(`<div class="activity-log-player-item" data-player="${name}"></div>`);
            var nameSpan = $(`<span class="player-name-container"><span class="${teamClass}">${name}</span> (${itemCount})</span>`);
            var removeIcon = $('<span class="remove-player-icon" title="Delete this player\'s logs">&times;</span>');

            removeIcon.on('click', function(e) {
                e.stopPropagation();
                window.plugin.playerActivityLog.removePlayerData(name);
            });

            playerDiv.append(nameSpan).append(removeIcon);

            playerDiv.on('click', function() {
                $('.activity-log-player-item.selected').removeClass('selected');
                $(this).addClass('selected');
                window.plugin.playerActivityLog.renderPlayerLog(name, logData);
            });
            playerListContainer.append(playerDiv);
        });

        // Event Handlers
        $('#activity-log-toggle-logging').on('click', window.plugin.playerActivityLog.toggleLogging);
        $('#activity-log-export').on('click', window.plugin.playerActivityLog.exportToCsv);
        $('#activity-log-clear').on('click', window.plugin.playerActivityLog.clearAllData);
        $('.activity-log-modal-backdrop, .activity-log-modal-close').on('click', function(e) {
            if ($(e.target).is('.activity-log-modal-backdrop, .activity-log-modal-close')) {
                $('.activity-log-modal-backdrop').remove();
            }
        });
    };

    window.plugin.playerActivityLog.toggleLogging = function() {
        var plugin = window.plugin.playerActivityLog;
        plugin.isLoggingEnabled = !plugin.isLoggingEnabled;
        plugin.updateToggleLoggingButton();
    };

    window.plugin.playerActivityLog.updateToggleLoggingButton = function() {
        var plugin = window.plugin.playerActivityLog;
        var button = $('#activity-log-toggle-logging');
        if (plugin.isLoggingEnabled) {
            button.text('Pause Logging').removeClass('paused');
        } else {
            button.text('Resume Logging').addClass('paused');
        }
    };

    window.plugin.playerActivityLog.removePlayerData = function(playerName) {
        if (confirm(`Are you sure you want to delete all logs for player "${playerName}"?`)) {
            var logData = JSON.parse(localStorage.getItem(window.plugin.playerActivityLog.STORAGE_KEY) || '{}');
            delete logData[playerName];
            localStorage.setItem(window.plugin.playerActivityLog.STORAGE_KEY, JSON.stringify(logData));

            if ($('.activity-log-modal-backdrop').length) {
                window.plugin.playerActivityLog.displayLog();
            }
        }
    };

    window.plugin.playerActivityLog.exportToCsv = function() {
        var logData = JSON.parse(localStorage.getItem(window.plugin.playerActivityLog.STORAGE_KEY) || '{}');
        var allActivities = [];

        for (var playerName in logData) {
            var player = logData[playerName];
            if (player.activities) {
                player.activities.forEach(function(act) {
                    allActivities.push({ player: playerName, faction: player.team, ...act });
                });
            }
        }

        allActivities.sort((a, b) => a.time - b.time);

        var csvContent = "Timestamp,Player,Faction,Activity,Portal Name,Portal Lat,Portal Lng\n";

        function escapeCsvField(field) {
            if (field === undefined || field === null) return '';
            var str = String(field);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        }

        allActivities.forEach(function(act) {
            var row = [
                formatTimestamp(act.time),
                escapeCsvField(act.player),
                escapeCsvField(act.faction),
                escapeCsvField(act.activity),
                escapeCsvField(act.portal.name),
                act.portal.lat,
                act.portal.lng
            ].join(',');
            csvContent += row + "\n";
        });

        var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        var link = document.createElement("a");
        var url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "iitc-activity-log.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    window.plugin.playerActivityLog.clearAllData = function() {
        if (confirm("Are you sure you want to delete all activity logs? This action cannot be undone.")) {
            localStorage.removeItem(window.plugin.playerActivityLog.STORAGE_KEY);
            if ($('.activity-log-modal-backdrop').length) {
                window.plugin.playerActivityLog.displayLog();
            }
        }
    };

    window.plugin.playerActivityLog.renderPlayerLog = function(playerName, logData, offset = 0) {
        var detailsContainer = $('.activity-log-details');
        if (offset === 0) {
            detailsContainer.empty();
        }

        detailsContainer.find('.load-more-button').remove();

        var player = logData[playerName];
        if (!player || !player.activities || player.activities.length === 0) {
            detailsContainer.html('<p>No activities logged for this player.</p>');
            return;
        }

        var activitiesToRender = player.activities.slice(offset, offset + window.plugin.playerActivityLog.INITIAL_DISPLAY_COUNT);

        activitiesToRender.forEach(function(act) {
            var entryDiv = $('<div class="activity-log-entry"></div>');
            var portalLink = $(`<a class="portal-link">${act.portal.name}</a>`).on('click', function() {
                window.selectPortalByLatLng(act.portal.lat, act.portal.lng);
            });
            var formattedTime = formatTimestamp(act.time);

            entryDiv.append($('<div class="activity-type">').text(act.activity));
            entryDiv.append(portalLink);
            entryDiv.append($('<div class="time">').text(formattedTime));

            detailsContainer.append(entryDiv);
        });

        var newOffset = offset + window.plugin.playerActivityLog.INITIAL_DISPLAY_COUNT;
        if (player.activities.length > newOffset) {
            var loadMoreButton = $('<button class="load-more-button">Load More</button>');
            loadMoreButton.on('click', function() {
                window.plugin.playerActivityLog.renderPlayerLog(playerName, logData, newOffset);
            });
            detailsContainer.append(loadMoreButton);
        }
    };

    window.plugin.playerActivityLog.getActivityType = function(plainText) {
        if (plainText.includes('captured')) return 'captured';
        if (plainText.includes('deployed a Resonator')) return 'deployed';
        if (plainText.includes('destroyed a Resonator')) return 'destroyed';
        if (plainText.includes('linked from')) return 'linked';
        if (plainText.includes('created a Control Field')) return 'created field';
        if (plainText.includes('destroyed the Link')) return null;
        if (plainText.includes('destroyed a Control Field')) return null;
        return null;
    };

    window.plugin.playerActivityLog.handleCommData = function (data) {
      if (!window.plugin.playerActivityLog.isLoggingEnabled) return;

      var limit = Date.now() - 3 * 24 * 60 * 60 * 1000;

      data.result.forEach(function (msg) {
        var guid = msg[0], timestamp = msg[1], plext = msg[2].plext;
        if (timestamp < limit) return;

        var playerName, playerTeam, portalName, portalAddress, portalLat, portalLng, activityType;

        plext.markup.forEach(function (markup) {
          switch (markup[0]) {
            case 'TEXT':
              if (!activityType) activityType = window.plugin.playerActivityLog.getActivityType(markup[1].plain);
              break;
            case 'PLAYER':
              playerName = markup[1].plain;
              playerTeam = markup[1].team;
              break;
            case 'PORTAL':
              portalName = markup[1].name;
              portalAddress = markup[1].address;
              portalLat = markup[1].latE6 / 1E6;
              portalLng = markup[1].lngE6 / 1E6;
              break;
          }
        });

        if (!playerName || !playerTeam || playerTeam === 'MACHINA' || !activityType || !portalName) {
          return;
        }

        var activity = {
          activity: activityType,
          portal: { name: portalName, address: portalAddress, lat: portalLat, lng: portalLng },
          time: timestamp
        };
        window.plugin.playerActivityLog.storePlayerActivity(playerName, playerTeam, activity, guid);
      });
    };

    window.plugin.playerActivityLog.storePlayerActivity = function(playerName, playerTeam, activity, guid) {
        var storedData = localStorage.getItem(window.plugin.playerActivityLog.STORAGE_KEY);
        var log = storedData ? JSON.parse(storedData) : {};

        if (!log[playerName] || Array.isArray(log[playerName])) {
            log[playerName] = { team: playerTeam, activities: [] };
        }
        log[playerName].team = playerTeam;

        var activities = log[playerName].activities;
        if (activities.some(act => act.guid === guid)) return;

        activity.guid = guid;
        activities.push(activity);
        activities.sort((a, b) => b.time - a.time);

        localStorage.setItem(window.plugin.playerActivityLog.STORAGE_KEY, JSON.stringify(log));
    };

    var setup = window.plugin.playerActivityLog.setup;
    setup.info = plugin_info;
    plugin_info.changelog = changelog;

    // PLUGIN END //////////////////////////////////////////////////////////

    if (!window.bootPlugins) window.bootPlugins = [];
    window.bootPlugins.push(setup);
    if (window.iitcLoaded && typeof setup === 'function') setup();

} // wrapper end

// inject plugin into page
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) info.script = { version: GM_info.script.version, name: GM_info.script.name, description: plugin_info.description };
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);

