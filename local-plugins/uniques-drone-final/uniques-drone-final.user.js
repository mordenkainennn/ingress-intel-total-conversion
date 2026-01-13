// ==UserScript==
// @author         3ch01c, mordenkainennn
// @name           Uniques (Drone Final)
// @category       Misc
// @version        1.1.0
// @description    Allow manual entry and import of portals visited, captured, scanned, and drone-visited.
// @id             uniques-drone-final
// @namespace      https://github.com/mordenkainennn/ingress-intel-total-conversion
// @updateURL      https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/main/local-plugins/uniques-drone-final/uniques-drone-final.meta.js
// @downloadURL    https://github.com/mordenkainennn/ingress-intel-total-conversion/raw/main/local-plugins/uniques-drone-final/uniques-drone-final.user.js
// @match          https://intel.ingress.com/*
// @match          https://intel-x.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
  // ensure plugin framework is there, even if iitc is not yet loaded
  if (typeof window.plugin !== 'function') {
    window.plugin = function () {};
  }

  //PLUGIN AUTHORS: writing a plugin outside of the IITC build environment? if so, delete these lines!!
  //(leaving them in place might break the 'About IITC' page or break update checks)
  plugin_info.buildName = 'local';
  plugin_info.dateTimeVersion = '20260111.180000';
  plugin_info.pluginId = 'uniques-drone-final';
  //END PLUGIN AUTHORS NOTE

  /* exported setup, changelog --eslint */

  var changelog = [
    {
      version: '1.1.0',
      changes: [
        'NEW: Added full support for "Scout Controlled" status and an "Import from Official History" feature.',
        'UPD: Reworked map highlighter color scheme and priority for all states to align with Niantic standards where possible.',
        'FIX: Corrected a subtle syntax error in a helper function that caused the entire script to fail parsing in Tampermonkey.',
        'FIX: Ensured all internal feature names (highlighter, storage keys, sync tasks, hooks) are unique to prevent conflicts.',
      ],
    },
    {
      version: '1.0.0',
      changes: ['NEW: Complete rewrite to add Drone support and initial standalone plugin functionality.'],
    },
  ];

  // use own namespace for plugin
  window.plugin.uniquesDroneFinal = function () {};
  var self = window.plugin.uniquesDroneFinal;

  self.SYNC_PLUGIN_NAME = 'uniquesDroneFinal';
  self.SYNC_FIELD_NAME = 'uniques';
  self.SYNC_DELAY = 5000;

  self.FIELDS = {
    uniques: 'plugin-uniques-drone-final-data',
    updateQueue: 'plugin-uniques-drone-final-data-queue',
    updatingQueue: 'plugin-uniques-drone-final-data-updating-queue',
  };

  self.uniques = {};
  self.updateQueue = {};
  self.updatingQueue = {};
  self.enableSync = false;
  self.disabledMessage = null;
  self.contentHTML = null;
  self.isHighlightActive = false;

  self.onPortalDetailsUpdated = function () {
    if (typeof Storage === 'undefined') {
      $('#portaldetails > .imgpreview').after(self.disabledMessage);
      return;
    }
    $('#portaldetails > .imgpreview').after(self.contentHTML);
    self.updateCheckedAndHighlight(window.selectedPortal);
    self.addImportToolLink();
  };

  self.addImportToolLink = function () {
    var linkDetails = $('#portaldetails .linkdetails');
    // Check if our link already exists to avoid duplicates
    if (linkDetails.length > 0 && $('#uniques-import-toolbox-link').length === 0) {
      var importLink = $('<a>')
        .text('Import History')
        .attr('id', 'uniques-import-toolbox-link')
        .attr('title', 'Import official history for all visible portals')
        .click(function() {
          self.importFromOfficialHistory();
          return false;
        });
      // Append after the existing links, on its own line
      linkDetails.after($('<aside>').append(importLink));
    }
  };

  self.updateCheckedAndHighlight = function (guid) {
    window.runHooks('pluginUniquesDroneFinalUpdate', { guid: guid });

    if (guid === window.selectedPortal) {
      var uniqueInfo = self.uniques[guid] || {};
      $('#visited').prop('checked', !!uniqueInfo.visited);
      $('#captured').prop('checked', !!uniqueInfo.captured);
      $('#scoutControlled').prop('checked', !!uniqueInfo.scoutControlled);
      $('#drone').prop('checked', !!uniqueInfo.droneVisited);
    }

    if (self.isHighlightActive && window.portals[guid]) {
      window.setMarkerStyle(window.portals[guid], guid === window.selectedPortal);
    }
  };

  self.ensureUniqueInfo = function (guid) {
    if (!self.uniques[guid]) {
      self.uniques[guid] = {
        visited: false,
        captured: false,
        scoutControlled: false,
        droneVisited: false,
      };
    }
    return self.uniques[guid];
  };

  self.updateStatus = function (guid, property, value) {
    var uniqueInfo = self.ensureUniqueInfo(guid);
    if (uniqueInfo[property] === value) return;

    uniqueInfo[property] = value;

    if (property === 'captured' && value) uniqueInfo.visited = true;
    if (property === 'visited' && !value) uniqueInfo.captured = false;

    self.updateCheckedAndHighlight(guid);
    self.sync(guid);
  };

  self.updateVisited = (checked, guid) => self.updateStatus(guid || window.selectedPortal, 'visited', checked);
  self.updateCaptured = (checked, guid) => self.updateStatus(guid || window.selectedPortal, 'captured', checked);
  self.updateScoutControlled = (checked, guid) => self.updateStatus(guid || window.selectedPortal, 'scoutControlled', checked);
  self.updateDroneVisited = (checked, guid) => self.updateStatus(guid || window.selectedPortal, 'droneVisited', checked);

  self.sync = function (guid) {
    self.updateQueue[guid] = true;
    self.storeLocal('uniques');
    self.storeLocal('updateQueue');
    self.syncQueue();
  };

  self.syncQueue = function () {
    if (!self.enableSync) return;
    clearTimeout(self.syncTimer);
    self.syncTimer = setTimeout(function () {
      self.syncTimer = null;
      $.extend(self.updatingQueue, self.updateQueue);
      self.updateQueue = {};
      self.storeLocal('updatingQueue');
      self.storeLocal('updateQueue');
      const ok = window.plugin.sync.updateMap(self.SYNC_PLUGIN_NAME, self.SYNC_FIELD_NAME, Object.keys(self.updatingQueue));
      if (!ok) {
        console.warn(`[${self.SYNC_PLUGIN_NAME}] sync updateMap failed: RegisteredMap not found`);
      }
    }, self.SYNC_DELAY);
  };

  self.registerFieldForSyncing = function () {
    if (!window.plugin.sync) return;
    window.plugin.sync.registerMapForSync(self.SYNC_PLUGIN_NAME, self.SYNC_FIELD_NAME, self.syncCallback, self.syncInitialed);
  };

  self.syncCallback = function (pluginName, fieldName, e, fullUpdated) {
    if (fieldName !== self.SYNC_FIELD_NAME) return;
    self.storeLocal('uniques');
    if (fullUpdated) {
      if (window.selectedPortal) self.updateCheckedAndHighlight(window.selectedPortal);
      if (self.isHighlightActive) window.resetHighlightedPortals();
      window.runHooks('pluginUniquesDroneFinalRefreshAll');
      return;
    }
    if (!e) return;
    if (e.isLocal) {
      delete self.updatingQueue[e.property];
    } else {
      delete self.updateQueue[e.property];
      self.storeLocal('updateQueue');
      self.updateCheckedAndHighlight(e.property);
      window.runHooks('pluginUniquesDroneFinalUpdate', { guid: e.property });
    }
  };

  self.syncInitialed = function (pluginName, fieldName) {
    if (fieldName !== self.SYNC_FIELD_NAME) return;
    self.enableSync = true;
    if (Object.keys(self.updateQueue).length > 0) {
      self.syncQueue();
    }
  };

  self.storeLocal = function (name) {
    var key = self.FIELDS[name];
    if (key) localStorage[key] = JSON.stringify(self[name]);
  };

  self.loadLocal = function (name) {
    var key = self.FIELDS[name];
    if (key && localStorage[key]) {
      self[name] = JSON.parse(localStorage[key]);
    }
  };

  self.highlighter = {
    highlight: function (data) {
      var guid = data.portal.options.guid;
      var uniqueInfo = self.uniques[guid];
      var style = {};

      if (uniqueInfo) {
        if (uniqueInfo.captured) {
          // No highlight
        } else if (uniqueInfo.visited) {
          style.fillColor = 'purple';
          style.fillOpacity = 0.6;
        } else if (uniqueInfo.droneVisited) {
          style.fillColor = 'cyan';
          style.fillOpacity = 0.6;
        } else if (uniqueInfo.scoutControlled) {
          style.fillColor = '#FFC107'; // Deep Yellow
          style.fillOpacity = 0.6;
        } else {
          style.fillColor = 'red';
          style.fillOpacity = 0.5;
        }
      } else {
        style.fillColor = 'red';
        style.fillOpacity = 0.7;
      }
      data.portal.setStyle(style);
    },
    setSelected: function (active) {
      self.isHighlightActive = active;
    },
  };

  self.importFromOfficialHistory = function () {
    if (!confirm('Import from Official History?\n\nThis will update your personal uniques data with the official visited/captured/scanned status for all currently loaded portals. This may overwrite some of your manual marks.')) {
      return;
    }
    var count = 0;
    for (var guid in window.portals) {
      var portal = window.portals[guid];
      var details = portal.getDetails();
      if (details && details.history) {
        var uniqueInfo = self.ensureUniqueInfo(guid);
        var changed = false;
        if (details.history.captured && !uniqueInfo.captured) {
          self.updateStatus(guid, 'captured', true);
          changed = true;
        } else if (details.history.visited && !uniqueInfo.visited) {
          self.updateStatus(guid, 'visited', true);
          changed = true;
        }
        if (details.history.scoutControlled && !uniqueInfo.scoutControlled) {
          self.updateStatus(guid, 'scoutControlled', true);
          changed = true;
        }
        if(changed) count++;
      }
    }
    self.storeLocal('uniques');
    alert('Imported official history for ' + count + ' portals.');
    if (self.isHighlightActive) window.resetHighlightedPortals();
  };

  self.setupCSS = function () {
    $('<style>').prop('type', 'text/css').html(
      '#uniques-container{display:block;text-align:center;margin:6px 3px 1px}#uniques-container label{margin:0 .5em}#uniques-container input{vertical-align:middle}.portal-list-uniques input[type=checkbox]{padding:0;height:auto;margin-top:-5px;margin-bottom:-5px}'
    ).appendTo('head');
  };

  self.setupContent = function () {
    self.contentHTML =
      '<div id="uniques-container">' +
      '<label><input type="checkbox" id="visited" onclick="window.plugin.uniquesDroneFinal.updateVisited($(this).prop(\'checked\'))"> Visited</label>' +
      '<label><input type="checkbox" id="captured" onclick="window.plugin.uniquesDroneFinal.updateCaptured($(this).prop(\'checked\'))"> Captured</label>' +
      '<br>' +
      '<label><input type="checkbox" id="scoutControlled" onclick="window.plugin.uniquesDroneFinal.updateScoutControlled($(this).prop(\'checked\'))"> Scanned</label>' +
      '<label><input type="checkbox" id="drone" onclick="window.plugin.uniquesDroneFinal.updateDroneVisited($(this).prop(\'checked\'))"> Drone</label>' +
      '</div>';
    self.disabledMessage = '<div id="uniques-container" class="help" title="Your browser does not support localStorage">Plugin Uniques disabled</div>';
  };

  self.setupPortalsList = function () {
    function addHook(name, guid) {
      var info = self.uniques[guid] || {};
      $(`[data-list-uniques="${guid}"].visited`).prop('checked', !!info.visited);
      $(`[data-list-uniques="${guid}"].captured`).prop('checked', !!info.captured);
      $(`[data-list-uniques="${guid}"].scoutControlled`).prop('checked', !!info.scoutControlled);
      $(`[data-list-uniques="${guid}"].drone`).prop('checked', !!info.droneVisited);
    }

    window.addHook('pluginUniquesDroneFinalUpdate', (data) => addHook('Update', data.guid));
    window.addHook('pluginUniquesDroneFinalRefreshAll', () => {
      $('[data-list-uniques]').each((i, el) => addHook('Refresh', el.getAttribute('data-list-uniques')));
    });

    function uniqueValue(guid) {
      var info = self.uniques[guid];
      if (!info) return 0;
      if (info.captured) return 4;
      if (info.visited) return 3;
      if (info.droneVisited) return 2;
      if (info.scoutControlled) return 1;
      return 0;
    }

    window.plugin.portalslist.fields.push({
      title: 'U.History',
      value: (portal) => portal.options.guid,
      sort: (guidA, guidB) => uniqueValue(guidA) - uniqueValue(guidB),
      format: function (cell, portal, guid) {
        var info = self.uniques[guid] || {};
        $(cell).addClass('portal-list-uniques');

        function createBox(cls, title, checked, changeFunc) {
          $('<input>').prop({ type: 'checkbox', className: cls, title: title, checked: checked })
            .attr('data-list-uniques', guid)
            .appendTo(cell)[0]
            .addEventListener('change', (ev) => {
              changeFunc(ev.target.checked, guid);
              ev.preventDefault();
              return false;
            }, false);
        }

        createBox('visited', 'Visited?', !!info.visited, self.updateVisited);
        createBox('captured', 'Captured?', !!info.captured, self.updateCaptured);
        $(cell).append('<br>');
        createBox('scoutControlled', 'Scanned?', !!info.scoutControlled, self.updateScoutControlled);
        createBox('drone', 'Drone Visited?', !!info.droneVisited, self.updateDroneVisited);
      },
    });
  };

  var setup = function () {
    self.setupCSS();
    self.setupContent();
    self.loadLocal('uniques');
    window.addPortalHighlighter('Uniques (Drone)', self.highlighter);
    window.addHook('portalDetailsUpdated', self.onPortalDetailsUpdated);
    self.registerFieldForSyncing();

    if (window.plugin.portalslist) {
      self.setupPortalsList();
    }
  };

  setup.info = plugin_info; //add the script info data to the function as a property
  if (typeof changelog !== 'undefined') setup.info.changelog = changelog;
  if (!window.bootPlugins) window.bootPlugins = [];
  window.bootPlugins.push(setup);
  if (window.iitcLoaded && typeof setup === 'function') setup();
} // wrapper end
// inject code into site context
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
  info.script = { version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description };
}
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);
