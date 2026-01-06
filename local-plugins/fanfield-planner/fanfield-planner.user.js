// ==UserScript==
// @id             iitc-plugin-fanfield-planner@mordenkainennn
// @name           IITC Plugin: mordenkainennn's Fanfield Planner
// @version        2.1
// @description    Plugin for planning fanfields/pincushions in IITC (Phase 1 Safe Mode)
// @author         mordenkainennn
// @category       Layer
// @namespace      https://github.com/mordenkainennn/ingress-intel-total-conversion
// @updateURL      https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/main/local-plugins/fanfield-planner/fanfield-planner.meta.js
// @downloadURL    https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/main/local-plugins/fanfield-planner/fanfield-planner.user.js
// @match          https://intel.ingress.com/*
// @match          http://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
    if (typeof window.plugin !== 'function') window.plugin = function () { };
    const self = (window.plugin.fanfieldPlanner = function () { });

    self.anchorPortal = null;
    self.basePortals = [];

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

    /* =======================
       Boilerplate / Setup
       ======================= */

    self.setup = function () {
        window.addHook('portalSelected', data => {
            const details = window.portals[data.selectedPortalGuid]?._details;
            if (!details) return;

            const mode = $('input[name="fanfield-select-mode"]:checked').val();
            if (mode === 'anchor') {
                self.anchorPortal = {
                    guid: data.selectedPortalGuid,
                    details,
                };
            } else {
                if (!self.basePortals.some(p => p.guid === data.selectedPortalGuid)) {
                    self.basePortals.push({
                        guid: data.selectedPortalGuid,
                        details,
                    });
                }
            }
        });
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
