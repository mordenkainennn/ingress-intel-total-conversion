// ==UserScript==
// @id             iitc-plugin-drone-planner@cloverjune
// @name           IITC Plugin: cloverjune's Drone Flight Planner
// @version        0.2.0.20260211
// @description    Plugin for planning drone flights in IITC
// @author         cloverjune
// @category       Layer
// @namespace      https://github.com/mordenkainennn/ingress-intel-total-conversion
// @updateURL      https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/drone-flight-planner/drone-flight-planner.meta.js
// @downloadURL    https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/master/local-plugins/drone-flight-planner/drone-flight-planner.user.js
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

pluginName = "mordenkainennn's Drone Planner";
version = "0.2.0.20260211";
changeLog = [
    {
        version: '0.2.0.20260211',
        changes: [
            'NEW: Added time-sliced A* for Perfect mode to keep the UI responsive.',
            'NEW: Added active S2 grid overlay and one-way jump warnings (with settings toggles).',
            'NEW: Added S2 cell pre-binning and cache resets on grid setting changes.',
            'UPD: Improved hop classification and heuristic to honor S2 mechanics.',
            'FIX: Updated DrawTools export and legacy settings migration for view radius.',
            'FIX: Settings now load on startup.',
        ],
    },
    {
        version: '0.1.1',
        changes: ['FIX: Corrected UserScript update/download URLs to point to the correct `master` branch.'],
    },
    {
        version: '0.1.0.20260116',
        changes: [
            'NEW: Implemented automatic saving and loading of flight plans to/from localStorage.',
            'NEW: Loaded plans are now fully actionable, including "Switch End to Start" functionality.',
            'UPD: Saved plan data is automatically pruned to include only the main path and its immediate neighbors, significantly reducing localStorage footprint.',
            'FIX: Corrected UI update timing to ensure the text area is populated correctly when dialog is opened after a plan is loaded.',
            'FIX: Ensured map layers are programmatically enabled when a plan is loaded to guarantee visibility.',
        ],
    },
    {
        version: '0.0.2.20260116',
        changes: [
            'NEW: Re-enabled "Perfect" optimization mode in the Drone Flight Planner dialog.',
            'UPD: User testing shows "Perfect" mode significantly improves path quality (fewer moves) without unacceptable performance overhead.',
        ],
    },
    {
        version: '0.0.1.20251231',
        changes: [
            'Forked from 57Cell and updated metadata for personal use.',
        ],
    },
    {
        version: '1.0.1.20250909',
        changes: [
            'NEW: Allow users to disallow the key trick',
        ],
    },
    {
        version: '1.0.0.20250816',
        changes: [
            'NEW: Initial Public Release',
        ],
    },
];

