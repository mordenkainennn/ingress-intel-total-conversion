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

    self.setup = function () {
        $('#toolbox').append('<a onclick="window.plugin.fanfieldPlanner.openDialog(); return false;">Plan Fanfield</a>');
        // Placeholder for future LayerGroups
    };

    self.openDialog = function () {
        // Placeholder for dialog HTML
        dialog({
            title: 'Fanfield Planner',
            id: 'fanfield-planner-view',
            html: '<div>Fanfield Planner - UI to be implemented</div>',
            width: '40%',
            minHeight: 460,
        });
        self.attachEventHandler();
    };

    self.attachEventHandler = function () {
        // Placeholder for event handlers
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
