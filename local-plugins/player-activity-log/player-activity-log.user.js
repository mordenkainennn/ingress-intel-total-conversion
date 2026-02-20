// ==UserScript==
// @id             iitc-plugin-player-activity-log
// @name           IITC plugin: Player Activity Log
// @category       Info
// @version        0.8.1
// @namespace      https://github.com/mordenkainennn/ingress-intel-total-conversion
// @updateURL      https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/player-activity-log/player-activity-log.meta.js
// @downloadURL    https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/player-activity-log/player-activity-log.user.js
// @description    Logs player activities and stores them in localStorage.
// @include        https://intel.ingress.com/*
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
    // Ensure plugin framework is there, even if iitc is not yet loaded
    if (typeof window.plugin !== 'function') window.plugin = function () { };

    // PLUGIN START ////////////////////////////////////////////////////////

    // use own namespace for plugin
    window.plugin.playerActivityLog = function () { };

    var changelog = [
        {
            version: '0.8.1',
            changes: [
                'NEW: Added import preview/confirmation prompt before writing data to localStorage.',
            ],
        },
        {
            version: '0.8.0',
            changes: [
                'NEW: Added JSON export and import.',
                'NEW: Added import merge with de-duplication (by guid, with event fingerprint fallback).',
                'UPD: Kept CSV export and added CSV import support.',
            ],
        },
        {
            version: '0.7.10',
            changes: [
                'FIX: Restored dashed trail rendering to match player-activity-tracker style.',
            ],
        },
        {
            version: '0.7.9',
            changes: [
                'UPD: Removed the 3-day cutoff and now records all activity messages provided by Intel COMM.',
            ],
        },
        {
            version: '0.7.8',
            changes: [
                'UPD: Draw player trails by connecting all loaded portal events in chronological order.',
                'UPD: Disabled marker age-based fading; trail markers now stay fully visible.',
            ],
        },
        {
            version: '0.7.7',
            changes: [
                'FIX: Added backward-compatible log data normalization so legacy stored player logs are visible again.',
            ],
        },
        {
            version: '0.7.6',
            changes: [
                'FIX: Repaired player ID filter by normalizing filter values as strings and handling input events reliably.',
            ],
        },
        {
            version: '0.7.5',
            changes: [
                'NEW: Added a search box to filter the player list by name.',
                'NEW: Added a warning message regarding potential conflicts with the official "Player activity tracker" plugin.'
            ],
        },
        {
            version: '0.7.4',
            changes: [
                'NEW: Integrated player activity trails feature from player-activity-tracker.',
                'NEW: Added UI to select and display player movement trails on the map (max 3 players).',
                'NEW: Added "Draw Trails" and "Clear Trails" buttons to activity log modal.',
                'FIX: Corrected portal logging for "linked from" activities (records origin portal).',
                'UPD: Resolved marker display issue by adjusting icon URL handling (removed retina URL for compatibility).',
            ],
        },
        {
            version: '0.7.3',
            changes: [
                'FIX: Restored standard IITC wrapper injection to fix missing toolbox link.',
            ],
        },
        {
            version: '0.7.0',
            changes: [
                'FIX: Reverted to legacy plugin structure to permanently fix toolbox link loading issue.',
                'NEW: All features (pause, delete, export, etc.) have been retained in the new structure.',
            ],
        },
        {
            version: '0.5.5',
            changes: ['FIX: Attempted to fix toolbox link using vanilla JS.'],
        },
    ];

    window.plugin.playerActivityLog.STORAGE_KEY = 'player-activity-log';
    window.plugin.playerActivityLog.INITIAL_DISPLAY_COUNT = 20;

    // Constants for trail drawing
    window.plugin.playerActivityLog.PLAYER_TRAIL_MAX_TIME = 3 * 60 * 60 * 1000;
    window.plugin.playerActivityLog.PLAYER_TRAIL_MIN_OPACITY = 0.3;
    window.plugin.playerActivityLog.PLAYER_TRAIL_LINE_COLOUR = '#FF00FD';
    window.plugin.playerActivityLog.PLAYER_TRAIL_MAX_DISPLAY_EVENTS = 10;
    window.plugin.playerActivityLog.isLoggingEnabled = true;
    window.plugin.playerActivityLog.playersToTrack = [];

    // Helper function for zero-padding
    function pad(number) {
        return (number < 10 ? '0' : '') + number;
    }

    // Function to format timestamp to YYYYMMDD HHMMSS
    function formatTimestamp(timestamp) {
        var d = new Date(timestamp);
        var year = d.getFullYear();
        var month = pad(d.getMonth() + 1);
        var day = pad(d.getDate());
        var hours = pad(d.getHours());
        var minutes = pad(d.getMinutes());
        var seconds = pad(d.getSeconds());
        return `${year}${month}${day} ${hours}${minutes}${seconds}`;
    }

    function parseTimestamp(value) {
        var raw = String(value === undefined || value === null ? '' : value).trim();
        if (!raw) return NaN;

        if (/^\d{8}\s\d{6}$/.test(raw)) {
            var year = Number(raw.slice(0, 4));
            var month = Number(raw.slice(4, 6)) - 1;
            var day = Number(raw.slice(6, 8));
            var hour = Number(raw.slice(9, 11));
            var minute = Number(raw.slice(11, 13));
            var second = Number(raw.slice(13, 15));
            return new Date(year, month, day, hour, minute, second).getTime();
        }

        if (/^\d+$/.test(raw)) {
            var num = Number(raw);
            if (raw.length === 10) return num * 1000;
            return num;
        }

        var parsed = Date.parse(raw);
        return isNaN(parsed) ? NaN : parsed;
    }

    window.plugin.playerActivityLog.normalizeTeam = function (team) {
        if (team === 'RESISTANCE' || team === 'RES' || team === 1 || team === '1') return 'RESISTANCE';
        if (team === 'ENLIGHTENED' || team === 'ENL' || team === 2 || team === '2') return 'ENLIGHTENED';
        return '';
    };

    window.plugin.playerActivityLog.normalizeActivity = function (act) {
        if (!act || typeof act !== 'object' || !act.portal || typeof act.portal !== 'object') return null;
        var lat = Number(act.portal.lat);
        var lng = Number(act.portal.lng);
        var time = Number(act.time);
        if (!isFinite(lat) || !isFinite(lng) || !isFinite(time)) return null;

        return {
            activity: String(act.activity || ''),
            portal: {
                name: String(act.portal.name || '(unknown portal)'),
                address: String(act.portal.address || ''),
                lat: lat,
                lng: lng,
            },
            time: time,
            guid: act.guid,
        };
    };

    window.plugin.playerActivityLog.normalizeLogData = function (rawLogData) {
        var changed = false;
        var normalizedLogData = {};

        if (!rawLogData || typeof rawLogData !== 'object' || Array.isArray(rawLogData)) {
            return { logData: normalizedLogData, changed: true };
        }

        Object.keys(rawLogData).forEach(function (playerName) {
            var rawRecord = rawLogData[playerName];
            var team = '';
            var rawActivities = [];

            if (Array.isArray(rawRecord)) {
                // legacy format: { playerName: [activities...] }
                rawActivities = rawRecord;
                changed = true;
            } else if (rawRecord && typeof rawRecord === 'object') {
                var normalizedTeam = window.plugin.playerActivityLog.normalizeTeam(rawRecord.team);
                if (normalizedTeam !== rawRecord.team) changed = true;
                team = normalizedTeam;

                if (Array.isArray(rawRecord.activities)) {
                    rawActivities = rawRecord.activities;
                } else if (Array.isArray(rawRecord.events)) {
                    // fallback if events were stored under another key
                    rawActivities = rawRecord.events;
                    changed = true;
                } else {
                    rawActivities = [];
                    if (rawRecord.activities !== undefined || rawRecord.events !== undefined) changed = true;
                }
            } else {
                changed = true;
                return;
            }

            var activities = rawActivities
                .map(window.plugin.playerActivityLog.normalizeActivity)
                .filter(Boolean)
                .sort((a, b) => b.time - a.time);

            if (activities.length !== rawActivities.length) changed = true;
            normalizedLogData[playerName] = { team: team, activities: activities };
        });

        return { logData: normalizedLogData, changed: changed };
    };

    window.plugin.playerActivityLog.loadLogData = function () {
        var rawLogData = JSON.parse(localStorage.getItem(window.plugin.playerActivityLog.STORAGE_KEY) || '{}');
        var normalized = window.plugin.playerActivityLog.normalizeLogData(rawLogData);
        if (normalized.changed) {
            localStorage.setItem(window.plugin.playerActivityLog.STORAGE_KEY, JSON.stringify(normalized.logData));
        }
        return normalized.logData;
    };

    window.plugin.playerActivityLog.countActivities = function (logData) {
        var count = 0;
        Object.keys(logData || {}).forEach(function (playerName) {
            var player = logData[playerName];
            if (player && Array.isArray(player.activities)) {
                count += player.activities.length;
            }
        });
        return count;
    };

    window.plugin.playerActivityLog.downloadFile = function (fileName, content, mimeType) {
        var blob = new Blob([content], { type: mimeType });
        var link = document.createElement('a');
        var url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    window.plugin.playerActivityLog.csvSplitLine = function (line) {
        var fields = [];
        var current = '';
        var inQuotes = false;

        for (var i = 0; i < line.length; i++) {
            var ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch === ',' && !inQuotes) {
                fields.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
        fields.push(current);
        return fields;
    };

    window.plugin.playerActivityLog.parseCsvToLogData = function (text) {
        var plugin = window.plugin.playerActivityLog;
        var lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(function (line) { return line.trim() !== ''; });
        if (lines.length < 2) {
            throw new Error('CSV is empty or missing rows.');
        }

        var headers = plugin.csvSplitLine(lines[0]).map(function (header) { return header.trim().toLowerCase(); });
        var findHeaderIndex = function (candidates) {
            for (var i = 0; i < candidates.length; i++) {
                var idx = headers.indexOf(candidates[i]);
                if (idx !== -1) return idx;
            }
            return -1;
        };

        var timestampIdx = findHeaderIndex(['timestamp', 'time']);
        var playerIdx = findHeaderIndex(['player', 'player name', 'player id']);
        var factionIdx = findHeaderIndex(['faction', 'team']);
        var activityIdx = findHeaderIndex(['activity']);
        var portalNameIdx = findHeaderIndex(['portal name', 'portal']);
        var portalLatIdx = findHeaderIndex(['portal lat', 'lat']);
        var portalLngIdx = findHeaderIndex(['portal lng', 'lng', 'lon', 'long']);
        var guidIdx = findHeaderIndex(['guid']);

        if (timestampIdx === -1 || playerIdx === -1 || activityIdx === -1 || portalLatIdx === -1 || portalLngIdx === -1) {
            throw new Error('CSV headers are invalid. Required: Timestamp, Player, Activity, Portal Lat, Portal Lng.');
        }

        var logData = {};
        var parsedRows = 0;
        var skippedRows = 0;

        for (var lineNo = 1; lineNo < lines.length; lineNo++) {
            var fields = plugin.csvSplitLine(lines[lineNo]);
            var playerName = String(fields[playerIdx] || '').trim();
            var activityType = String(fields[activityIdx] || '').trim();
            var portalName = String(fields[portalNameIdx] || '').trim();
            var portalLat = Number(String(fields[portalLatIdx] || '').trim());
            var portalLng = Number(String(fields[portalLngIdx] || '').trim());
            var team = plugin.normalizeTeam(fields[factionIdx] || '');
            var time = parseTimestamp(fields[timestampIdx]);
            var guid = guidIdx !== -1 ? String(fields[guidIdx] || '').trim() : '';

            if (!playerName || !activityType || !isFinite(portalLat) || !isFinite(portalLng) || !isFinite(time)) {
                skippedRows++;
                continue;
            }

            if (!logData[playerName]) {
                logData[playerName] = { team: team, activities: [] };
            } else if (!logData[playerName].team && team) {
                logData[playerName].team = team;
            }

            logData[playerName].activities.push({
                activity: activityType,
                portal: {
                    name: portalName || '(unknown portal)',
                    address: '',
                    lat: portalLat,
                    lng: portalLng,
                },
                time: time,
                guid: guid || undefined,
            });
            parsedRows++;
        }

        return {
            logData: logData,
            parsedRows: parsedRows,
            skippedRows: skippedRows,
        };
    };

    window.plugin.playerActivityLog.convertEventsToLogData = function (events) {
        var plugin = window.plugin.playerActivityLog;
        var logData = {};

        (events || []).forEach(function (event) {
            if (!event || typeof event !== 'object') return;

            var playerName = String(event.player || event.playerName || '').trim();
            var team = plugin.normalizeTeam(event.team || event.faction || event.playerTeam || '');
            var activityType = String(event.activity || event.type || '').trim();
            var time = parseTimestamp(event.time || event.timestamp);
            var portalObj = event.portal && typeof event.portal === 'object' ? event.portal : {};
            var portalName = String(portalObj.name || event.portalName || '').trim();
            var portalLat = Number(portalObj.lat !== undefined ? portalObj.lat : event.portalLat);
            var portalLng = Number(portalObj.lng !== undefined ? portalObj.lng : event.portalLng);
            var portalAddress = String(portalObj.address || event.portalAddress || '');
            var guid = event.guid ? String(event.guid) : undefined;

            if (!playerName || !activityType || !isFinite(time) || !isFinite(portalLat) || !isFinite(portalLng)) return;

            if (!logData[playerName]) {
                logData[playerName] = { team: team, activities: [] };
            } else if (!logData[playerName].team && team) {
                logData[playerName].team = team;
            }

            logData[playerName].activities.push({
                activity: activityType,
                portal: {
                    name: portalName || '(unknown portal)',
                    address: portalAddress,
                    lat: portalLat,
                    lng: portalLng,
                },
                time: time,
                guid: guid,
            });
        });

        return logData;
    };

    window.plugin.playerActivityLog.extractImportLogData = function (payload) {
        var plugin = window.plugin.playerActivityLog;

        if (Array.isArray(payload)) {
            return plugin.convertEventsToLogData(payload);
        }
        if (!payload || typeof payload !== 'object') {
            throw new Error('Unsupported import payload.');
        }
        if (Array.isArray(payload.events)) {
            return plugin.convertEventsToLogData(payload.events);
        }
        if (payload.players && typeof payload.players === 'object') {
            return payload.players;
        }
        if (payload.logData && typeof payload.logData === 'object') {
            return payload.logData;
        }

        var keys = Object.keys(payload);
        var looksLikePlayerMap = keys.length > 0 && keys.every(function (key) {
            var value = payload[key];
            return Array.isArray(value) || (value && typeof value === 'object' && (Array.isArray(value.activities) || Array.isArray(value.events) || value.team !== undefined));
        });

        if (looksLikePlayerMap) {
            return payload;
        }
        throw new Error('Unsupported JSON structure.');
    };

    window.plugin.playerActivityLog.makeActivityFingerprint = function (playerName, activity) {
        var portal = activity && activity.portal ? activity.portal : {};
        var lat = Number(portal.lat);
        var lng = Number(portal.lng);
        var latKey = isFinite(lat) ? lat.toFixed(6) : '';
        var lngKey = isFinite(lng) ? lng.toFixed(6) : '';
        return [
            String(playerName || ''),
            Number(activity && activity.time),
            String(activity && activity.activity || ''),
            latKey,
            lngKey,
        ].join('|');
    };

    window.plugin.playerActivityLog.mergeLogData = function (baseLogData, incomingLogData) {
        var plugin = window.plugin.playerActivityLog;
        var merged = plugin.normalizeLogData(baseLogData).logData;
        var incoming = plugin.normalizeLogData(incomingLogData).logData;
        var guidSet = new Set();
        var fingerprintSet = new Set();
        var importedCount = plugin.countActivities(incoming);
        var addedCount = 0;
        var skippedCount = 0;

        Object.keys(merged).forEach(function (playerName) {
            var player = merged[playerName];
            if (!player || !Array.isArray(player.activities)) return;
            player.activities.forEach(function (activity) {
                if (activity.guid) guidSet.add(activity.guid);
                fingerprintSet.add(plugin.makeActivityFingerprint(playerName, activity));
            });
        });

        Object.keys(incoming).forEach(function (playerName) {
            var sourcePlayer = incoming[playerName];
            if (!sourcePlayer || !Array.isArray(sourcePlayer.activities)) return;

            if (!merged[playerName]) {
                merged[playerName] = { team: plugin.normalizeTeam(sourcePlayer.team), activities: [] };
            } else if (!merged[playerName].team && sourcePlayer.team) {
                merged[playerName].team = plugin.normalizeTeam(sourcePlayer.team);
            }

            sourcePlayer.activities.forEach(function (activity) {
                if (activity.guid && guidSet.has(activity.guid)) {
                    skippedCount++;
                    return;
                }

                var fingerprint = plugin.makeActivityFingerprint(playerName, activity);
                if (fingerprintSet.has(fingerprint)) {
                    skippedCount++;
                    return;
                }

                merged[playerName].activities.push(activity);
                if (activity.guid) guidSet.add(activity.guid);
                fingerprintSet.add(fingerprint);
                addedCount++;
            });

            merged[playerName].activities.sort(function (a, b) { return b.time - a.time; });
        });

        return {
            logData: merged,
            importedCount: importedCount,
            addedCount: addedCount,
            skippedCount: skippedCount,
        };
    };

    window.plugin.playerActivityLog.prepareImportFromText = function (fileName, text) {
        var plugin = window.plugin.playerActivityLog;
        var rawText = String(text || '');
        var trimmedText = rawText.trim();
        if (!trimmedText) throw new Error('Import file is empty.');

        var lowerFileName = String(fileName || '').toLowerCase();
        var parsedData;
        var sourceFormat;
        var parseMeta = {};

        if (lowerFileName.endsWith('.csv')) {
            parsedData = plugin.parseCsvToLogData(rawText);
            sourceFormat = 'csv';
            parseMeta.parsedRows = parsedData.parsedRows;
            parseMeta.skippedRows = parsedData.skippedRows;
            parsedData = parsedData.logData;
        } else {
            var isJsonLike = lowerFileName.endsWith('.json') || trimmedText[0] === '{' || trimmedText[0] === '[';
            if (isJsonLike) {
                var payload = JSON.parse(trimmedText);
                parsedData = plugin.extractImportLogData(payload);
                sourceFormat = 'json';
            } else {
                parsedData = plugin.parseCsvToLogData(rawText);
                sourceFormat = 'csv';
                parseMeta.parsedRows = parsedData.parsedRows;
                parseMeta.skippedRows = parsedData.skippedRows;
                parsedData = parsedData.logData;
            }
        }

        var existingLogData = plugin.loadLogData();
        var existingCount = plugin.countActivities(existingLogData);
        var merged = plugin.mergeLogData(existingLogData, parsedData);
        var finalCount = plugin.countActivities(merged.logData);

        return {
            format: sourceFormat,
            importedCount: merged.importedCount,
            addedCount: merged.addedCount,
            skippedCount: merged.skippedCount,
            parsedRows: parseMeta.parsedRows || merged.importedCount,
            parseSkippedRows: parseMeta.skippedRows || 0,
            existingCount: existingCount,
            finalCount: finalCount,
            logData: merged.logData,
        };
    };

    window.plugin.playerActivityLog.importFromText = function (fileName, text) {
        var plugin = window.plugin.playerActivityLog;
        var result = plugin.prepareImportFromText(fileName, text);
        localStorage.setItem(plugin.STORAGE_KEY, JSON.stringify(result.logData));
        return result;
    };

    window.plugin.playerActivityLog.handleImportFileSelection = function (event) {
        var input = event && event.target;
        var file = input && input.files && input.files[0];
        if (!file) return;

        var reader = new FileReader();
        reader.onload = function (loadEvent) {
            try {
                var plugin = window.plugin.playerActivityLog;
                var result = plugin.prepareImportFromText(file.name, String(loadEvent.target && loadEvent.target.result || ''));
                var confirmMessage =
                    `Import preview (${result.format.toUpperCase()})\n` +
                    `Rows parsed: ${result.parsedRows}\n` +
                    `Current entries: ${result.existingCount}\n` +
                    `Will add: ${result.addedCount}\n` +
                    `Will skip duplicates: ${result.skippedCount}\n` +
                    `Invalid/skipped rows: ${result.parseSkippedRows}\n` +
                    `Final entries after import: ${result.finalCount}\n\n` +
                    `Proceed with import?`;
                if (!confirm(confirmMessage)) {
                    alert('Import canceled.');
                    return;
                }
                localStorage.setItem(plugin.STORAGE_KEY, JSON.stringify(result.logData));
                alert(
                    `Import completed (${result.format.toUpperCase()}).\n` +
                    `Rows parsed: ${result.parsedRows}\n` +
                    `Added: ${result.addedCount}\n` +
                    `Skipped duplicates/invalid: ${result.skippedCount + result.parseSkippedRows}\n` +
                    `Total entries now: ${result.finalCount}`
                );
                if ($('.activity-log-modal-backdrop').length) {
                    window.plugin.playerActivityLog.displayLog();
                }
            } catch (err) {
                console.error('IITC Player Activity Log import error:', err);
                alert(`Import failed: ${err.message}`);
            } finally {
                $('#activity-log-import-file').val('');
            }
        };
        reader.onerror = function () {
            alert('Import failed: unable to read file.');
            $('#activity-log-import-file').val('');
        };
        reader.readAsText(file);
    };

    window.plugin.playerActivityLog.setup = function () {
        window.plugin.playerActivityLog.addCss();
        window.plugin.playerActivityLog.addControl();

        // Setup for trails
        var iconEnlImage = 'https://gongjupal.com/ingress/images/marker-green.png';
        // var iconEnlRetImage = 'https://gongjupal.com/ingress/images/marker-green-2x.png';
        var iconResImage = 'https://gongjupal.com/ingress/images/marker-blue.png';
        // var iconResRetImage = 'https://gongjupal.com/ingress/images/marker-blue-2x.png';

        window.plugin.playerActivityLog.iconEnl = L.Icon.Default.extend({
            options: {
                iconUrl: iconEnlImage,
                // iconRetinaUrl: iconEnlRetImage,
            },
        });
        window.plugin.playerActivityLog.iconRes = L.Icon.Default.extend({
            options: {
                iconUrl: iconResImage,
                // iconRetinaUrl: iconResRetImage,
            },
        });

        window.plugin.playerActivityLog.drawnTracesEnl = new L.LayerGroup();
        window.plugin.playerActivityLog.drawnTracesRes = new L.LayerGroup();
        if (window.PLAYER.team === 'RESISTANCE') {
            window.layerChooser.addOverlay(window.plugin.playerActivityLog.drawnTracesRes, 'Player Trails (RES)');
            window.layerChooser.addOverlay(window.plugin.playerActivityLog.drawnTracesEnl, 'Player Trails (ENL)');
        } else {
            window.layerChooser.addOverlay(window.plugin.playerActivityLog.drawnTracesEnl, 'Player Trails (ENL)');
            window.layerChooser.addOverlay(window.plugin.playerActivityLog.drawnTracesRes, 'Player Trails (RES)');
        }

        // Setup the hook for chat data
        window.addHook('publicChatDataAvailable', window.plugin.playerActivityLog.handleCommData);
    };

    window.plugin.playerActivityLog.addControl = function () {
        var link = document.createElement('a');
        link.textContent = 'Activity Log';
        link.onclick = function () { window.plugin.playerActivityLog.displayLog(); return false; };
        link.title = 'Display player activity log.';
        var toolbox = document.getElementById('toolbox');
        if (toolbox) {
            toolbox.appendChild(link);
        } else {
            console.warn('IITC Player Activity Log: Toolbox not found');
        }
    };

    window.plugin.playerActivityLog.addCss = function () {
        $('<style>').prop('type', 'text/css').html(`
            .activity-log-modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 2000; display: flex; align-items: center; justify-content: center; }
            .activity-log-modal-content { background: #202124; color: #f1f1f1; padding: 20px; border-radius: 8px; width: 80%; max-width: 800px; height: 80vh; display: flex; flex-direction: column; box-shadow: 0 5px 15px rgba(0,0,0,0.5); }
            .activity-log-modal-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 10px; margin-bottom: 10px; }
            .activity-log-modal-header h2 { margin: 0; font-size: 1.2em; flex-grow: 1; }
            .activity-log-header-buttons { display: flex; align-items: center; }
            .activity-log-header-button { margin-left: 10px; padding: 4px 8px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; }
            .activity-log-header-button:hover { background-color: #45a049; }
            .activity-log-header-button.clear-all { background-color: #f44336; }
            .activity-log-header-button.clear-all:hover { background-color: #d32f2f; }
            .activity-log-header-button.paused { background-color: #FBC02D; }
            .activity-log-modal-close { cursor: pointer; font-size: 1.5em; line-height: 1; font-weight: bold; margin-left: 15px; }
            .activity-log-modal-body { display: flex; flex-grow: 1; min-height: 0; }
            .activity-log-player-list-container { width: 35%; border-right: 1px solid #444; padding-right: 10px; display: flex; flex-direction: column; }
            #player-list-search { width: 100%; box-sizing: border-box; padding: 5px; margin-bottom: 10px; background: #000; color: #eee; border: 1px solid #555; border-radius: 4px; }
            .activity-log-player-list { flex-grow: 1; overflow-y: auto; padding-right: 5px; }
            .activity-log-player-item { display: flex; justify-content: space-between; align-items: center; padding: 5px; cursor: pointer; border-radius: 4px; }
            .activity-log-player-item:hover { background-color: #313235; }
            .activity-log-player-item.selected { background-color: #4CAF50; color: white; }
            .activity-log-player-item .player-name-container { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .activity-log-player-item .trail-checkbox { margin-right: 8px; vertical-align: middle; }
            .remove-player-icon { display: none; padding: 0 5px; color: #ff8888; font-weight: bold; }
            .activity-log-player-item:hover .remove-player-icon { display: inline; }
            .remove-player-icon:hover { color: #ff0000; }
            .activity-log-details { width: 65%; padding-left: 10px; overflow-y: auto; }
            .activity-log-entry { margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #333; }
            .activity-log-entry .portal-link { font-weight: bold; }
            .activity-log-entry .time { font-size: 0.9em; color: #ccc; }
            .activity-log-entry .activity-type { text-transform: uppercase; font-weight: bold; }
            .load-more-button { background-color: #4CAF50; color: white; padding: 10px 15px; border: none; border-radius: 4px; cursor: pointer; display: block; margin: 10px auto; }
            .load-more-button:hover { background-color: #45a049; }
            .res { color: #0088ff; }
            .enl { color: #00ff00; }
        `).appendTo('head');
    };

    window.plugin.playerActivityLog.displayLog = function () {
        $('.activity-log-modal-backdrop').remove();

        var modal = `
                <div class="activity-log-modal-backdrop">
                    <div class="activity-log-modal-content">
                        <div class="activity-log-modal-header">
                            <h2>Player Activity Log</h2>
                            <div class="activity-log-header-buttons">
                                <button class="activity-log-header-button" id="activity-log-draw-trails">Draw Trails</button>
                                <button class="activity-log-header-button" id="activity-log-clear-trails">Clear Trails</button>
                                <button class="activity-log-header-button" id="activity-log-toggle-logging"></button>
                                <button class="activity-log-header-button" id="activity-log-import">Import JSON</button>
                                <button class="activity-log-header-button" id="activity-log-export-json">Export JSON</button>
                                <button class="activity-log-header-button" id="activity-log-export-csv">Export CSV</button>
                                <button class="activity-log-header-button clear-all" id="activity-log-clear">Clear All</button>
                                <span class="activity-log-modal-close">&times;</span>
                            </div>
                        </div>
                        <input type="file" id="activity-log-import-file" accept=".json,.csv,application/json,text/csv" style="display:none;">
                        <div class="activity-log-modal-body">
                            <div class="activity-log-player-list-container">
                                <input type="text" id="player-list-search" placeholder="Search player ID/name..." autocomplete="off">
                                <div class="activity-log-player-list"></div>
                            </div>
                            <div class="activity-log-details">
                                <p>Select a player to view their activity.</p>
                                <br>
                                <p style="color:#ffce00;">Note: Data is volatile. Please export it regularly!</p>
                                <br>
                                <p style="color:#F88; font-style:italic;">
                                    Reminder: The 'Draw Trails' feature may conflict with the official 'Player activity tracker' plugin.
                                    For best results, please disable the official plugin from the layer chooser while using trails here.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        $(document.body).append(modal);

        window.plugin.playerActivityLog.updateToggleLoggingButton();

        var logData = window.plugin.playerActivityLog.loadLogData();
        var playerListContainer = $('.activity-log-player-list');
        var playerNames = Object.keys(logData).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

        playerNames.forEach(function (name) {
            var player = logData[name];
            if (!player || !Array.isArray(player.activities)) return;

            var team = window.plugin.playerActivityLog.normalizeTeam(player.team);
            var teamClass = team === 'RESISTANCE' ? 'res' : (team === 'ENLIGHTENED' ? 'enl' : '');
            var itemCount = player.activities ? player.activities.length : 0;
            var playerDiv = $('<div class="activity-log-player-item"></div>');
            playerDiv.attr('data-player', name);
            playerDiv.data('player', name);

            var checkbox = $(`<input type="checkbox" class="trail-checkbox" title="Track this player on map">`);
            checkbox.prop('checked', window.plugin.playerActivityLog.playersToTrack.includes(name));
            checkbox.on('click', function (e) {
                e.stopPropagation(); // prevent player log from opening
                var checked = $(this).prop('checked');
                var currentTracked = window.plugin.playerActivityLog.playersToTrack;
                if (checked) {
                    if (currentTracked.length >= 3) {
                        alert('You can only track up to 3 players at a time.');
                        $(this).prop('checked', false);
                    } else {
                        currentTracked.push(name);
                    }
                } else {
                    var index = currentTracked.indexOf(name);
                    if (index > -1) {
                        currentTracked.splice(index, 1);
                    }
                }
            });

            var nameSpan = $('<span class="player-name-container"></span>');
            var playerNameText = $('<span></span>').text(name);
            if (teamClass) playerNameText.addClass(teamClass);
            nameSpan.append(playerNameText).append(` (${itemCount})`);
            var removeIcon = $('<span class="remove-player-icon" title="Delete this player\'s logs">&times;</span>');

            removeIcon.on('click', function (e) {
                e.stopPropagation();
                window.plugin.playerActivityLog.removePlayerData(name);
            });

            playerDiv.append(checkbox).append(nameSpan).append(removeIcon);
            playerDiv.on('click', function () {
                $('.activity-log-player-item.selected').removeClass('selected');
                $(this).addClass('selected');
                window.plugin.playerActivityLog.renderPlayerLog(name, logData);
            });
            playerListContainer.append(playerDiv);
        });

        $('#activity-log-draw-trails').on('click', function () {
            if (window.plugin.playerActivityLog.drawPlayerTrails) {
                window.plugin.playerActivityLog.drawPlayerTrails();
            } else {
                console.warn('drawPlayerTrails function not yet implemented');
            }
        });
        $('#activity-log-clear-trails').on('click', function () {
            if (window.plugin.playerActivityLog.clearAllTrails) {
                window.plugin.playerActivityLog.clearAllTrails();
            } else {
                console.warn('clearAllTrails function not yet implemented');
            }
        });

        $('#activity-log-toggle-logging').on('click', window.plugin.playerActivityLog.toggleLogging);
        $('#activity-log-import').on('click', function () {
            var input = $('#activity-log-import-file');
            input.val('');
            input.trigger('click');
        });
        $('#activity-log-import-file').on('change', window.plugin.playerActivityLog.handleImportFileSelection);
        $('#activity-log-export-json').on('click', window.plugin.playerActivityLog.exportToJson);
        $('#activity-log-export-csv').on('click', window.plugin.playerActivityLog.exportToCsv);
        $('#activity-log-clear').on('click', window.plugin.playerActivityLog.clearAllData);
        $('.activity-log-modal-backdrop, .activity-log-modal-close').on('click', function (e) {
            if ($(e.target).is('.activity-log-modal-backdrop, .activity-log-modal-close')) {
                $('.activity-log-modal-backdrop').remove();
            }
        });

        // search filter
        $('#player-list-search').on('input', function () {
            var searchTerm = String($(this).val() || '').trim().toLowerCase();
            $('.activity-log-player-list .activity-log-player-item').each(function () {
                var playerName = String($(this).data('player') || $(this).attr('data-player') || '').toLowerCase();
                $(this).toggle(playerName.includes(searchTerm));
            });
        });
    };
    window.plugin.playerActivityLog.toggleLogging = function () {
        var plugin = window.plugin.playerActivityLog;
        plugin.isLoggingEnabled = !plugin.isLoggingEnabled;
        plugin.updateToggleLoggingButton();
    };

    window.plugin.playerActivityLog.updateToggleLoggingButton = function () {
        var plugin = window.plugin.playerActivityLog;
        var button = $('#activity-log-toggle-logging');
        if (plugin.isLoggingEnabled) {
            button.text('Pause Logging').removeClass('paused');
        } else {
            button.text('Resume Logging').addClass('paused');
        }
    };

    window.plugin.playerActivityLog.removePlayerData = function (playerName) {
        if (confirm(`Are you sure you want to delete all logs for player "${playerName}"?`)) {
            var logData = window.plugin.playerActivityLog.loadLogData();
            delete logData[playerName];
            localStorage.setItem(window.plugin.playerActivityLog.STORAGE_KEY, JSON.stringify(logData));
            if ($('.activity-log-modal-backdrop').length) {
                window.plugin.playerActivityLog.displayLog();
            }
        }
    };

    window.plugin.playerActivityLog.exportToJson = function () {
        var logData = window.plugin.playerActivityLog.loadLogData();
        var payload = {
            format: 'iitc-player-activity-log',
            version: '1.0',
            exportedAt: new Date().toISOString(),
            players: logData,
        };
        window.plugin.playerActivityLog.downloadFile('iitc-activity-log.json', JSON.stringify(payload, null, 2), 'application/json;charset=utf-8;');
    };

    window.plugin.playerActivityLog.exportToCsv = function () {
        var logData = window.plugin.playerActivityLog.loadLogData();
        var allActivities = [];
        for (var playerName in logData) {
            var player = logData[playerName];
            if (player.activities) {
                player.activities.forEach(function (act) {
                    allActivities.push({ player: playerName, faction: window.plugin.playerActivityLog.normalizeTeam(player.team), ...act });
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
        allActivities.forEach(function (act) {
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
        window.plugin.playerActivityLog.downloadFile('iitc-activity-log.csv', csvContent, 'text/csv;charset=utf-8;');
    };

    window.plugin.playerActivityLog.clearAllData = function () {
        if (confirm("Are you sure you want to delete all activity logs? This action cannot be undone.")) {
            localStorage.removeItem(window.plugin.playerActivityLog.STORAGE_KEY);
            if ($('.activity-log-modal-backdrop').length) {
                window.plugin.playerActivityLog.displayLog();
            }
        }
    };

    window.plugin.playerActivityLog.renderPlayerLog = function (playerName, logData, offset = 0) {
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
        activitiesToRender.forEach(function (act) {
            var entryDiv = $('<div class="activity-log-entry"></div>');
            var portalLink = $(`<a class="portal-link">${act.portal.name}</a>`).on('click', function () {
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
            loadMoreButton.on('click', function () {
                window.plugin.playerActivityLog.renderPlayerLog(playerName, logData, newOffset);
            });
            detailsContainer.append(loadMoreButton);
        }
    };

    window.plugin.playerActivityLog.getActivityType = function (plainText) {
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
        data.result.forEach(function (msg) {
            var guid = msg[0], timestamp = msg[1], plext = msg[2].plext;
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
                        portalName = portalName ? portalName : markup[1].name;
                        portalAddress = portalAddress ? portalAddress : markup[1].address;
                        portalLat = portalLat ? portalLat : markup[1].latE6 / 1E6;
                        portalLng = portalLng ? portalLng : markup[1].lngE6 / 1E6;
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

    window.plugin.playerActivityLog.storePlayerActivity = function (playerName, playerTeam, activity, guid) {
        var log = window.plugin.playerActivityLog.loadLogData();
        if (!log[playerName] || Array.isArray(log[playerName])) {
            log[playerName] = { team: playerTeam, activities: [] };
        }
        log[playerName].team = window.plugin.playerActivityLog.normalizeTeam(playerTeam);
        var activities = log[playerName].activities;
        if (activities.some(act => act.guid === guid)) return;
        activity.guid = guid;
        activities.push(activity);
        activities.sort((a, b) => b.time - a.time);
        localStorage.setItem(window.plugin.playerActivityLog.STORAGE_KEY, JSON.stringify(log));
    };

    window.plugin.playerActivityLog.clearAllTrails = function () {
        window.plugin.playerActivityLog.drawnTracesEnl.clearLayers();
        window.plugin.playerActivityLog.drawnTracesRes.clearLayers();
    };

    window.plugin.playerActivityLog.getDrawnTracesByTeam = function (team) {
        var normalizedTeam = window.plugin.playerActivityLog.normalizeTeam(team);
        return normalizedTeam === 'RESISTANCE' ? window.plugin.playerActivityLog.drawnTracesRes : window.plugin.playerActivityLog.drawnTracesEnl;
    };

    window.plugin.playerActivityLog.getPortalLinkFromActivity = function (act) {
        var position = [act.portal.lat, act.portal.lng];
        return $('<a>')
            .addClass('text-overflow-ellipsis')
            .css('max-width', '15em')
            .text(act.portal.name)
            .prop({
                title: act.portal.name,
                href: window.makePermalink(position),
            })
            .click(function (event) {
                window.selectPortalByLatLng(position);
                event.preventDefault();
                return false;
            });
    };

    window.plugin.playerActivityLog.drawPlayerTrails = function () {
        var plugin = window.plugin.playerActivityLog;
        plugin.clearAllTrails();

        var playersToDraw = plugin.playersToTrack;
        if (playersToDraw.length === 0) {
            return;
        }

        var logData = plugin.loadLogData();
        var now = Date.now();
        var isTouchDev = window.isTouchDevice();

        playersToDraw.forEach(function (playerName) {
            var playerData = logData[playerName];
            if (!playerData || !playerData.activities || playerData.activities.length === 0) {
                return; // No data for this player
            }
            var team = plugin.normalizeTeam(playerData.team);

            // Our stored activities are sorted newest to oldest. Reverse to chronological order.
            var playerEvents = [...playerData.activities].reverse();

            // Draw a single chronological path including all loaded activity portals.
            var pathPoints = playerEvents
                .map(function (ev) {
                    return ev && ev.portal ? [Number(ev.portal.lat), Number(ev.portal.lng)] : null;
                })
                .filter(function (point) {
                    return point && isFinite(point[0]) && isFinite(point[1]);
                });

            if (pathPoints.length >= 2) {
                L.polyline(pathPoints, {
                    weight: 2,
                    color: plugin.PLAYER_TRAIL_LINE_COLOUR,
                    interactive: false,
                    opacity: 1,
                    dashArray: '5,8',
                }).addTo(plugin.getDrawnTracesByTeam(team));
            }

            // --- Adapted Marker Logic ---
            var lastEvent = playerEvents[playerEvents.length - 1];
            if (!lastEvent) return;

            const ago = IITC.utils.formatAgo;
            var tooltip = isTouchDev ? '' : playerName + ', ' + ago(lastEvent.time, now) + ' ago';

            // Popup
            var popup = $('<div>').addClass('plugin-player-tracker-popup'); // Consider reusing CSS from player-tracker
            var popupNickClass = team === 'RESISTANCE' ? 'res' : (team === 'ENLIGHTENED' ? 'enl' : '');
            $('<span>')
                .addClass('nickname' + (popupNickClass ? ' ' + popupNickClass : ''))
                .css('font-weight', 'bold')
                .text(playerName)
                .appendTo(popup);

            popup.append('<br>')
                .append(document.createTextNode(ago(lastEvent.time, now)))
                .append('<br>')
                .append(plugin.getPortalLinkFromActivity(lastEvent));

            if (playerEvents.length >= 2) {
                popup.append('<br><br>').append(document.createTextNode('previous locations:')).append('<br>');
                var table = $('<table>').appendTo(popup).css('border-spacing', '0');
                for (let i = playerEvents.length - 2; i >= 0 && i >= playerEvents.length - plugin.PLAYER_TRAIL_MAX_DISPLAY_EVENTS; i--) {
                    var ev = playerEvents[i];
                    $('<tr>')
                        .append($('<td>').text(ago(ev.time, now) + ' ago'))
                        .append($('<td>').append(plugin.getPortalLinkFromActivity(ev)))
                        .appendTo(table);
                }
            }

            // Marker
            var icon = team === 'RESISTANCE' ? new plugin.iconRes() : new plugin.iconEnl();
            var markerPos = [lastEvent.portal.lat, lastEvent.portal.lng];
            var m = new L.Marker(markerPos, { icon: icon, opacity: 1, title: tooltip });

            // OMS-friendly popup handling
            m.options.desc = popup[0];
            m.on('spiderfiedclick', function (e) {
                if (!plugin.playerPopup) {
                    plugin.playerPopup = new L.Popup({ offset: new L.Point([1, -34]) });
                }
                plugin.playerPopup.setContent(e.target.options.desc);
                plugin.playerPopup.setLatLng(e.target.getLatLng());
                window.map.openPopup(plugin.playerPopup);
            });


            if (tooltip) {
                m.on('mouseout', function () { $(this._icon).tooltip('close'); });
            }

            m.addTo(plugin.getDrawnTracesByTeam(team));
            window.registerMarkerForOMS(m);
            if (!isTouchDev) {
                window.setupTooltips($(m._icon));
            }
        });
    };


    var setup = window.plugin.playerActivityLog.setup;
    setup.info = plugin_info; // Pass info to setup

    // This checks if we are running inside the wrapper injection already or need to queue it
    if (window.iitcLoaded && typeof setup === 'function') {
        setup();
    } else {
        if (!window.bootPlugins) window.bootPlugins = [];
        window.bootPlugins.push(setup);
    }

    // PLUGIN END //////////////////////////////////////////////////////////
}

// Inject plugin into page (Standard IITC Wrapper Injection)
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) info.script = { version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description };
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);
