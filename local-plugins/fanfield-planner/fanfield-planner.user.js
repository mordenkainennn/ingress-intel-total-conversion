// ==UserScript==
// @id             iitc-plugin-fanfield-planner@mordenkainennn
// @name           IITC Plugin: mordenkainennn's Fanfield Planner
// @version        0.0.1.20251231
// @description    Plugin for planning fanfields/pincushions in IITC
// @author         mordenkainennn
// @category       Layer
// @namespace      https://github.com/mordenkainennn/ingress-intel-total-conversion
// @updateURL      https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/main/local-plugins/fanfield-planner/fanfield-planner.meta.js
// @downloadURL    https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/main/local-plugins/fanfield-planner/fanfield-planner.user.js
// @include        https://intel.ingress.com/*
// @include        http://intel.ingress.com/*
// @match          https://intel.ingress.com/*
// @match          http://intel.ingress.com/*
// @include        https://*.ingress.com/intel*
// @include        http://*.ingress.com/intel*
// @match          https://*.ingress.com/intel*
// @match          http://*.ingress.com/intel*
// @include        https://*.ingress.com/mission/*
// @include        http://*.ingress.com/mission/*
// @match          https://*.ingress.com/mission/*
// @match          http://*.ingress.com/mission/*
// @grant        none
// ==/UserScript==

