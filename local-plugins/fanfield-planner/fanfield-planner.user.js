// ==UserScript==
// @id             iitc-plugin-fanfield-planner@mordenkainennn
// @name           IITC Plugin: mordenkainennn's Fanfield Planner
// @version        2.1.4
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
    self.basePortals = [];
    self.selectMode = 'anchor';
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

    /* =======================
       Main Planning Logic
       ======================= */

    self.generateFanfieldPlan = function () {
        if (!self.anchorPortal || self.basePortals.length < 2) {
            throw new Error('Select one anchor and at least two base portals.');
        }

        const anchorGuid = self.anchorPortal.guid;
        const baseGuids = self.basePortals.map(p => p.guid);

        const sortedBase = self.sortBasePortalsByAngle(baseGuids, anchorGuid);

        // Track actual Phase 1 links (bidirectional)
        const phase1Links = new Set();
        const hasLink = (a, b) =>
            phase1Links.has(`${a}|${b}`) || phase1Links.has(`${b}|${a}`);

        const plan = [];
        let lastVisited = null;
        let totalDistance = 0;
        let linkCount = 0;
        let fieldCount = 0;

        plan.push({
            type: 'header',
            text: 'Phase 1: Build Base Fanfield (Safe Mode)',
        });

        sortedBase.forEach((guid, index) => {
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
                keysToFarm: 1,
            });

            // 1. current -> anchor (always)
            plan.push({ type: 'link', from: guid, to: anchorGuid, phase: 1 });
            phase1Links.add(`${guid}|${anchorGuid}`);
            linkCount++;

            // 2. current -> previous (if exists)
            if (index > 0) {
                const prev = sortedBase[index - 1];
                plan.push({ type: 'link', from: guid, to: prev, phase: 1 });
                phase1Links.add(`${guid}|${prev}`);
                linkCount++;

                // Field only if triangle is fully closed
                if (
                    hasLink(guid, anchorGuid) &&
                    hasLink(prev, anchorGuid) &&
                    hasLink(guid, prev)
                ) {
                    plan.push({
                        type: 'field',
                        p1: guid,
                        p2: anchorGuid,
                        p3: prev,
                        phase: 1,
                    });
                    fieldCount++;
                }
            }

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

        sortedBase.forEach((guid, i) => {
            plan.push({ type: 'link', from: anchorGuid, to: guid, phase: 2 });
            linkCount++;

            if (i > 0) {
                plan.push({
                    type: 'field',
                    p1: anchorGuid,
                    p2: sortedBase[i - 1],
                    p3: guid,
                    phase: 2,
                });
                fieldCount++;
            }
        });

        plan.push({
            type: 'summary',
            linkCount,
            fieldCount,
            totalDistance,
            basePortalsCount: baseGuids.length,
        });

        return plan;
    };

    self.dialog_html = `
        <div id="fanfield-planner-container">
            <div class="fanfield-select-mode-container">
                <strong>Selection Mode:</strong>
                <label><input type="radio" name="fanfield-select-mode" value="anchor" checked> Select Anchor</label>
                <label><input type="radio" name="fanfield-select-mode" value="base"> Select Base Portals</label>
            </div>

            <fieldset>
                <legend>Anchor Portal</legend>
                <div id="fanfield-anchor-portal-details">
                    <div class="placeholder">Please select one anchor portal.</div>
                </div>
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
                #fanfield-planner-container { display:flex; flex-direction:column; gap:8px; }
                .fanfield-select-mode-container, #fanfield-buttons-container { padding:5px 0; }
                #fanfield-base-portals-list { max-height:150px; overflow-y:auto; display:flex; flex-direction:column; gap:5px; }
                .fanfield-portal-item { display:flex; align-items:center; background:rgba(0,0,0,0.3); padding:3px; border-radius:4px; gap:8px; }
                .fanfield-portal-item img { width:40px; height:40px; border-radius:4px; }
                .fanfield-remove-btn { margin-left:auto; cursor:pointer; color:#ff5555; }
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
            baseListDiv.append('<div class="placeholder">Please select at least 2 base portals.</div>');
        }

        dialogElement.find(`input[name="fanfield-select-mode"][value="${self.selectMode}"]`).prop('checked', true);
        dialogElement.find('#plan-fanfield-btn').prop('disabled', !(self.anchorPortal && self.basePortals.length >= 2));
    };

    self.resetSelection = function () {
        self.anchorPortal = null;
        self.basePortals = [];
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
            self.selectMode = $(this).val() === 'base' ? 'base' : 'anchor';
        });

        dialogElement.on('click.fanfieldPlanner', '#clear-fanfield-btn', function () {
            self.resetSelection();
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
            self.basePortals.splice(indexToRemove, 1);
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
                    planText += `Total Links: ${action.linkCount}\n`;
                    planText += `Total Fields: ${action.fieldCount}\n`;
                    planText += `Estimated Travel Distance: ${self.formatDistance(action.totalDistance)}\n`;
                    break;
                default:
                    break;
            }
        });

        return planText;
    };

    self.portalSelected = function (data) {
        if (!self.dialogIsOpen()) return;

        const details = window.portals[data.selectedPortalGuid]?._details;
        if (!details) return;

        if (self.selectMode === 'anchor') {
            self.anchorPortal = {
                guid: data.selectedPortalGuid,
                details,
            };
        } else if (!self.basePortals.some(p => p.guid === data.selectedPortalGuid)) {
            self.basePortals.push({
                guid: data.selectedPortalGuid,
                details,
            });
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
        self.basePortals = [];

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
