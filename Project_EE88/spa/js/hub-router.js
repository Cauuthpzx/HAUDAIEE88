/**
 * Hub SPA Router — Tab manager with lazy page loading
 *
 * - Loads page JS modules on demand
 * - Manages layui tabs (open, close, switch)
 * - Handles language change: re-renders all open tabs without reload
 *
 * Page modules register on global SpaPages object:
 *   SpaPages.editPassword = { getHTML(), init(container), destroy(), onLangChange(container) }
 */
var SpaPages = {};

var HubRouter = (function () {
  var TABS_ID = 'hubTabs';
  var openedTabs = {};    // pageId → { loaded: true }
  var loadedScripts = {}; // pageId → true (script already loaded)
  var tabs, dropdown, dropdownInst, $;

  // Menu groups for script prefetching
  var MENU_GROUPS = {
    'user':                   ['user', 'inviteList'],
    'inviteList':             ['user', 'inviteList'],
    'reportLottery':          ['reportLottery', 'reportFunds', 'reportThirdGame'],
    'reportFunds':            ['reportLottery', 'reportFunds', 'reportThirdGame'],
    'reportThirdGame':        ['reportLottery', 'reportFunds', 'reportThirdGame'],
    'depositAndWithdrawal':   ['depositAndWithdrawal', 'withdrawalsRecord'],
    'withdrawalsRecord':      ['depositAndWithdrawal', 'withdrawalsRecord'],
    'bet':                    ['bet', 'betOrder'],
    'betOrder':               ['bet', 'betOrder'],
    'editPassword':           ['editPassword', 'editFundPassword'],
    'editFundPassword':       ['editPassword', 'editFundPassword'],
    'manageAgents':           ['manageAgents', 'manageUsers', 'activityLog', 'syncStatus'],
    'manageUsers':            ['manageAgents', 'manageUsers', 'activityLog', 'syncStatus'],
    'activityLog':            ['manageAgents', 'manageUsers', 'activityLog', 'syncStatus'],
    'syncStatus':             ['manageAgents', 'manageUsers', 'activityLog', 'syncStatus'],
    'dashboard':              ['dashboard']
  };

  function init(tabsRef, dropdownRef, dropdownInstRef, jq) {
    tabs = tabsRef;
    dropdown = dropdownRef;
    dropdownInst = dropdownInstRef;
    $ = jq;

    // Listen for tab close events
    tabs.on('close(' + TABS_ID + ')', function (data) {
      var pageId = data.id;
      if (pageId && openedTabs[pageId]) {
        // Call destroy on the page module
        var mod = SpaPages[pageId];
        if (mod && mod.destroy) {
          try { mod.destroy(); } catch (e) { console.warn('[SPA] destroy error:', pageId, e); }
        }
        delete openedTabs[pageId];
      }
    });
  }

  /**
   * Open a page tab
   * @param {string} pageId — module name (e.g., 'editPassword')
   * @param {string} titleI18nKey — i18n key for tab title
   */
  function openPage(pageId, titleI18nKey) {
    var title = HubLang.t(titleI18nKey);

    if (openedTabs[pageId]) {
      tabs.change(TABS_ID, pageId);
      document.title = 'Agent Hub — ' + title;
      // Auto-reload table data khi chuyển lại tab đã mở
      var container = document.getElementById('page_' + pageId);
      if (container) {
        var tbl = container.querySelector('table[id][lay-filter]');
        if (tbl) {
          try { layui.table.reload(tbl.id); } catch (e) {}
        }
      }
      return;
    }

    // Create tab with loading placeholder
    tabs.add(TABS_ID, {
      title: title,
      content: '<div class="hub-page" id="page_' + pageId + '"><div style="text-align:center;padding:50px;"><i class="hi hi-spinner" style="font-size:30px;"></i></div></div>',
      id: pageId,
      done: function (data) {
        if (dropdownInst) {
          dropdown.render($.extend({}, dropdownInst.config, { elem: data.headerItem }));
        }
      }
    });
    openedTabs[pageId] = { titleKey: titleI18nKey };
    document.title = 'Agent Hub — ' + title;

    // Load page script if not loaded
    loadPageScript(pageId, function () {
      renderPage(pageId);
    });

    // Prefetch sibling page scripts in background
    prefetchSiblings(pageId);
  }

  /**
   * Lazy load a page script
   */
  function loadPageScript(pageId, callback) {
    if (loadedScripts[pageId] || SpaPages[pageId]) {
      loadedScripts[pageId] = true;
      callback();
      return;
    }
    var script = document.createElement('script');
    script.src = '/spa/js/pages/' + pageId + '.js';
    script.onload = function () {
      loadedScripts[pageId] = true;
      callback();
    };
    script.onerror = function () {
      console.error('[SPA] Failed to load page:', pageId);
      var container = document.getElementById('page_' + pageId);
      if (container) container.innerHTML = '<div style="text-align:center;padding:50px;color:#ff5722;">Failed to load page module: ' + pageId + '</div>';
    };
    document.body.appendChild(script);
  }

  /**
   * Render a page module into its tab container
   */
  function renderPage(pageId) {
    var mod = SpaPages[pageId];
    if (!mod) {
      console.error('[SPA] Page module not found:', pageId);
      return;
    }
    var container = document.getElementById('page_' + pageId);
    if (!container) return;

    container.innerHTML = mod.getHTML();
    HubLang.applyDOM(container);

    if (mod.init) {
      try { mod.init(container); } catch (e) { console.error('[SPA] init error:', pageId, e); }
    }
  }

  /**
   * Handle language change: re-render all open tabs
   */
  function onLangChange() {
    // Update tab titles
    var headerItems = document.querySelectorAll('#' + TABS_ID + ' .layui-tabs-header li');
    headerItems.forEach(function (li) {
      var layId = li.getAttribute('lay-id');
      if (layId && openedTabs[layId] && openedTabs[layId].titleKey) {
        var span = li.querySelector('span');
        if (span) span.textContent = HubLang.t(openedTabs[layId].titleKey);
      }
    });

    // Re-render each open page
    for (var pageId in openedTabs) {
      var mod = SpaPages[pageId];
      if (!mod) continue;

      if (mod.onLangChange) {
        var container = document.getElementById('page_' + pageId);
        if (container) {
          try { mod.onLangChange(container); } catch (e) { console.warn('[SPA] onLangChange error:', pageId, e); }
        }
      }
    }

    // Update document title
    var activeItem = document.querySelector('#' + TABS_ID + ' .layui-tabs-header li.layui-this');
    if (activeItem) {
      var activeId = activeItem.getAttribute('lay-id');
      if (activeId && openedTabs[activeId] && openedTabs[activeId].titleKey) {
        document.title = 'Agent Hub — ' + HubLang.t(openedTabs[activeId].titleKey);
      }
    } else {
      document.title = HubLang.t('adminPageTitle');
    }
  }

  /**
   * Get context menu data for tab right-click
   */
  function getContextMenuData() {
    return [
      { title: HubLang.t('closeTab'), action: 'close', mode: 'this' },
      { title: HubLang.t('closeOther'), action: 'close', mode: 'other' },
      { title: HubLang.t('closeRight'), action: 'close', mode: 'right' },
      { type: '-' },
      { title: HubLang.t('closeAll'), action: 'close', mode: 'all' }
    ];
  }

  /**
   * Refresh current active tab
   */
  function refreshActive() {
    var activeItem = document.querySelector('#' + TABS_ID + ' .layui-tabs-header li.layui-this');
    if (!activeItem) return;
    var pageId = activeItem.getAttribute('lay-id');
    if (!pageId || !openedTabs[pageId]) return;

    var mod = SpaPages[pageId];
    if (!mod) return;

    // Destroy then re-render
    if (mod.destroy) {
      try { mod.destroy(); } catch (e) {}
    }
    renderPage(pageId);
  }

  /**
   * Prefetch sibling page scripts (low-priority background load)
   */
  function prefetchSiblings(pageId) {
    var siblings = MENU_GROUPS[pageId];
    if (!siblings) return;
    siblings.forEach(function (sid) {
      if (loadedScripts[sid] || SpaPages[sid]) return;
      if (document.querySelector('link[data-prefetch="' + sid + '"]')) return;
      var link = document.createElement('link');
      link.rel = 'prefetch';
      link.as = 'script';
      link.href = '/spa/js/pages/' + sid + '.js';
      link.setAttribute('data-prefetch', sid);
      document.head.appendChild(link);
    });
  }

  return {
    TABS_ID: TABS_ID,
    init: init,
    openPage: openPage,
    onLangChange: onLangChange,
    getContextMenuData: getContextMenuData,
    refreshActive: refreshActive,
    openedTabs: openedTabs
  };
})();
