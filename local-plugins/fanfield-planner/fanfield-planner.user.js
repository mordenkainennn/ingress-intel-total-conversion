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

        const mode = $('input[name="fanfield-select-mode"]:checked').val();
        const portalDetails = window.portals[data.selectedPortalGuid]?._details;
        if (!portalDetails) return;

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
        return ($("#fanfield-planner-view").hasClass("ui-dialog-content") && $("#fanfield-planner-view").dialog('isOpen'));
    };

    self.setup = function () {
        self.anchorPortal = null;
        self.basePortals = [];

        window.addHook('portalSelected', self.portalSelected);

        $('#toolbox').append('<a onclick="window.plugin.fanfieldPlanner.openDialog(); return false;">Plan Fanfield</a>');
        // Placeholder for future LayerGroups
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

        // Placeholder for the main planning button
        $('#plan-fanfield-btn').click(function () {
            $('#fanfield-plan-text').val('Planning logic not yet implemented...');
            // self.generateFanfieldPlan(); // This will be implemented next
        });
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