function wrapper(plugin_info) {
    if (typeof window.plugin !== 'function') window.plugin = function () { };
    
    // PLUGIN START
    let self = window.plugin.fanfieldPlanner = function () { };

    self.anchorPortal = null;
    self.basePortals = []; // Array of {guid, details}

    self.dialog_html = `
        <div id="fanfield-planner-container">
            <div class="fanfield-select-mode-container">
                <strong>Selection Mode:</strong>
                <label><input type="radio" name="fanfield-select-mode" value="anchor" checked> Select Anchor</label>
                <label><input type="radio" name="fanfield-select-mode" value="base"> Select Base Portals</label>
            </div>
    
            <fieldset id="fanfield-anchor-portal-details">
                <legend>Anchor Portal</legend>
                <div class="placeholder">Please select one anchor portal.</div>
            </fieldset>
    
            <fieldset>
                <legend>Base Portals (<span id="fanfield-base-count">0</span> selected)</legend>
                <div id="fanfield-base-portals-list">
                    <div class="placeholder">Please select at least 2 base portals.</div>
                </div>
            </fieldset>
    
            <div id="fanfield-buttons-container">
                <button id="plan-fanfield-btn" disabled>Plan Fanfield</button>
                <button id="clear-fanfield-btn">Clear Portals</button>
            </div>
    
            <textarea id="fanfield-plan-text" readonly placeholder="Planning results will appear here."></textarea>
            <style>
                #fanfield-planner-container { display: flex; flex-direction: column; }
                .fanfield-select-mode-container, #fanfield-buttons-container { padding: 5px 0; }
                #fanfield-base-portals-list { max-height: 150px; overflow-y: auto; display: flex; flex-direction: column; gap: 5px; }
                .fanfield-portal-item { display: flex; align-items: center; background: rgba(0,0,0,0.3); padding: 3px; border-radius: 4px;}
                .fanfield-portal-item img { width: 40px; height: 40px; margin-right: 8px; border-radius: 4px; }
                .fanfield-portal-item .fanfield-remove-btn { margin-left: auto; cursor: pointer; color: #ff5555; }
                #fanfield-plan-text { height: 200px; resize: vertical; }
                .placeholder { color: #999; text-align: center; padding: 10px; }
            </style>
        </div>
    `;

    self.updateDialog = function () {
        // Update Anchor
        const anchorDiv = $('#fanfield-anchor-portal-details');
        anchorDiv.empty();
        if (self.anchorPortal) {
            anchorDiv.append(`
                <div class="fanfield-portal-item">
                    <img src="${self.anchorPortal.details.image || window.DEFAULT_PORTAL_IMG}" alt="${self.anchorPortal.details.title}" />
                    <span>${self.anchorPortal.details.title}</span>
                </div>`);
        } else {
            anchorDiv.append('<div class="placeholder">Please select one anchor portal.</div>');
        }

        // Update Base Portals
        const baseListDiv = $('#fanfield-base-portals-list');
        baseListDiv.empty();
        $('#fanfield-base-count').text(self.basePortals.length);
        if (self.basePortals.length > 0) {
            self.basePortals.forEach((p, index) => {
                baseListDiv.append(`
                    <div class="fanfield-portal-item">
                        <img src="${p.details.image || window.DEFAULT_PORTAL_IMG}" alt="${p.details.title}" />
                        <span>${p.details.title}</span>
                        <a class="fanfield-remove-btn" data-index="${index}" title="Remove"> X </a>
                    </div>`);
            });
        } else {
            baseListDiv.append('<div class="placeholder">Please select at least 2 base portals.</div>');
        }

        // Update Button State
        if (self.anchorPortal && self.basePortals.length >= 2) {
            $('#plan-fanfield-btn').prop('disabled', false);
        } else {
            $('#plan-fanfield-btn').prop('disabled', true);
        }
    };
    
    self.portalSelected = function (data) {
        if (!self.dialogIsOpen()) return;

        // Using the _details property as it's confirmed to work in the user's environment via homogeneous-fields plugin
        const portalDetails = window.portals[data.selectedPortalGuid]?._details;
        if (!portalDetails) {
            console.warn(`Fanfield Planner: Could not retrieve portal details for ${data.selectedPortalGuid}. Portal may not be fully loaded.`);
            return;
        }

        const mode = $('input[name="fanfield-select-mode"]:checked').val();

        if (mode === 'anchor') {
            self.anchorPortal = { guid: data.selectedPortalGuid, details: portalDetails };
        } else { // mode === 'base'
            // Avoid duplicates
            if (!self.basePortals.some(p => p.guid === data.selectedPortalGuid)) {
                self.basePortals.push({ guid: data.selectedPortalGuid, details: portalDetails });
            }
        }
        self.updateDialog();
    };

    self.dialogIsOpen = function() {
        // Corrected selector: jQuery UI prepends "dialog-" to the id.
        return ($("#dialog-fanfield-planner-view").length > 0 && $("#dialog-fanfield-planner-view").dialog('isOpen'));
    };

    self.setup = function () {
        self.anchorPortal = null;
        self.basePortals = [];

        window.addHook('portalSelected', self.portalSelected);

        $('#toolbox').append('<a onclick="window.plugin.fanfieldPlanner.openDialog(); return false;">Plan Fanfield</a>');
    };

    self.openDialog = function () {
        if (!self.dialogIsOpen()) {
            dialog({
                title: 'Fanfield Planner',
                id: 'fanfield-planner-view',
                html: self.dialog_html,
                width: 500,
                minHeight: 460, // Adjust as needed
            });
            self.attachEventHandler();
            self.updateDialog();
        }
    };

    self.attachEventHandler = function () {
        $('#clear-fanfield-btn').click(function () {
            self.anchorPortal = null;
            self.basePortals = [];
            self.updateDialog();
            $('#fanfield-plan-text').val('');
        });

        // Event delegation for remove buttons
        $(document).on('click', '.fanfield-remove-btn', function() {
            const indexToRemove = $(this).data('index');
            self.basePortals.splice(indexToRemove, 1);
            self.updateDialog();
        });

        // Main planning button
        $('#plan-fanfield-btn').click(function () {
            try {
                const plan = self.generateFanfieldPlan();
                const planText = self.planToText(plan);
                $('#fanfield-plan-text').val(planText);
            } catch (e) {
                console.error("Fanfield planning error:", e);
                $('#fanfield-plan-text').val("An error occurred during planning:\n" + e.message);
            }
        });
    };

    // ++ Main Planning Logic ++

    self.generateFanfieldPlan = function () {
        if (!self.anchorPortal || self.basePortals.length < 2) {
            throw new Error("Please select one anchor and at least two base portals.");
        }

        $('#fanfield-plan-text').val('Optimizing travel path for base portals...');
        const baseGuids = self.basePortals.map(p => p.guid);
        const optimizedBasePath = self.findShortestPath(baseGuids);

        let plan = [];
        let linkCount = 0;
        let fieldCount = 0;
        let totalDistance = 0;
        let keysNeeded = {}; // {guid: count}

        // Initialize keys needed
        keysNeeded[self.anchorPortal.guid] = baseGuids.length; // for phase 1
        baseGuids.forEach(guid => {
            keysNeeded[guid] = 0;
        });

        // == Phase 1: Build the base fanfield ==
        plan.push({ type: 'header', text: 'Phase 1: Build Base Fanfield' });

        let lastVisitedGuid = null;
        optimizedBasePath.forEach((guid, index) => {
            // Action: Go to portal
            let distance = 0;
            if (lastVisitedGuid) {
                distance = self.distance(window.portals[lastVisitedGuid].getLatLng(), window.portals[guid].getLatLng());
                totalDistance += distance;
            }
            plan.push({ type: 'visit', guid: guid, distance: distance, from: lastVisitedGuid });

            // Action: Link to anchor
            plan.push({ type: 'link', from: guid, to: self.anchorPortal.guid });
            linkCount++;

            // Action: Link to previous base portals to form fields
            for (let i = 0; i < index; i++) {
                const prevBaseGuid = optimizedBasePath[i];
                plan.push({ type: 'link', from: guid, to: prevBaseGuid });
                linkCount++;
                fieldCount++; // Each link to a previous base portal creates a new field with the anchor
                keysNeeded[guid]++;
            }

            lastVisitedGuid = guid;
        });

        // == Phase 2: The Finale ==
        plan.push({ type: 'header', text: 'Phase 2: Grand Finale' });

        // Action: Go to anchor
        let distance = self.distance(window.portals[lastVisitedGuid].getLatLng(), window.portals[self.anchorPortal.guid].getLatLng());
        totalDistance += distance;
        plan.push({ type: 'visit', guid: self.anchorPortal.guid, distance: distance, from: lastVisitedGuid });

        // Action: Destroy and rebuild
        plan.push({ type: 'destroy', guid: self.anchorPortal.guid });

        // Action: Link from anchor to all base portals
        baseGuids.forEach(guid => {
            plan.push({ type: 'link', from: self.anchorPortal.guid, to: guid });
            linkCount++;
        });
        fieldCount += baseGuids.length - 1; // Linking to N portals from one point creates N-1 fields.
        
        plan.push({type: 'summary', linkCount, fieldCount, totalDistance, keysNeeded });

        return plan;
    };

    self.planToText = function(plan) {
        if (!plan) return "No plan generated.";
        let planText = "";
        let step = 1;

        plan.forEach(action => {
            switch(action.type) {
                case 'header':
                    planText += `\n--- ${action.text} ---\n`;
                    step = 1;
                    break;
                case 'visit':
                    let visitText = `Step ${step++}: Go to portal ${self.getPortalLink(action.guid)}.`;
                    if (action.from) {
                        const fromLL = window.portals[action.from].getLatLng();
                        const toLL = window.portals[action.guid].getLatLng();
                        const bearing = self.bearing(fromLL, toLL);
                        visitText += ` (${self.formatDistance(action.distance)}, ${self.formatBearing(bearing)})`;
                    }
                    planText += visitText + '\n';
                    break;
                case 'link':
                    planText += `    - Link to ${self.getPortalLink(action.to)}\n`;
                    break;
                case 'destroy':
                    planText += `Step ${step++}: Destroy and recapture portal ${self.getPortalLink(action.guid)}.\n`;
                    break;
                case 'summary':
                    planText += "\n--- SUMMARY ---\n";
                    planText += `Total Fields: ${action.fieldCount}\n`;
                    planText += `Total Links: ${action.linkCount}\n`;
                    planText += `Estimated Travel Distance: ${self.formatDistance(action.totalDistance)}\n\n`;
                    planText += "Keys Required:\n";
                    for (const guid in action.keysNeeded) {
                        if (action.keysNeeded[guid] > 0) {
                            planText += `  - ${action.keysNeeded[guid]}x keys for ${self.getPortalLink(guid)}\n`;
                        }
                    }
                    break;
            }
        });
        return planText;
    };

    // ++ Helper Functions ++

    self.getPortalLink = function(guid) {
        const portal = window.portals[guid];
        if (!portal) return `[Unknown Portal: ${guid}]`;
        const details = portal.options.data;
        const lat = details.latE6 / 1E6;
        const lng = details.lngE6 / 1E6;
        const perma = `https://intel.ingress.com/intel?ll=${lat},${lng}&z=17&pll=${lat},${lng}`;
        return `<a href="${perma}" target="_blank">${details.title}</a>`;
    };

    self.distance = function(p1, p2) {
        return p1.distanceTo(p2);
    };
    
    self.bearing = function(p1, p2) {
        const toRad = Math.PI / 180;
        const toDeg = 180 / Math.PI;
        const lat1 = p1.lat * toRad;
        const lon1 = p1.lng * toRad;
        const lat2 = p2.lat * toRad;
        const lon2 = p2.lng * toRad;
        const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
        return (Math.atan2(y, x) * toDeg + 360) % 360;
    };

    self.calculatePathLength = function(path) {
        let totalLength = 0;
        for (let i = 1; i < path.length; i++) {
            let p1 = window.portals[path[i-1]]?.getLatLng();
            let p2 = window.portals[path[i]]?.getLatLng();
            if(p1 && p2) {
                totalLength += self.distance(p1, p2);
            }
        }
        return totalLength;
    };

    self.findShortestPath = function(portalGuids) {
        if (portalGuids.length <= 1) return portalGuids;
        let bestPath = portalGuids.slice();
        // Simple sort as a starting point (e.g., by latitude)
        bestPath.sort((a,b) => window.portals[a].getLatLng().lat - window.portals[b].getLatLng().lat);
        let bestLength = self.calculatePathLength(bestPath);

        // Run optimization for a limited number of iterations
        for (let i = 0; i < (portalGuids.length * portalGuids.length * 2); i++) {
            let newPath = bestPath.slice();
            let index1 = Math.floor(Math.random() * newPath.length);
            let index2 = Math.floor(Math.random() * newPath.length);
            [newPath[index1], newPath[index2]] = [newPath[index2], newPath[index1]];
            
            let newLength = self.calculatePathLength(newPath);

            if (newLength < bestLength) {
                bestPath = newPath;
                bestLength = newLength;
            }
        }
        return bestPath;
    };
    
    self.buildDirection = function(compass1, compass2, angle) {
        if (angle < 0) angle += 360;
        if (angle == 0) return compass1;
        if (angle == 45) return compass1 + compass2;
        if (angle > 45) return self.buildDirection(compass2, compass1, 90-angle);
        return compass1 + ' ' + Math.round(angle) + '° ' + compass2;
    };

    self.formatBearing = function(bearing) {
        bearing = (bearing + 360) % 360;
        if (bearing <= 90) return self.buildDirection('N', 'E', bearing);
        else if (bearing <= 180) return self.buildDirection('S', 'E', 180 - bearing);
        else if (bearing <= 270) return self.buildDirection('S', 'W', bearing - 180);
        else return self.buildDirection('N', 'W', 360 - bearing);
    };

    self.formatDistance = function(distanceMeters) {
        if (distanceMeters < 1000) {
            return `${Math.round(distanceMeters)}m`;
        } else {
            return `${(distanceMeters / 1000).toFixed(2)}km`;
        }
    };



    // PLUGIN END
    var setup = self.setup;
    setup.info = plugin_info;

    if (!window.bootPlugins) window.bootPlugins = [];
    window.bootPlugins.push(setup);
    if (window.iitcLoaded && typeof setup === 'function') setup();
} // wrapper end

var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
    info.script = {
        version: GM_info.script.version,
        name: GM_info.script.name,
        description: GM_info.script.description
    };
}
var textContent = document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ')');
script.appendChild(textContent);
(document.body || document.head || document.documentElement).appendChild(script);
