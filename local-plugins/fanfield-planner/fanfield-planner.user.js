// ==UserScript==
// @id             iitc-plugin-fanfield-planner@mordenkainennn
// @name           IITC Plugin: mordenkainennn's Fanfield Planner
// @version        1.9
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
        const anchorDiv = $("#fanfield-anchor-portal-details");
        anchorDiv.empty();
        if (self.anchorPortal) {
            anchorDiv.append(`
                <div class="fanfield-portal-item">
                    <img src="${self.anchorPortal.details.image || window.DEFAULT_PORTAL_IMG}" alt="${self.anchorPortal.details.title}" />
                    <span>${self.getPortalName(self.anchorPortal.guid)}</span>
                </div>`);
        } else {
            anchorDiv.append('<div class="placeholder">Please select one anchor portal.</div>');
        }

        // Update Base Portals
        const baseListDiv = $("#fanfield-base-portals-list");
        baseListDiv.empty();
        $("#fanfield-base-count").text(self.basePortals.length);
        if (self.basePortals.length > 0) {
            self.basePortals.forEach((p, index) => {
                baseListDiv.append(`
                    <div class="fanfield-portal-item">
                        <img src="${p.details.image || window.DEFAULT_PORTAL_IMG}" alt="${p.details.title}" />
                        <span>${self.getPortalName(p.guid)}</span>
                        <a class="fanfield-remove-btn" data-index="${index}" title="Remove"> X </a>
                    </div>`);
            });
        } else {
            baseListDiv.append('<div class="placeholder">Please select at least 2 base portals.</div>');
        }

        // Update Button State
        if (self.anchorPortal && self.basePortals.length >= 2) {
            $("#plan-fanfield-btn").prop('disabled', false);
        } else {
            $("#plan-fanfield-btn").prop('disabled', true);
        }
    };

    self.portalSelected = function (data) {
        if (!self.dialogIsOpen()) return;

        const portalDetails = window.portals[data.selectedPortalGuid]?._details;
        if (!portalDetails) {
            console.warn(`Fanfield Planner: Could not retrieve portal details for ${data.selectedPortalGuid}. Portal may not be fully loaded.`);
            return;
        }

        const mode = $("input[name='fanfield-select-mode']:checked").val();

        if (mode === 'anchor') {
            self.anchorPortal = { guid: data.selectedPortalGuid, details: portalDetails };
        } else { // mode === 'base'
            if (!self.basePortals.some(p => p.guid === data.selectedPortalGuid)) {
                self.basePortals.push({ guid: data.selectedPortalGuid, details: portalDetails });
            }
        }
        self.updateDialog();
    };

    self.dialogIsOpen = function () {
        return ($("#dialog-fanfield-planner-view").length > 0 && $("#dialog-fanfield-planner-view").dialog('isOpen'));
    };

    self.setup = function () {
        self.anchorPortal = null;
        self.basePortals = [];

        window.addHook('portalSelected', self.portalSelected);

        $('#toolbox').append('<a onclick="window.plugin.fanfieldPlanner.openDialog(); return false;">Plan Fanfield</a>');

        self.linksLayerPhase1 = new L.LayerGroup();
        self.fieldsLayerPhase1 = new L.LayerGroup();
        self.linksLayerPhase2 = new L.LayerGroup();
        self.fieldsLayerPhase2 = new L.LayerGroup();

        window.addLayerGroup('Fanfield Plan (Links Phase 1)', self.linksLayerPhase1, false);
        window.addLayerGroup('Fanfield Plan (Fields Phase 1)', self.fieldsLayerPhase1, false);
        window.addLayerGroup('Fanfield Plan (Links Phase 2)', self.linksLayerPhase2, false);
        window.addLayerGroup('Fanfield Plan (Fields Phase 2)', self.fieldsLayerPhase2, false);
    };

    self.openDialog = function () {
        if (!self.dialogIsOpen()) {
            dialog({
                title: 'Fanfield Planner',
                id: 'fanfield-planner-view',
                html: self.dialog_html,
                width: 500,
                minHeight: 460,
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
            self.clearLayers();
        });

        $(document).on('click', '.fanfield-remove-btn', function () {
            const indexToRemove = $(this).data('index');
            self.basePortals.splice(indexToRemove, 1);
            self.updateDialog();
        });

        $('#plan-fanfield-btn').click(function () {
            try {
                const plan = self.generateFanfieldPlan();
                const planText = self.planToText(plan);
                $('#fanfield-plan-text').val(planText);
                self.drawPlan(plan);
            } catch (e) {
                console.error("Fanfield planning error:", e);
                $('#fanfield-plan-text').val("An error occurred during planning:\n" + e.message);
                self.clearLayers();
            }
        });
    };

    // ++ Drawing Functions ++ 
    self.clearLayers = function () {
        self.linksLayerPhase1.clearLayers();
        self.fieldsLayerPhase1.clearLayers();
        self.linksLayerPhase2.clearLayers();
        self.fieldsLayerPhase2.clearLayers();
    };

    self.drawLink = function (layerGroup, fromLatLng, toLatLng, color) {
        const poly = L.polyline([fromLatLng, toLatLng], { color: color, opacity: 1, weight: 3, clickable: false, interactive: false });
        poly.addTo(layerGroup);
    };

    self.drawField = function (layerGroup, p1LatLng, p2LatLng, p3LatLng, color) {
        const poly = L.polygon([p1LatLng, p2LatLng, p3LatLng], { stroke: false, fill: true, fillColor: color, fillOpacity: 0.1, clickable: false, interactive: false });
        poly.addTo(layerGroup);
    };

    self.drawPlan = function (plan) {
        self.clearLayers();
        if (!plan) return;

        const phase1Color = '#FF00FF'; // Magenta
        const phase2Color = '#FFFF00'; // Yellow

        plan.forEach(action => {
            if (action.type === 'link') {
                const fromPortal = window.portals[action.from];
                const toPortal = window.portals[action.to];
                if (!fromPortal || !toPortal) return;
                const fromLatLng = fromPortal.getLatLng();
                const toLatLng = toPortal.getLatLng();

                if (action.phase === 1) {
                    self.drawLink(self.linksLayerPhase1, fromLatLng, toLatLng, phase1Color);
                } else if (action.phase === 2) {
                    self.drawLink(self.linksLayerPhase2, fromLatLng, toLatLng, phase2Color);
                }
            } else if (action.type === 'field') {
                const p1 = window.portals[action.p1];
                const p2 = window.portals[action.p2];
                const p3 = window.portals[action.p3];
                if (!p1 || !p2 || !p3) return;
                const p1LatLng = p1.getLatLng();
                const p2LatLng = p2.getLatLng();
                const p3LatLng = p3.getLatLng();

                if (action.phase === 1) {
                    self.drawField(self.fieldsLayerPhase1, p1LatLng, p2LatLng, p3LatLng, phase1Color);
                } else if (action.phase === 2) {
                    self.drawField(self.fieldsLayerPhase2, p1LatLng, p2LatLng, p3LatLng, phase2Color);
                }
            }
        });
    };

    // ++ Main Planning Logic ++ 
    self.sortBasePortalsByAngle = function (baseGuids, anchorGuid) {
        if (!window.portals[anchorGuid]) return baseGuids;
        const anchorLatLng = window.portals[anchorGuid].getLatLng();
        return baseGuids.sort((a, b) => {
            if (!window.portals[a] || !window.portals[b]) return 0;
            const bearingA = self.bearing(anchorLatLng, window.portals[a].getLatLng());
            const bearingB = self.bearing(anchorLatLng, window.portals[b].getLatLng());
            return bearingA - bearingB;
        });
    };

    self.findShortestPathForSortedBase = function (sortedBase) {
        if (sortedBase.length <= 1) return sortedBase;

        const pathLR = sortedBase.slice();
        const pathRL = sortedBase.slice().reverse();

        let distLR = 0;
        for (let i = 1; i < pathLR.length; i++) {
            if (window.portals[pathLR[i - 1]] && window.portals[pathLR[i]]) {
                distLR += self.distance(window.portals[pathLR[i - 1]].getLatLng(), window.portals[pathLR[i]].getLatLng());
            }
        }

        let distRL = 0;
        for (let i = 1; i < pathRL.length; i++) {
            if (window.portals[pathRL[i - 1]] && window.portals[pathRL[i]]) {
                distRL += self.distance(window.portals[pathRL[i - 1]].getLatLng(), window.portals[pathRL[i]].getLatLng());
            }
        }

        return distLR < distRL ? pathLR : pathRL;
    };

    // Intersection Helpers
    self.latLngIsEqual = function (a, b) {
        return Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lng - b.lng) < 1e-9;
    };

    self.ccw = function (p1, p2, p3) {
        return (p3.lat - p1.lat) * (p2.lng - p1.lng) > (p2.lat - p1.lat) * (p3.lng - p1.lng);
    };

    self.segmentsIntersect = function (p1, p2, p3, p4) {
        // Exclude cases where segments share an endpoint (not a crossing)
        if (self.latLngIsEqual(p1, p3) || self.latLngIsEqual(p1, p4) || self.latLngIsEqual(p2, p3) || self.latLngIsEqual(p2, p4)) return false;
        return (self.ccw(p1, p3, p4) != self.ccw(p2, p3, p4)) && (self.ccw(p1, p2, p3) != self.ccw(p1, p2, p4));
    };

    self.generateFanfieldPlan = function () {
        if (!self.anchorPortal || self.basePortals.length < 2) {
            throw new Error("Please select one anchor and at least two base portals.");
        }

        const baseGuids = self.basePortals.map(p => p.guid);

        const missingPortals = baseGuids.filter(guid => !window.portals[guid]);
        if (!window.portals[self.anchorPortal.guid] || missingPortals.length > 0) {
            throw new Error("Some selected portals are not currently loaded in the view. Please zoom in or reload data to ensure all portals are visible.");
        }

        $('#fanfield-plan-text').val('Checking geometry and calculating path...');

        const sortedBasePath = self.sortBasePortalsByAngle(baseGuids, self.anchorPortal.guid);
        const optimizedTravelPath = self.findShortestPathForSortedBase(sortedBasePath);
        const anchorLL = window.portals[self.anchorPortal.guid].getLatLng();

        // == Pass 1: Simulate Geometry & Tally Keys ==
        let keysNeeded = {};
        baseGuids.forEach(guid => { keysNeeded[guid] = 0; });
        keysNeeded[self.anchorPortal.guid] = 0;

        let stepActions = []; // { guid, links: [{to, type}] }
        let rays = []; // Array of [p1, p2] representing Anchor-Base links used for obstruction checks

        optimizedTravelPath.forEach((guid, index) => {
            const currentLL = window.portals[guid].getLatLng();
            let links = [];

            // 1. Link to Anchor (Always valid)
            links.push({ to: self.anchorPortal.guid, type: 'anchor' });
            // Anchor keys are typically farmed beforehand, but we track consumption.
            keysNeeded[self.anchorPortal.guid]++;

            if (index > 0) {
                const prevGuid = optimizedTravelPath[index - 1];
                const prevLL = window.portals[prevGuid].getLatLng();

                // 2. Link to Previous (Chain)
                // Check if Current->Prev crosses any existing Anchor->Base rays (excluding Prev's own ray)
                let safeToPrev = true;
                for (let r = 0; r < rays.length - 1; r++) {
                    if (self.segmentsIntersect(currentLL, prevLL, rays[r][0], rays[r][1])) {
                        safeToPrev = false; break;
                    }
                }
                if (safeToPrev) {
                    links.push({ to: prevGuid, type: 'chain' });
                    keysNeeded[prevGuid]++;
                }

                // 3. Greedy Back-linking (Layering/Triangulation)
                // Try to link to ALL previous portals (pk where k < index - 1) to create multiple layers
                // and max fields, instead of just connecting to the start portal.
                for (let k = index - 2; k >= 0; k--) {
                    const backGuid = optimizedTravelPath[k];
                    const backLL = window.portals[backGuid].getLatLng();

                    let isSafe = true;
                    // Check if segment (current -> back) intersects any rays of intermediate portals.
                    // Intermediate rays are at indices (k + 1) to (index - 1).
                    for (let r = k + 1; r < index; r++) {
                        if (self.segmentsIntersect(currentLL, backLL, rays[r][0], rays[r][1])) {
                            isSafe = false; break;
                        }
                    }

                    if (isSafe) {
                        links.push({ to: backGuid, type: 'layer' });
                        keysNeeded[backGuid]++;
                    }
                }
            }

            stepActions.push({ guid: guid, links: links });
            rays.push([anchorLL, currentLL]);
        });

        // Phase 2 Key Count (Simple Fan from Anchor)
        baseGuids.forEach(guid => { keysNeeded[guid]++; });

        // == Pass 2: Generate Plan Text & Objects ==
        let plan = [];
        let linkCount = 0;
        let fieldCount = 0;
        let totalDistance = 0;
        let lastVisitedGuid = null;

        plan.push({ type: 'header', text: 'Phase 1: Build Base Fanfield (Greedy Triangulation)' });

        stepActions.forEach((step) => {
            const currentGuid = step.guid;
            let distance = 0;
            if (lastVisitedGuid) {
                distance = self.distance(window.portals[lastVisitedGuid].getLatLng(), window.portals[currentGuid].getLatLng());
                totalDistance += distance;
            }

            plan.push({
                type: 'visit',
                guid: currentGuid,
                distance: distance,
                from: lastVisitedGuid,
                phase: 1,
                keysToFarm: keysNeeded[currentGuid]
            });

            // Process simulated links
            step.links.forEach(link => {
                plan.push({ type: 'link', from: currentGuid, to: link.to, phase: 1 });
                linkCount++;

                // Determine fields
                if (link.type === 'chain') {
                    // Chain creates field (Current, Anchor, Prev)
                    // We know Anchor link exists.
                    plan.push({ type: 'field', p1: currentGuid, p2: self.anchorPortal.guid, p3: link.to, phase: 1 });
                    fieldCount++;
                } else if (link.type === 'layer') {
                    // Layer creates field (Current, Anchor, Back)
                    plan.push({ type: 'field', p1: currentGuid, p2: self.anchorPortal.guid, p3: link.to, phase: 1 });
                    fieldCount++;
                }
            });

            lastVisitedGuid = currentGuid;
        });

        // Phase 2
        plan.push({ type: 'header', text: 'Phase 2: Re-throw from Anchor (Optional)' });
        let distanceToAnchor = self.distance(window.portals[lastVisitedGuid].getLatLng(), window.portals[self.anchorPortal.guid].getLatLng());
        totalDistance += distanceToAnchor;

        plan.push({ type: 'visit', guid: self.anchorPortal.guid, distance: distanceToAnchor, from: lastVisitedGuid, phase: 2, keysToFarm: 0 });
        plan.push({ type: 'destroy', guid: self.anchorPortal.guid, phase: 2 });

        for (let i = 0; i < sortedBasePath.length; i++) {
            const currentBase = sortedBasePath[i];
            plan.push({ type: 'link', from: self.anchorPortal.guid, to: currentBase, phase: 2 });
            linkCount++;

            if (i > 0) {
                const prevBase = sortedBasePath[i - 1];
                plan.push({ type: 'field', p1: self.anchorPortal.guid, p2: prevBase, p3: currentBase, phase: 2 });
                fieldCount++;
            }
        }

        plan.push({ type: 'summary', linkCount, fieldCount, totalDistance, keysNeeded, basePortalsCount: baseGuids.length });

        return plan;
    };

    self.planToText = function (plan) {
        if (!plan) return "No plan generated.";
        let planText = "";
        let step = 1;

        plan.forEach(action => {
            switch (action.type) {
                case 'header':
                    planText += `\n--- ${action.text} ---\n`;
                    step = 1;
                    break;
                case 'visit':
                    let visitText = `Step ${step++} (Phase ${action.phase}): Go to portal ${self.getPortalName(action.guid)}.`;
                    if (action.from) {
                        const fromLL = window.portals[action.from].getLatLng();
                        const toLL = window.portals[action.guid].getLatLng();
                        const bearing = self.bearing(fromLL, toLL);
                        visitText += ` (${self.formatDistance(action.distance)}, ${self.formatBearing(bearing)})`;
                    }
                    if (action.keysToFarm > 0) {
                        visitText += `\n      [!] Farm at least ${action.keysToFarm} keys here.`;
                    }
                    planText += visitText + '\n';
                    break;
                case 'link':
                    planText += `    - (Phase ${action.phase}) Link from ${self.getPortalName(action.from)} to ${self.getPortalName(action.to)}\n`;
                    break;
                case 'field':
                    planText += `    -> (Phase ${action.phase}) FIELD created: ${self.getPortalName(action.p1)}, ${self.getPortalName(action.p2)}, ${self.getPortalName(action.p3)}\n`;
                    break;
                case 'destroy':
                    planText += `Step ${step++} (Phase ${action.phase}): Destroy and recapture portal ${self.getPortalName(action.guid)}.\n`;
                    break;
                case 'summary':
                    planText += "\n--- SUMMARY ---\n";
                    planText += `Base Portals: ${action.basePortalsCount}\n`;
                    planText += `Total Links: ${action.linkCount}\n`;
                    planText += `Total Fields: ${action.fieldCount}\n`;
                    planText += `Estimated Travel Distance: ${self.formatDistance(action.totalDistance)}\n\n`;
                    planText += "Total Keys Required (Check individual steps for farming location):\n";
                    for (const guid in action.keysNeeded) {
                        if (action.keysNeeded[guid] > 0) {
                            planText += `  - ${action.keysNeeded[guid]}x keys for ${self.getPortalName(guid)}\n`;
                        }
                    }
                    planText += `  Note: Anchor keys (${action.keysNeeded[self.anchorPortal.guid] || 0}) must be obtained BEFORE starting Phase 1.\n`;
                    break;
            }
        });
        return planText;
    };

    // ++ Helper Functions ++ 
    self.getPortalName = function (guid) {
        const portal = window.portals[guid];
        if (!portal) return `[Unknown Portal]`
        const details = portal.options.data;

        const isCoordinate = /^-?[\d.]+, ?-?[\d.]+$/.test(details.title);

        if (details && details.title && !isCoordinate) {
            return details.title;
        }
        return `[Portal name not loaded]`; // Fallback text
    };

    self.distance = function (p1, p2) {
        return p1.distanceTo(p2);
    };

    self.bearing = function (p1, p2) {
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

    self.calculatePathLength = function (path) {
        let totalLength = 0;
        for (let i = 1; i < path.length; i++) {
            let p1 = window.portals[path[i - 1]]?.getLatLng();
            let p2 = window.portals[path[i]]?.getLatLng();
            if (p1 && p2) {
                totalLength += self.distance(p1, p2);
            }
        }
        return totalLength;
    };

    self.findShortestPath = function (portalGuids) {
        if (portalGuids.length <= 1) return portalGuids;
        let bestPath = portalGuids.slice();
        bestPath.sort((a, b) => window.portals[a].getLatLng().lat - window.portals[b].getLatLng().lat);
        let bestLength = self.calculatePathLength(bestPath);

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

    self.buildDirection = function (compass1, compass2, angle) {
        if (angle < 0) angle += 360;
        if (angle == 0) return compass1;
        if (angle == 45) return compass1 + compass2;
        if (angle > 45) return self.buildDirection(compass2, compass1, 90 - angle);
        return compass1 + ' ' + Math.round(angle) + '° ' + compass2;
    };

    self.formatBearing = function (bearing) {
        bearing = (bearing + 360) % 360;
        if (bearing <= 90) return self.buildDirection('N', 'E', bearing);
        else if (bearing <= 180) return self.buildDirection('S', 'E', 180 - bearing);
        else if (bearing <= 270) return self.buildDirection('S', 'W', bearing - 180);
        else return self.buildDirection('N', 'W', 360 - bearing);
    };

    self.formatDistance = function (distanceMeters) {
        if (distanceMeters < 1000) {
            return `${Math.round(distanceMeters)}m`;
        } else {
            return `${(distanceMeters / 1000).toFixed(2)}km`;
        }
    };

    var setup = self.setup;
    setup.info = plugin_info;

    if (!window.bootPlugins) window.bootPlugins = [];
    window.bootPlugins.push(setup);
    if (window.iitcLoaded && typeof setup === 'function') setup();
}

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