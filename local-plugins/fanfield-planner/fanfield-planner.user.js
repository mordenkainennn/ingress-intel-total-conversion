// ==UserScript==
// @id             iitc-plugin-fanfield-planner@Cloverjune
// @name           IITC Plugin: Cloverjune's Fanfield Planner
// @version        2.2.0
// @description    Plugin for planning fanfields/pincushions in IITC (Phase 1 Safe Mode)
// @author         cloverjune
// @category       Layer
// @namespace      https://github.com/mordenkainennn/ingress-intel-total-conversion
// @updateURL      https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/fanfield-planner/fanfield-planner.meta.js
// @downloadURL    https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/fanfield-planner/fanfield-planner.user.js
// @match          https://intel.ingress.com/*
// @match          http://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
    if (typeof window.plugin !== 'function') window.plugin = function () { };
    const self = (window.plugin.fanfieldPlanner = function () { });

    self.changelog = [
        {
            version: '2.2.0',
            changes: ['FEAT: Add triangle-based portal discovery with included/excluded lists so large fanfields can be curated without manual base selection.'],
        },
        {
            version: '2.1.10',
            changes: ['FEAT: Warn when Phase 2 reflection requires SBUL mods for more than 8 outgoing links.'],
        },
        {
            version: '2.1.9',
            changes: ['FEAT: Summary now includes total AP from links and fields.'],
        },
        {
            version: '2.1.8',
            changes: ['FEAT: Summary now shows separate Phase 1/Phase 2 link and field counts plus totals.'],
        },
        {
            version: '2.1.7',
            changes: ['FEAT: Phase 2 now reflects against the full Phase 1 base graph and creates all closable fields.'],
        },
        {
            version: '2.1.6',
            changes: ['FIX: Phase 1 crosslink checks now validate against all previously planned links, not only anchor rays.'],
        },
        {
            version: '2.1.5',
            changes: ['FEAT: Phase 1 now greedily backlinks to as many historical bases as possible with crosslink checks.'],
        },
        {
            version: '2.1.4',
            changes: ['FIX: Restore 1.9-style planner UI and layer groups while keeping the current safe-mode plan logic.'],
        },
        {
            version: '2.1.3',
            changes: ['FIX: Render dialog into IITC dialog container (#dialog-<id>) to prevent blank UI.'],
        },
        {
            version: '2.1.1',
            changes: ['FIX: Corrected UserScript update/download URLs to point to the correct `master` branch.'],
        },
        {
            version: '2.1',
            changes: ['Initial release for fanfield planning.'],
        },
    ];

    self.anchorPortal = null;
    self.framePortals = [];
    self.basePortals = [];
    self.selectMode = 'anchor';
    self.includedPortalGuids = [];
    self.excludedPortalGuids = [];
    self.dialogId = 'fanfield-planner-view';
    self.dialogRef = null;
    self.linksLayerPhase1 = null;
    self.fieldsLayerPhase1 = null;
    self.linksLayerPhase2 = null;
    self.fieldsLayerPhase2 = null;

    /* =======================
       Geometry Helpers
       ======================= */

    self.distance = (p1, p2) => p1.distanceTo(p2);

    self.bearing = function (p1, p2) {
        const toRad = Math.PI / 180;
        const lat1 = p1.lat * toRad;
        const lon1 = p1.lng * toRad;
        const lat2 = p2.lat * toRad;
        const lon2 = p2.lng * toRad;
        const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
        const x =
            Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
        return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    };

    self.sortBasePortalsByAngle = function (baseGuids, anchorGuid) {
        const anchorLL = window.portals[anchorGuid].getLatLng();
        return baseGuids.slice().sort((a, b) => {
            const A = window.portals[a].getLatLng();
            const B = window.portals[b].getLatLng();
            return self.bearing(anchorLL, A) - self.bearing(anchorLL, B);
        });
    };

    self.findShortestPathForSortedBase = function (sortedBase) {
        if (sortedBase.length <= 1) return sortedBase;

        const pathLR = sortedBase.slice();
        const pathRL = sortedBase.slice().reverse();

        let distLR = 0;
        for (let i = 1; i < pathLR.length; i++) {
            distLR += self.distance(
                window.portals[pathLR[i - 1]].getLatLng(),
                window.portals[pathLR[i]].getLatLng()
            );
        }

        let distRL = 0;
        for (let i = 1; i < pathRL.length; i++) {
            distRL += self.distance(
                window.portals[pathRL[i - 1]].getLatLng(),
                window.portals[pathRL[i]].getLatLng()
            );
        }

        return distLR < distRL ? pathLR : pathRL;
    };

    self.latLngIsEqual = function (a, b) {
        return Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lng - b.lng) < 1e-9;
    };

    self.ccw = function (p1, p2, p3) {
        return (p3.lat - p1.lat) * (p2.lng - p1.lng) > (p2.lat - p1.lat) * (p3.lng - p1.lng);
    };

    self.segmentsIntersect = function (p1, p2, p3, p4) {
        if (
            self.latLngIsEqual(p1, p3) ||
            self.latLngIsEqual(p1, p4) ||
            self.latLngIsEqual(p2, p3) ||
            self.latLngIsEqual(p2, p4)
        ) {
            return false;
        }

        return self.ccw(p1, p3, p4) !== self.ccw(p2, p3, p4) &&
            self.ccw(p1, p2, p3) !== self.ccw(p1, p2, p4);
    };

    self.linkWouldCrossExisting = function (fromGuid, toGuid, existingSegments) {
        const fromPortal = window.portals[fromGuid];
        const toPortal = window.portals[toGuid];
        if (!fromPortal || !toPortal) return true;

        const fromLL = fromPortal.getLatLng();
        const toLL = toPortal.getLatLng();

        return existingSegments.some(segment => {
            const segFrom = window.portals[segment.from];
            const segTo = window.portals[segment.to];
            if (!segFrom || !segTo) return false;
            return self.segmentsIntersect(fromLL, toLL, segFrom.getLatLng(), segTo.getLatLng());
        });
    };

    self.makeUndirectedKey = function (a, b) {
        return a < b ? `${a}|${b}` : `${b}|${a}`;
    };

    self.dotProduct = function (a, b) {
        return a.x * b.x + a.y * b.y + a.z * b.z;
    };

    self.vectorSubtract = function (a, b) {
        return {
            x: a.x - b.x,
            y: a.y - b.y,
            z: a.z - b.z,
        };
    };

    self.pointInTriangle = function (pt, triangle) {
        const convertTo3D = function (latLng) {
            const lat = latLng.lat * Math.PI / 180;
            const lng = latLng.lng * Math.PI / 180;
            return {
                x: Math.cos(lat) * Math.cos(lng),
                y: Math.cos(lat) * Math.sin(lng),
                z: Math.sin(lat),
            };
        };

        const [p1, p2, p3] = triangle.map(convertTo3D);
        const pt3D = convertTo3D(pt);

        const v0 = self.vectorSubtract(p3, p1);
        const v1 = self.vectorSubtract(p2, p1);
        const v2 = self.vectorSubtract(pt3D, p1);

        const dot00 = self.dotProduct(v0, v0);
        const dot01 = self.dotProduct(v0, v1);
        const dot02 = self.dotProduct(v0, v2);
        const dot11 = self.dotProduct(v1, v1);
        const dot12 = self.dotProduct(v1, v2);

        const invDeno = 1 / (dot00 * dot11 - dot01 * dot01);
        const eps = 1e-6;
        const u = (dot11 * dot02 - dot01 * dot12) * invDeno;
        if (u <= eps || u >= 1 - eps) return false;

        const v = (dot00 * dot12 - dot01 * dot02) * invDeno;
        if (v <= eps || v >= 1 - eps) return false;

        return u + v < 1 - eps;
    };

    self.choosePhase2ReflectionOrder = function (sortedBase, adjacency) {
        const reflected = new Set();
        const remaining = new Set(sortedBase);
        const order = [];

        while (remaining.size > 0) {
            let bestGuid = null;
            let bestScore = -1;
            let bestIndex = Number.MAX_SAFE_INTEGER;

            sortedBase.forEach((guid, index) => {
                if (!remaining.has(guid)) return;
                const neighbors = adjacency.get(guid) || new Set();
                let score = 0;
                neighbors.forEach(neighbor => {
                    if (reflected.has(neighbor)) score++;
                });

                if (score > bestScore || (score === bestScore && index < bestIndex)) {
                    bestGuid = guid;
                    bestScore = score;
                    bestIndex = index;
                }
            });

            order.push(bestGuid);
            remaining.delete(bestGuid);
            reflected.add(bestGuid);
        }

        return order;
    };

    /* =======================
       Main Planning Logic
       ======================= */

    self.generateFanfieldPlan = function () {
        if (!self.anchorPortal || self.basePortals.length < 2) {
            throw new Error('Select one anchor and at least two base portals.');
        }

        const anchorGuid = self.anchorPortal.guid;
        const baseGuids = self.basePortals.map(p => p.guid);
        const missingPortals = baseGuids.filter(guid => !window.portals[guid]);

        if (!window.portals[anchorGuid] || missingPortals.length > 0) {
            throw new Error('Some selected portals are not currently loaded in the view. Please zoom in or reload data to ensure all portals are visible.');
        }

        const sortedBase = self.sortBasePortalsByAngle(baseGuids, anchorGuid);
        const optimizedTravelPath = self.findShortestPathForSortedBase(sortedBase);
        const anchorLL = window.portals[anchorGuid].getLatLng();

        const keysNeeded = {};
        baseGuids.forEach(guid => {
            keysNeeded[guid] = 0;
        });
        keysNeeded[anchorGuid] = 0;

        const stepActions = [];
        const phase1Segments = [];
        const phase1BaseEdgeSet = new Set();
        const phase1BaseAdjacency = new Map();

        const addPhase1BaseEdge = function (fromGuid, toGuid) {
            const key = self.makeUndirectedKey(fromGuid, toGuid);
            if (phase1BaseEdgeSet.has(key)) return;
            phase1BaseEdgeSet.add(key);

            if (!phase1BaseAdjacency.has(fromGuid)) phase1BaseAdjacency.set(fromGuid, new Set());
            if (!phase1BaseAdjacency.has(toGuid)) phase1BaseAdjacency.set(toGuid, new Set());
            phase1BaseAdjacency.get(fromGuid).add(toGuid);
            phase1BaseAdjacency.get(toGuid).add(fromGuid);
        };

        optimizedTravelPath.forEach((guid, index) => {
            const links = [];

            links.push({ to: anchorGuid, type: 'anchor' });
            keysNeeded[anchorGuid]++;
            phase1Segments.push({ from: guid, to: anchorGuid });

            if (index > 0) {
                const prevGuid = optimizedTravelPath[index - 1];
                if (!self.linkWouldCrossExisting(guid, prevGuid, phase1Segments)) {
                    links.push({ to: prevGuid, type: 'chain' });
                    keysNeeded[prevGuid]++;
                    phase1Segments.push({ from: guid, to: prevGuid });
                    addPhase1BaseEdge(guid, prevGuid);
                }

                for (let k = index - 2; k >= 0; k--) {
                    const backGuid = optimizedTravelPath[k];
                    if (!self.linkWouldCrossExisting(guid, backGuid, phase1Segments)) {
                        links.push({ to: backGuid, type: 'layer' });
                        keysNeeded[backGuid]++;
                        phase1Segments.push({ from: guid, to: backGuid });
                        addPhase1BaseEdge(guid, backGuid);
                    }
                }
            }

            stepActions.push({ guid, links });
        });

        baseGuids.forEach(guid => {
            keysNeeded[guid]++;
        });

        const plan = [];
        let lastVisited = null;
        let totalDistance = 0;
        let linkCount = 0;
        let fieldCount = 0;
        let phase1LinkCount = 0;
        let phase1FieldCount = 0;
        let phase2LinkCount = 0;
        let phase2FieldCount = 0;

        plan.push({
            type: 'header',
            text: 'Phase 1: Build Base Fanfield (Greedy Triangulation)',
        });

        stepActions.forEach(step => {
            const guid = step.guid;
            const ll = window.portals[guid].getLatLng();
            let dist = 0;

            if (lastVisited) {
                dist = self.distance(
                    window.portals[lastVisited].getLatLng(),
                    ll
                );
                totalDistance += dist;
            }

            plan.push({
                type: 'visit',
                guid,
                from: lastVisited,
                distance: dist,
                phase: 1,
                keysToFarm: keysNeeded[guid],
            });

            step.links.forEach(link => {
                plan.push({ type: 'link', from: guid, to: link.to, phase: 1 });
                linkCount++;
                phase1LinkCount++;

                if (link.type === 'chain' || link.type === 'layer') {
                    plan.push({
                        type: 'field',
                        p1: guid,
                        p2: anchorGuid,
                        p3: link.to,
                        phase: 1,
                    });
                    fieldCount++;
                    phase1FieldCount++;
                }
            });

            lastVisited = guid;
        });

        /* =======================
           Phase 2 (unchanged)
           ======================= */

        plan.push({
            type: 'header',
            text: 'Phase 2: Re-throw from Anchor',
        });

        const backDist = self.distance(
            window.portals[lastVisited].getLatLng(),
            window.portals[anchorGuid].getLatLng()
        );
        totalDistance += backDist;

        plan.push({
            type: 'visit',
            guid: anchorGuid,
            from: lastVisited,
            distance: backDist,
            phase: 2,
            keysToFarm: 0,
        });

        plan.push({ type: 'destroy', guid: anchorGuid, phase: 2 });

        const phase2Order = self.choosePhase2ReflectionOrder(sortedBase, phase1BaseAdjacency);
        const reflectedBaseSet = new Set();

        phase2Order.forEach(guid => {
            plan.push({ type: 'link', from: anchorGuid, to: guid, phase: 2 });
            linkCount++;
            phase2LinkCount++;

            const neighbors = phase1BaseAdjacency.get(guid) || new Set();
            neighbors.forEach(neighbor => {
                if (!reflectedBaseSet.has(neighbor)) return;
                plan.push({
                    type: 'field',
                    p1: anchorGuid,
                    p2: neighbor,
                    p3: guid,
                    phase: 2,
                });
                fieldCount++;
                phase2FieldCount++;
            });

            reflectedBaseSet.add(guid);
        });

        plan.push({
            type: 'summary',
            linkCount,
            fieldCount,
            phase1LinkCount,
            phase1FieldCount,
            phase2LinkCount,
            phase2FieldCount,
            phase2RequiredSbul: Math.max(0, Math.ceil((phase2LinkCount - 8) / 8)),
            totalAp: linkCount * 313 + fieldCount * 1250,
            totalDistance,
            keysNeeded,
            basePortalsCount: baseGuids.length,
        });

        return plan;
    };

    self.dialog_html = `
        <div id="fanfield-planner-container">
            <div class="fanfield-select-mode-container">
                <strong>Selection Mode:</strong>
                <label><input type="radio" name="fanfield-select-mode" value="anchor" checked> Select Anchor</label>
                <label><input type="radio" name="fanfield-select-mode" value="frame"> Select Outer Corners</label>
                <label><input type="radio" name="fanfield-select-mode" value="manual"> Add Base Portals</label>
            </div>

            <fieldset>
                <legend>Anchor Portal</legend>
                <div id="fanfield-anchor-portal-details">
                    <div class="placeholder">Please select one anchor portal.</div>
                </div>
            </fieldset>

            <fieldset>
                <legend>Outer Triangle</legend>
                <div id="fanfield-frame-portal-details">
                    <div class="placeholder">Please select two additional outer corners.</div>
                </div>
                <div id="fanfield-scan-controls">
                    <button id="fanfield-scan-btn" type="button">Scan Triangle</button>
                    <button id="fanfield-reset-candidates-btn" type="button">Reset Lists</button>
                </div>
            </fieldset>

            <fieldset>
                <legend>Candidate Base Portals</legend>
                <div class="fanfield-candidate-layout">
                    <div class="fanfield-candidate-column">
                        <label for="fanfield-included-portals"><strong>Included</strong></label>
                        <select id="fanfield-included-portals" multiple></select>
                    </div>
                    <div class="fanfield-candidate-actions">
                        <button id="fanfield-move-to-excluded" type="button">&gt;</button>
                        <button id="fanfield-move-to-included" type="button">&lt;</button>
                    </div>
                    <div class="fanfield-candidate-column">
                        <label for="fanfield-excluded-portals"><strong>Excluded</strong></label>
                        <select id="fanfield-excluded-portals" multiple></select>
                    </div>
                </div>
            </fieldset>

            <fieldset>
                <legend>Base Portals (<span id="fanfield-base-count">0</span> selected)</legend>
                <div id="fanfield-base-portals-list">
                    <div class="placeholder">Scan a triangle or add base portals manually.</div>
                </div>
            </fieldset>

            <div id="fanfield-buttons-container">
                <button id="plan-fanfield-btn" disabled>Plan Fanfield</button>
                <button id="clear-fanfield-btn">Clear Portals</button>
            </div>

            <textarea id="fanfield-plan-text" readonly placeholder="Planning results will appear here."></textarea>
            <style>
                #fanfield-planner-container { display:flex; flex-direction:column; gap:8px; }
                .fanfield-select-mode-container, #fanfield-buttons-container { padding:5px 0; }
                #fanfield-scan-controls { display:flex; gap:8px; margin-top:8px; }
                #fanfield-base-portals-list { max-height:150px; overflow-y:auto; display:flex; flex-direction:column; gap:5px; }
                .fanfield-portal-item { display:flex; align-items:center; background:rgba(0,0,0,0.3); padding:3px; border-radius:4px; gap:8px; }
                .fanfield-portal-item img { width:40px; height:40px; border-radius:4px; }
                .fanfield-remove-btn { margin-left:auto; cursor:pointer; color:#ff5555; }
                .fanfield-frame-grid { display:flex; gap:8px; flex-wrap:wrap; }
                .fanfield-frame-grid .fanfield-portal-item { flex:1 1 45%; }
                .fanfield-candidate-layout { display:grid; grid-template-columns:1fr 44px 1fr; gap:8px; align-items:center; }
                .fanfield-candidate-column { display:flex; flex-direction:column; gap:6px; }
                .fanfield-candidate-column select { min-height:160px; width:100%; box-sizing:border-box; }
                .fanfield-candidate-actions { display:flex; flex-direction:column; gap:8px; }
                #fanfield-plan-text { height:220px; resize:vertical; width:100%; box-sizing:border-box; }
                .placeholder { color:#999; text-align:center; padding:10px; }
            </style>
        </div>
    `;

    self.escapeHtml = function (text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    self.getPortalTitle = function (guid) {
        const portal = window.portals[guid];
        if (!portal || !portal.options || !portal.options.data) return '[Unknown Portal]';
        const title = portal.options.data.title || portal._details?.title;
        if (!title) return '[Portal name not loaded]';
        const isCoordinate = /^-?[\d.]+, ?-?[\d.]+$/.test(title);
        return isCoordinate ? '[Portal name not loaded]' : title;
    };

    self.getPortalImage = function (portal) {
        return portal?.details?.image || window.portals[portal?.guid]?.options?.data?.image || window.DEFAULT_PORTAL_IMG;
    };

    self.getPortalRecord = function (guid) {
        if (!guid) return null;
        const portal = window.portals[guid];
        if (!portal) return null;
        return {
            guid,
            details: portal._details || { title: portal.options?.data?.title, image: portal.options?.data?.image },
        };
    };

    self.syncBasePortalsFromIncluded = function () {
        self.basePortals = self.includedPortalGuids
            .map(guid => self.getPortalRecord(guid))
            .filter(Boolean);
    };

    self.getTriangleCornerGuids = function () {
        if (!self.anchorPortal || self.framePortals.length !== 2) return [];
        return [self.anchorPortal.guid, self.framePortals[0].guid, self.framePortals[1].guid];
    };

    self.getPortalsInTriangle = function (triangleGuids, portalsToConsider) {
        const triangleLatLngs = triangleGuids.map(guid => {
            const portal = window.portals[guid];
            return portal ? portal.getLatLng() : null;
        });

        if (triangleLatLngs.some(latLng => latLng === null)) return [];

        const portalGuids = portalsToConsider || Object.keys(window.portals);
        return portalGuids.filter(guid => {
            const portal = window.portals[guid];
            return portal && self.pointInTriangle(portal.getLatLng(), triangleLatLngs);
        });
    };

    self.sortPortalGuidsByTitle = function (guids) {
        return guids.slice().sort((a, b) => self.getPortalTitle(a).localeCompare(self.getPortalTitle(b)));
    };

    self.scanTrianglePortals = function () {
        const triangleGuids = self.getTriangleCornerGuids();
        if (triangleGuids.length !== 3) {
            throw new Error('Select the anchor and two additional outer corners before scanning.');
        }

        const corners = new Set(triangleGuids);
        const discovered = self.getPortalsInTriangle(triangleGuids, Object.keys(window.portals))
            .filter(guid => !corners.has(guid));

        self.includedPortalGuids = self.sortPortalGuidsByTitle(discovered);
        self.excludedPortalGuids = [];
        self.syncBasePortalsFromIncluded();
        self.updateDialog();
    };

    self.moveSelectedCandidates = function (sourceSelector, destinationSelector) {
        const dialogElement = self.getDialogElement();
        const selected = dialogElement.find(`${sourceSelector} option:selected`).map(function () {
            return $(this).val();
        }).get();
        if (selected.length === 0) return;

        if (sourceSelector === '#fanfield-included-portals') {
            self.includedPortalGuids = self.includedPortalGuids.filter(guid => !selected.includes(guid));
            self.excludedPortalGuids = self.sortPortalGuidsByTitle(self.excludedPortalGuids.concat(selected));
        } else {
            self.excludedPortalGuids = self.excludedPortalGuids.filter(guid => !selected.includes(guid));
            self.includedPortalGuids = self.sortPortalGuidsByTitle(self.includedPortalGuids.concat(selected));
        }

        self.syncBasePortalsFromIncluded();
        self.updateDialog();
    };

    self.getDialogElement = function () {
        const byId = $(`#dialog-${self.dialogId}`);
        if (byId.length) return byId;
        if (self.dialogRef && self.dialogRef.length && $.contains(document, self.dialogRef[0])) {
            return self.dialogRef;
        }
        return $();
    };

    self.dialogIsOpen = function () {
        const dialogElement = self.getDialogElement();
        return dialogElement.length > 0 && dialogElement.hasClass('ui-dialog-content') && dialogElement.dialog('isOpen');
    };

    self.updateDialog = function () {
        const dialogElement = self.getDialogElement();
        if (!dialogElement.length) return;

        const anchorDiv = dialogElement.find('#fanfield-anchor-portal-details');
        anchorDiv.empty();
        if (self.anchorPortal) {
            anchorDiv.append(`
                <div class="fanfield-portal-item">
                    <img src="${self.escapeHtml(self.getPortalImage(self.anchorPortal))}" alt="${self.escapeHtml(self.getPortalTitle(self.anchorPortal.guid))}">
                    <span>${self.escapeHtml(self.getPortalTitle(self.anchorPortal.guid))}</span>
                </div>
            `);
        } else {
            anchorDiv.append('<div class="placeholder">Please select one anchor portal.</div>');
        }

        const frameDiv = dialogElement.find('#fanfield-frame-portal-details');
        frameDiv.empty();
        if (self.framePortals.length > 0) {
            frameDiv.append('<div class="fanfield-frame-grid"></div>');
            const frameGrid = frameDiv.find('.fanfield-frame-grid');
            self.framePortals.forEach((portal, index) => {
                frameGrid.append(`
                    <div class="fanfield-portal-item">
                        <img src="${self.escapeHtml(self.getPortalImage(portal))}" alt="${self.escapeHtml(self.getPortalTitle(portal.guid))}">
                        <span>Corner ${index + 2}: ${self.escapeHtml(self.getPortalTitle(portal.guid))}</span>
                    </div>
                `);
            });
            for (let i = self.framePortals.length; i < 2; i++) {
                frameGrid.append('<div class="placeholder">Select one more outer corner.</div>');
            }
        } else {
            frameDiv.append('<div class="placeholder">Please select two additional outer corners.</div>');
        }

        const includedList = dialogElement.find('#fanfield-included-portals');
        const excludedList = dialogElement.find('#fanfield-excluded-portals');
        includedList.empty();
        excludedList.empty();
        self.sortPortalGuidsByTitle(self.includedPortalGuids).forEach(guid => {
            includedList.append(`<option value="${self.escapeHtml(guid)}">${self.escapeHtml(self.getPortalTitle(guid))}</option>`);
        });
        self.sortPortalGuidsByTitle(self.excludedPortalGuids).forEach(guid => {
            excludedList.append(`<option value="${self.escapeHtml(guid)}">${self.escapeHtml(self.getPortalTitle(guid))}</option>`);
        });

        const baseListDiv = dialogElement.find('#fanfield-base-portals-list');
        baseListDiv.empty();
        dialogElement.find('#fanfield-base-count').text(self.basePortals.length);
        if (self.basePortals.length > 0) {
            self.basePortals.forEach((portal, index) => {
                baseListDiv.append(`
                    <div class="fanfield-portal-item">
                        <img src="${self.escapeHtml(self.getPortalImage(portal))}" alt="${self.escapeHtml(self.getPortalTitle(portal.guid))}">
                        <span>${self.escapeHtml(self.getPortalTitle(portal.guid))}</span>
                        <a class="fanfield-remove-btn" data-index="${index}" title="Remove">X</a>
                    </div>
                `);
            });
        } else {
            baseListDiv.append('<div class="placeholder">Scan a triangle or add base portals manually.</div>');
        }

        dialogElement.find(`input[name="fanfield-select-mode"][value="${self.selectMode}"]`).prop('checked', true);
        dialogElement.find('#fanfield-scan-btn').prop('disabled', !(self.anchorPortal && self.framePortals.length === 2));
        dialogElement.find('#plan-fanfield-btn').prop('disabled', !(self.anchorPortal && self.basePortals.length >= 2));
    };

    self.resetSelection = function () {
        self.anchorPortal = null;
        self.framePortals = [];
        self.basePortals = [];
        self.includedPortalGuids = [];
        self.excludedPortalGuids = [];
        self.updateDialog();
        const dialogElement = self.getDialogElement();
        dialogElement.find('#fanfield-plan-text').val('');
        self.clearLayers();
    };

    self.attachEventHandler = function () {
        const dialogElement = self.getDialogElement();
        if (!dialogElement.length) return;

        dialogElement.off('.fanfieldPlanner');
        $(document).off('click.fanfieldPlannerRemove');

        dialogElement.on('change.fanfieldPlanner', 'input[name="fanfield-select-mode"]', function () {
            const mode = $(this).val();
            self.selectMode = mode === 'frame' || mode === 'manual' ? mode : 'anchor';
        });

        dialogElement.on('click.fanfieldPlanner', '#clear-fanfield-btn', function () {
            self.resetSelection();
        });

        dialogElement.on('click.fanfieldPlanner', '#fanfield-scan-btn', function () {
            try {
                self.scanTrianglePortals();
            } catch (err) {
                dialogElement.find('#fanfield-plan-text').val(`Triangle scan failed:\n${err.message}`);
            }
        });

        dialogElement.on('click.fanfieldPlanner', '#fanfield-reset-candidates-btn', function () {
            self.includedPortalGuids = [];
            self.excludedPortalGuids = [];
            self.syncBasePortalsFromIncluded();
            self.updateDialog();
        });

        dialogElement.on('click.fanfieldPlanner', '#fanfield-move-to-excluded', function () {
            self.moveSelectedCandidates('#fanfield-included-portals', '#fanfield-excluded-portals');
        });

        dialogElement.on('click.fanfieldPlanner', '#fanfield-move-to-included', function () {
            self.moveSelectedCandidates('#fanfield-excluded-portals', '#fanfield-included-portals');
        });

        dialogElement.on('click.fanfieldPlanner', '#plan-fanfield-btn', function () {
            try {
                const plan = self.generateFanfieldPlan();
                dialogElement.find('#fanfield-plan-text').val(self.planToText(plan));
                self.drawPlan(plan);
            } catch (err) {
                dialogElement.find('#fanfield-plan-text').val(`An error occurred during planning:\n${err.message}`);
                self.clearLayers();
            }
        });

        $(document).on('click.fanfieldPlannerRemove', '#dialog-' + self.dialogId + ' .fanfield-remove-btn', function () {
            const indexToRemove = $(this).data('index');
            const removed = self.basePortals[indexToRemove];
            if (!removed) return;
            self.includedPortalGuids = self.includedPortalGuids.filter(guid => guid !== removed.guid);
            if (!self.excludedPortalGuids.includes(removed.guid)) {
                self.excludedPortalGuids = self.sortPortalGuidsByTitle(self.excludedPortalGuids.concat([removed.guid]));
            }
            self.syncBasePortalsFromIncluded();
            self.updateDialog();
        });
    };

    self.clearLayers = function () {
        if (self.linksLayerPhase1) self.linksLayerPhase1.clearLayers();
        if (self.fieldsLayerPhase1) self.fieldsLayerPhase1.clearLayers();
        if (self.linksLayerPhase2) self.linksLayerPhase2.clearLayers();
        if (self.fieldsLayerPhase2) self.fieldsLayerPhase2.clearLayers();
    };

    self.drawLink = function (layerGroup, fromLatLng, toLatLng, color) {
        if (!layerGroup) return;
        L.polyline([fromLatLng, toLatLng], {
            color,
            opacity: 1,
            weight: 3,
            clickable: false,
            interactive: false,
        }).addTo(layerGroup);
    };

    self.drawField = function (layerGroup, p1LatLng, p2LatLng, p3LatLng, color) {
        if (!layerGroup) return;
        L.polygon([p1LatLng, p2LatLng, p3LatLng], {
            stroke: false,
            fill: true,
            fillColor: color,
            fillOpacity: 0.1,
            clickable: false,
            interactive: false,
        }).addTo(layerGroup);
    };

    self.drawPlan = function (plan) {
        self.clearLayers();
        if (!plan) return;

        const phase1Color = '#ff00ff';
        const phase2Color = '#ffff00';

        plan.forEach(action => {
            if (action.type === 'link') {
                const fromPortal = window.portals[action.from];
                const toPortal = window.portals[action.to];
                if (!fromPortal || !toPortal) return;
                const layerGroup = action.phase === 1 ? self.linksLayerPhase1 : self.linksLayerPhase2;
                const color = action.phase === 1 ? phase1Color : phase2Color;
                self.drawLink(layerGroup, fromPortal.getLatLng(), toPortal.getLatLng(), color);
            }

            if (action.type === 'field') {
                const p1 = window.portals[action.p1];
                const p2 = window.portals[action.p2];
                const p3 = window.portals[action.p3];
                if (!p1 || !p2 || !p3) return;
                const layerGroup = action.phase === 1 ? self.fieldsLayerPhase1 : self.fieldsLayerPhase2;
                const color = action.phase === 1 ? phase1Color : phase2Color;
                self.drawField(layerGroup, p1.getLatLng(), p2.getLatLng(), p3.getLatLng(), color);
            }
        });
    };

    self.buildDirection = function (compass1, compass2, angle) {
        if (angle < 0) angle += 360;
        if (angle === 0) return compass1;
        if (angle === 45) return compass1 + compass2;
        if (angle > 45) return self.buildDirection(compass2, compass1, 90 - angle);
        return compass1 + ' ' + Math.round(angle) + ' deg ' + compass2;
    };

    self.formatBearing = function (bearing) {
        const normalized = (bearing + 360) % 360;
        if (normalized <= 90) return self.buildDirection('N', 'E', normalized);
        if (normalized <= 180) return self.buildDirection('S', 'E', 180 - normalized);
        if (normalized <= 270) return self.buildDirection('S', 'W', normalized - 180);
        return self.buildDirection('N', 'W', 360 - normalized);
    };

    self.formatDistance = function (distanceMeters) {
        if (distanceMeters < 1000) return `${Math.round(distanceMeters)}m`;
        return `${(distanceMeters / 1000).toFixed(2)}km`;
    };

    self.planToText = function (plan) {
        if (!plan) return 'No plan generated.';

        let planText = '';
        let step = 1;

        plan.forEach(action => {
            switch (action.type) {
                case 'header':
                    planText += `\n--- ${action.text} ---\n`;
                    if (action.text === 'Phase 2: Re-throw from Anchor') {
                        const summary = plan.find(stepItem => stepItem.type === 'summary');
                        if (summary && summary.phase2RequiredSbul > 0) {
                            planText += `[!] Prepare ${summary.phase2RequiredSbul} SBUL mod(s) before starting Phase 2.\n`;
                            if (summary.phase2RequiredSbul > 2) {
                                planText += `[!] This exceeds the usual solo self-deploy limit of 2 mods.\n`;
                            }
                        }
                    }
                    step = 1;
                    break;
                case 'visit': {
                    let visitText = `Step ${step++} (Phase ${action.phase}): Go to portal ${self.getPortalTitle(action.guid)}.`;
                    if (action.from && window.portals[action.from] && window.portals[action.guid]) {
                        const fromLL = window.portals[action.from].getLatLng();
                        const toLL = window.portals[action.guid].getLatLng();
                        visitText += ` (${self.formatDistance(action.distance)}, ${self.formatBearing(self.bearing(fromLL, toLL))})`;
                    }
                    if (action.keysToFarm > 0) {
                        visitText += `\n      [!] Farm at least ${action.keysToFarm} keys here.`;
                    }
                    planText += visitText + '\n';
                    break;
                }
                case 'link':
                    planText += `    - (Phase ${action.phase}) Link from ${self.getPortalTitle(action.from)} to ${self.getPortalTitle(action.to)}\n`;
                    break;
                case 'field':
                    planText += `    -> (Phase ${action.phase}) FIELD created: ${self.getPortalTitle(action.p1)}, ${self.getPortalTitle(action.p2)}, ${self.getPortalTitle(action.p3)}\n`;
                    break;
                case 'destroy':
                    planText += `Step ${step++} (Phase ${action.phase}): Destroy and recapture portal ${self.getPortalTitle(action.guid)}.\n`;
                    break;
                case 'summary':
                    planText += '\n--- SUMMARY ---\n';
                    planText += `Base Portals: ${action.basePortalsCount}\n`;
                    planText += `Phase 1 Links: ${action.phase1LinkCount}\n`;
                    planText += `Phase 1 Fields: ${action.phase1FieldCount}\n`;
                    planText += `Phase 2 Links: ${action.phase2LinkCount}\n`;
                    planText += `Phase 2 Fields: ${action.phase2FieldCount}\n`;
                    if (action.phase2RequiredSbul > 0) {
                        planText += `Required SBUL for Phase 2: ${action.phase2RequiredSbul}\n`;
                        if (action.phase2RequiredSbul > 2) {
                            planText += 'Solo self-deploy limit exceeded: yes\n';
                        }
                    } else {
                        planText += 'Required SBUL for Phase 2: 0\n';
                    }
                    planText += `Total Links: ${action.linkCount}\n`;
                    planText += `Total Fields: ${action.fieldCount}\n`;
                    planText += `Total AP: ${action.totalAp}\n`;
                    planText += `Estimated Travel Distance: ${self.formatDistance(action.totalDistance)}\n\n`;
                    planText += 'Total Keys Required (check individual steps for farming location):\n';
                    Object.keys(action.keysNeeded || {}).forEach(guid => {
                        if (action.keysNeeded[guid] > 0) {
                            planText += `  - ${action.keysNeeded[guid]}x keys for ${self.getPortalTitle(guid)}\n`;
                        }
                    });
                    break;
                default:
                    break;
            }
        });

        return planText;
    };

    self.portalSelected = function (data) {
        if (!self.dialogIsOpen()) return;

        const portalRecord = self.getPortalRecord(data.selectedPortalGuid);
        if (!portalRecord) return;

        if (self.selectMode === 'anchor') {
            self.anchorPortal = portalRecord;
            self.framePortals = self.framePortals.filter(portal => portal.guid !== portalRecord.guid);
            self.includedPortalGuids = self.includedPortalGuids.filter(guid => guid !== portalRecord.guid);
            self.excludedPortalGuids = self.excludedPortalGuids.filter(guid => guid !== portalRecord.guid);
            self.syncBasePortalsFromIncluded();
        } else if (self.selectMode === 'frame') {
            if (!self.anchorPortal) {
                self.anchorPortal = portalRecord;
            } else if (portalRecord.guid !== self.anchorPortal.guid && !self.framePortals.some(portal => portal.guid === portalRecord.guid)) {
                if (self.framePortals.length >= 2) self.framePortals.shift();
                self.framePortals.push(portalRecord);
                self.includedPortalGuids = self.includedPortalGuids.filter(guid => guid !== portalRecord.guid);
                self.excludedPortalGuids = self.excludedPortalGuids.filter(guid => guid !== portalRecord.guid);
                self.syncBasePortalsFromIncluded();
            }
        } else if (self.selectMode === 'manual') {
            if (
                portalRecord.guid !== self.anchorPortal?.guid &&
                !self.framePortals.some(portal => portal.guid === portalRecord.guid) &&
                !self.includedPortalGuids.includes(portalRecord.guid)
            ) {
                self.includedPortalGuids = self.sortPortalGuidsByTitle(self.includedPortalGuids.concat([portalRecord.guid]));
                self.excludedPortalGuids = self.excludedPortalGuids.filter(guid => guid !== portalRecord.guid);
                self.syncBasePortalsFromIncluded();
            }
        }

        self.updateDialog();
    };

    self.openDialog = function () {
        if (self.dialogIsOpen()) {
            self.updateDialog();
            return;
        }

        self.dialogRef = window.dialog({
            id: self.dialogId,
            title: 'Fanfield Planner',
            html: self.dialog_html,
            width: 520,
            minHeight: 520,
        });

        self.attachEventHandler();
        self.updateDialog();
    };

    /* =======================
       Boilerplate / Setup
       ======================= */

    self.setup = function () {
        self.anchorPortal = null;
        self.framePortals = [];
        self.basePortals = [];
        self.includedPortalGuids = [];
        self.excludedPortalGuids = [];

        $('#toolbox').append(
            '<a onclick="window.plugin.fanfieldPlanner.openDialog(); return false;">Fanfield Planner</a>'
        );

        window.addHook('portalSelected', self.portalSelected);

        if (!self.linksLayerPhase1) self.linksLayerPhase1 = new L.LayerGroup();
        if (!self.fieldsLayerPhase1) self.fieldsLayerPhase1 = new L.LayerGroup();
        if (!self.linksLayerPhase2) self.linksLayerPhase2 = new L.LayerGroup();
        if (!self.fieldsLayerPhase2) self.fieldsLayerPhase2 = new L.LayerGroup();

        window.addLayerGroup('Fanfield Plan (Links Phase 1)', self.linksLayerPhase1, false);
        window.addLayerGroup('Fanfield Plan (Fields Phase 1)', self.fieldsLayerPhase1, false);
        window.addLayerGroup('Fanfield Plan (Links Phase 2)', self.linksLayerPhase2, false);
        window.addLayerGroup('Fanfield Plan (Fields Phase 2)', self.fieldsLayerPhase2, false);
    };

    const setup = self.setup;
    setup.info = plugin_info;
    window.bootPlugins = window.bootPlugins || [];
    window.bootPlugins.push(setup);
    if (window.iitcLoaded) setup();
}

const script = document.createElement('script');
const info = typeof GM_info !== 'undefined' ? GM_info.script : {};
script.appendChild(
    document.createTextNode(`(${wrapper})(${JSON.stringify(info)})`)
);
(document.body || document.head).appendChild(script);