function wrapper(plugin_info) {
    if (typeof window.plugin !== 'function') window.plugin = function () { };
    plugin_info.buildName = '';
    plugin_info.dateTimeVersion = '20260211-120000';
    plugin_info.pluginId = 'mordenkainennnsDronePlanner';

    // PLUGIN START
    console.log('loading drone plugin')
    var changelog = changeLog;
    let self = window.plugin.dronePlanner = function () { };

    // --- S2 Geometry Library Integration ---
    const d2r = Math.PI / 180.0;
    const r2d = 180.0 / Math.PI;

    if (!window.S2) {
        (function () {
            window.S2 = {};

            function LatLngToXYZ(latLng) {
                const phi = latLng.lat * d2r;
                const theta = latLng.lng * d2r;
                const cosphi = Math.cos(phi);
                return [Math.cos(theta) * cosphi, Math.sin(theta) * cosphi, Math.sin(phi)];
            }

            function XYZToLatLng(xyz) {
                const lat = Math.atan2(xyz[2], Math.sqrt(xyz[0] * xyz[0] + xyz[1] * xyz[1]));
                const lng = Math.atan2(xyz[1], xyz[0]);
                return { lat: lat * r2d, lng: lng * r2d };
            }

            function largestAbsComponent(xyz) {
                const temp = [Math.abs(xyz[0]), Math.abs(xyz[1]), Math.abs(xyz[2])];
                if (temp[0] > temp[1]) {
                    if (temp[0] > temp[2]) return 0;
                    return 2;
                }
                if (temp[1] > temp[2]) return 1;
                return 2;
            }

            function faceXYZToUV(face, xyz) {
                let u, v;
                switch (face) {
                    case 0: u = xyz[1] / xyz[0]; v = xyz[2] / xyz[0]; break;
                    case 1: u = -xyz[0] / xyz[1]; v = xyz[2] / xyz[1]; break;
                    case 2: u = -xyz[0] / xyz[2]; v = -xyz[1] / xyz[2]; break;
                    case 3: u = xyz[2] / xyz[0]; v = xyz[1] / xyz[0]; break;
                    case 4: u = xyz[2] / xyz[1]; v = -xyz[0] / xyz[1]; break;
                    case 5: u = -xyz[1] / xyz[2]; v = -xyz[0] / xyz[2]; break;
                    default: throw { error: 'Invalid face' };
                }
                return [u, v];
            }

            function XYZToFaceUV(xyz) {
                let face = largestAbsComponent(xyz);
                if (xyz[face] < 0) face += 3;
                const uv = faceXYZToUV(face, xyz);
                return [face, uv];
            }

            function FaceUVToXYZ(face, uv) {
                const u = uv[0];
                const v = uv[1];
                switch (face) {
                    case 0: return [1, u, v];
                    case 1: return [-u, 1, v];
                    case 2: return [-u, -v, 1];
                    case 3: return [-1, -v, -u];
                    case 4: return [v, -1, -u];
                    case 5: return [v, u, -1];
                    default: throw { error: 'Invalid face' };
                }
            }

            function STToUV(st) {
                const singleSTtoUV = function (st) {
                    if (st >= 0.5) return (1 / 3.0) * (4 * st * st - 1);
                    return (1 / 3.0) * (1 - (4 * (1 - st) * (1 - st)));
                };
                return [singleSTtoUV(st[0]), singleSTtoUV(st[1])];
            }

            function UVToST(uv) {
                const singleUVtoST = function (uv) {
                    if (uv >= 0) return 0.5 * Math.sqrt(1 + 3 * uv);
                    return 1 - 0.5 * Math.sqrt(1 - 3 * uv);
                };
                return [singleUVtoST(uv[0]), singleUVtoST(uv[1])];
            }

            function STToIJ(st, order) {
                const maxSize = 1 << order;
                const singleSTtoIJ = function (st) {
                    const ij = Math.floor(st * maxSize);
                    return Math.max(0, Math.min(maxSize - 1, ij));
                };
                return [singleSTtoIJ(st[0]), singleSTtoIJ(st[1])];
            }

            function IJToST(ij, order, offsets) {
                const maxSize = 1 << order;
                return [
                    (ij[0] + offsets[0]) / maxSize,
                    (ij[1] + offsets[1]) / maxSize
                ];
            }

            S2.S2Cell = function () { };

            S2.S2Cell.FromLatLng = function (latLng, level) {
                const xyz = LatLngToXYZ(latLng);
                const faceuv = XYZToFaceUV(xyz);
                const st = UVToST(faceuv[1]);
                const ij = STToIJ(st, level);
                return S2.S2Cell.FromFaceIJ(faceuv[0], ij, level);
            };

            S2.S2Cell.FromFaceIJ = function (face, ij, level) {
                const cell = new S2.S2Cell();
                cell.face = face;
                cell.ij = ij;
                cell.level = level;
                return cell;
            };

            S2.S2Cell.prototype.toString = function () {
                return 'F' + this.face + 'ij[' + this.ij[0] + ',' + this.ij[1] + ']@' + this.level;
            };

            S2.S2Cell.prototype.getLatLng = function () {
                const st = IJToST(this.ij, this.level, [0.5, 0.5]);
                const uv = STToUV(st);
                const xyz = FaceUVToXYZ(this.face, uv);
                return XYZToLatLng(xyz);
            };

            S2.S2Cell.prototype.getCornerLatLngs = function () {
                const offsets = [
                    [0.0, 0.0], [0.0, 1.0], [1.0, 1.0], [1.0, 0.0]
                ];
                return offsets.map(offset => {
                    const st = IJToST(this.ij, this.level, offset);
                    const uv = STToUV(st);
                    const xyz = FaceUVToXYZ(this.face, uv);
                    return XYZToLatLng(xyz);
                });
            };

            S2.S2Cell.prototype.getNeighbors = function () {
                const fromFaceIJWrap = function (face, ij, level) {
                    const maxSize = 1 << level;
                    if (ij[0] >= 0 && ij[1] >= 0 && ij[0] < maxSize && ij[1] < maxSize) {
                        return S2.S2Cell.FromFaceIJ(face, ij, level);
                    }
                    let st = IJToST(ij, level, [0.5, 0.5]);
                    let uv = STToUV(st);
                    let xyz = FaceUVToXYZ(face, uv);
                    const faceuv = XYZToFaceUV(xyz);
                    return S2.S2Cell.FromFaceIJ(faceuv[0], STToIJ(UVToST(faceuv[1]), level), level);
                };
                const face = this.face;
                const i = this.ij[0];
                const j = this.ij[1];
                const level = this.level;
                const deltas = [
                    { a: -1, b: 0 }, { a: 0, b: -1 }, { a: 1, b: 0 }, { a: 0, b: 1 }
                ];
                return deltas.map(values => fromFaceIJWrap(face, [i + values.a, j + values.b], level));
            };
        })();
    }
    // --- End of S2 Geometry Library ---

    // Settings Management
    const KEY_SETTINGS = "plugin-drone-flight-planner-settings";
    
    self.defaultSettings = {
        // Appearance
        shortHopColor: "#cc44ff",
        longHopColor: "#ff0000",
        fullTreeColor: "#ffcc44",
        
        // Path Finding
        pathType: "min-long-hops", // min-hops, balanced, min-long-hops
        allowLongHops: "yes-long-hops", // yes-long-hops, no-long-hops
        optimisationType: "none", // none, greedy, balanced, perfect
        
        // S2 Mechanics
        useS2: true, // Toggle S2 logic
        s2Level: 16, // 16 or 17
        viewRadius: 550, // Replacing 'longHopLength', default 550m
        showOneWayWarning: true,
        displayActiveGrid: false
    };

    self.settings = Object.assign({}, self.defaultSettings);

    self.planRunToken = 0;

    self.loadSettings = function() {
        try {
            const saved = JSON.parse(localStorage.getItem(KEY_SETTINGS));
            if (saved) {
                if (saved.longHopLength !== undefined && saved.viewRadius === undefined) {
                    saved.viewRadius = saved.longHopLength;
                }
                if (saved.s2Level !== undefined) {
                    saved.s2Level = parseInt(saved.s2Level, 10);
                }
                if (saved.viewRadius !== undefined) {
                    saved.viewRadius = parseInt(saved.viewRadius, 10);
                }
                self.settings = Object.assign({}, self.defaultSettings, saved);
                if (![16, 17].includes(self.settings.s2Level)) {
                    self.settings.s2Level = self.defaultSettings.s2Level;
                }
                if (!Number.isFinite(self.settings.viewRadius)) {
                    self.settings.viewRadius = self.defaultSettings.viewRadius;
                }
            }
        } catch(e) {
            console.warn("DronePlanner: Failed to load settings", e);
        }
    };

    self.saveSettings = function() {
        localStorage.setItem(KEY_SETTINGS, JSON.stringify(self.settings));
    };

    // --- S2 Helper Functions & Cache ---
    
    self.reachableCellsCache = {}; // Map<S2CellString, Set<S2CellString>>
    self.portalCellIdByGuid = {}; // Map<PortalGuid, S2CellString>
    self.portalCellByGuid = {}; // Map<PortalGuid, S2Cell>

    self.clearReachabilityCache = function() {
        self.reachableCellsCache = {};
    }

    self.clearS2Caches = function() {
        self.reachableCellsCache = {};
        self.portalCellIdByGuid = {};
        self.portalCellByGuid = {};
    }

    function haversine(lat1, lon1, lat2, lon2) {
        const R = 6371e3; 
        const phi1 = lat1 * Math.PI / 180;
        const phi2 = lat2 * Math.PI / 180;
        const deltaPhi = (lat2 - lat1) * Math.PI / 180;
        const deltaLambda = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; 
    }

    function getCellFaceMidpointLatLngs(corners) {
        let midpoints = [];
        let _corners = [...corners, corners[0]];
        for (let i = 0; i < 4; i++) {
            const mlat = (_corners[i].lat + _corners[i + 1].lat) / 2;
            const mlng = (_corners[i].lng + _corners[i + 1].lng) / 2;
            midpoints.push({ "lat": mlat, "lng": mlng });
        }
        return midpoints;
    }

    function isCellInRange(cell, centerLatLng, radius) {
        const cellCenter = cell.getLatLng();
        if (haversine(cellCenter.lat, cellCenter.lng, centerLatLng.lat, centerLatLng.lng) < radius) return true;
        const corners = cell.getCornerLatLngs();
        for (let i = 0; i < corners.length; i++) {
            if (haversine(corners[i].lat, corners[i].lng, centerLatLng.lat, centerLatLng.lng) < radius) return true;
        }
        const midpoints = getCellFaceMidpointLatLngs(corners);
        for (let i = 0; i < midpoints.length; i++) {
            if (haversine(midpoints[i].lat, midpoints[i].lng, centerLatLng.lat, centerLatLng.lng) < radius) return true;
        }
        return false;
    }

    self.getReachableCells = function(centerLatLng) {
        const gridLevel = self.settings.s2Level;
        const radius = self.settings.viewRadius;
        const centerCell = S2.S2Cell.FromLatLng(centerLatLng, gridLevel);
        const centerCellId = centerCell.toString();
        
        // We use a combined key of CellID + Radius to allow radius adjustments
        const cacheKey = `${centerCellId}_${radius}`;
        if (self.reachableCellsCache[cacheKey]) return self.reachableCellsCache[cacheKey];

        const seenCells = new Set();
        const reachable = new Set();
        const queue = [centerCell];
        seenCells.add(centerCellId);
        reachable.add(centerCellId);

        while (queue.length > 0) {
            const current = queue.pop();
            const neighbors = current.getNeighbors();
            for (let n of neighbors) {
                const nStr = n.toString();
                if (!seenCells.has(nStr)) {
                    seenCells.add(nStr);
                    if (isCellInRange(n, centerLatLng, radius)) {
                        reachable.add(nStr);
                        queue.push(n);
                    }
                }
            }
        }
        self.reachableCellsCache[cacheKey] = reachable;
        return reachable;
    }

    self.getCellFromId = function(cellId) {
        if (!cellId) return null;
        const match = /^F(\d+)ij\[(\d+),(\d+)\]@(\d+)$/.exec(cellId);
        if (!match) return null;
        const face = parseInt(match[1], 10);
        const i = parseInt(match[2], 10);
        const j = parseInt(match[3], 10);
        const level = parseInt(match[4], 10);
        return S2.S2Cell.FromFaceIJ(face, [i, j], level);
    };

    self.getPortalCell = function(guid, latLng) {
        if (self.portalCellByGuid[guid]) return self.portalCellByGuid[guid];
        const ll = latLng || self.getLatLng(guid);
        if (!ll) return null;
        const cell = S2.S2Cell.FromLatLng(ll, self.settings.s2Level);
        self.portalCellByGuid[guid] = cell;
        self.portalCellIdByGuid[guid] = cell.toString();
        return cell;
    };

    self.getPortalCellId = function(guid, latLng) {
        if (self.portalCellIdByGuid[guid]) return self.portalCellIdByGuid[guid];
        const cell = self.getPortalCell(guid, latLng);
        return cell ? cell.toString() : null;
    };

    // helper function to convert portal ID to portal object
    function portalIdToObject(portalId) {
        let portals = self.allPortals; // IITC global object that contains all portal data
        let portal = portals[portalId] ? portals[portalId].options.data : null;

        // Convert portal to the structure expected by populatePortalData
        if (portal) {
            let lat = parseFloat(portal.latE6 / 1e6);
            let lng = parseFloat(portal.lngE6 / 1e6);
            return {
                id: portalId, // ID of the portal
                name: portal.title, // title of the portal
                latLng: new L.latLng(lat, lng), // use LatLng Class to stay more flexible
            };
        }

        return null;
    }

    // layerGroup for the draws
    self.linksLayerGroup = null;
    self.fieldsLayerGroup = null;
    self.highlightLayergroup = null;

    self.allPortals = {};
    self.graph = {};

    self.scanPortalsAndUpdateGraph = function () {
        let graph = self.graph;
        var bounds = map.getBounds(); // Current map view bounds

        for (let key in window.portals) {
            var portal = window.portals[key]; // Retrieve the portal object
            var portalLatLng = portal.getLatLng(); // Portal's latitude and longitude
            if (!self.allPortals.hasOwnProperty(key) && bounds.contains(portalLatLng)) {
                self.allPortals[key] = portal; // Add new portal
                if (window.S2) {
                    self.getPortalCellId(key, portalLatLng);
                }

                // Initialize graph entry for the new portal
                graph[key] = [];

                // Check distance to all other portals in self.allPortals
                for (let otherKey in self.allPortals) {
                    if (key !== otherKey) {
                        let distance = self.getDistance(key, otherKey);
                        if (distance <= self.getHardMaxDistance()) {
                            // Add bidirectional edges for close portals
                            graph[key].push(otherKey);
                            if (!graph[otherKey].includes(key)) { // Prevent duplicate entries
                                graph[otherKey].push(key);
                            }
                        }
                    }
                }
            }
        }
        self.updatePlan();
    }

    // TODO: make linkStyle editable in options dialog
    self.linkStyle = {
        color: '#FF0000',
        opacity: 1,
        weight: 1.5,
        clickable: false,
        interactive: false,
        smoothFactor: 10,
        dashArray: [12, 5, 4, 5, 6, 5, 8, 5, "100000"],
    };

    // TODO: make fieldStyle editable in options dialog
    self.fieldStyle = {
        stroke: false,
        fill: true,
        fillColor: '#FF0000',
        fillOpacity: 0.1,
        clickable: false,
        interactive: false,
    };

    self.updatePlan = function () {
        $("#hcf-plan-text").val("Please wait...");

        if (!self.startPortal) {
            $("#hcf-plan-text").val("Please click on a start portal...");
            return;
        }
        let graph = self.graph;
        const planToken = ++self.planRunToken;

        if (self.settings.optimisationType === 'perfect') {
            console.time("A* Time (Perfect)");
            let pnfp = self.createSpanningTreeAndFindFurthestPortal(graph);
            let previousNodes = pnfp.pn;
            let furthestPortal = pnfp.fp;
            let tree = self.constructTree(previousNodes);

            self.applyAStarAsync(graph, self.startPortal.guid, furthestPortal, self.heuristic, planToken, function (path) {
                if (planToken !== self.planRunToken) return;
                tree.furthestPath = path;
                self.plan = tree;
                console.timeEnd("A* Time (Perfect)");

                console.time("update Layer Time");
                self.updateLayer();
                console.timeEnd("update Layer Time");

                const planJson = self.getPlanAsJson();
                if (planJson) {
                    localStorage.setItem('drone-flight-plan-autosave', JSON.stringify(planJson));
                }
            });
            return;
        }

        console.time("A* Time");
        self.plan = self.findMinimumCostPath(graph);
        console.timeEnd("A* Time");

        console.time("update Layer Time");
        self.updateLayer();
        console.timeEnd("update Layer Time");

        // Save plan to localStorage
        const planJson = self.getPlanAsJson();
        if (planJson) {
            localStorage.setItem('drone-flight-plan-autosave', JSON.stringify(planJson));
        }
    }

    self.findMinimumCostPath = function (graph) {
        console.time("spanning tree Time");
        let pnfp = self.createSpanningTreeAndFindFurthestPortal(graph);
        let previousNodes = pnfp.pn;
        let furthestPortal = pnfp.fp;
        console.timeEnd("spanning tree Time");
        console.time("construct tree Time");
        let tree = self.constructTree(previousNodes);
        console.timeEnd("construct tree Time");
        console.time("furthest path Time");
        if (self.settings.optimisationType === 'none') {
            tree.furthestPath = self.reconstructPath(previousNodes, furthestPortal);
        } else {
            tree.furthestPath = self.applyAStar(graph, self.startPortal.guid, furthestPortal, self.heuristic);
        }
        console.timeEnd("furthest path Time");

        return tree;
    };

    self.createSpanningTreeAndFindFurthestPortal = function (graph) {
        let previousNodes = {};
        let visited = new Set();
        visited.add(self.startPortal.guid);
        let queue = [self.startPortal.guid];
        let furthestPortal = self.startPortal.guid;
        let maxDistance = 0;
        while (queue.length > 0) {
            let current = queue.shift();
            let currentDistance = self.getDistance(self.startPortal.guid, current);
            if (currentDistance > maxDistance) {
                maxDistance = currentDistance;
                furthestPortal = current;
            }

            if (graph[current]) {
                graph[current].forEach(neighbor => {
                    if (!visited.has(neighbor)) {
                        let hopInfo = self.getHopInfo(current, neighbor);
                        if (!hopInfo.reachable) {
                            return;
                        }
                        visited.add(neighbor);
                        previousNodes[neighbor] = current;
                        if (hopInfo.short) {
                            queue.unshift(neighbor);
                        } else {
                            queue.push(neighbor);
                        }
                    }
                });
            }
        }
        let rtn = { pn: previousNodes, fp: furthestPortal };
        return rtn;
    };

    self.getOptimisationScale = function () {
        switch (self.settings.optimisationType) {
            case 'perfect': return 1;
            case 'balanced': return 3;
            case 'greedy': return 10;
            default: return undefined;
        }
    }

    self.getHopInfo = function (fromGuid, toGuid) {
        const pA = self.getLatLng(fromGuid);
        const pB = self.getLatLng(toGuid);
        if (!pA || !pB) {
            return { distance: Infinity, short: false, long: false, reachable: false };
        }

        const dist = haversine(pA.lat, pA.lng, pB.lat, pB.lng);
        let isShort = false;

        // 1. Check Short Hop
        if (self.settings.useS2) {
            const reachableCells = self.getReachableCells(pA);
            const targetCellId = self.getPortalCellId(toGuid, pB);
            if (targetCellId && reachableCells.has(targetCellId)) {
                isShort = true;
            }
        } else {
            if (dist <= self.settings.viewRadius) {
                isShort = true;
            }
        }

        const isLong = !isShort && self.areLongHopsAllowed() && dist <= self.getHardMaxDistance();

        return { distance: dist, short: isShort, long: isLong, reachable: isShort || isLong };
    };

    // Combined reachability and cost logic
    self.getHopCost = function (fromGuid, toGuid) {
        const hopInfo = self.getHopInfo(fromGuid, toGuid);
        if (!hopInfo.reachable) return Infinity;

        // 1. Short Hop (Cost 1)
        if (hopInfo.short) return 1;

        // 2. Long Hop (Cost based on Path Type)
        if (hopInfo.long) {
            const PENALTY_MIN_HOPS = 1.01;
            const PENALTY_BALANCED = 3;
            const PENALTY_MIN_LONG_HOPS = 100;

            switch (self.settings.pathType) {
                case 'min-long-hops': return PENALTY_MIN_LONG_HOPS;
                case 'min-hops': return PENALTY_MIN_HOPS;
                case 'balanced': return PENALTY_BALANCED;
                default: return PENALTY_BALANCED;
            }
        }

        return Infinity;
    };

    self.heuristic = function (node, goal) {
        const pA = self.getLatLng(node);
        const pB = self.getLatLng(goal);
        if (!pA || !pB) return Infinity;

        if (self.settings.useS2) {
            const cellA = self.getPortalCell(node, pA);
            const cellB = self.getPortalCell(goal, pB);
            if (cellA && cellB && cellA.face === cellB.face) {
                const di = Math.abs(cellA.ij[0] - cellB.ij[0]);
                const dj = Math.abs(cellA.ij[1] - cellB.ij[1]);
                const gridSpan = Math.max(di, dj);
                const scale = self.getOptimisationScale();
                return gridSpan * (scale || 1);
            }
        }

        const distMetres = haversine(pA.lat, pA.lng, pB.lat, pB.lng);
        const viewRadius = self.settings.viewRadius;
        
        // Estimate cost based on straight line distance
        // Minimum possible cost is distance / max_hop_distance
        let minHops = Math.ceil(distMetres / 1250); 
        
        // If we only used short hops
        let shortHopOnlyCost = Math.ceil(distMetres / viewRadius);

        let scale = self.getOptimisationScale();
        return Math.min(minHops * 1.01, shortHopOnlyCost) * (scale || 1);
    }

    self.applyAStar = function (graph, start, end, heuristic) {
        let openSet = [start];
        let cameFrom = {};
        let gScore = { [start]: 0 };
        let fScore = { [start]: heuristic(start, end) };

        // Clear cache before each search to ensure fresh results if settings changed
        self.clearReachabilityCache();

        while (openSet.length > 0) {
            openSet.sort((a, b) => fScore[a] - fScore[b]);
            let current = openSet.shift();
            
            if (current === end) {
                return self.reconstructPath(cameFrom, current);
            }

            if (!graph[current]) continue;

            graph[current].forEach(neighbor => {
                const cost = self.getHopCost(current, neighbor);
                if (cost === Infinity) return;

                let tentative_gScore = gScore[current] + cost;
                if (!gScore.hasOwnProperty(neighbor) || tentative_gScore < gScore[neighbor]) {
                    cameFrom[neighbor] = current;
                    gScore[neighbor] = tentative_gScore;
                    let tentative_fScore = gScore[neighbor] + heuristic(neighbor, end);
                    if (!fScore.hasOwnProperty(neighbor)) {
                        fScore[neighbor] = tentative_fScore;
                        openSet.push(neighbor);
                    } else if (tentative_fScore < fScore[neighbor]) {
                        fScore[neighbor] = tentative_fScore;
                    }
                }
            });
        }
        return [];
    };

    self.applyAStarAsync = function (graph, start, end, heuristic, token, onDone) {
        let openSet = [start];
        let cameFrom = {};
        let gScore = { [start]: 0 };
        let fScore = { [start]: heuristic(start, end) };

        self.clearReachabilityCache();

        const runSlice = (deadline) => {
            if (token !== self.planRunToken) return;

            const sliceStart = performance.now();
            while (openSet.length > 0) {
                if (token !== self.planRunToken) return;
                if (deadline && deadline.timeRemaining && deadline.timeRemaining() <= 1) break;
                if (performance.now() - sliceStart > 16) break;

                openSet.sort((a, b) => fScore[a] - fScore[b]);
                let current = openSet.shift();

                if (current === end) {
                    onDone(self.reconstructPath(cameFrom, current));
                    return;
                }

                if (!graph[current]) continue;

                graph[current].forEach(neighbor => {
                    const cost = self.getHopCost(current, neighbor);
                    if (cost === Infinity) return;

                    let tentative_gScore = gScore[current] + cost;
                    if (!gScore.hasOwnProperty(neighbor) || tentative_gScore < gScore[neighbor]) {
                        cameFrom[neighbor] = current;
                        gScore[neighbor] = tentative_gScore;
                        let tentative_fScore = gScore[neighbor] + heuristic(neighbor, end);
                        if (!fScore.hasOwnProperty(neighbor)) {
                            fScore[neighbor] = tentative_fScore;
                            openSet.push(neighbor);
                        } else if (tentative_fScore < fScore[neighbor]) {
                            fScore[neighbor] = tentative_fScore;
                        }
                    }
                });
            }

            if (openSet.length === 0) {
                onDone([]);
                return;
            }

            if (window.requestIdleCallback) {
                window.requestIdleCallback(runSlice);
            } else {
                setTimeout(runSlice, 0);
            }
        };

        if (window.requestIdleCallback) {
            window.requestIdleCallback(runSlice);
        } else {
            setTimeout(runSlice, 0);
        }
    };

    self.reconstructPath = function (cameFrom, current) {
        let totalPath = [current];
        while (cameFrom.hasOwnProperty(current)) {
            current = cameFrom[current];
            totalPath.unshift(current);
            if (totalPath.length > 2000) break; 
        }
        return totalPath;
    };

    self.areLongHopsAllowed = function () {
        return self.settings.allowLongHops === "yes-long-hops";
    }

    self.getHardMaxDistance = function () {
        return 1250;
    }

    self.constructTree = function (previousNodes, hops = {}) {
        let tree = {};
        for (let key in previousNodes) {
            tree[key] = {
                parent: previousNodes[key],
                longHops: hops[key] ? hops[key].long : 0,
                shortHops: hops[key] ? hops[key].short : 0
            };
        }
        return tree;
    };

    self.exportPlanAsText = function () {
        let totalHops = self.plan.furthestPath.length - 1; 
        let longHops = 0;

        let totalDistance = self.getDistance(self.plan.furthestPath[0], self.plan.furthestPath.slice(-1)[0]);

        for (let i = 0; i < self.plan.furthestPath.length - 1; i++) {
            let hopInfo = self.getHopInfo(self.plan.furthestPath[i], self.plan.furthestPath[i + 1]);
            if (hopInfo.long) {
                longHops++;
            }
        }

        totalDistance = totalDistance / 1000;

        let message = totalDistance.toFixed(2) + " km path found, with " + totalHops + " hops total, and " + longHops + " long hops\n\n";
        for (let i = 0; i < self.plan.furthestPath.length; i++) {
            let distance = i == 0 ? 0 : self.getDistance(self.plan.furthestPath[i], self.plan.furthestPath[i - 1]);
            let longHop = false;
            if (i > 0) {
                let hopInfo = self.getHopInfo(self.plan.furthestPath[i - 1], self.plan.furthestPath[i]);
                longHop = hopInfo.long;
            }
            let prefix = i == 0 ? "Place drone at " : "Move drone to ";
            let portalName = self.getPortalNameFromGUID(self.plan.furthestPath[i]);
            let line = i + ". " + prefix + portalName;
            if (longHop) {
                line += " (Long hop: might need a key)";
            }
            line += " ";
            let flightDistance = self.getDistance(self.plan.furthestPath[i], self.plan.furthestPath[0]) / 1000;
            line += flightDistance.toFixed(2) + "km so far";
            message += line + "\n";
        }
        return message;
    }

    self.getPlanAsJson = function () {
        if (!self.plan || !self.plan.furthestPath || !self.graph) {
            return null;
        }

        // --- START OF NEW PRUNING LOGIC ---
        const portalsToKeepDetails = {};
        const prunedGraph = {};

        // 1. Get the set of portals on the main path
        const furthestPathSet = new Set(self.plan.furthestPath);

        // 2. Find all portal GUIDs to keep: main path + their direct neighbors
        const guidsToKeep = new Set(self.plan.furthestPath);
        for (const pathPortalGuid of furthestPathSet) {
            if (self.graph[pathPortalGuid]) {
                self.graph[pathPortalGuid].forEach(neighborGuid => {
                    guidsToKeep.add(neighborGuid);
                });
            }
        }

        // 3. Build the pruned graph and the portal details dictionary for ONLY the kept portals
        for (const guid of guidsToKeep) {
            if (self.graph[guid]) {
                prunedGraph[guid] = self.graph[guid].filter(neighbor => guidsToKeep.has(neighbor));
            }

            let portal = window.portals[guid] || self.allPortals[guid];
            if (portal) {
                let latLng = self.getLatLng(guid);
                portalsToKeepDetails[guid] = {
                    name: portal.options.data.title,
                    lat: latLng.lat,
                    lng: latLng.lng
                };
            }
        }
        // --- END OF NEW PRUNING LOGIC ---

        const planJson = {
            name: "Drone Flight Plan",
            version: "1.0",
            startPortalGuid: self.startPortal.guid,
            path: self.plan.furthestPath, 
            graph: prunedGraph, 
            portals: portalsToKeepDetails 
        };
        return planJson;
    };

    self.exportPlanAsJson = function () {
        const planJson = self.getPlanAsJson();
        if (!planJson) {
            alert("No plan to export.");
            return;
        }

        const jsonString = JSON.stringify(planJson, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'iitc-drone-plan.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    self.loadPlan = function (planJson) {
        try {
            if (!planJson.version || !planJson.startPortalGuid || !planJson.path || !planJson.portals) {
                console.warn('Drone Planner: Invalid plan format in storage.');
                return;
            }

            self.clearLayers();
            self.plan = null;
            self.graph = {}; 
            self.clearS2Caches();

            for (const guid in planJson.portals) {
                if (!window.portals[guid] && !self.allPortals[guid]) { 
                    const portalData = planJson.portals[guid];
                    self.allPortals[guid] = {
                        options: {
                            data: {
                                title: portalData.name,
                                latE6: portalData.lat * 1e6,
                                lngE6: portalData.lng * 1e6
                            }
                        }
                    };
                }
            }

            self.startPortal = { guid: planJson.startPortalGuid };
            self.plan = { furthestPath: planJson.path };

            if (planJson.graph) {
                self.graph = planJson.graph;
            }

            if (self.linksLayerGroup && !window.map.hasLayer(self.linksLayerGroup)) {
                window.map.addLayer(self.linksLayerGroup);
            }
            if (self.fieldsLayerGroup && !window.map.hasLayer(self.fieldsLayerGroup)) {
                window.map.addLayer(self.fieldsLayerGroup);
            }

            self.drawLayer(); 
            console.log('Drone Planner: Loaded plan from storage.');

        } catch (err) {
            console.error('Drone Planner: Failed to load plan.', err);
        }
    };

    self.importPlanFromJson = function () {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.onchange = function (e) {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function (event) {
                try {
                    const planJson = JSON.parse(event.target.result);
                    if (!planJson.version || !planJson.startPortalGuid || !planJson.path || !planJson.portals) {
                        alert('Invalid plan file format.');
                        return;
                    }
                    self.clearLayers();
                    self.plan = null;
                    self.clearS2Caches();
                    for (const guid in planJson.portals) {
                        if (!self.allPortals[guid]) {
                            const portalData = planJson.portals[guid];
                            self.allPortals[guid] = {
                                options: {
                                    data: {
                                        title: portalData.name,
                                        latE6: portalData.lat * 1e6,
                                        lngE6: portalData.lng * 1e6
                                    }
                                }
                            };
                        }
                    }
                    self.startPortal = { guid: planJson.startPortalGuid };
                    self.plan = { furthestPath: planJson.path };
                    self.updateLayer();
                    alert('Plan imported successfully!');
                } catch (err) {
                    alert('Failed to parse JSON file: ' + err);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    self.getPortalNameFromGUID = function (guid) {
        let portalData = self.allPortals[guid];
        if (portalData && portalData.options && portalData.options.data && portalData.options.data.title) {
            return portalData.options.data.title;
        } else {
            let latLng = self.getLatLng(guid);
            if (latLng) {
                return "?? Portal at " + latLng.lat.toFixed(6) + ", " + latLng.lng.toFixed(6);
            } else {
                return "Unknown Portal";
            }
        }
    };

    self.updateLayer = function () {
        if (self.plan && self.plan.furthestPath) {
            let message = self.exportPlanAsText();
            $("#hcf-plan-text").val(message);
            self.drawLayer();
        } else {
            $("#hcf-plan-text").val("No plan available.");
            self.clearLayers();
        }
    };

    self.drawLayer = function () {
        self.clearLayers();
        let shortHopColor = self.settings.shortHopColor;
        let longHopColor = self.settings.longHopColor;
        let fullTreeColor = self.settings.fullTreeColor;
        
        function getStyleForHop(fromGuid, toGuid, isTree) {
            const hopInfo = self.getHopInfo(fromGuid, toGuid);
            return {
                color: isTree ? fullTreeColor : hopInfo.short ? shortHopColor : longHopColor,
                opacity: 1,
                weight: isTree ? 1.5 : 4.5,
                clickable: false,
                interactive: false,
                smoothFactor: 10,
                dashArray: [12, 5, 4, 5, 6, 5, 8, 5, "100000"],
            };
        }

        for (let guid in self.plan) {
            if (self.plan[guid].parent) {
                let startLatLng = self.getLatLng(guid);
                let endLatLng = self.getLatLng(self.plan[guid].parent);
                self.drawLine(self.linksLayerGroup, startLatLng, endLatLng, getStyleForHop(guid, self.plan[guid].parent, true));
            }
        }

        for (let i = 0; i < self.plan.furthestPath.length - 1; i++) {
            let startLatLng = self.getLatLng(self.plan.furthestPath[i]);
            let endLatLng = self.getLatLng(self.plan.furthestPath[i + 1]);
            self.drawLine(self.fieldsLayerGroup, startLatLng, endLatLng, getStyleForHop(self.plan.furthestPath[i], self.plan.furthestPath[i + 1], false));
        }

        self.drawActiveGrid();
        self.drawOneWayWarnings();
    };

    self.drawActiveGrid = function () {
        if (!self.settings.displayActiveGrid || !self.settings.useS2) return;
        if (!window.map.hasLayer(self.activeGridLayerGroup)) return;

        const centerLatLng = self.startPortal ? self.getLatLng(self.startPortal.guid) : map.getCenter();
        if (!centerLatLng) return;

        const reachableCells = self.getReachableCells(centerLatLng);
        reachableCells.forEach(cellId => {
            const cell = self.getCellFromId(cellId);
            if (!cell) return;
            const corners = cell.getCornerLatLngs();
            const poly = L.polygon(corners, {
                color: '#00aaff',
                weight: 1,
                opacity: 0.6,
                fill: false,
                interactive: false,
            });
            poly.addTo(self.activeGridLayerGroup);
        });
    };

    self.drawOneWayWarnings = function () {
        if (!self.settings.showOneWayWarning || !self.settings.useS2) return;
        if (!self.plan || !self.plan.furthestPath || self.plan.furthestPath.length < 2) return;
        if (!window.map.hasLayer(self.oneWayWarningLayerGroup)) return;

        for (let i = 0; i < self.plan.furthestPath.length - 1; i++) {
            const fromGuid = self.plan.furthestPath[i];
            const toGuid = self.plan.furthestPath[i + 1];
            const forwardInfo = self.getHopInfo(fromGuid, toGuid);
            if (!forwardInfo.short) continue;

            const backInfo = self.getHopInfo(toGuid, fromGuid);
            if (backInfo.short) continue;

            const latLng = self.getLatLng(toGuid);
            if (!latLng) continue;

            const tooltipText = self.areLongHopsAllowed()
                ? 'One-way warning: return may require a key'
                : 'One-way warning: return not possible with keys disabled';

            const marker = L.circleMarker(latLng, {
                radius: 7,
                color: '#ff3333',
                weight: 2,
                fillOpacity: 0.8,
                fillColor: '#ff3333',
                interactive: true,
            }).bindTooltip(tooltipText);

            marker.addTo(self.oneWayWarningLayerGroup);
        }
    };


    self.setup = function () {
        self.loadSettings();
        self.clearS2Caches();

        // Add button to toolbox
        $('#toolbox').append('<a onclick="window.plugin.dronePlanner.openDialog(); return false;">Plan Drone Flight</a>');

        // Add event listener for portal selection
        window.addHook('portalSelected', self.portalSelected);

        self.linksLayerGroup = new L.LayerGroup();
        window.addLayerGroup('All Drone Paths', self.linksLayerGroup, false);

        // window.addLayerGroup('Homogeneous CF Links', self.linksLayerGroup, false);

        self.fieldsLayerGroup = new L.LayerGroup();
        window.addLayerGroup('Longest Drone Path', self.fieldsLayerGroup, false);
        
        self.activeGridLayerGroup = new L.LayerGroup();
        window.addLayerGroup('Drone Active Grid (S2)', self.activeGridLayerGroup, true);

        self.oneWayWarningLayerGroup = new L.LayerGroup();
        window.addLayerGroup('One-Way Jump Warnings', self.oneWayWarningLayerGroup, true);

        self.highlightLayergroup = new L.LayerGroup();
        window.addLayerGroup('Start Portal Highlights', self.highlightLayergroup, true);

        window.map.on('overlayadd overlayremove', function () {
            setTimeout(function () {
                self.updateLayer();
            }, 1);
        });

        // Load plan from localStorage on startup
        setTimeout(function () {
            const savedPlan = localStorage.getItem('drone-flight-plan-autosave');
            if (savedPlan) {
                try {
                    const planJson = JSON.parse(savedPlan);
                    self.loadPlan(planJson);
                } catch (e) {
                    console.error('Drone Planner: Failed to parse saved plan from localStorage', e);
                    localStorage.removeItem('drone-flight-plan-autosave'); // Clear corrupted data
                }
            }
        }, 1000); // 1-second delay to ensure IITC is fully loaded
    };

    self.clearLayers = function () {
        if (window.map.hasLayer(self.linksLayerGroup)) {
            self.linksLayerGroup.clearLayers();
        }
        if (window.map.hasLayer(self.fieldsLayerGroup)) {
            self.fieldsLayerGroup.clearLayers();
        }
        if (window.map.hasLayer(self.activeGridLayerGroup)) {
            self.activeGridLayerGroup.clearLayers();
        }
        if (window.map.hasLayer(self.oneWayWarningLayerGroup)) {
            self.oneWayWarningLayerGroup.clearLayers();
        }
        if (window.map.hasLayer(self.highlightLayergroup)) {
            self.highlightLayergroup.clearLayers();
        }
    }

    self.drawLine = function (layerGroup, alatlng, blatlng, style) {
        //check if layer is active
        if (!window.map.hasLayer(layerGroup)) {
            return;
        }
        var poly = L.polyline([alatlng, blatlng], style);
        poly.addTo(layerGroup);
    }

    // function to draw a link to the plugin layer
    self.drawLink = function (alatlng, blatlng, style) {
        self.drawLine(self.linkLayerGroup, alatlng, blatlng, style);
    }

    // function to draw a field to the plugin layer
    self.drawField = function (alatlng, blatlng, clatlng, style) {
        //check if layer is active
        if (!window.map.hasLayer(self.fieldsLayerGroup)) {
            return;
        }

        var poly = L.polygon([alatlng, blatlng, clatlng], style);
        poly.addTo(self.fieldsLayerGroup);

    }

    self.exportDrawtoolsLink = function (p1, p2) {
        let alatlng = self.getLatLng(p1);
        let blatlng = self.getLatLng(p2);
        let opts = { ...window.plugin.drawTools.lineOptions };
        let shortHopColor = document.getElementById('short-hop-colorPicker').value;
        let longHopColor = document.getElementById('long-hop-colorPicker').value;
        let hopInfo = self.getHopInfo(p1, p2);

        opts.color = hopInfo.short ? shortHopColor : longHopColor;

        let layer = L.geodesicPolyline([alatlng, blatlng], opts);
        window.plugin.drawTools.drawnItems.addLayer(layer);
        window.plugin.drawTools.save();

    }

    // function to draw the plan to the plugin layer
    self.drawPlan = function (plan) {
        // initialize plugin layer
        self.clearLayers();

        $.each(plan, function (index, planStep) {
            if (planStep.action === 'link') {
                let ll_from = planStep.fromPortal.latLng, ll_to = planStep.portal.latLng;
                self.drawLink(ll_from, ll_to, self.linkStyle);
            }
            if (planStep.action === 'field') {
                self.drawField(
                    planStep.a.latLng,
                    planStep.b.latLng,
                    planStep.c.latLng,
                    self.fieldStyle);
            }
        });
    }

    // function to export and draw the plan to the drawtools plugin layer
    self.exportToDrawtools = function (plan) {
        // initialize plugin layer
        if (window.plugin.drawTools !== 'undefined') {
            for (var i = 0; i < self.plan.furthestPath.length - 1; i++) {
                self.exportDrawtoolsLink(self.plan.furthestPath[i], self.plan.furthestPath[i + 1]);
            }
        }
    }

    // function to add a link to the arc plugin
    self.drawArc = function (p1, p2) {
        if (typeof window.plugin.arcs != 'undefined') {
            window.selectedPortal = p1.id;
            window.plugin.arcs.draw();
            window.selectedPortal = p2.id;
            window.plugin.arcs.draw();
        }
    }


    // function to export the plan to the arc plugin
    self.drawArcPlan = function (plan) {
        // initialize plugin layer
        if (typeof window.plugin.arcs !== 'undefined') {
            $.each(plan, function (index, planStep) {
                if (planStep.action === 'link') {
                    self.drawArc(planStep.fromPortal, planStep.portal);
                }
            });
        }
    }

    self.buildDirection = function (compass1, compass2, angle) {
        if (angle == 0) return compass1;
        if (angle == 45) return compass1 + compass2;
        if (angle > 45) return self.buildDirection(compass2, compass1, 90 - angle);
        return compass1 + ' ' + angle + '° ' + compass2;
    }

    self.formatBearing = function (bearing) {
        var bearingFromNorth = false;
        bearing = (bearing + 360) % 360;
        if (bearingFromNorth)
            return bearing.toString().padStart(3, '0') + "°";
        if (bearing <= 90) return self.buildDirection('N', 'E', bearing);
        else if (bearing <= 180) return self.buildDirection('S', 'E', 180 - bearing);
        else if (bearing <= 270) return self.buildDirection('S', 'W', bearing - 180);
        else return self.buildDirection('N', 'W', 360 - bearing);
    }

    self.formatDistance = function (distanceMeters) {
        const feetInAMeter = 3.28084;
        const milesInAMeter = 0.000621371;
        const kmInAMeter = 0.001;

        if (distanceMeters < 1000) {
            const distanceFeet = Math.round(distanceMeters * feetInAMeter);
            return `${Math.round(distanceMeters)}m (${distanceFeet}ft)`;
        } else {
            const distanceKm = (distanceMeters * kmInAMeter).toFixed(2);
            const distanceMiles = (distanceMeters * milesInAMeter).toFixed(2);
            return `${distanceKm}km (${distanceMiles}mi)`;
        }
    }

    self.info_dialog_html = '<div id="more-info-container" ' +
        '                    style="height: inherit; display: flex; flex-direction: column; align-items: stretch;">\n' +
        '   <div style="display: flex;justify-content: space-between;align-items: center;">\n' +
        '      <span>This is ' + pluginName + ' version ' + version + '. Follow the links below if you would like to:\n' +
        '        <ul>\n' +
        '          <li> <a href="https://youtu.be/5M1IrA_6EoY" target="_blank">Learn how to use this plugin</a></li>\n' +
        '        </ul>\n' +
        '      Contributing authors:\n' +
        '        <ul>\n' +
        '          <li> <a href="https://www.youtube.com/@57Cell" target="_blank">@57Cell</a></li>\n' +
        '        </ul>\n' +
        '      </span>\n' +
        '</div></div>';

    // ATTENTION! DO NOT EVER TOUCH THE STYLES WITHOUT INTENSE TESTING!
    self.dialog_html = '<div id="hcf-plan-container" style="height: inherit; display: flex; flex-direction: column; align-items: stretch;">\n' +
        '   <div style="display: flex;justify-content: space-between;align-items: center;">' +
        '      <span>Short Hop: <input type="color" id="short-hop-colorPicker"></span>' +
        '      <span>Long Hop: <input type="color" id="long-hop-colorPicker"></span>' +
        '      <span>Full Tree: <input type="color" id="full-tree-colorPicker"></span>' +
        '   </div>' +
        '    <fieldset style="margin: 2px;">\n' +
        '      <legend>Path Options</legend>\n' +
        '      <label>Optimization Goal:</label><br/>\n' +
        '      <input type="radio" id="path-min-hops" name="path-type" value="min-hops" /> <label for="path-min-hops">Min Hops</label>\n' +
        '      <input type="radio" id="path-balanced" name="path-type" value="balanced" /> <label for="path-balanced">Balanced</label>\n' +
        '      <input type="radio" id="path-min-long-hops" name="path-type" value="min-long-hops" /> <label for="path-min-long-hops">Min Keys</label><br/>\n' +
        '      <br/>\n' +
        '      <label>Search Algorithm:</label><br/>\n' +
        '      <input type="radio" id="opt-none" name="optimisation-type" value="none" /> <label for="opt-none" title="Fastest">None</label>\n' +
        '      <input type="radio" id="opt-greedy" name="optimisation-type" value="greedy" /> <label for="opt-greedy">Greedy</label>\n' +
        '      <input type="radio" id="opt-balanced" name="optimisation-type" value="balanced" /> <label for="opt-balanced">Balanced</label>\n' +
        '      <input type="radio" id="opt-perfect" name="optimisation-type" value="perfect" /> <label for="opt-perfect" title="Slowest, best result">Perfect</label>\n' +
        '    </fieldset>\n' +
        '    <fieldset style="margin: 2px;">\n' +
        '      <legend>Mechanics & Constraints</legend>\n' +
        '      <input type="checkbox" id="use-s2-logic" /> <label for="use-s2-logic" title="Use accurate S2 Cell visibility logic">Use S2 Mechanics</label>\n' +
        '      <select id="s2-level" style="margin-left:10px;"><option value="16">L16 (Standard)</option><option value="17">L17 (Strict)</option></select><br/>\n' +
        '      <div style="margin-top:5px;">\n' +
        '        <label for="view-radius" title="The detection radius of your scanner">Scanner View Radius (m): </label>\n' +
        '        <input type="number" id="view-radius" min="400" max="1000" step="10" style="width:60px;">\n' +
        '      </div>\n' +
        '      <div style="margin-top:5px;">\n' +
        '        <input type="checkbox" id="show-one-way" /> <label for="show-one-way">Show One-Way Warnings</label>\n' +
        '        <input type="checkbox" id="display-active-grid" style="margin-left:10px;" /> <label for="display-active-grid">Display Active Grid</label>\n' +
        '      </div>\n' +
        '      <div style="margin-top:5px;">\n' +
        '        <input type="radio" id="path-yes-long-hops" name="allow-long-hops" value="yes-long-hops" /> <label for="path-yes-long-hops">Allow Keys (<1.25km)</label>\n' +
        '        <input type="radio" id="path-no-long-hops" name="allow-long-hops" value="no-long-hops" /> <label for="path-no-long-hops">No Keys</label>\n' +
        '      </div>\n' +
        '    </fieldset>\n' +
        '    <div id="hcf-buttons-container" style="margin: 3px;">\n' +
        '      <button id="scan-portals" style="cursor: pointer" style=""margin: 2px;">Use Portals In View</button>' +
        '      <button id="hcf-to-dt-btn" style="cursor: pointer">Export to DrawTools</button>' +
        '      <button id="export-plan-btn" style="cursor: pointer">Export Plan</button>' +
        '      <button id="import-plan-btn" style="cursor: pointer">Import Plan</button>' +
        '      <button id="swap-ends-btn" style="cursor: pointer">Switch End to Start</button>' + '      <button id="hcf-simulator-btn" style="cursor: pointer" hidden>Simulate</button>' +
        '      <button id="hcf-clear-start-btn" style="cursor: pointer">Clear Start</button>' +
        '      <button id="hcf-clear-some-btn" style="cursor: pointer">Clear Unused</button>' +
        '      <button id="hcf-clear-most-btn" style="cursor: pointer">Clear Most</button>' +
        '      <button id="hcf-clear-btn" style="cursor: pointer">Clear All</button>' +
        '      <button id="more-info" style="cursor: pointer" style="margin: 2px;">More Info</button>' +
        '    </div>\n' +
        '    <textarea readonly id="hcf-plan-text" style="height:inherit;min-height:150px;width: auto;margin:2px;resize:none"></textarea>\n' +
        '</div>\n';

    // Attach click event to find-hcf-plan-button after the dialog is created
    self.openDialog = function () {
        if (!self.dialogIsOpen()) {
            dialog({
                title: 'Drone Planning',
                id: 'hcf-plan-view',
                html: self.dialog_html,
                width: '40%',
                minHeight: 460,
            });

            // If a plan was loaded from localStorage, update the UI now that it exists.
            if (self.plan) {
                self.updateLayer();
            }

            self.attachEventHandler();
            $('#dialog-hcf-plan-view').css("height", "370px");
        }
    };

    // Attach click event to find-hcf-plan-button after the dialog is created
    self.open_info_dialog = function () {
        if (!self.infoDialogIsOpen()) {
            dialog({
                title: 'Plugin And Other Information',
                id: 'hcf-info-view',
                html: self.info_dialog_html,
                width: '30%',
                minHeight: 120,
            });
            self.attachEventHandler();
            $('#dialog-hcf-info-view').css("height", "220px");
        }
    };

    self.switchEndToStart = function () {
        if (!self.plan) return;
        if (!self.plan.furthestPath) return;
        self.startPortal = { guid: self.plan.furthestPath.slice(-1)[0] };
        self.updatePlan();
    }

    self.clearPortalsOffTrack = function (keepNeighbours) {
        var newAllPortals = {};
        var newGraph = {};

        // Convert furthestPath to a Set for efficient lookups
        let furthestPathSet = new Set(self.plan.furthestPath);
        // determine which portals should be retained
        for (let portalGUID in self.allPortals) {
            if (furthestPathSet.has(portalGUID)) {
                newAllPortals[portalGUID] = self.allPortals[portalGUID];
            }
        }

        // if keepNeighbours is true, also keep portals within 1.25km of furthestPath portals
        if (keepNeighbours) {
            for (let pathPortalGUID of furthestPathSet) {
                for (let portalGUID in self.allPortals) {
                    if (!newAllPortals[portalGUID]) {
                        let distance = self.getDistance(pathPortalGUID, portalGUID);
                        if (distance <= self.getHardMaxDistance()) {
                            newAllPortals[portalGUID] = self.allPortals[portalGUID];
                        }
                    }
                }
            }
        }

        // Then, construct the newGraph based on the portals retained in newAllPortals
        for (let portalGUID in newAllPortals) {
            // Initialize an entry in newGraph for the portal
            newGraph[portalGUID] = [];

            // Include connections to other portals that are also retained in newAllPortals
            if (self.graph[portalGUID]) {
                self.graph[portalGUID].forEach(neighborGUID => {
                    if (newAllPortals.hasOwnProperty(neighborGUID)) {
                        newGraph[portalGUID].push(neighborGUID);
                    }
                });
            }
        }

        // Update self.allPortals and self.graph with the filtered results
        self.allPortals = newAllPortals;
        self.graph = newGraph;
        self.clearS2Caches();
        self.updatePlan();
    };

    // Function to create and show the dialog
    self.showClearConfirmationDialog = function () {
        // Create dialog elements
        var dialog = document.createElement('div');
        dialog.id = 'clear-confirmation-dialog';
        dialog.style.cssText = `position: fixed;
        z-index: 1000;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0,0,0,0.4);
        display: flex;
        justify-content: center;
        align-items: center;
    `;

        var content = document.createElement('div');
        content.style.cssText = `background-color: #fefefe;
        padding: 20px;
        border: 1px solid #888;
        max-width: 500px;
        text-align: center;
    `;

        var message = document.createElement('p');
        message.textContent = 'Are you sure you want to clear all portals from the cache? This action cannot be undone.';

        var yesButton = document.createElement('button');
        yesButton.textContent = 'Yes, I\'m sure!';
        yesButton.style.margin = '10px';

        var cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.style.margin = '10px';

        // Assemble the dialog
        content.appendChild(message);
        content.appendChild(yesButton);
        content.appendChild(cancelButton);
        dialog.appendChild(content);

        // Add the dialog to the body
        document.body.appendChild(dialog);

        // Set up event listeners
        yesButton.onclick = function () {
            self.clearLayers();
            self.startPortal = null;
            self.plan = null;
            self.allPortals = [];
            self.graph = {};
            self.clearS2Caches();
            $("#hcf-to-dt-btn").hide();
            document.body.removeChild(dialog);
            alert("All portals have been cleared from the cache.");
        };

        cancelButton.onclick = function () {
            document.body.removeChild(dialog);
        };
    }

    self.updateUIFromSettings = function() {
        if (!self.dialogIsOpen()) return;
        
        // Colors
        $('#short-hop-colorPicker').val(self.settings.shortHopColor);
        $('#long-hop-colorPicker').val(self.settings.longHopColor);
        $('#full-tree-colorPicker').val(self.settings.fullTreeColor);
        
        // Radios
        $(`input[name="path-type"][value="${self.settings.pathType}"]`).prop('checked', true);
        $(`input[name="allow-long-hops"][value="${self.settings.allowLongHops}"]`).prop('checked', true);
        $(`input[name="optimisation-type"][value="${self.settings.optimisationType}"]`).prop('checked', true);
        
        // S2 Settings
        $('#use-s2-logic').prop('checked', self.settings.useS2);
        $('#s2-level').val(self.settings.s2Level);
        $('#view-radius').val(self.settings.viewRadius);
        $('#show-one-way').prop('checked', self.settings.showOneWayWarning);
        $('#display-active-grid').prop('checked', self.settings.displayActiveGrid);
    };

    self.attachEventHandler = function () {
        self.updateUIFromSettings();

        // --- Settings Bindings ---
        
        // Colors
        $("#short-hop-colorPicker").change(function () {
            self.settings.shortHopColor = this.value;
            self.saveSettings();
            self.drawLayer();
        });
        $("#long-hop-colorPicker").change(function () {
            self.settings.longHopColor = this.value;
            self.saveSettings();
            self.drawLayer();
        });
        $("#full-tree-colorPicker").change(function () {
            self.settings.fullTreeColor = this.value;
            self.saveSettings();
            self.drawLayer();
        });

        // Path Options
        $('input[name="path-type"]').change(function () {
            self.settings.pathType = this.value;
            self.saveSettings();
            self.updatePlan();
        });
        $('input[name="allow-long-hops"]').change(function () {
            self.settings.allowLongHops = this.value;
            self.saveSettings();
            self.updatePlan();
        });
        $('input[name="optimisation-type"]').change(function () {
            self.settings.optimisationType = this.value;
            self.saveSettings();
            self.updatePlan();
        });

        // S2 Mechanics
        $('#use-s2-logic').change(function() {
            self.settings.useS2 = this.checked;
            self.saveSettings();
            self.clearS2Caches();
            self.updatePlan();
        });
        $('#s2-level').change(function() {
            self.settings.s2Level = parseInt(this.value);
            self.saveSettings();
            self.clearS2Caches();
            self.updatePlan();
        });
        $('#view-radius').change(function() {
            self.settings.viewRadius = parseInt(this.value);
            self.saveSettings();
            self.clearS2Caches();
            self.updatePlan();
        });
        $('#show-one-way').change(function() {
            self.settings.showOneWayWarning = this.checked;
            self.saveSettings();
            self.updateLayer();
        });
        $('#display-active-grid').change(function() {
            self.settings.displayActiveGrid = this.checked;
            self.saveSettings();
            self.updateLayer();
        });

        // --- Action Buttons ---

        $("#export-plan-btn").click(function () { self.exportPlanAsJson(); });
        $("#import-plan-btn").click(function () { self.importPlanFromJson(); });
        $("#hcf-to-dt-btn").click(function () { self.exportToDrawtools(self.plan); });
        $("#swap-ends-btn").click(function () { self.switchEndToStart(); });
        $("#hcf-clear-some-btn").click(function () { self.clearPortalsOffTrack(false); });
        $("#hcf-clear-most-btn").click(function () { self.clearPortalsOffTrack(true); });
        
        $("#hcf-clear-btn").click(function () {
            self.showClearConfirmationDialog();
        });

        $("#hcf-clear-start-btn").click(function () {
            self.clearLayers();
            self.startPortal = null;
            self.plan = null;
            $("#hcf-to-dt-btn").hide();
        });

        $("#scan-portals").click(function () {
            self.scanPortalsAndUpdateGraph();
        });

        $("#more-info").click(function () {
            self.open_info_dialog();
        });

    } // end of attachEventHandler

    self.portalSelected = function (data) {
        // ignore if dialog closed
        if (!self.dialogIsOpen() || self.startPortal) {
            return;
        };

        // Ignore if already selected
        let portalDetails = window.portalDetail.get(data.selectedPortalGuid);
        if (portalDetails === undefined) return;
        self.startPortal = { guid: data.selectedPortalGuid, details: portalDetails };
        self.updatePlan();
    };

    self.dialogIsOpen = function () {
        return ($("#dialog-hcf-plan-view").hasClass("ui-dialog-content") && $("#dialog-hcf-plan-view").dialog('isOpen'));
    };

    self.infoDialogIsOpen = function () {
        return ($("#dialog-hcf-info-view").hasClass("ui-dialog-content") && $("#dialog-hcf-info-view").dialog('isOpen'));
    };

    self.getLatLng = function (guid) {
        let portal = self.allPortals[guid] ? self.allPortals[guid].options.data : null;
        if (portal) {
            let lat = parseFloat(portal.latE6 / 1e6);
            let lng = parseFloat(portal.lngE6 / 1e6);
            return new L.latLng(lat, lng); // Assuming L.latLng is available in your context
        }
        return null;
    };

    self.getDistance = function (guid1, guid2) {
        let latLng1 = self.getLatLng(guid1);
        let latLng2 = self.getLatLng(guid2);

        if (latLng1 && latLng2) {
            return self.distance(latLng1, latLng2);
        } else {
            return Infinity; // Or some error handling if one of the portals is not found
        }
    };

    self.distance = function (portal1, portal2) {
        return portal1.distanceTo(portal2);
    };

    // PLUGIN END
    self.pluginLoadedTimeStamp = performance.now();
    console.log('drone planner plugin is ready')


    // Add an info property for IITC's plugin system
    var setup = self.setup;
    setup.info = plugin_info;

    // export changelog
    if (typeof changelog !== 'undefined') setup.info.changelog = changelog;

    // Make sure window.bootPlugins exists and is an array
    if (!window.bootPlugins) window.bootPlugins = [];
    // Add our startup hook
    window.bootPlugins.push(setup);
    // If IITC has already booted, immediately run the 'setup' function
    if (window.iitcLoaded && typeof setup === 'function') setup();

} // wrapper end

// Create a script element to hold our content script
var script = document.createElement('script');
var info = {};

// GM_info is defined by the assorted monkey-themed browser extensions
// and holds information parsed from the script header.
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
    info.script = {
        version: GM_info.script.version,
        name: GM_info.script.name,
        description: GM_info.script.description
    };
}

// Create a text node and our IIFE inside of it
var textContent = document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ')');
// Add some content to the script element
script.appendChild(textContent);
// Finally, inject it... wherever.
(document.body || document.head || document.documentElement).appendChild(script);
