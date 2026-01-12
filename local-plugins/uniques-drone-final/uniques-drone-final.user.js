// ==UserScript==
// @author         3ch01c, mordenkainennn
// @name           Uniques (Drone Final)
// @category       Misc
// @version        1.0.2
// @description    Allow manual entry of portals visited/captured/drone-visited. Use the 'highlighter-uniques' plugin to show the uniques on the map, and 'sync' to share between multiple browsers or desktop/mobile.
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
  plugin_info.dateTimeVersion = '20260111.150000';
  plugin_info.pluginId = 'uniques-drone-final';
  //END PLUGIN AUTHORS NOTE

  /* exported setup, changelog --eslint */

  var changelog = [
    {
      version: '1.0.2',
      changes: ['Ensured all feature names (highlighter, storage keys, sync tasks, hooks) are unique to prevent conflicts.'],
    },
    {
      version: '1.0.1',
      changes: ['Resolved conflicts with original uniques plugin by ensuring unique feature names and localStorage keys.'],
    },
    {
      version: '1.0.0',
      changes: ['Complete rewrite to add drone support and fix all loading/conflict issues.'],
    },
  ];

  // use own namespace for plugin
  window.plugin.uniquesDroneFinal = function () {};
  var self = window.plugin.uniquesDroneFinal;

  // Engineering Improvement: Sync Constants
  self.SYNC_PLUGIN_NAME = 'uniquesDroneFinal';
  self.SYNC_FIELD_NAME = 'uniques';

  // Engineering Improvement: Sync Constants
  self.SYNC_PLUGIN_NAME = 'uniquesDroneFinal';
  self.SYNC_FIELD_NAME = 'uniques';

  // delay in ms
  self.SYNC_DELAY = 5000;

  // maps the JS property names to localStorage keys
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

  self.onPortalDetailsUpdated = function (data) {
    if (typeof Storage === 'undefined') {
      $('#portaldetails > .imgpreview').after(self.disabledMessage);
      return;
    }

    var guid = window.selectedPortal,
      details = data.portalDetails,
      nickname = window.PLAYER.nickname;
    if (details) {
      if (details.owner === nickname) {
        // FIXME: a virus flip will set the owner of the portal, but doesn't count as a unique capture
        self.updateCaptured(true);
        // no further logic required
      } else {
        function installedByPlayer(entity) {
          return entity && entity.owner === nickname;
        }

        if (details.resonators.some(installedByPlayer) || details.mods.some(installedByPlayer)) {
          self.updateVisited(true);
        }
      }
    }

    $('#portaldetails > .imgpreview').after(self.contentHTML);
    self.updateCheckedAndHighlight(guid);
  };

  self.onPublicChatDataAvailable = function (data) {
    var nick = window.PLAYER.nickname;
    data.result.forEach(function (msg) {
      var plext = msg[2].plext,
        markup = plext.markup;

      if (
        plext.plextType === 'SYSTEM_BROADCAST' &&
        markup.length === 5 &&
        markup[0][0] === 'PLAYER' &&
        markup[0][1].plain === nick &&
        markup[1][0] === 'TEXT' &&
        markup[1][1].plain === ' deployed an ' &&
        markup[2][0] === 'TEXT' &&
        markup[3][0] === 'TEXT' &&
        markup[3][1].plain === ' Resonator on ' &&
        markup[4][0] === 'PORTAL'
      ) {
        // search for "x deployed an Ly Resonator on z"
        var portal = markup[4][1];
        var guid = window.findPortalGuidByPositionE6(portal.latE6, portal.lngE6);
        if (guid) self.setPortalVisited(guid);
      } else if (
        plext.plextType === 'SYSTEM_BROADCAST' &&
        markup.length === 3 &&
        markup[0][0] === 'PLAYER' &&
        markup[0][1].plain === nick &&
        markup[1][0] === 'TEXT' &&
        markup[1][1].plain === ' deployed a Resonator on ' &&
        markup[2][0] === 'PORTAL'
      ) {
        // search for "x deployed a Resonator on z"
        const portal = markup[2][1];
        const guid = window.findPortalGuidByPositionE6(portal.latE6, portal.lngE6);
        if (guid) self.setPortalVisited(guid);
      } else if (
        plext.plextType === 'SYSTEM_BROADCAST' &&
        markup.length === 3 &&
        markup[0][0] === 'PLAYER' &&
        markup[0][1].plain === nick &&
        markup[1][0] === 'TEXT' &&
        markup[1][1].plain === ' captured ' &&
        markup[2][0] === 'PORTAL'
      ) {
        // search for "x captured y"
        const portal = markup[2][1];
        const guid = window.findPortalGuidByPositionE6(portal.latE6, portal.lngE6);
        if (guid) self.setPortalCaptured(guid);
      } else if (
        plext.plextType === 'SYSTEM_BROADCAST' &&
        markup.length === 5 &&
        markup[0][0] === 'PLAYER' &&
        markup[0][1].plain === nick &&
        markup[1][0] === 'TEXT' &&
        markup[1][1].plain === ' linked ' &&
        markup[2][0] === 'PORTAL' &&
        markup[3][0] === 'TEXT' &&
        markup[3][1].plain === ' to ' &&
        markup[4][0] === 'PORTAL'
      ) {
        // search for "x linked y to z"
        const portal = markup[2][1];
        const guid = window.findPortalGuidByPositionE6(portal.latE6, portal.lngE6);
        if (guid) self.setPortalVisited(guid);
      } else if (
        plext.plextType === 'SYSTEM_NARROWCAST' &&
        markup.length === 6 &&
        markup[0][0] === 'TEXT' &&
        markup[0][1].plain === 'Your ' &&
        markup[1][0] === 'TEXT' &&
        markup[2][0] === 'TEXT' &&
        markup[2][1].plain === ' Resonator on ' &&
        markup[3][0] === 'PORTAL' &&
        markup[4][0] === 'TEXT' &&
        markup[4][1].plain === ' was destroyed by ' &&
        markup[5][0] === 'PLAYER'
      ) {
        // search for "Your Lx Resonator on y was destroyed by z"
        const portal = markup[3][1];
        const guid = window.findPortalGuidByPositionE6(portal.latE6, portal.lngE6);
        if (guid) self.setPortalVisited(guid);
      } else if (
        plext.plextType === 'SYSTEM_NARROWCAST' &&
        markup.length === 5 &&
        markup[0][0] === 'TEXT' &&
        markup[0][1].plain === 'Your ' &&
        markup[1][0] === 'TEXT' &&
        markup[2][0] === 'TEXT' &&
        markup[2][1].plain === ' Resonator on ' &&
        markup[3][0] === 'PORTAL' &&
        markup[4][0] === 'TEXT' &&
        markup[4][1].plain === ' has decayed'
      ) {
        // search for "Your Lx Resonator on y has decayed"
        const portal = markup[3][1];
        const guid = window.findPortalGuidByPositionE6(portal.latE6, portal.lngE6);
        if (guid) self.setPortalVisited(guid);
      } else if (
        plext.plextType === 'SYSTEM_NARROWCAST' &&
        markup.length === 4 &&
        markup[0][0] === 'TEXT' &&
        markup[0][1].plain === 'Your Portal ' &&
        markup[1][0] === 'PORTAL' &&
        markup[2][0] === 'TEXT' &&
        (markup[2][1].plain === ' neutralized by ' || markup[2][1].plain === ' is under attack by ') &&
        markup[3][0] === 'PLAYER'
      ) {
        // search for "Your Portal x neutralized by y"
        // search for "Your Portal x is under attack by y"
        const portal = markup[1][1];
        const guid = window.findPortalGuidByPositionE6(portal.latE6, portal.lngE6);
        if (guid) self.setPortalVisited(guid);
      }
    });
  };

  self.updateCheckedAndHighlight = function (guid) {
    window.runHooks('pluginUniquesDroneFinalUpdate', { guid: guid });

    if (guid === window.selectedPortal) {
      var uniqueInfo = self.uniques[guid],
        visited = (uniqueInfo && uniqueInfo.visited) || false,
        captured = (uniqueInfo && uniqueInfo.captured) || false,
        droneVisited = (uniqueInfo && uniqueInfo.droneVisited) || false;
      $('#visited').prop('checked', visited);
      $('#captured').prop('checked', captured);
      $('#drone').prop('checked', droneVisited);
    }

    if (self.isHighlightActive) {
      if (window.portals[guid]) {
        window.setMarkerStyle(window.portals[guid], guid === window.selectedPortal);
      }
    }
  };

  self.setPortalVisited = function (guid) {
    var uniqueInfo = self.uniques[guid];
    if (uniqueInfo) {
      if (uniqueInfo.visited) return;

      uniqueInfo.visited = true;
    } else {
      self.uniques[guid] = {
        visited: true,
        captured: false,
        droneVisited: false,
      };
    }

    self.updateCheckedAndHighlight(guid);
    self.sync(guid);
  };

  self.setPortalCaptured = function (guid) {
    var uniqueInfo = self.uniques[guid];
    if (uniqueInfo) {
      if (uniqueInfo.visited && uniqueInfo.captured) return;

      uniqueInfo.visited = true;
      uniqueInfo.captured = true;
    } else {
      self.uniques[guid] = {
        visited: true,
        captured: true,
        droneVisited: false,
      };
    }

    self.updateCheckedAndHighlight(guid);
    self.sync(guid);
  };

  self.updateVisited = function (visited, guid) {
    if (guid === undefined) guid = window.selectedPortal;

    var uniqueInfo = self.uniques[guid];
    if (!uniqueInfo) {
      self.uniques[guid] = uniqueInfo = {
        visited: false,
        captured: false,
        droneVisited: false,
      };
    }

    if (visited === uniqueInfo.visited) return;

    if (visited) {
      uniqueInfo.visited = true;
    } else {
      // not visited --> not captured
      uniqueInfo.visited = false;
      uniqueInfo.captured = false;
    }

    self.updateCheckedAndHighlight(guid);
    self.sync(guid);
  };

  self.updateCaptured = function (captured, guid) {
    if (guid === undefined) guid = window.selectedPortal;

    var uniqueInfo = self.uniques[guid];
    if (!uniqueInfo) {
      self.uniques[guid] = uniqueInfo = {
        visited: false,
        captured: false,
        droneVisited: false,
      };
    }

    if (captured === uniqueInfo.captured) return;

    if (captured) {
      // captured --> visited
      uniqueInfo.captured = true;
      uniqueInfo.visited = true;
    } else {
      uniqueInfo.captured = false;
    }

    self.updateCheckedAndHighlight(guid);
    self.sync(guid);
  };

  self.updateDroneVisited = function (droneVisited, guid) {
    if (guid === undefined) guid = window.selectedPortal;

    var uniqueInfo = self.uniques[guid];
    if (!uniqueInfo) {
      self.uniques[guid] = uniqueInfo = {
        visited: false,
        captured: false,
        droneVisited: false,
      };
    }

    if (droneVisited === uniqueInfo.droneVisited) return;

    uniqueInfo.droneVisited = droneVisited;

    self.updateCheckedAndHighlight(guid);
    self.sync(guid);
  };

  // stores the gived GUID for sync
  self.sync = function (guid) {
    self.updateQueue[guid] = true;
    self.storeLocal('uniques');
    self.storeLocal('updateQueue');
    self.syncQueue();
  };

  // sync the queue, but delay the actual sync to group a few updates in a single request
  self.syncQueue = function () {
    if (!self.enableSync) return;

    clearTimeout(self.syncTimer);

    self.syncTimer = setTimeout(function () {
      self.syncTimer = null;

      $.extend(self.updatingQueue, self.updateQueue);
      self.updateQueue = {};
      self.storeLocal('updatingQueue');
      self.storeLocal('updateQueue');

      const ok = window.plugin.sync.updateMap(
        self.SYNC_PLUGIN_NAME,
        self.SYNC_FIELD_NAME,
        Object.keys(self.updatingQueue)
      );
      if (!ok) {
        console.warn(`[${self.SYNC_PLUGIN_NAME}] sync updateMap failed: RegisteredMap not found`);
      }
    }, self.SYNC_DELAY);
  };

  // Call after IITC and all plugin loaded
  self.registerFieldForSyncing = function () {
    if (!window.plugin.sync) return;
    window.plugin.sync.registerMapForSync(self.SYNC_PLUGIN_NAME, self.SYNC_FIELD_NAME, self.syncCallback, self.syncInitialed);
  };

  // Call after local or remote change uploaded
  self.syncCallback = function (pluginName, fieldName, e, fullUpdated) {
    if (fieldName === 'uniques') {
      self.storeLocal('uniques');
      // All data is replaced if other client update the data during this client
      // offline,
      // fire 'pluginUniquesDroneFinalRefreshAll' to notify a full update
      if (fullUpdated) {
        // a full update - update the selected portal sidebar
        if (window.selectedPortal) {
          self.updateCheckedAndHighlight(window.selectedPortal);
        }
        // and also update all highlights, if needed
        if (self.isHighlightActive) {
          window.resetHighlightedPortals();
        }

        window.runHooks('pluginUniquesDroneFinalRefreshAll');
        return;
      }

      if (!e) return;
      if (e.isLocal) {
        // Update pushed successfully, remove it from updatingQueue
        delete self.updatingQueue[e.property];
      } else {
        // Remote update
        delete self.updateQueue[e.property];
        self.storeLocal('updateQueue');
        self.updateCheckedAndHighlight(e.property);
        window.runHooks('pluginUniquesDroneFinalUpdate', { guid: e.property });
      }
    }
  };

  // syncing of the field is initialed, upload all queued update
  self.syncInitialed = function (pluginName, fieldName) {
    if (fieldName === 'uniques') {
      self.enableSync = true;
      if (Object.keys(self.updateQueue).length > 0) {
        self.syncQueue();
      }
    }
  };

  self.storeLocal = function (name) {
    var key = self.FIELDS[name];
    if (key === undefined) return;

    var value = self[name];

    if (typeof value !== 'undefined' && value !== null) {
      localStorage[key] = JSON.stringify(self[name]);
    } else {
      localStorage.removeItem(key);
    }
  };

  self.loadLocal = function (name) {
    var key = self.FIELDS[name];
    if (key === undefined) return;

    if (localStorage[key] !== undefined) {
      self[name] = JSON.parse(localStorage[key]);
    }
  };

  /** ************************************************************************************************************************************************************/
  /** HIGHLIGHTER ************************************************************************************************************************************************/
  /** ************************************************************************************************************************************************************/
  self.highlighter = {
    highlight: function (data) {
      var guid = data.portal.options.ent[0];
      var uniqueInfo = self.uniques[guid];

      var style = {};

      if (uniqueInfo) {
        if (uniqueInfo.captured) {
          // captured (and, implied, visited too) - no highlights
        } else if (uniqueInfo.visited) {
          style.fillColor = 'yellow';
          style.fillOpacity = 0.6;
        } else if (uniqueInfo.droneVisited) {
          style.fillColor = 'purple';
          style.fillOpacity = 0.6;
        } else {
          // we have an 'uniqueInfo' entry for the portal, but it's not set visited or captured?
          // could be used to flag a portal you don't plan to visit, so use a less opaque red
          style.fillColor = 'red';
          style.fillOpacity = 0.5;
        }
      } else {
        // no visit data at all
        style.fillColor = 'red';
        style.fillOpacity = 0.7;
      }

      data.portal.setStyle(style);
    },

    setSelected: function (active) {
      self.isHighlightActive = active;
    },
  };

  self.setupCSS = function () {
    $('<style>')
      .prop('type', 'text/css')
      .html(
        '\
#uniques-container {\
  display: block;\
  text-align: center;\
  margin: 6px 3px 1px 3px;\
  padding: 0 4px;\
}\
#uniques-container label {\
  margin: 0 0.5em;\
}\
#uniques-container input {\
  vertical-align: middle;\
}\
\
.portal-list-uniques input[type=\'checkbox\'] {\
  padding: 0;\
  height: auto;\
  margin-top: -5px;\
  margin-bottom: -5px;\
}\
'
      )
      .appendTo('head');
  };

  self.setupContent = function () {
    self.contentHTML =
      '<div id="uniques-container">' +
      '<label><input type="checkbox" id="visited" onclick="window.plugin.uniquesDroneFinal.updateVisited($(this).prop(\'checked\'))"> Visited</label>' +
      '<label><input type="checkbox" id="captured" onclick="window.plugin.uniquesDroneFinal.updateCaptured($(this).prop(\'checked\'))"> Captured</label>' +
      '<label><input type="checkbox" id="drone" onclick="window.plugin.uniquesDroneFinal.updateDroneVisited($(this).prop(\'checked\'))"> Drone</label>' +
      '</div>';
    self.disabledMessage =
      '<div id="uniques-container" class="help" title="Your browser does not support localStorage">Plugin Uniques disabled</div>';
  };

  self.setupPortalsList = function () {
    window.addHook('pluginUniquesDroneFinalUpdate', function (data) {
      var info = self.uniques[data.guid];
      if (!info) info = { visited: false, captured: false, droneVisited: false };

      $(`[data-list-uniques="${data.guid}"].visited`).prop('checked', !!info.visited);
      $(`[data-list-uniques="${data.guid}"].captured`).prop('checked', !!info.captured);
      $(`[data-list-uniques="${data.guid}"].drone`).prop('checked', !!info.droneVisited);
    });

    window.addHook('pluginUniquesDroneFinalRefreshAll', function () {
      $('[data-list-uniques]').each(function (i, element) {
        var guid = element.getAttribute('data-list-uniques');

        var info = self.uniques[guid];
        if (!info) info = { visited: false, captured: false, droneVisited: false };

        var e = $(element);
        if (e.hasClass('visited')) e.prop('checked', !!info.visited);
        if (e.hasClass('captured')) e.prop('checked', !!info.captured);
        if (e.hasClass('drone')) e.prop('checked', !!info.droneVisited);
      });
    });

    function uniqueValue(guid) {
      var info = self.uniques[guid];
      if (!info) return 0;

      if (info.captured) return 3;
      if (info.visited) return 2;
      if (info.droneVisited) return 1;
      return 0;
    }

    window.plugin.portalslist.fields.push({
      title: 'Visit',
      value: function (portal) {
        return portal.options.guid;
      },
      sort: function (guidA, guidB) {
        return uniqueValue(guidA) - uniqueValue(guidB);
      },
      format: function (cell, portal, guid) {
        var info = self.uniques[guid];
        if (!info) info = { visited: false, captured: false, droneVisited: false };

        $(cell).addClass('portal-list-uniques');

        // Helper function to create checkbox
        function createBox(cls, title, checked, changeFunc) {
          $('<input>')
            .prop({
              type: 'checkbox',
              className: cls,
              title: title,
              checked: checked,
            })
            .attr('data-list-uniques', guid)
            .appendTo(cell)[0]
            .addEventListener(
              'change',
              function (ev) {
                changeFunc(this.checked, guid);
                ev.preventDefault();
                return false;
              },
              false
            );
        }

        createBox('visited', 'Portal visited?', !!info.visited, self.updateVisited);
        createBox('captured', 'Portal captured?', !!info.captured, self.updateCaptured);
        createBox('drone', 'Drone visited?', !!info.droneVisited, self.updateDroneVisited);
      },
    });
  };

  self.onMissionChanged = function (data) {
    if (!data.local) return;

    var mission = window.plugin.missions && window.plugin.missions.getMissionCache(data.mid, false);
    if (!mission) return;

    self.checkMissionWaypoints(mission);
  };

  self.onMissionLoaded = function (data) {
    // the mission has been loaded, but the dialog isn't visible yet.
    // we'll wait a moment so the mission dialog is opened behind the confirmation prompt
    setTimeout(function () {
      self.checkMissionWaypoints(data.mission);
    }, 0);
  };

  self.checkMissionWaypoints = function (mission) {
    if (!(window.plugin.missions && window.plugin.missions.checkedMissions[mission.guid])) return;

    if (!mission.waypoints) return;

    function isValidWaypoint(wp) {
      // might be hidden or field trip card
      if (!(wp && wp.portal && wp.portal.guid)) return false;

      // only use hack, deploy, link, field and upgrade; ignore photo and passphrase
      if (wp.objectiveNum <= 0 || wp.objectiveNum > 5) return false;

      return true;
    }
    function isVisited(wp) {
      var guid = wp.portal.guid,
        uniqueInfo = self.uniques[guid],
        visited = (uniqueInfo && uniqueInfo.visited) || false;

      return visited;
    }

    // check if all waypoints are already visited
    if (
      mission.waypoints.every(function (wp) {
        if (!isValidWaypoint(wp)) return true;
        return isVisited(wp);
      })
    )
      return;

    if (!confirm(`The mission ${mission.title} contains waypoints not yet marked as visited.\n\nDo you want to set them to 'visited' now?`)) return;

    mission.waypoints.forEach(function (wp) {
      if (!isValidWaypoint(wp)) return;
      if (isVisited(wp)) return;

      self.setPortalVisited(wp.portal.guid);
    });
  };

  var setup = function () {
    // HOOKS:
    // - pluginUniquesUpdateUniques
    // - pluginUniquesRefreshAll

    self.setupCSS();
    self.setupContent();
    self.loadLocal('uniques');
    window.addPortalHighlighter('Uniques (Drone)', self.highlighter);
    window.addHook('portalDetailsUpdated', self.onPortalDetailsUpdated);
    window.addHook('publicChatDataAvailable', self.onPublicChatDataAvailable);
    self.registerFieldForSyncing();

    // to mark mission portals as visited
    window.addHook('plugin-missions-mission-changed', self.onMissionChanged);
    window.addHook('plugin-missions-loaded-mission', self.onMissionLoaded);

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
