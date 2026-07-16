'use strict';

// ==========================================================================
// NO MOJIBAKE: Never paste emoji directly into this file. Use Unicode
// escapes (e.g. '\u2605') or HTML entities (e.g. '&#9733;') instead.
// Emoji pasted from clipboard corrupt silently across encodings.
// ==========================================================================


// ---------------------------------------------------------------------------
// Global state
// ---------------------------------------------------------------------------
var State = {
  config: null,
  world: null,
  gameState: null,
  hof: null,
  slots: null,
  selectedSlot: 1,
  menuSavesOpen: false,
  weeklyPool: null,
  strategies: null,
  lastReport: null,
  pendingBreakingQueue: null,
  pendingRecruitingBeat: null,
  preseasonRecruitingBeat: null,
  resultsNarrativeRecent: [],
  qualifiedEvents: null,
  pendingScreen: null,      // screen to show after breaking-news dismissed
  skipRaceAnimation: false,
};

// ---------------------------------------------------------------------------
// API bridge
// ---------------------------------------------------------------------------
function _sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

async function _awaitApiMethod(method, retries, delayMs) {
  var attempt = 0;
  var maxRetries = typeof retries === 'number' ? retries : 60;
  var waitMs = typeof delayMs === 'number' ? delayMs : 100;
  while (attempt < maxRetries) {
    var bridge = (typeof pywebview !== 'undefined' && pywebview && pywebview.api) ? pywebview.api : null;
    var fn = bridge && bridge[method];
    if (typeof fn === 'function') {
      return { bridge: bridge, fn: fn };
    }
    attempt += 1;
    await _sleep(waitMs);
  }
  throw new Error('Game API method not ready: ' + method);
}

async function api(method) {
  var args = Array.prototype.slice.call(arguments, 1);
  var ready = await _awaitApiMethod(method);
  return await ready.fn.apply(ready.bridge, args);
}

function _hotkeyTargetIsEditable(target) {
  if (!target) return false;
  var tag = String(target.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!target.isContentEditable;
}

function _dismissOverlayById(id) {
  var overlay = document.getElementById(id);
  if (!overlay || !overlay.parentNode) return false;
  var wrapper = overlay.parentNode;
  if (wrapper && wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
  else overlay.parentNode.removeChild(overlay);
  return true;
}

function _returnToMainMenu() {
  State.gameState = null;
  State.lastReport = null;
  State.weeklyPool = null;
  State.qualifiedEvents = null;
  State.strategies = null;
  State.pendingBreakingQueue = null;
  State.pendingRecruitingBeat = null;
  State.pendingScreen = null;
  api('list_slots').then(function (slots) {
    State.slots = slots;
    Router.go('menu', { slots: slots, selectedSlot: State.selectedSlot || 1 });
  }).catch(function () {
    Router.go('menu', { slots: [], selectedSlot: State.selectedSlot || 1 });
  });
}

var _globalHotkeysRegistered = false;
function registerGlobalHotkeys() {
  if (_globalHotkeysRegistered) return;
  _globalHotkeysRegistered = true;

  document.addEventListener('click', function (e) {
    var sidebarBtn = e.target && e.target.closest &&
      e.target.closest('#btn-sidebar-records, #btn-sidebar-rankings, #btn-sidebar-qualification, #btn-sidebar-achievements, #btn-sidebar-perks, #btn-sidebar-milestones');
    if (sidebarBtn) {
      if (sidebarBtn.id === 'btn-sidebar-records') { _openRecordBook(); }
      else if (sidebarBtn.id === 'btn-sidebar-rankings') { _openRankingsModal(); }
      else if (sidebarBtn.id === 'btn-sidebar-qualification') { _openQualificationModal(); }
      else if (sidebarBtn.id === 'btn-sidebar-achievements') { _openAchievementsModal(); }
      else if (sidebarBtn.id === 'btn-sidebar-perks') { _openPerksModal(); }
      else if (sidebarBtn.id === 'btn-sidebar-milestones') { _openMilestonesModal(); }
    }
    if (e.target && (e.target.id === 'btn-results-ach-strip' || (e.target.parentNode && e.target.parentNode.id === 'btn-results-ach-strip'))) {
      _openAchievementsUnlockedModal(State._pendingGainedAchs || []);
    }
  });

  document.addEventListener('keydown', function (e) {
    if (_hotkeyTargetIsEditable(e.target)) return;

    if (e.key === 'Escape') {
      var collectionModal = document.getElementById('collection-modal');
      if (collectionModal && collectionModal.parentNode) {
        collectionModal.parentNode.removeChild(collectionModal);
        e.preventDefault();
        return;
      }
      var rankingsModal = document.getElementById('rankings-modal');
      if (rankingsModal && rankingsModal.parentNode) {
        rankingsModal.parentNode.removeChild(rankingsModal);
        e.preventDefault();
        return;
      }
      var recordModal = document.getElementById('record-book-modal');
      if (recordModal && recordModal.parentNode) {
        recordModal.parentNode.removeChild(recordModal);
        e.preventDefault();
        return;
      }
      var qualificationModal = document.getElementById('qualification-modal');
      if (qualificationModal && qualificationModal.parentNode) {
        qualificationModal.parentNode.removeChild(qualificationModal);
        e.preventDefault();
        return;
      }
      if (_dismissOverlayById('overwrite-modal-overlay')) {
        e.preventDefault();
        return;
      }
      var dossierOverlay = document.getElementById('dossier-overlay');
      if (dossierOverlay && dossierOverlay.parentNode) {
        dossierOverlay.parentNode.removeChild(dossierOverlay);
        e.preventDefault();
        return;
      }
      if (Router.current() && Router.current() !== 'menu') {
        e.preventDefault();
        _returnToMainMenu();
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && String(e.key || '').toLowerCase() === 'q') {
      e.preventDefault();
      api('quit_game').catch(function (err) {
        showError('Failed to quit game: ' + err);
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
var Router = (function () {
  var _current = null;
  var _screens = {};

  function register(id, screenObj) {
    _screens[id] = screenObj;
  }

  function go(id, data) {
    _current = id;
    var screen = _screens[id];
    Root = document.getElementById('app');
    if (!screen) {
      appRoot.innerHTML =
        '<div class="error-banner">Unknown screen: ' + id + '</div>';
      return;
    }
    appRoot.innerHTML = screen.render(data || {});
    var newContent = appRoot.firstElementChild;
    if (newContent) newContent.classList.add('screen-enter');
    if (screen.init) screen.init(data || {});
  }

  return { register: register, go: go, current: function () { return _current; } };
})();

// ---------------------------------------------------------------------------
// Shared rendering helpers
// ---------------------------------------------------------------------------
function renderMenuScreen(data) {
  var slots = (data && data.slots) || [];
  var selectedSlot = (data && data.selectedSlot) || State.selectedSlot || 1;
  var savesOpen = !!((data && data.savesOpen) != null ? data.savesOpen : State.menuSavesOpen);
  var occupiedSlots = slots.filter(function (slotInfo) { return slotInfo && !slotInfo.empty; });
  var continueSlot = occupiedSlots.length
    ? occupiedSlots.slice().sort(function (a, b) { return new Date(b.timestamp) - new Date(a.timestamp); })[0]
    : null;
  var continueDisabled = !continueSlot;

  var cardsHtml = slots.map(function (slotInfo) {
    var occupied = slotInfo && !slotInfo.empty;
    var nameLine = occupied
      ? _escapeHtml((slotInfo.name || 'Unnamed Athlete') + ' \u00B7 ' + (slotInfo.build || 'Unknown Build'))
      : '\u2014 Empty \u2014';
    var metaLine = occupied
      ? 'Year ' + _escapeHtml(slotInfo.year) + ' \u00B7 Week ' + _escapeHtml(slotInfo.week) + ' \u00B7 Saved ' + _escapeHtml((slotInfo.timestamp || 'Unknown').slice(0, 10))
      : 'Start a new career';
    return (
      '<button class="menu-save-card' + (occupied ? ' menu-save-card--occupied' : ' menu-save-card--empty') + '" data-slot-card="' + slotInfo.slot + '">' +
      '<div class="menu-save-copy">' +
      '<div class="menu-save-slot">SLOT ' + slotInfo.slot + '</div>' +
      '<div class="menu-save-name">' + nameLine + '</div>' +
      '<div class="menu-save-meta">' + metaLine + '</div>' +
      '</div>' +
      '<div class="menu-save-chevron">\u203a</div>' +
      '</button>'
    );
  }).join('');

  return (
    '<div class="menu-screen">' +
    '<div class="menu-stack">' +
    '<div class="menu-title-block">' +
    '<h1 class="menu-title"><span class="menu-title-track">TRACK</span><span class="menu-title-star">STAR</span></h1>' +
    '</div>' +
    '<button class="menu-continue-btn' + (continueDisabled ? ' menu-continue-btn--disabled' : '') + '" id="btn-slot-continue"' + (continueDisabled ? ' disabled aria-disabled="true"' : '') + '>CONTINUE</button>' +
    '<div class="menu-secondary-row">' +
    '<button class="menu-secondary-btn" id="btn-slot-new-game">NEW GAME</button>' +
    '<button class="menu-secondary-btn" id="btn-record-book">RECORD BOOK</button>' +
    '</div>' +
    '<button class="menu-manage-link" id="btn-manage-saves">' + (savesOpen ? 'HIDE SAVES' : 'MANAGE SAVES') + '</button>' +
    '<button class="menu-manage-link" id="btn-how-to-play">HOW TO PLAY</button>' +
    '<button class="menu-manage-link" id="btn-settings">SETTINGS</button>' +
    (savesOpen ? '<div class="menu-saves-panel">' + cardsHtml + '</div>' : '') +
    '</div>' +
    '</div>'
  );
}

function _loadSkipRaceAnimation() {
  try {
    return window.localStorage.getItem('track_star_skip_race_animation') === '1';
  } catch (_) {
    return false;
  }
}

function _saveSkipRaceAnimation(enabled) {
  State.skipRaceAnimation = !!enabled;
  try {
    window.localStorage.setItem('track_star_skip_race_animation', enabled ? '1' : '0');
  } catch (_) {
    // Ignore storage failures and keep session state only.
  }
}

State.skipRaceAnimation = _loadSkipRaceAnimation();

function initMenuScreen() {
  function rerenderMenu(selectedSlot, savesOpen) {
    if (selectedSlot != null) State.selectedSlot = selectedSlot;
    if (savesOpen != null) State.menuSavesOpen = !!savesOpen;
    Router.go('menu', {
      slots: State.slots || [],
      selectedSlot: State.selectedSlot || 1,
      savesOpen: State.menuSavesOpen,
    });
  }

  function firstEmptySlot(slots) {
    var empty = (slots || []).filter(function (slotInfo) { return slotInfo && slotInfo.empty; })[0];
    return empty ? Number(empty.slot) : 1;
  }

  function defaultNewGameSlot(slots) {
    var slotOne = (slots || []).filter(function (slotInfo) { return Number(slotInfo.slot) === 1; })[0];
    if (!slotOne || slotOne.empty) return 1;
    return firstEmptySlot(slots);
  }

  function continueSlot(slots) {
    var occupied = (slots || []).filter(function (slotInfo) { return slotInfo && !slotInfo.empty; });
    if (!occupied.length) return null;
    occupied.sort(function (a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
    return Number(occupied[0].slot);
  }

  function loadSlot(slot) {
    return api('load_game', slot).then(function (result) {
      State.selectedSlot = result.slot || slot || State.selectedSlot || 1;
      State.gameState = result.game_state;
      State.weeklyPool = result.weekly_pool;
      State.qualifiedEvents = _normalizeQualifiedEvents(
        State.config,
        ((State.gameState || {}).athlete) || {},
        result.qualified_events || []
      );
      State.strategies = result.strategies;
      State.preseasonRecruitingBeat = result.recruiting_beat || null;
      if (result.resume_screen === 'week') {
        Router.go('week', { rivals: result.rivals || [] });
        return;
      }
      _routeAfterLoad(result.recruiting_beat || null);
    });
  }

  document.querySelectorAll('[data-slot-card]').forEach(function (card) {
    card.addEventListener('click', async function () {
      State.selectedSlot = parseInt(card.dataset.slotCard, 10) || 1;
      var selectedInfo = (State.slots || []).filter(function (slotInfo) {
        return Number(slotInfo.slot) === Number(State.selectedSlot);
      })[0];
      if (selectedInfo && selectedInfo.empty) {
        Router.go('builder', { slot: State.selectedSlot });
        return;
      }
      try {
        await loadSlot(State.selectedSlot);
      } catch (e) {
        showError('Failed to load save: ' + e);
      }
    });
  });

  var cont = document.getElementById('btn-slot-continue');
  if (cont) {
    cont.addEventListener('click', async function () {
      if (cont.disabled) return;
      var slot = continueSlot(State.slots || []);
      if (!slot) return;
      cont.disabled = true;
      cont.textContent = 'CONTINUE';
      try {
        await loadSlot(slot);
      } catch (e) {
        cont.disabled = false;
        cont.textContent = 'CONTINUE';
        showError('Failed to load save: ' + e);
      }
    });
  }

  function showOverwriteModal(slots, onChoose) {
    var existing = document.getElementById('overwrite-modal-overlay');
    if (existing) existing.parentNode.removeChild(existing);

    var btnsHtml = slots.map(function (s) {
      var label = _escapeHtml((s.name || 'Unnamed Athlete') + ' \u00B7 Year ' + s.year + ' \u00B7 Week ' + s.week);
      return '<button class="overwrite-modal-slot-btn" data-slot="' + Number(s.slot) + '">' + label + '</button>';
    }).join('');

    var html = (
      '<style>' +
      '#overwrite-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;z-index:9999;font-family:var(--font-mono);}' +
      '#overwrite-modal-box{background:var(--bg-secondary);border:1px solid var(--border-medium);border-radius:var(--radius-md);padding:2rem;max-width:420px;width:90%;display:flex;flex-direction:column;gap:1rem;}' +
      '#overwrite-modal-box p{color:var(--text-primary);margin:0;font-size:.9rem;}' +
      '.overwrite-modal-slot-btn{background:transparent;border:1px solid var(--border-medium);border-radius:var(--radius-md);color:var(--text-primary);padding:.65rem 1rem;font-family:var(--font-mono);font-size:.85rem;cursor:pointer;text-align:left;}' +
      '.overwrite-modal-slot-btn:hover{border-color:var(--accent);color:var(--accent);}' +
      '#overwrite-modal-cancel{background:transparent;border:none;color:var(--accent);font-family:var(--font-mono);font-size:.85rem;cursor:pointer;align-self:flex-end;padding:.25rem 0;}' +
      '</style>' +
      '<div id="overwrite-modal-overlay">' +
      '<div id="overwrite-modal-box">' +
      '<p>All save slots are full. Choose a slot to overwrite:</p>' +
      btnsHtml +
      '<button id="overwrite-modal-cancel">Cancel</button>' +
      '</div>' +
      '</div>'
    );

    var wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);

    var overlay = document.getElementById('overwrite-modal-overlay');

    overlay.querySelectorAll('.overwrite-modal-slot-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var slot = parseInt(btn.dataset.slot, 10);
        wrapper.parentNode.removeChild(wrapper);
        onChoose(slot);
      });
    });

    document.getElementById('overwrite-modal-cancel').addEventListener('click', function () {
      wrapper.parentNode.removeChild(wrapper);
    });
  }

  var newGame = document.getElementById('btn-slot-new-game');
  if (newGame) {
    newGame.addEventListener('click', function () {
      var slots = State.slots || [];
      var allOccupied = slots.length > 0 && slots.every(function (s) { return s && !s.empty; });
      if (allOccupied) {
        showOverwriteModal(slots, function (slot) {
          State.selectedSlot = slot;
          Router.go('builder', { slot: slot });
        });
        return;
      }
      State.selectedSlot = defaultNewGameSlot(slots);
      Router.go('builder', { slot: State.selectedSlot || 1 });
    });
  }

  var recordBook = document.getElementById('btn-record-book');
  if (recordBook) {
    recordBook.addEventListener('click', async function () {
      recordBook.disabled = true;
      recordBook.textContent = 'Loading...';
      try {
        State.hof = await api('get_hof');
        Router.go('hof', { hof: State.hof });
      } catch (e) {
        recordBook.disabled = false;
        recordBook.textContent = 'Record Book';
        showError('Failed to load Hall of Fame: ' + e);
      }
    });
  }

  var manage = document.getElementById('btn-manage-saves');
  if (manage) {
    manage.addEventListener('click', function () {
      State.menuSavesOpen = !State.menuSavesOpen;
      rerenderMenu(State.selectedSlot || 1, State.menuSavesOpen);
    });
  }

  var howToPlay = document.getElementById('btn-how-to-play');
  if (howToPlay) {
    howToPlay.addEventListener('click', function () {
      Router.go('tutorial');
    });
  }

  var settingsBtn = document.getElementById('btn-settings');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', function () {
      Router.go('settings');
    });
  }

  api('list_slots').then(function (slots) {
    var prevSerialized = JSON.stringify(State.slots || []);
    var nextSerialized = JSON.stringify(slots || []);
    State.slots = slots;
    if (!(State.selectedSlot >= 1 && State.selectedSlot <= 3)) {
      State.selectedSlot = defaultNewGameSlot(slots);
    }
    if (prevSerialized !== nextSerialized) {
      rerenderMenu(State.selectedSlot || 1, State.menuSavesOpen);
    }
  }).catch(function () {
    if (!State.slots) State.slots = [];
  });
}

var BUILDER_STAT_ORDER = ['Speed', 'Agility', 'Strength', 'Stamina', 'Toughness', 'Mentality', 'Technique', 'Recovery'];

function _builderDifficultyBudgets(config) {
  var pb = (config && config.player_builder) || {};
  var defaultPool = parseInt(pb.starting_points_pool, 10) || 100;
  var configured = pb.difficulty_budgets || {};
  return {
    easy: parseInt(configured.easy, 10) || (defaultPool + 20),
    normal: parseInt(configured.normal, 10) || defaultPool,
    hard: parseInt(configured.hard, 10) || Math.max(0, defaultPool - 40),
  };
}

function _builderDifficultyMeta(difficulty) {
  if (difficulty === 'easy') {
    return { label: 'EASY', color: 'var(--energy-high)' };
  }
  if (difficulty === 'hard') {
    return { label: 'HARD', color: 'var(--accent)' };
  }
  return { label: 'NORMAL', color: 'var(--text-primary)' };
}

function _builderContext(config, selectedBuild, difficulty) {
  var eventGroups = (config && config.event_groups) || {};
  var builds = Object.keys(eventGroups);
  var build = selectedBuild && eventGroups[selectedBuild] ? selectedBuild : (builds[0] || '');
  var pb = (config && config.player_builder) || {};
  var budgets = _builderDifficultyBudgets(config);
  var selectedDifficulty = budgets[difficulty] != null ? difficulty : 'normal';
  var baseStatValue = parseInt(pb.base_stat_value, 10) || 40;
  var pointsPool = budgets[selectedDifficulty];
  var minStat = parseInt(pb.min_stat_at_start, 10) || 30;
  var maxStat = parseInt(pb.max_stat_at_start, 10) || 65;
  var bonus = parseInt(pb.event_group_bonus, 10) || 0;
  var bonusSlots = parseInt(pb.event_group_bonus_slots, 10) || 0;
  var eg = eventGroups[build] || {};
  var bonusTargets = (eg.primary_stats || []).slice(0, bonusSlots);
  var baseByStat = {};

  BUILDER_STAT_ORDER.forEach(function (stat) {
    var statBase = baseStatValue;
    if (bonusTargets.indexOf(stat) >= 0) statBase += bonus;
    baseByStat[stat] = Math.max(minStat, Math.min(maxStat, statBase));
  });

  return {
    build: build,
    builds: builds,
    difficulty: selectedDifficulty,
    budgets: budgets,
    eventGroups: eventGroups,
    pointsPool: pointsPool,
    maxStat: maxStat,
    baseStatValue: baseStatValue,
    baseByStat: baseByStat,
  };
}

function _builderUsedPoints(allocations) {
  var used = 0;
  BUILDER_STAT_ORDER.forEach(function (stat) {
    used += allocations[stat] || 0;
  });
  return used;
}

function _competitionCategory(athlete) {
  return ((athlete || {}).competition_category) || 'men';
}

function _buildEventsForCategory(config, build, category) {
  var group = (((config || {}).event_groups || {})[build || '']) || {};
  var events = group.events || [];
  if (Array.isArray(events)) return events.slice();
  if (events && typeof events === 'object') {
    return (events[category] || events.men || []).slice();
  }
  return [];
}

function _normalizeQualifiedEvents(config, athlete, events) {
  if (!Array.isArray(events)) return [];
  var normalized = events.filter(Boolean).map(function (eventName) {
    return String(eventName);
  });
  if (!normalized.length) return normalized;
  if (!normalized.every(function (eventName) { return eventName === 'men' || eventName === 'women'; })) {
    return normalized;
  }
  return _buildEventsForCategory(
    config,
    ((athlete || {}).build) || '',
    _competitionCategory(athlete)
  );
}

function _renderBuilderBody(config, selectedBuild, difficulty, category) {
  var ctx = _builderContext(config, selectedBuild, difficulty);
  var primaryStats = (ctx.eventGroups[ctx.build] || {}).primary_stats || [];

  var difficultyOptions = ['easy', 'normal', 'hard'].map(function (key) {
    var meta = _builderDifficultyMeta(key);
    var selected = key === ctx.difficulty;
    return (
      '<button type="button" class="difficulty-option' + (selected ? ' difficulty-option--selected' : '') + '" data-difficulty-card="' + key + '">' +
      '<div class="difficulty-option__label">' + meta.label + '</div>' +
      '<div class="difficulty-option__pts">' + ctx.budgets[key] + ' pts</div>' +
      '</button>'
    );
  }).join('');

  var categoryOptions = ['men', 'women'].map(function (key) {
    var selected = key === (category || 'men');
    return (
      '<button type="button" class="difficulty-option' + (selected ? ' difficulty-option--selected' : '') + '" data-category-card="' + key + '">' +
      '<div class="difficulty-option__label">' + key.toUpperCase() + '</div>' +
      '</button>'
    );
  }).join('');

  var buildListHtml = ctx.builds.map(function (buildName) {
    var eg = ctx.eventGroups[buildName] || {};
    var selectedCls = buildName === ctx.build ? ' build-item--selected' : '';
    return (
      '<div class="build-item' + selectedCls + '" data-build-card="' + buildName + '">' +
      '<div class="build-item__name">' + buildName + '</div>' +
      '<div class="build-item__flavor">' + (eg.flavor || '') + '</div>' +
      '<div class="build-item__details">Primary: ' + ((eg.primary_stats || []).join(', ') || 'None') + '</div>' +
      '<div class="build-item__details" data-build-events-label="' + buildName + '">Events: ' + (_buildEventsForCategory(config, buildName, category || 'men').join(', ') || 'None') + '</div>' +
      '</div>'
    );
  }).join('');

  var statRowsHtml = BUILDER_STAT_ORDER.map(function (stat) {
    var maxAdd = Math.max(0, ctx.maxStat - ctx.baseByStat[stat]);
    var isPrimary = primaryStats.indexOf(stat) >= 0;
    return (
      '<div class="stat-card' + (isPrimary ? ' stat-card--primary' : '') + '">' +
      '<div class="stat-header">' +
      '<span class="stat-title">' + stat + '</span>' +
      '<span class="stat-value text-tabular" id="builder-value-' + stat + '">0</span>' +
      '</div>' +
      '<input type="range" class="stat-slider' + (isPrimary ? ' stat-slider--primary' : '') + '" min="0" max="' + maxAdd + '" value="0" data-stat-slider="' + stat + '" />' +
      '<div class="stat-base">Base: <span class="stat-base-value" id="builder-base-' + stat + '">0</span><span class="stat-bonus" id="builder-bonus-' + stat + '"></span></div>' +
      '</div>'
    );
  }).join('');

  return (
    '<div class="screen screen-builder">' +
    '<div class="builder-container">' +
    '<h1 class="builder-header"><span>CHOOSE YOUR </span><span class="builder-header__build">BUILD</span></h1>' +
    '<div class="builder-name-row">' +
    '<div class="builder-input-group">' +
    '<label class="builder-input-label" for="builder-name">NAME</label>' +
    '<input id="builder-name" class="builder-input" type="text" value="Player" maxlength="30" />' +
    '</div>' +
    '<div class="builder-input-group">' +
    '<label class="builder-input-label" for="builder-school">SCHOOL</label>' +
    '<input id="builder-school" class="builder-input" type="text" value="Hometown High" maxlength="40" />' +
    '</div>' +
    '</div>' +
    '<div class="builder-layout">' +
    '<div class="builder-left">' +
    '<div class="label-xs">Competition Category</div>' +
    '<div class="difficulty-segment">' + categoryOptions + '</div>' +
    '<div class="build-list">' + buildListHtml + '</div>' +
    '</div>' +
    '<div class="builder-right">' +
    '<div class="label-xs">Difficulty</div>' +
    '<div class="difficulty-segment">' + difficultyOptions + '</div>' +
    '<div class="label-xs">Stat Allocation</div>' +
    '<div class="stat-grid">' + statRowsHtml + '</div>' +
    '<div class="builder-footer">' +
    '<div class="builder-remaining">Remaining: <span id="builder-remaining" class="text-tabular">0</span> / <span id="builder-budget-total" class="text-tabular">0</span></div>' +
    '<button class="btn btn--career-start builder-start-btn" id="btn-start-career">Start Career</button>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '</div>'
  );
}

function renderBuilderScreen() {
  return (
    '<div class="screen screen-builder">' +
    '<div class="builder-container">' +
    '<div class="heading-lg">Athlete Builder</div>' +
    '<div class="builder-layout">' +
    '<div class="builder-left"><div class="card"><div class="label-sm">Loading builder...</div></div></div>' +
    '<div class="builder-right"><div class="card"><div class="label-sm">Preparing stat allocation...</div></div></div>' +
    '</div>' +
    '</div>' +
    '</div>'
  );
}

function initBuilderScreen(data) {
  (async function () {
    var config = State.config;
    if (!config) {
      showError('Game config not loaded. Please restart.');
      return;
    }
    if (data && data.slot) State.selectedSlot = data.slot;

    var localState = {
      selectedBuild: _builderContext(config, null, 'normal').build,
      difficulty: 'normal',
      category: 'men',
      allocations: {},
    };
    var selectedBuild = localState.selectedBuild;
    BUILDER_STAT_ORDER.forEach(function (stat) {
      localState.allocations[stat] = 0;
    });

    Root = document.getElementById('app');
    appRoot.innerHTML = _renderBuilderBody(config, localState.selectedBuild, localState.difficulty, localState.category);
    if (appRoot.firstElementChild) appRoot.firstElementChild.classList.add('screen-enter');

    function syncAllocationToConstraints(ctx) {
      BUILDER_STAT_ORDER.forEach(function (stat) {
        var maxAdd = Math.max(0, ctx.maxStat - ctx.baseByStat[stat]);
        if ((localState.allocations[stat] || 0) > maxAdd) {
          localState.allocations[stat] = maxAdd;
        }
      });
      var used = _builderUsedPoints(localState.allocations);
      while (used > ctx.pointsPool) {
        for (var i = 0; i < BUILDER_STAT_ORDER.length && used > ctx.pointsPool; i++) {
          var s = BUILDER_STAT_ORDER[i];
          if (localState.allocations[s] > 0) {
            localState.allocations[s] -= 1;
            used -= 1;
          }
        }
      }
    }

    function updateBuilderUi() {
      var ctx = _builderContext(config, localState.selectedBuild, localState.difficulty);
      syncAllocationToConstraints(ctx);
      var used = _builderUsedPoints(localState.allocations);
      var remaining = ctx.pointsPool - used;

      document.getElementById('builder-remaining').textContent = remaining;
      document.getElementById('builder-budget-total').textContent = ctx.pointsPool;

      document.querySelectorAll('[data-build-card]').forEach(function (card) {
        if (card.dataset.buildCard === localState.selectedBuild) card.classList.add('build-item--selected');
        else card.classList.remove('build-item--selected');
      });

      document.querySelectorAll('[data-difficulty-card]').forEach(function (card) {
        var key = card.dataset.difficultyCard;
        var isSelected = key === localState.difficulty;
        if (isSelected) card.classList.add('difficulty-option--selected');
        else card.classList.remove('difficulty-option--selected');
      });

      document.querySelectorAll('[data-category-card]').forEach(function (card) {
        var key = card.dataset.categoryCard;
        var isSelected = key === localState.category;
        if (isSelected) card.classList.add('difficulty-option--selected');
        else card.classList.remove('difficulty-option--selected');
      });

      var activePrimary = (ctx.eventGroups[ctx.build] || {}).primary_stats || [];
      document.querySelectorAll('[data-build-events-label]').forEach(function (el) {
        var buildName = el.dataset.buildEventsLabel || '';
        var evList = _buildEventsForCategory(config, buildName, localState.category);
        el.textContent = 'Events: ' + (evList.join(', ') || 'None');
      });
      BUILDER_STAT_ORDER.forEach(function (stat) {
        var slider = document.querySelector('[data-stat-slider="' + stat + '"]');
        var maxAdd = Math.max(0, ctx.maxStat - ctx.baseByStat[stat]);
        var alloc = localState.allocations[stat] || 0;
        slider.max = String(maxAdd);
        slider.value = String(Math.min(alloc, maxAdd));
        document.getElementById('builder-value-' + stat).textContent = ctx.baseByStat[stat] + alloc;
        var statCard = slider.closest('.stat-card');
        var isPrimary = activePrimary.indexOf(stat) >= 0;
        if (statCard) {
          if (isPrimary) statCard.classList.add('stat-card--primary');
          else statCard.classList.remove('stat-card--primary');
        }
        if (isPrimary) slider.classList.add('stat-slider--primary');
        else slider.classList.remove('stat-slider--primary');
      });

      updateStatBonuses();
    }

    function updateStatBonuses() {
      var ctx = _builderContext(config, selectedBuild, localState.difficulty);
      BUILDER_STAT_ORDER.forEach(function (stat) {
        var baseValue = ctx.baseByStat[stat];
        var bonus = ctx.baseByStat[stat] - ctx.baseStatValue;
        var baseText = document.getElementById('builder-base-' + stat);
        var bonusText = document.getElementById('builder-bonus-' + stat);
        if (!baseText || !bonusText) return;
        baseText.textContent = String(baseValue);
        bonusText.textContent = bonus > 0 ? ' (+' + bonus + ' build bonus)' : '';
      });
    }

    document.querySelectorAll('[data-difficulty-card]').forEach(function (card) {
      card.addEventListener('click', function () {
        localState.difficulty = card.dataset.difficultyCard || 'normal';
        updateBuilderUi();
      });
    });

    document.querySelectorAll('[data-category-card]').forEach(function (card) {
      card.addEventListener('click', function () {
        localState.category = card.dataset.categoryCard || 'men';
        updateBuilderUi();
      });
    });

    document.querySelectorAll('[data-build-card]').forEach(function (card) {
      card.addEventListener('click', function () {
        localState.selectedBuild = card.dataset.buildCard;
        selectedBuild = localState.selectedBuild;
        updateStatBonuses();
        updateBuilderUi();
      });
    });

    document.querySelectorAll('[data-stat-slider]').forEach(function (slider) {
      slider.addEventListener('input', function () {
        var stat = slider.dataset.statSlider;
        var ctx = _builderContext(config, localState.selectedBuild, localState.difficulty);
        var usedWithoutCurrent = _builderUsedPoints(localState.allocations) - (localState.allocations[stat] || 0);
        var maxAdd = Math.max(0, ctx.maxStat - ctx.baseByStat[stat]);
        var maxAllowed = Math.min(maxAdd, ctx.pointsPool - usedWithoutCurrent);
        var requested = parseInt(slider.value, 10) || 0;
        localState.allocations[stat] = Math.max(0, Math.min(maxAllowed, requested));
        updateBuilderUi();
      });
    });

    document.getElementById('btn-start-career').addEventListener('click', async function () {
      var name = document.getElementById('builder-name').value.trim() || 'Player';
      var school = document.getElementById('builder-school').value.trim() || 'Hometown High';
      var ctx = _builderContext(config, localState.selectedBuild, localState.difficulty);
      var stats = {};

      BUILDER_STAT_ORDER.forEach(function (stat) {
        stats[stat] = ctx.baseByStat[stat] + (localState.allocations[stat] || 0);
      });

      var btn = document.getElementById('btn-start-career');
      btn.disabled = true;
      btn.classList.add('btn--disabled');
      btn.textContent = 'Starting...';
      try {
        var result = await api('new_game', name, school, ctx.build, stats, localState.category, localState.difficulty, false, State.selectedSlot || 1);
        if (result && result.error) {
          btn.disabled = false;
          btn.classList.remove('btn--disabled');
          btn.textContent = 'Start Career';
          showError(result.error);
          return;
        }
        State.gameState = result.game_state;
        State.weeklyPool = result.weekly_pool;
        State.strategies = result.strategies;
        State.lastReport = null;
        State.preseasonRecruitingBeat = result.recruiting_beat || null;

        var athlete = (State.gameState && State.gameState.athlete) || {};
        if ((athlete.week || 1) === 1) {
          try {
            var ensured = await api('ensure_goals');
            State.gameState = ensured.game_state;
            State.preseasonRecruitingBeat = State.preseasonRecruitingBeat || ensured.recruiting_beat || null;
          } catch (goalErr) { /* ignore */ }
          Router.go('preseason');
        } else {
          Router.go('training');
        }
      } catch (e) {
        btn.disabled = false;
        btn.classList.remove('btn--disabled');
        btn.textContent = 'Start Career';
        showError('Failed to start game: ' + e);
      }
    });

    updateBuilderUi();
  })();
}

var MenuScreen = {
  render: renderMenuScreen,
  init: initMenuScreen,
};

var BuilderScreen = {
  render: renderBuilderScreen,
  init: initBuilderScreen,
};


function _escapeHtml(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _energyFillClass(energy, config) {
  var es = (config && config.energy_system) || {};
  var low = es.low_energy_threshold != null ? es.low_energy_threshold : 35;
  var veryLow = es.very_low_energy_threshold != null ? es.very_low_energy_threshold : 20;
  if (energy <= veryLow) return 'bar-fill--energy-low';
  if (energy <= low) return 'bar-fill--energy-mid';
  return 'bar-fill--energy-high';
}

function _energyMax(gameState, config) {
  return ((config && config.energy_system) || {}).max || 100;
}

function renderTopStatusBar(gameState, config, ctaConfig) {
  var gs = gameState || {};
  var athlete = gs.athlete || {};
  var energy = athlete.energy || 0;
  var energyMax = _energyMax(gs, config);
  var energyPct = Math.max(0, Math.min(100, Math.round((energy / Math.max(1, energyMax)) * 100)));
  var year = athlete.year || 1;
  var week = athlete.week || 1;
  var ctaHtml = '';
  if (ctaConfig) {
    var ctaCls = 'top-cta-btn btn ' + (ctaConfig.disabled ? 'btn--disabled' : 'btn--primary');
    var ctaDisabledAttr = ctaConfig.disabled ? ' disabled' : '';
    ctaHtml = '<button class="' + ctaCls + '" id="' + _escapeHtml(ctaConfig.id) + '"' + ctaDisabledAttr + '>' + _escapeHtml(ctaConfig.text) + '</button>';
  }
  return (
    '<div class="top-status-bar">' +
    '<div class="top-status-item top-status-item--primary">' + _escapeHtml(athlete.name || 'Athlete') + '</div>' +
    '<div class="top-status-item">' + _escapeHtml(athlete.team || '') + '</div>' +
    '<div class="top-status-item">' + _escapeHtml(seasonLabel(year)) + ' - Week ' + week + '</div>' +
    '<div class="top-status-energy">' +
    '<span class="top-status-energy-label text-tabular">Energy ' + energy + '/' + energyMax + '</span>' +
    '<div class="bar-track bar-track--energy top-status-energy-track">' +
    '<div class="bar-fill ' + _energyFillClass(energy, config) + '" style="width:' + energyPct + '%"></div>' +
    '</div>' +
    '</div>' +
    ctaHtml +
    '</div>'
  );
}
function _pbDisplayForEvent(eventName, value, config) {
  var eventsCfg = (config && config.events) || {};
  var ev = eventsCfg[eventName] || {};
  if (ev.type === 'field') return formatMark(value);
  return formatTime(value);
}

var TRAINING_UI_META = {
  'Recovery Run':                    { stats: ['Stamina', 'Recovery'],                   energy_cost: 0,  energy_recovery: 12, max_gains: { Stamina: 1, Recovery: 1 } },
  'Weight Room':                     { stats: ['Strength', 'Toughness'],                 energy_cost: 7,  energy_recovery: 0,  max_gains: { Strength: 1, Toughness: 1 } },
  'Blocks & Acceleration':           { stats: ['Speed', 'Agility', 'Technique'],         energy_cost: 9,  energy_recovery: 0,  max_gains: { Speed: 2, Agility: 1, Technique: 1 } },
  'Speed Endurance':                 { stats: ['Speed', 'Stamina', 'Strength'],          energy_cost: 8,  energy_recovery: 0,  max_gains: { Speed: 1, Stamina: 2, Strength: 1 } },
  'Sprints Race Simulation':         { stats: ['Speed', 'Agility', 'Mentality', 'Strength'], energy_cost: 7, energy_recovery: 0, max_gains: { Speed: 1, Agility: 1, Mentality: 2, Strength: 1 } },
  'Hurdle Drills':                   { stats: ['Technique', 'Agility'],                  energy_cost: 9,  energy_recovery: 0,  max_gains: { Technique: 2, Agility: 2 } },
  'Stride Cycle Work':               { stats: ['Speed', 'Technique', 'Stamina'],         energy_cost: 8,  energy_recovery: 0,  max_gains: { Speed: 1, Technique: 1, Stamina: 1 } },
  'Hurdler Race Simulation':         { stats: ['Agility', 'Mentality', 'Stamina'],       energy_cost: 7,  energy_recovery: 0,  max_gains: { Agility: 1, Mentality: 2, Stamina: 1 } },
  'Tempo Runs':                      { stats: ['Stamina', 'Speed'],                      energy_cost: 8,  energy_recovery: 0,  max_gains: { Stamina: 2, Speed: 1 } },
  'Track Intervals':                 { stats: ['Stamina', 'Toughness'],                  energy_cost: 10, energy_recovery: 0,  max_gains: { Stamina: 2, Toughness: 1 } },
  'Middle Distance Race Simulation': { stats: ['Stamina', 'Mentality', 'Technique'],     energy_cost: 7,  energy_recovery: 0,  max_gains: { Stamina: 1, Mentality: 2, Technique: 1 } },
  'Long Slow Distance':              { stats: ['Stamina', 'Recovery'],                   energy_cost: 7,  energy_recovery: 0,  max_gains: { Stamina: 2, Recovery: 1 } },
  'Hill Repeats':                    { stats: ['Speed', 'Stamina', 'Toughness'],         energy_cost: 10, energy_recovery: 0,  max_gains: { Speed: 1, Stamina: 2, Toughness: 1 } },
  'Long Distance Race Simulation':   { stats: ['Stamina', 'Mentality'],                  energy_cost: 7,  energy_recovery: 0,  max_gains: { Stamina: 1, Mentality: 2 } },
  'Plyometrics':                     { stats: ['Agility', 'Speed', 'Strength'],          energy_cost: 9,  energy_recovery: 0,  max_gains: { Agility: 2, Speed: 1, Strength: 1 } },
  'Approach & Takeoff Drills':       { stats: ['Technique', 'Agility'],                  energy_cost: 8,  energy_recovery: 0,  max_gains: { Technique: 2, Agility: 1 } },
  'Jumping Competition Sim':         { stats: ['Technique', 'Mentality', 'Toughness'],   energy_cost: 7,  energy_recovery: 0,  max_gains: { Technique: 1, Mentality: 2, Toughness: 1 } },
  'Implement Drills':                { stats: ['Technique', 'Strength', 'Mentality'],    energy_cost: 8,  energy_recovery: 0,  max_gains: { Technique: 2, Strength: 1, Mentality: 1 } },
  'Explosive Power Work':            { stats: ['Strength', 'Speed'],                     energy_cost: 10, energy_recovery: 0,  max_gains: { Strength: 2, Speed: 2 } },
  'Throwing Competition Sim':        { stats: ['Strength', 'Mentality', 'Technique'],    energy_cost: 7,  energy_recovery: 0,  max_gains: { Strength: 2, Mentality: 2, Technique: 1 } },
};

function _sessionMeta(sessionName) {
  var name = String(sessionName || '');
  var configMeta = ((State.config || {}).training_ui_meta || {})[name];
  return configMeta || TRAINING_UI_META[name] || { stats: [], energy_cost: 0, energy_recovery: 0 };
}

function _sessionDescription(sessionName) {
  var name = String(sessionName || '');
  var uiContent = ((State.config || {}).ui_content || {});
  var authored = ((uiContent.training_descriptions || {})[name]) || '';
  if (authored) return String(authored);
  if (/Recovery Run/i.test(name)) return 'Low-impact reset session that restores energy.';
  if (/Race Simulation|Competition Sim/i.test(name)) return 'Meet-pace rehearsal for execution and composure.';
  if (/Drills|Approach|Stride/i.test(name)) return 'Technical reps focused on form and consistency.';
  if (/Intervals|Repeats|Endurance|Tempo|Distance/i.test(name)) return 'Aerobic load to build stamina and late-race strength.';
  if (/Weight|Power|Plyometrics|Blocks/i.test(name)) return 'Power-focused work for speed and explosiveness.';
  return 'Balanced development session for week-to-week gains.';
}

function _strategyDescription(strategyId) {
  var name = String(strategyId || '');
  var uiContent = ((State.config || {}).ui_content || {});
  var authored = ((uiContent.race_strategy_descriptions || {})[name]) || '';
  return authored ? String(authored) : '';
}

function _rivalTeamName(rival, world) {
  // rival may have r.team (from the week-screen rival spotlight) or only r.npc_id (from Python API)
  if (rival.team) return rival.team;
  var npcs = (world && world.teams) ? world.npcs || [] : [];
  var teams = (world && world.teams) || [];
  var teamById = {};
  teams.forEach(function (t) { teamById[t.id] = t; });
  var npcById = {};
  npcs.forEach(function (n) { npcById[n.id] = n; });
  var npc = npcById[rival.npc_id];
  if (!npc) return 'Unknown School';
  return (teamById[npc.team_id] || {}).name || npc.team_id || 'Unknown School';
}

function _resolveNpcName(npcId, world) {
  var gsOverrides = ((State.gameState || {}).npc_name_overrides) || {};
  if (gsOverrides[npcId]) return gsOverrides[npcId];
  var overrides = (world && world.npc_name_overrides) || {};
  if (overrides[npcId]) return overrides[npcId];
  var npcs = (world && world.npcs) || [];
  for (var i = 0; i < npcs.length; i++) {
    if (npcs[i].id === npcId) return npcs[i].name || 'Unknown';
  }
  return 'Unknown';
}

/* ── Shared training-screen helpers (used by both renderTrainingScreen and
   renderWeekSummaryScreen — the "cold start" and "common weekly" entry
   points to what is functionally the same screen). ── */

function _renderTrainingSessionCard(session, selected) {
  var meta = _sessionMeta(session);
  var statsText = (meta.stats || []).map(function (s) {
    return _escapeHtml(s);
  }).join('<span class="dot">&middot;</span>');
  var energyText = meta.energy_recovery > 0
    ? '+' + meta.energy_recovery
    : '-' + (meta.energy_cost || 0);
  var selectedCls = selected ? ' selected' : '';
  var checkboxCls = selected ? ' checkbox--checked' : '';
  var mark = selected ? '<span class="checkbox__mark">&#10003;</span>' : '<span class="checkbox__mark"></span>';
  return (
    '<div class="card card--selectable training-card training-card--compact' + selectedCls + '" data-session="' + _escapeHtml(session) + '">' +
    '<div class="flex items-center gap-12">' +
    '<div class="checkbox' + checkboxCls + '" data-session-checkbox="' + _escapeHtml(session) + '">' + mark + '</div>' +
    '<div class="flex-1">' +
    '<div class="tcard-row">' +
    '<div class="tcard-title">' + _escapeHtml(session) + '</div>' +
    '<span class="energy-cost"><span class="icon-energy"></span>' + _escapeHtml(energyText) + '</span>' +
    '</div>' +
    '<div class="tcard-stats">' + statsText + '</div>' +
    '</div>' +
    '</div>' +
    '</div>'
  );
}

function _renderWeeklyNewsLog(worldEvents) {
  var events = (worldEvents || []).filter(function (e) { return !_isBreakingEvent(e); });
  var itemsHtml = events.map(function (e) {
    var lines = _extractNarrativeStrings(e);
    var text = lines.length ? lines[0] : '';
    if (!text) return '';
    var deltas = _collectEventStatDeltas(e);
    var barCls = '';
    var chipHtml = '';
    if (deltas.length) {
      var d = deltas[0];
      var pos = d.delta >= 0;
      barCls = pos ? ' news-log-bar--pos' : ' news-log-bar--neg';
      var sign = pos ? '+' : '−';
      chipHtml = '<span class="news-log-effect ' + (pos ? 'news-log-effect--pos' : 'news-log-effect--neg') + '">' +
        _escapeHtml(d.label) + ' ' + sign + Math.abs(d.delta) + '</span>';
    }
    return (
      '<div class="news-log-item">' +
      '<div class="news-log-bar' + barCls + '"></div>' +
      '<div class="news-log-body"><span class="news-log-text">' + _escapeHtml(text) + chipHtml + '</span></div>' +
      '</div>'
    );
  }).filter(function (x) { return !!x; }).join('');

  if (!itemsHtml) {
    return '<div class="news-empty-note">No weekly news yet &mdash; check back after your first week of training.</div>';
  }
  return '<div class="news-log">' + itemsHtml + '</div>';
}

function _renderTrainingRankingsBlock(gameState) {
  var athlete = (gameState || {}).athlete || {};
  return (
    '<div class="rankings-block">' +
    '<div class="rankings-block-head">' +
    '<div class="label-xs">RANKINGS</div>' +
    '<div class="rankings-block-meta" id="tt-rankings-meta">Year ' + (athlete.year || 1) + ' &middot; Week ' + (athlete.week || 1) + '</div>' +
    '</div>' +
    '<div class="rankings-tabs" id="tt-rankings-tabs"></div>' +
    '<div class="rankings-event-toggle" id="tt-rankings-events"></div>' +
    '<table class="rankings-table">' +
    '<thead><tr>' +
    '<th class="rankings-table__num">#</th><th>Name</th><th>School</th><th>Yr</th>' +
    '<th class="rankings-table__num">Mark</th><th></th>' +
    '</tr></thead>' +
    '<tbody id="tt-rankings-tbody"><tr class="rankings-nr-row"><td colspan="6">Loading rankings&hellip;</td></tr></tbody>' +
    '</table>' +
    '</div>'
  );
}

function _renderTrainingColumns(gameState, config, sessions, opts) {
  var gs = gameState || {};
  var o = opts || {};
  var athlete = gs.athlete || {};
  var eMax = _energyMax(gs, config);
  var week = athlete.week || 1;

  var cardsHtml = (sessions || []).map(function (session) {
    return _renderTrainingSessionCard(session, false);
  }).join('');

  var resultsHtml = o.resultsHtml
    ? '<div class="training-results-recap"><div class="label-xs">TRAINING RESULTS</div>' + o.resultsHtml + '</div>'
    : '';

  var leftInner = (
    resultsHtml +
    '<div class="training-section">' +
    '<div class="label-xs">SELECT TRAINING SESSIONS</div>' +
    '<div class="training-energy-block" id="training-energy-preview">' +
    '<div class="energy-bar-row">' +
    '<div class="energy-bar-wrap"><div class="energy-bar-fill" id="energy-bar-fill" style="width:100%"></div></div>' +
    '<div class="energy-bar-num"><span class="energy-after" id="energy-preview-after">' + (athlete.energy || 0) + '</span>' +
    '<span class="energy-bar-denom"> / ' + eMax + '</span></div>' +
    '</div>' +
    '<div class="potential-gains-line">' +
    '<span class="label-xs">POTENTIAL GAINS</span> ' +
    '<span id="potential-gains-text">&mdash;</span>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '<div class="training-grid training-grid--compact" id="training-session-list">' + cardsHtml + '</div>'
  );

  var newsHtml = '<div class="news-section-head"><div class="news-section-title">WEEKLY NEWS</div><div class="news-section-meta">Week ' + week + '</div></div>' +
    _renderWeeklyNewsLog(o.worldEvents);

  if (!gs.cohort) {
    return (
      '<div class="training-columns training-columns--single">' +
      '<div class="training-col-left training-col-left--full">' + leftInner + '</div>' +
      '</div>' +
      newsHtml
    );
  }

  return (
    '<div class="training-columns">' +
    '<div class="training-col-left">' + leftInner + '</div>' +
    '<div class="training-col-right">' + newsHtml + _renderTrainingRankingsBlock(gs) + '</div>' +
    '</div>'
  );
}

/* ── Embedded rankings widget (distinct from the sidebar's rankings modal —
   separate cache, separate view-state, fetch-once-then-flip-locally). ── */

var _trainingRankingsView = { tier: null, event: null, data: null };

function _ttRankingsMoveHtml(move) {
  if (!move) return '<span class="rankings-row__move"></span>';
  if (move > 0) return '<span class="rankings-row__move rankings-move--up">▲' + move + '</span>';
  return '<span class="rankings-row__move rankings-move--down">▼' + (-move) + '</span>';
}

function _ttRankingsRowHtml(row) {
  var cls = row.is_player ? ' class="rankings-row--player"' : '';
  var yearLabel = _RANKINGS_YEAR_LABELS[row.class_year] || String(row.class_year || '');
  var nameHtml = _escapeHtml(row.name) + (row.is_player ? ' <span class="rankings-you-tag">YOU</span>' : '');
  return (
    '<tr' + cls + '>' +
    '<td class="rankings-table__num">#' + row.rank + '</td>' +
    '<td>' + nameHtml + '</td>' +
    '<td>' + _escapeHtml(row.school || '') + '</td>' +
    '<td>' + _escapeHtml(yearLabel) + '</td>' +
    '<td class="rankings-table__num">' + _escapeHtml(_formatResultValue(row.kind || 'time', row.value)) + '</td>' +
    '<td>' + _ttRankingsMoveHtml(row.movement) + '</td>' +
    '</tr>'
  );
}

function _renderTrainingRankingsTabs() {
  var data = _trainingRankingsView.data || {};
  var tiers = data.tiers || [];
  var tabsEl = document.getElementById('tt-rankings-tabs');
  if (tabsEl) {
    tabsEl.innerHTML = tiers.map(function (tier) {
      var sel = tier === _trainingRankingsView.tier ? ' rankings-tab--selected' : '';
      return '<button class="rankings-tab' + sel + '" data-tt-tier="' + _escapeHtml(tier) + '">' + _escapeHtml(tier) + '</button>';
    }).join('');
  }
  var events = data.events || [];
  var eventsEl = document.getElementById('tt-rankings-events');
  if (eventsEl) {
    eventsEl.innerHTML = events.length > 1 ? events.map(function (ev) {
      var sel = ev === _trainingRankingsView.event ? ' rankings-event-btn--selected' : '';
      return '<button class="rankings-event-btn' + sel + '" data-tt-event="' + _escapeHtml(ev) + '">' + _escapeHtml(ev) + '</button>';
    }).join('') : '';
  }
}

var _TT_RANKINGS_TOP_N = 5;

function _renderTrainingRankingsTable() {
  var data = _trainingRankingsView.data || {};
  var board = ((data.boards || {})[_trainingRankingsView.event] || {})[_trainingRankingsView.tier] ||
    { rows: [], pinned_player_row: null, player_nr: true };
  var allRows = board.rows || [];
  var topRows = allRows.slice(0, _TT_RANKINGS_TOP_N);
  var rowsHtml = topRows.map(_ttRankingsRowHtml).join('');
  var playerInTop = topRows.some(function (r) { return r.is_player; });
  if (!playerInTop) {
    var playerRow = board.pinned_player_row || allRows.filter(function (r) { return r.is_player; })[0] || null;
    if (playerRow) {
      rowsHtml += '<tr class="rankings-sep"><td colspan="6">&middot; &middot; &middot;</td></tr>';
      rowsHtml += _ttRankingsRowHtml(playerRow);
    } else if (board.player_nr) {
      rowsHtml += '<tr class="rankings-nr-row"><td colspan="6">You are NR &mdash; post a mark this season to enter the boards.</td></tr>';
    }
  }
  if (!rowsHtml) rowsHtml = '<tr class="rankings-nr-row"><td colspan="6">No marks posted yet.</td></tr>';
  var tbody = document.getElementById('tt-rankings-tbody');
  if (tbody) tbody.innerHTML = rowsHtml;
  var meta = document.getElementById('tt-rankings-meta');
  if (meta) meta.textContent = 'Year ' + (data.year || 1) + ' · Week ' + (data.week || 1);
}

function _bindTrainingRankingsClicks() {
  var tabsEl = document.getElementById('tt-rankings-tabs');
  if (tabsEl) {
    tabsEl.addEventListener('click', function (e) {
      var tier = e.target && e.target.getAttribute && e.target.getAttribute('data-tt-tier');
      if (!tier) return;
      _trainingRankingsView.tier = tier;
      _renderTrainingRankingsTabs();
      _renderTrainingRankingsTable();
    });
  }
  var eventsEl = document.getElementById('tt-rankings-events');
  if (eventsEl) {
    eventsEl.addEventListener('click', function (e) {
      var ev = e.target && e.target.getAttribute && e.target.getAttribute('data-tt-event');
      if (!ev) return;
      _trainingRankingsView.event = ev;
      _renderTrainingRankingsTabs();
      _renderTrainingRankingsTable();
    });
  }
}

function _initTrainingRankingsWidget(gameState) {
  var gs = gameState || {};
  if (!gs.cohort) return;
  _bindTrainingRankingsClicks();
  api('get_rankings').then(function (data) {
    if (!data || !data.available) return;
    _trainingRankingsView.data = data;
    var tiers = data.tiers || [];
    if (!_trainingRankingsView.tier || tiers.indexOf(_trainingRankingsView.tier) === -1) {
      _trainingRankingsView.tier = tiers.length ? tiers[0] : null;
    }
    var events = data.events || [];
    if (!_trainingRankingsView.event || events.indexOf(_trainingRankingsView.event) === -1) {
      _trainingRankingsView.event = events.length ? events[0] : null;
    }
    _renderTrainingRankingsTabs();
    _renderTrainingRankingsTable();
  }).catch(function () {
    var tbody = document.getElementById('tt-rankings-tbody');
    if (tbody) tbody.innerHTML = '<tr class="rankings-nr-row"><td colspan="6">Could not load rankings.</td></tr>';
  });
}

function renderSidebar(gameState, config, worldEvents) {
  var gs = gameState || {};
  var athlete = gs.athlete || {};
  var world = State.world || {};
  var stats = athlete.stats || {};
  var statOrder = ['Speed', 'Agility', 'Strength', 'Stamina', 'Toughness', 'Mentality', 'Technique', 'Recovery'];
  var pbs = athlete.personal_bests || {};
  var seasonPrs = (gs.current_season || {}).season_prs || {};
  var achievements = athlete.achievements_unlocked || [];
  var perks = gs.perks_unlocked || [];
  var milestones = gs.milestones_completed || [];

  var statsHtml = statOrder.map(function (s) {
    var v = Number(stats[s] || 0);
    var pct = Math.max(0, Math.min(100, v));
    return (
      '<div class="stat-row">' +
      '<div class="stat-name">' + _escapeHtml(s) + '</div>' +
      '<div class="bar-track bar-track--stat flex-1"><div class="bar-fill bar-fill--stat" style="width:' + pct + '%"></div></div>' +
      '<div class="stat-value">' + formatStat(v) + '</div>' +
      '</div>'
    );
  }).join('');

  var pbKeys = Object.keys(pbs);
  var pbHtml = pbKeys.length ? pbKeys.map(function (evName) {
    return (
      '<div class="flex justify-between gap-8 text-tabular">' +
      '<span>' + _escapeHtml(evName) + '</span>' +
      '<span>' + _escapeHtml(_pbDisplayForEvent(evName, pbs[evName], config)) + '</span>' +
      '</div>'
    );
  }).join('') : '<div class="label-sm">No PBs yet.</div>';

  var week = athlete.week || 1;
  var schedule = (config && config.season && config.season.schedule) || {};
  var meetType = (((schedule[String(week)] || {}).meet_type) || 'regular_season');
  var targetMeet = _qualificationTargetMeet(meetType);
  var qualCfg = ((config || {}).qualification || {})[targetMeet || ''] || {};
  var category = _competitionCategory(athlete);
  var timeThresholds = (qualCfg.time_thresholds || {})[category] || (qualCfg.time_thresholds || {});
  var markThresholds = (qualCfg.mark_thresholds || {})[category] || (qualCfg.mark_thresholds || {});
  var buildEvents = _buildEventsForCategory(config, athlete.build || '', category);
  var qualEvents = buildEvents.filter(function (ev) {
    return timeThresholds[ev] != null || markThresholds[ev] != null;
  });
  var qualificationTitle = targetMeet ? meetLabel(targetMeet) : 'No active target';
  var qualificationHtml = targetMeet && qualEvents.length ? qualEvents.map(function (ev) {
    var seasonPr = (seasonPrs[ev] || {}).value;
    var threshold = (timeThresholds[ev] != null) ? timeThresholds[ev] : markThresholds[ev];
    var isTime = timeThresholds[ev] != null;
    var markText = seasonPr == null ? 'No mark' : (isTime ? formatTime(seasonPr) : formatMark(seasonPr));
    var standardText = threshold == null ? '\u2014' : _formatThreshold(ev, threshold, config);
    return (
      '<div class="qualification-row">' +
      '<span class="qualification-event">' + _escapeHtml(ev) + '</span>' +
      '<span class="qualification-values text-tabular">' + _escapeHtml(markText) + ' / ' + _escapeHtml(standardText) + '</span>' +
      '</div>'
    );
  }).join('') : '<div class="label-sm">No qualification standards available.</div>';

  function _sidebarListRow(id, bulletCls, label, valueHtml) {
    return (
      '<button class="sidebar-list-row" id="' + id + '">' +
      '<span class="sidebar-list-bullet ' + bulletCls + '"></span>' +
      '<span class="sidebar-list-label">' + _escapeHtml(label) + '</span>' +
      '<span class="sidebar-list-value">' + valueHtml + '</span>' +
      '</button>'
    );
  }

  function _sidebarFraction(unlocked, kind) {
    var total = _collectionAllIds(kind).length;
    return total ? (unlocked.length + '/' + total) : String(unlocked.length);
  }

  var hasCohort = !!(gameState && gameState.cohort);
  var recordsRowsHtml =
    _sidebarListRow('btn-sidebar-achievements', 'sidebar-list-bullet--achievement', 'Achievements', _sidebarFraction(achievements, 'achievement')) +
    _sidebarListRow('btn-sidebar-perks', 'sidebar-list-bullet--perk', 'Perks', '') +
    _sidebarListRow('btn-sidebar-milestones', 'sidebar-list-bullet--milestone', 'Milestones', '') +
    '<div class="sidebar-list-divider"></div>' +
    (hasCohort ? _sidebarListRow('btn-sidebar-rankings', 'sidebar-list-bullet--rankings', 'Rankings', '\u203a') : '') +
    _sidebarListRow('btn-sidebar-records', 'sidebar-list-bullet--records', 'Record Book', '\u203A');

  return (
    '<aside class="sidebar">' +
    '<div class="label-xs">STATS</div>' +
    '<div class="flex flex-col gap-6">' + statsHtml + '</div>' +
    '<div class="divider-accent"></div>' +
    '<div class="label-xs">PERSONAL BESTS</div>' +
    '<div class="flex flex-col gap-6">' + pbHtml + '</div>' +
    '<div class="divider-accent"></div>' +
    '<button class="sidebar-collection-hdr" id="btn-sidebar-qualification">QUALIFICATION</button>' +
    '<div class="qualification-subhead">' + _escapeHtml(qualificationTitle) + '</div>' +
    '<div class="qualification-list">' + qualificationHtml + '</div>' +
    '<div class="divider-accent"></div>' +
    '<div class="label-xs">RECORDS &amp; AWARDS</div>' +
    '<div class="sidebar-list">' + recordsRowsHtml + '</div>' +
    '</aside>'
  );
}

function renderTrainingScreen(gameState, config, pool, worldEvents) {
  var gs = gameState || {};
  var athlete = gs.athlete || {};
  var buildName = athlete.build || '';
  var sessions = pool || [];

  return (
    '<div class="app">' +
    renderSidebar(gs, config, worldEvents || []) +
    '<main class="main-content">' +
    renderTopStatusBar(gs, config, { id: 'btn-training-proceed', text: 'Select a session', disabled: true }) +
    '<div class="heading-lg">Training</div>' +
    '<div class="label-sm">' + _escapeHtml(buildName) + '</div>' +
    '<div class="divider-accent"></div>' +
    _renderTrainingColumns(gs, config, sessions, { worldEvents: worldEvents || [] }) +
    '</main>' +
    '</div>'
  );
}

function initTrainingScreen(gameState, config, pool) {
  var sessions = pool || [];
  var selected = {};
  var maxSessions = (config && config.training && config.training.sessions_per_week) || 5;
  var athlete = (gameState && gameState.athlete) || {};
  var energyBefore = athlete.energy || 0;
  var energyMax = _energyMax(gameState, config);
  function escAttr(v) {
    return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function selectedCount() {
    return Object.keys(selected).length;
  }

  function isSelected(name) {
    return !!selected[name];
  }

  function deselect(name) {
    if (selected[name]) delete selected[name];
  }

  function select(name) {
    selected[name] = true;
  }

  function projectedEnergyAfter() {
    var chosen = Object.keys(selected);
    var projected = energyBefore;
    chosen.forEach(function (sessionName, idx) {
      var meta = _sessionMeta(sessionName);
      if ((meta.energy_recovery || 0) > 0) {
        projected += (meta.energy_recovery || 0);
      } else {
        var cost = meta.energy_cost || 0;
        if (idx >= 3) cost = Math.round(cost * 1.25);
        projected -= cost;
      }
    });
    if (projected < 0) projected = 0;
    if (projected > energyMax) projected = energyMax;
    return projected;
  }

  function updateEnergyPreview() {
    var afterEl = document.getElementById('energy-preview-after');
    var fillEl = document.getElementById('energy-bar-fill');
    if (!afterEl) return;
    var projected = projectedEnergyAfter();
    afterEl.textContent = String(projected);
    if (fillEl) {
      var pct = energyMax > 0 ? Math.max(0, Math.round(projected / energyMax * 100)) : 0;
      fillEl.style.width = pct + '%';
    }
  }

  function updatePotentialGains() {
    var el = document.getElementById('potential-gains-text');
    if (!el) return;
    var chosen = Object.keys(selected);
    if (!chosen.length) { el.innerHTML = '—'; return; }
    var totals = {};
    chosen.forEach(function (name) {
      var gains = (_sessionMeta(name).max_gains) || {};
      Object.keys(gains).forEach(function (stat) {
        totals[stat] = (totals[stat] || 0) + gains[stat];
      });
    });
    var parts = Object.keys(totals).map(function (stat) {
      return '<span class="gain-chip">+' + totals[stat] + ' ' + _escapeHtml(stat) + '</span>';
    });
    el.innerHTML = parts.join('');
  }

  function syncUi() {
    sessions.forEach(function (session) {
      var card = document.querySelector('[data-session="' + escAttr(session) + '"]');
      var cb = document.querySelector('[data-session-checkbox="' + escAttr(session) + '"]');
      if (!card || !cb) return;
      if (isSelected(session)) {
        card.classList.add('card--selected');
        card.classList.add('selected');
        cb.classList.add('checkbox--checked');
        cb.innerHTML = '<span class="checkbox__mark">&#10003;</span>';
      } else {
        card.classList.remove('card--selected');
        card.classList.remove('selected');
        cb.classList.remove('checkbox--checked');
        cb.innerHTML = '<span class="checkbox__mark"></span>';
      }
    });

    updateEnergyPreview();
    updatePotentialGains();
    var btn = document.getElementById('btn-training-proceed');
    if (!btn) return;
    if (selectedCount() > 0) {
      btn.classList.remove('btn--disabled');
      btn.classList.add('btn--primary');
      btn.textContent = 'Proceed to Race Setup \u2192';
      btn.disabled = false;
    } else {
      btn.classList.remove('btn--primary');
      btn.classList.add('btn--disabled');
      btn.textContent = 'Select at least one session';
      btn.disabled = true;
    }
  }

  sessions.forEach(function (session) {
    var card = document.querySelector('[data-session="' + escAttr(session) + '"]');
    if (!card) return;
    card.addEventListener('click', function () {
      var recovery = /^Recovery Run$/i.test(session);
      if (isSelected(session)) {
        deselect(session);
        syncUi();
        return;
      }

      if (recovery) {
        selected = {};
        select(session);
        syncUi();
        return;
      }

      if (isSelected('Recovery Run')) deselect('Recovery Run');
      if (selectedCount() >= maxSessions) return;
      select(session);
      syncUi();
    });
  });

  var submitBtn = document.getElementById('btn-training-proceed');
  if (submitBtn) {
    submitBtn.addEventListener('click', async function () {
      if (selectedCount() < 1) return;
      var selectedSessions = Object.keys(selected);

      submitBtn.disabled = true;
      submitBtn.classList.remove('btn--primary');
      submitBtn.classList.add('btn--disabled');
      submitBtn.textContent = 'Submitting...';

      try {
        var result = await api('submit_training', selectedSessions);
        if (result && result.error) {
          if (result.season_end) {
            _routeSeasonEnd();
            return;
          }
          submitBtn.disabled = false;
          showError(result.error);
          syncUi();
          return;
        }
        State.gameState = result.game_state;

        if (result.is_bye) {
          State.weeklyPool = result.weekly_pool;
          State.lastReport = result.report;
          State.pendingRecruitingBeat = result.recruiting_beat || null;
          Router.go('results', { report: result.report });
        } else {
          State.qualifiedEvents = _normalizeQualifiedEvents(
            State.config,
            ((State.gameState || {}).athlete) || {},
            result.qualified_events
          );
          State.strategies = result.strategies;
          State.previewRivals = result.rivals || [];

          var _curWeek = ((State.gameState || {}).athlete || {}).week || 1;
          var _curSchedule = ((State.config || {}).season || {}).schedule || {};
          var _curMeetType = ((_curSchedule[String(_curWeek)] || {}).meet_type) || '';
          if (_RACE_PREVIEW_MEET_TYPES[_curMeetType] && State.qualifiedEvents.length > 0) {
            api('get_race_preview', State.qualifiedEvents).then(function (preview) {
              Router.go('race_preview', { preview: preview });
            }).catch(function (err) {
              showError('Preview error: ' + err);
              Router.go('week', { rivals: State.previewRivals });
            });
          } else {
            Router.go('week', { rivals: State.previewRivals });
          }
        }
      } catch (e) {
        submitBtn.disabled = false;
        showError('Error submitting training: ' + e);
        syncUi();
      }
    });
  }

  syncUi();
  _initTrainingRankingsWidget(gameState);
}

var TrainingScreen = {
  render: function (data) {
    var d = data || {};
    return renderTrainingScreen(
      State.gameState,
      State.config,
      State.weeklyPool || [],
      d.worldEvents || []
    );
  },
  init: function () {
    initTrainingScreen(State.gameState, State.config, State.weeklyPool || []);
  },
};

function _meetPressure(config, meetType) {
  var p = (((config || {}).pressure_system || {}).meet_pressure || {});
  return Number(p[meetType] || 0);
}

function _qualificationTargetMeet(meetType) {
  if (meetType === 'regular_season' || meetType === 'club_championship') return 'class_meet';
  if (meetType === 'class_meet') return 'state_meet';
  if (meetType === 'state_meet') return 'regional_meet';
  if (meetType === 'regional_meet') return 'national_meet';
  return null;
}

function _qualifiedHigherTiersForEvent(gameState, currentMeetType, eventName) {
  var order = ['class_meet', 'state_meet', 'regional_meet', 'national_meet'];
  var meetOrder = {
    regular_season: -1,
    club_championship: -1,
    class_meet: 0,
    state_meet: 1,
    regional_meet: 2,
    national_meet: 3,
  };
  var curIdx = meetOrder[currentMeetType] != null ? meetOrder[currentMeetType] : -1;
  var qual = (gameState && gameState.qualification) || {};
  return order.filter(function (m, idx) {
    return idx > curIdx && !!((qual[m] || {})[eventName]);
  });
}

function _formatThreshold(eventName, threshold, config) {
  var eventsCfg = (config && config.events) || {};
  var ev = eventsCfg[eventName] || {};
  if (ev.type === 'field') return formatMark(threshold);
  return formatTime(threshold);
}

function _formatResultValue(kind, value) {
  return kind === 'mark' ? formatMark(value) : formatTime(value);
}

function _resultsNarrativeText(narrative) {
  if (!narrative) return '';
  if (typeof narrative === 'string') return narrative;
  if (typeof narrative.line === 'string') return narrative.line;
  return '';
}

var MEET_ATMOSPHERE_BEAT_IDS = {
  narr_regular_grind: true,
  narr_regular_grind_compete: true,
  narr_regular_grind_focus: true,
  narr_league_scene: true,
  narr_league_routine: true,
  narr_week_one_start: true,
  narr_mid_season_check: true,
  narr_regular_season_finale: true,
  narr_regular_season_fatigue: true,
  narr_week_seven: true,
  narr_club_championship: true,
  narr_club_championship_nerves: true,
  narr_club_champ_reminder: true,
  narr_class_meet: true,
  narr_class_meet_focus: true,
  narr_class_meet_arrive: true,
  narr_state_meet: true,
  narr_state_meet_pressure: true,
  narr_state_meet_composed: true,
  narr_regional_meet: true,
  narr_regional_meet_edge: true,
  narr_regional_meet_earned: true,
  narr_national_meet: true,
  narr_national_meet_quiet: true,
  narr_national_meet_arrive: true,
  narr_season_start_goals: true,
  narr_week_two: true,
  narr_week_three: true,
  narr_week_six: true,
};

function _normalizeNarrativeEntry(narrative) {
  if (!narrative) return null;
  if (typeof narrative === 'string') return { id: '', line: narrative };
  var line = '';
  if (typeof narrative.line === 'string') line = narrative.line;
  else if (typeof narrative.text === 'string') line = narrative.text;
  return {
    id: narrative.id || '',
    line: line,
  };
}

function _isMeetAtmosphereNarrative(entry, world) {
  var n = _normalizeNarrativeEntry(entry);
  if (!n) return false;
  if (n.id && MEET_ATMOSPHERE_BEAT_IDS[n.id]) return true;
  var line = String(n.line || '').trim();
  if (!line) return false;
  var beats = ((((world || {}).narrative || {}).beats) || []);
  for (var i = 0; i < beats.length; i++) {
    var beat = beats[i] || {};
    if (!MEET_ATMOSPHERE_BEAT_IDS[beat.id || '']) continue;
    var text = beat.text;
    if (Array.isArray(text)) {
      for (var j = 0; j < text.length; j++) {
        if (String(text[j] || '').trim() === line) return true;
      }
    } else if (String(text || '').trim() === line) {
      return true;
    }
  }
  return false;
}

function _narrativeTriggerMatches(trigger, context) {
  var t = trigger || {};
  var c = context || {};
  var type = t.type;
  if (type === 'week_equals') return c.week === t.week;
  if (type === 'meet_type_is') return c.meet_type === t.meet_type;
  return false;
}

function _stableHashInt(seed) {
  var s = String(seed || '');
  var h = 2166136261;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function _pickMeetAtmosphereLines(world, gameState, meetType, week) {
  var beats = ((((world || {}).narrative || {}).beats) || []);
  var ctx = {
    meet_type: meetType,
    week: week,
  };
  var matching = beats.filter(function (b) {
    var beat = b || {};
    return !!MEET_ATMOSPHERE_BEAT_IDS[beat.id || ''] && _narrativeTriggerMatches(beat.trigger || {}, ctx);
  });
  if (!matching.length) return { primary: '', secondary: '' };

  var athlete = ((gameState || {}).athlete) || {};
  var seedBase = [athlete.name || '', athlete.year || 1, week, meetType || ''].join('|');

  function pickBeat(seedSuffix, excludeId) {
    var pool = excludeId ? matching.filter(function (b) { return (b || {}).id !== excludeId; }) : matching;
    if (!pool.length) return null;
    var totalWeight = pool.reduce(function (sum, beat) {
      var w = Number((beat || {}).weight);
      return sum + (w > 0 ? w : 1);
    }, 0);
    var cursor = _stableHashInt(seedBase + seedSuffix) / 4294967296 * (totalWeight || 1);
    var chosen = pool[0];
    for (var i = 0; i < pool.length; i++) {
      var beatWeight = Number((pool[i] || {}).weight);
      var wv = beatWeight > 0 ? beatWeight : 1;
      cursor -= wv;
      if (cursor <= 0) {
        chosen = pool[i];
        break;
      }
    }
    return chosen;
  }

  function lineFromBeat(beat, lineSeed) {
    var text = (beat || {}).text;
    if (Array.isArray(text) && text.length) {
      var idx = _stableHashInt(lineSeed + '|' + ((beat || {}).id || '')) % text.length;
      return String(text[idx] || '').trim();
    }
    return String(text || '').trim();
  }

  var primaryBeat = pickBeat('', null);
  var primary = primaryBeat ? lineFromBeat(primaryBeat, seedBase) : '';

  var secondaryBeat = pickBeat('|2', (primaryBeat || {}).id);
  var secondary = secondaryBeat ? lineFromBeat(secondaryBeat, seedBase + '|2') : '';

  return { primary: primary, secondary: secondary };
}

function _beatLineForReport(beat, report) {
  var b = beat || {};
  var text = b.text;
  if (Array.isArray(text)) {
    if (!text.length) return '';
    var rep = report || {};
    var seed = String(rep.year || '') + '|' + String(rep.week || '') + '|' + String(b.id || '');
    var idx = _stableHashInt(seed) % text.length;
    return String(text[idx] || '').trim();
  }
  return String(text || '').trim();
}

function _reportNarrativeLine(report) {
  var rep = report || {};
  var lines = _extractNarrativeStrings(rep.narratives);
  if (!lines.length) lines = _extractNarrativeStrings(rep.narrative);
  return lines.length ? String(lines[0] || '').trim() : '';
}

function _resultsNarrativeBeat(report, gameState, world) {
  var rep = report || {};
  var gs = gameState || {};
  var beats = ((((world || {}).narrative || {}).beats) || []).filter(function (b) {
    var beatId = (b || {}).id || '';
    return !MEET_ATMOSPHERE_BEAT_IDS[beatId];
  });
  if (!beats.length) return null;

  var gained = {};
  (rep.achievements_gained || []).forEach(function (a) {
    if (!a) return;
    if (typeof a === 'string') gained[a] = true;
    else if (a.id) gained[a.id] = true;
  });
  var gainedIds = Object.keys(gained);

  function allMatches(pred) {
    var out = [];
    for (var i = 0; i < beats.length; i++) {
      if (pred(beats[i] || {})) out.push(beats[i]);
    }
    return out;
  }

  function pickWithCooldown(candidates, bucket) {
    var list = candidates || [];
    if (!list.length) return null;
    var recent = State.resultsNarrativeRecent || [];
    var blocked = {};
    recent.forEach(function (id) { blocked[id] = true; });
    var available = list.filter(function (b) { return !blocked[(b || {}).id || '']; });
    var pool = available.length ? available : list;
    var repSeed = [String(rep.year || ''), String(rep.week || ''), String(bucket || '')].join('|');
    var idx = _stableHashInt(repSeed) % pool.length;
    return pool[idx];
  }

  // Prefer the backend-selected beat when present so the UI matches the sim
  // layer, including any formatted rivalry names/placeholders.
  var reportNarrativeId = (((rep || {}).narrative || {}).id) || '';
  if (reportNarrativeId && !MEET_ATMOSPHERE_BEAT_IDS[reportNarrativeId]) {
    var backendBeat = allMatches(function (beat) { return (beat.id || '') === reportNarrativeId; })[0] || null;
    if (backendBeat) return backendBeat;
  }

  // 1) Achievement beats
  if (gainedIds.length) {
    var achCandidates = allMatches(function (beat) {
      var trig = beat.trigger || {};
      return trig.type === 'achievement_unlocked' && !!gained[trig.achievement_id || ''];
    });
    if (achCandidates.length) return pickWithCooldown(achCandidates, 'achievement');
  }

  // 2) Rivalry beats
  var rivalry = rep.rivalry || {};
  var rivalryState = {
    rival_win: !!rivalry.rival_win,
    rival_loss: !!rivalry.rival_loss,
    rival_present: !!rivalry.rival_present,
    rival_new: !!rivalry.new_rivals && rivalry.new_rivals.length > 0,
  };
  var rivalCandidates = allMatches(function (beat) {
    var trig = beat.trigger || {};
    var t = trig.type || '';
    return (t === 'rival_win' || t === 'rival_loss' || t === 'rival_present' || t === 'rival_new') && !!rivalryState[t];
  });
  if (rivalCandidates.length) return pickWithCooldown(rivalCandidates, 'rivalry');

  // 3) Energy condition beats
  var energy = Number(rep.energy);
  if (!(energy >= 0)) energy = Number((((gs || {}).athlete || {}).energy));
  var energyCandidates = allMatches(function (beat) {
    var trig = beat.trigger || {};
    if (trig.type === 'energy_lte') return energy <= Number(trig.energy);
    if (trig.type === 'energy_gte') return energy >= Number(trig.energy);
    return false;
  });
  if (energyCandidates.length) return pickWithCooldown(energyCandidates, 'energy');

  // 4) Event-specific beats
  var chosenEvents = (rep.events || []).slice();
  if (!chosenEvents.length && rep.event) chosenEvents = [rep.event];
  if (!chosenEvents.length) {
    chosenEvents = (rep.meet_results || []).map(function (mr) { return (mr || {}).event; }).filter(Boolean);
  }
  var eventLookup = {};
  chosenEvents.forEach(function (ev) { eventLookup[String(ev)] = true; });
  var eventCandidates = allMatches(function (beat) {
    var trig = beat.trigger || {};
    return trig.type === 'event_chosen' && !!eventLookup[String(trig.event || '')];
  });
  if (eventCandidates.length) return pickWithCooldown(eventCandidates, 'event');

  return null;
}

function _truncateLabel(text, maxLen) {
  var s = String(text || '');
  if (s.length <= maxLen) return s;
  return s.slice(0, Math.max(1, maxLen - 1)).trim() + '\u2026';
}

function _findAchievementDef(achievementId, config, world) {
  if (!achievementId) return null;
  var worldAchievements = (world && world.achievements) || null;
  if (worldAchievements) {
    if (!Array.isArray(worldAchievements) && worldAchievements[achievementId]) return worldAchievements[achievementId];
    if (Array.isArray(worldAchievements)) {
      for (var i = 0; i < worldAchievements.length; i++) {
        if ((worldAchievements[i] || {}).id === achievementId) return worldAchievements[i];
      }
    }
  }
  var cfgAchievements = (config && config.achievements) || null;
  if (cfgAchievements) {
    if (!Array.isArray(cfgAchievements) && cfgAchievements[achievementId]) return cfgAchievements[achievementId];
    if (Array.isArray(cfgAchievements)) {
      for (var j = 0; j < cfgAchievements.length; j++) {
        if ((cfgAchievements[j] || {}).id === achievementId) return cfgAchievements[j];
      }
    }
  }
  return null;
}

function _findMilestoneDef(milestoneId, config, world) {
  if (!milestoneId) return null;
  var worldMilestones = (world && world.milestones) || null;
  if (worldMilestones) {
    if (!Array.isArray(worldMilestones) && worldMilestones[milestoneId]) return worldMilestones[milestoneId];
    if (Array.isArray(worldMilestones)) {
      for (var i = 0; i < worldMilestones.length; i++) {
        if ((worldMilestones[i] || {}).id === milestoneId) return worldMilestones[i];
      }
    }
  }
  var cfgMilestones = (config && config.milestones) || null;
  if (cfgMilestones) {
    if (!Array.isArray(cfgMilestones) && cfgMilestones[milestoneId]) return cfgMilestones[milestoneId];
    if (Array.isArray(cfgMilestones)) {
      for (var j = 0; j < cfgMilestones.length; j++) {
        if ((cfgMilestones[j] || {}).id === milestoneId) return cfgMilestones[j];
      }
    }
  }
  return null;
}

function _resolveAchievementName(achievementId, config, world) {
  var def = _findAchievementDef(achievementId, config, world) || {};
  return def.name || def.title || def.label || _humanizeId(achievementId, 'ach_');
}

function _resolvePerkName(perkId, config, world) {
  return _findPerkName(perkId, config, world);
}

function _resolveMilestoneName(milestoneId, config, world) {
  var def = _findMilestoneDef(milestoneId, config, world) || {};
  return def.name || def.title || def.label || _humanizeId(milestoneId, 'ms_');
}

function _achievementEligibleForBuild(def, buildEvents) {
  var conditions = (def && def.conditions) || [];
  for (var i = 0; i < conditions.length; i++) {
    var ev = conditions[i] && conditions[i].event;
    if (ev && buildEvents.indexOf(ev) === -1) return false;
  }
  return true;
}

function _collectionAllIds(kind) {
  var world = State.world || {};
  var config = State.config || {};
  if (kind === 'achievement') {
    var gs = State.gameState || {};
    var athlete = gs.athlete || {};
    var category = _competitionCategory(athlete);
    var buildEvents = _buildEventsForCategory(config, athlete.build || '', category);
    return (world.achievements || []).filter(function (d) {
      return _achievementEligibleForBuild(d, buildEvents);
    }).map(function (d) { return d.id; });
  }
  if (kind === 'perk') {
    return Object.keys(config.perks || {});
  }
  if (kind === 'milestone') {
    return (config.milestones || []).map(function (d) { return d.id; });
  }
  return [];
}

function _collectionDef(kind, id) {
  var world = State.world || {};
  var config = State.config || {};
  if (kind === 'achievement') return _findAchievementDef(id, config, world);
  if (kind === 'perk') return _findPerkDef(id, config, world);
  if (kind === 'milestone') return _findMilestoneDef(id, config, world);
  return null;
}

function _collectEventStatDeltas(eventObj) {
  var e = eventObj || {};
  var labels = {
    speed: 'Speed',
    agility: 'Agility',
    strength: 'Strength',
    stamina: 'Stamina',
    toughness: 'Toughness',
    mentality: 'Mentality',
    technique: 'Technique',
    recovery: 'Recovery',
    energy: 'Energy',
  };
  var out = [];
  var seen = {};

  function titleCase(s) {
    return String(s || '').split(/[\s_]+/).filter(Boolean).map(function (p) {
      return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    }).join(' ');
  }

  function normalizeName(name) {
    var key = String(name || '').trim();
    if (!key) return '';
    var lower = key.toLowerCase().replace(/\s+/g, '_');
    return labels[lower] || titleCase(key);
  }

  function pushPart(name, delta) {
    var label = normalizeName(name);
    var n = Number(delta);
    if (!label || !isFinite(n) || n === 0) return;
    var key = label + '|' + n;
    if (seen[key]) return;
    seen[key] = true;
    out.push({ label: label, delta: n });
  }

  function numericDelta(obj) {
    if (!obj || typeof obj !== 'object') return null;
    var cand = ['delta', 'value', 'amount', 'change', 'modifier'];
    for (var i = 0; i < cand.length; i++) {
      var n = Number(obj[cand[i]]);
      if (isFinite(n) && n !== 0) return n;
    }
    return null;
  }

  function walk(value, hintKey, containerMode) {
    if (value == null) return;
    if (typeof value === 'string') {
      // Ignore raw identifier-like strings (e.g., "energy", "stat:Technique").
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(function (item) { walk(item, hintKey, containerMode); });
      return;
    }
    if (typeof value === 'object') {
      var namedStat = value.stat || value.name || value.attribute || null;
      var namedDelta = numericDelta(value);
      if (namedStat && namedDelta != null) {
        pushPart(namedStat, namedDelta);
      } else if (typeof value.effect === 'string' && namedDelta != null) {
        pushPart(value.effect, namedDelta);
      }

      Object.keys(value).forEach(function (k) {
        var v = value[k];
        var key = String(k || '');
        var lower = key.toLowerCase();
        if (lower === 'stat' || lower === 'name' || lower === 'attribute' ||
            lower === 'delta' || lower === 'value' || lower === 'amount' ||
            lower === 'change' || lower === 'modifier') {
          return;
        }
        var isContainer = lower === 'effect' || lower === 'effects' || lower === 'stat_changes' ||
          lower === 'changes' || lower === 'modifiers' || lower === 'stats' || lower === 'bonuses';

        if (isContainer) {
          walk(v, key, true);
          return;
        }

        if (typeof v === 'number') {
          if (labels[lower]) {
            pushPart(lower, v);
            return;
          }
          return;
        }

        walk(v, key, containerMode);
      });
      return;
    }

    if (typeof value === 'number' && hintKey) {
      var lk = String(hintKey).toLowerCase();
      if (labels[lk]) pushPart(lk, value);
    }
  }

  walk(e.stat_changes, 'stat_changes', true);
  walk(e.effects, 'effects', true);
  walk(e.effect, 'effect', true);
  walk(e.stat, 'stat', true);

  return out;
}

function _isBreakingEvent(ev) {
  var e = ev || {};
  var severity = parseInt(e.severity, 10);
  var layer = parseInt(e.layer, 10);
  var type = String(e.type || '').toLowerCase();
  return severity === 3 || layer === 3 || type === 'breaking_news';
}

function _breakingEventsFromReport(report) {
  return (report && report.world_events || []).filter(_isBreakingEvent);
}

function _breakingHeadline(ev) {
  var e = ev || {};
  // Prefer an explicit display field; otherwise format the label or id.
  if (e.headline) return e.headline;
  if (e.title) return e.title;
  var raw = e.label || e.id || '';
  // Convert snake_case -> Title Case ("major_injury" -> "Major Injury")
  return raw.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }) || 'Breaking News';
}

function _breakingNarrativeParagraphs(ev) {
  var e = ev || {};
  var lines = [];
  function add(v) {
    var s = String(v || '').trim();
    if (s) lines.push(s);
  }
  // Prefer explicit narrative field
  if (Array.isArray(e.narrative)) e.narrative.forEach(add);
  else if (e.narrative != null) add(e.narrative);
  // Fall back to the text field used by world events (string or array of variants)
  if (!lines.length) {
    if (Array.isArray(e.text)) {
      // text array contains alternative phrasings -- pick one via stable hash on the id
      var idx = e.id ? _stableHashInt(e.id) % e.text.length : 0;
      add(e.text[Math.abs(idx) % e.text.length]);
    } else if (typeof e.text === 'string') {
      add(e.text);
    }
  }
  var dedup = [];
  var seen = {};
  lines.forEach(function (l) {
    if (seen[l]) return;
    seen[l] = true;
    dedup.push(l);
  });
  return dedup.slice(0, 3);
}

// Dedicated effect summary for breaking news modal.
// _collectEventStatDeltas only surfaces type:"stat" effects; this function
// reads the effect struct directly so energy/mod effect types show too.
function _breakingEffectLine(ev) {
  var e = ev || {};
  var eff = e.effect || {};
  var type = String(eff.type || '');
  var stat = String(eff.stat || '');
  var delta = Number(eff.delta);
  if (!isFinite(delta) || delta === 0) return '';
  var sign = delta > 0 ? '+' : '\u2212';
  var abs = Math.abs(delta);
  if (type === 'stat' && stat) return stat + ' ' + sign + abs;
  if (type === 'energy') return 'Energy ' + sign + abs;
  if (type === 'training_gain_mod') return 'Training gains ' + sign + abs + ' this week';
  if (type === 'pressure_mod') return 'Race pressure ' + sign + abs;
  return '';
}

function _extractNarrativeStrings(value) {
  var out = [];
  function walk(v) {
    if (v == null) return;
    if (typeof v === 'string' || typeof v === 'number') {
      var s = String(v).trim();
      if (s && s !== '[object Object]') out.push(s);
      return;
    }
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (typeof v === 'object') {
      if (typeof v.text === 'string' && v.text.trim()) {
        out.push(v.text.trim());
        return;
      }
      if (typeof v.line === 'string' && v.line.trim()) {
        out.push(v.line.trim());
        return;
      }
      Object.keys(v).forEach(function (k) {
        // Skip known identifier keys to avoid leaking internal taxonomy labels.
        if (k === 'id' || k === 'key' || k === 'type' || k === 'label' || k === 'slug') return;
        walk(v[k]);
      });
    }
  }
  walk(value);
  return out;
}

function _previousBestForEvent(historyMeets, eventName, kind, reportYear, reportWeek) {
  var prior = (historyMeets || []).filter(function (m) {
    if (m.event !== eventName) return false;
    if (kind === 'time' && m.kind !== 'time') return false;
    if (kind === 'mark' && m.kind !== 'mark') return false;
    var y = parseInt(m.year, 10) || 0;
    var w = parseInt(m.week, 10) || 0;
    return (y < reportYear) || (y === reportYear && w < reportWeek);
  });
  if (!prior.length) return null;
  if (kind === 'mark') {
    return prior.reduce(function (best, m) {
      return best == null || m.value > best ? m.value : best;
    }, null);
  }
  return prior.reduce(function (best, m) {
    return best == null || m.value < best ? m.value : best;
  }, null);
}

function renderWeekScreen(gameState, config, qualifiedEvents, strategies, rivals, worldEvents, world) {
  var gs = gameState || {};
  var athlete = gs.athlete || {};
  var week = athlete.week || 1;
  var schedule = (config && config.season && config.season.schedule) || {};
  var meetInfo = schedule[String(week)] || {};
  var meetType = meetInfo.meet_type || 'regular_season';
  var meetName = meetInfo.name || meetLabel(meetType);
  var pressure = _meetPressure(config, meetType);
  var events = _normalizeQualifiedEvents(config, athlete, qualifiedEvents || []);
  var stratList = strategies || [];
  var rivalList = rivals || [];
  var atmosphereLines = _pickMeetAtmosphereLines(world || State.world, gs, meetType, week);

  var eventsHtml = events.map(function (ev) {
    var qualifiedHigher = _qualifiedHigherTiersForEvent(gs, meetType, ev);
    var badges = qualifiedHigher.map(function (tier) {
      return '<span class="badge badge--qual">Q ' + _escapeHtml(meetLabel(tier)) + '</span>';
    }).join('');
    return (
      '<div class="card card--selectable week-event-card event-card" data-week-event="' + _escapeHtml(ev) + '">' +
      '<div class="flex items-center justify-between">' +
      '<div class="flex items-center gap-12">' +
      '<div class="checkbox" data-week-event-checkbox="' + _escapeHtml(ev) + '"><span class="checkbox__mark"></span></div>' +
      '<div class="heading-md">' + _escapeHtml(ev) + '</div>' +
      '</div>' +
      '<div class="flex gap-6" style="flex-wrap:wrap;">' + badges + '</div>' +
      '</div>' +
      '</div>'
    );
  }).join('');
  var _throttleDisplayList = stratList.slice().reverse();
  var throttleLabelsHtml = _throttleDisplayList.map(function (s, i) {
    return (
      '<div class="throttle-label" data-week-strategy="' + _escapeHtml(s.id) + '" data-throttle-idx="' + i + '">' +
      '<div class="throttle-label-name">' + _escapeHtml(s.id) + '</div>' +
      '<div class="throttle-label-desc">' + _escapeHtml(_strategyDescription(s.id) || s.description || '') + '</div>' +
      '</div>'
    );
  }).join('');

  var rivalsHtml = rivalList.length ? (
    '<div class="card rival-spotlight-wrap">' +
    '<div class="label-xs">RIVAL SPOTLIGHT</div>' +
    rivalList.map(function (r) {
      var level = r.level || 1;
      var npcIdAttr = r.npc_id ? ' data-rival-npc-id="' + _escapeHtml(r.npc_id) + '"' : '';
      var accentClass = level >= 3 ? ' rival-spotlight-card--lv3' : (level >= 2 ? ' rival-spotlight-card--lv2' : ' rival-spotlight-card--lv1');
      return (
        '<div class="card rival-spotlight-card' + accentClass + '"' + npcIdAttr + '>' +
        '<div class="rival-spotlight-inner">' +
        '<div class="rival-name">' + _escapeHtml(r.name || 'Rival') + '</div>' +
        '<div class="rival-meta text-tabular">' + _escapeHtml(_rivalTeamName(r, world || State.world || {})) + '<span class="rival-sep">&bull;</span>' + (r.wins || 0) + 'W / ' + (r.losses || 0) + 'L</div>' +
        '<span class="rival-level">LV ' + level + '</span>' +
        '</div>' +
        '<div class="rival-bio">' + _escapeHtml(r.bio || '') + '</div>' +
        '</div>'
      );
    }).join('') +
    '</div>'
  ) : '';

  var atmosphereHtml = atmosphereLines.primary
    ? '<div class="card meet-atmosphere">' +
      '<div class="meet-atmosphere-label">Meet Atmosphere</div>' +
      '<div class="meet-atmosphere-text">' + _escapeHtml(atmosphereLines.primary) + '</div>' +
      (atmosphereLines.secondary ? '<div class="meet-atmosphere-text--secondary">' + _escapeHtml(atmosphereLines.secondary) + '</div>' : '') +
      '</div>'
    : '';

  var meetContextHtml = rivalsHtml
    ? '<div class="meet-context-columns">' +
      '<div class="meet-context-col--rivals">' + rivalsHtml + '</div>' +
      '<div class="meet-context-col--atmosphere">' + atmosphereHtml + '</div>' +
      '</div>'
    : atmosphereHtml;

  return (
    '<div class="app app-week-screen">' +
    renderSidebar(gs, config, worldEvents || []) +
    '<main class="main-content">' +
    renderTopStatusBar(gs, config, { id: 'btn-submit-race-plan', text: 'Submit Race Plan', disabled: true }) +
    '<div class="card meet-header-card">' +
    '<div class="heading-lg">' + _escapeHtml(meetName) + '</div>' +
    '<div class="label-sm">' + _escapeHtml(athlete.build || '') + '</div>' +
    (pressure > 0 ? '<div style="margin-top:8px;"><span class="badge badge--qual">Pressure +' + Math.round(pressure * 100) + '%</span></div>' : '') +
    '</div>' +
    meetContextHtml +
    '<div><div class="label-xs">EVENTS</div><div class="meet-events-hint">Select one or more events to enter.</div></div>' +
    '<div class="event-grid">' + (eventsHtml || '<div class="label-sm">No events available.</div>') + '</div>' +
    '<div class="label-xs">RACE STRATEGY</div>' +
    '<div class="throttle-picker" id="strategy-throttle-picker">' +
    '<div class="throttle-col"><div class="throttle-body" id="throttle-body"><div class="throttle-fill" id="throttle-fill"></div><div class="throttle-handle" id="throttle-handle"></div></div></div>' +
    '<div class="throttle-labels">' + throttleLabelsHtml + '</div>' +
    '<div class="throttle-info" id="throttle-info"><div class="tinfo-empty">Select a strategy<br>to see its profile.</div></div>' +
    '</div>' +
    '</main>' +
    '</div>'
  );
}

function initWeekScreen(gameState, config, qualifiedEvents, strategies) {
  var events = _normalizeQualifiedEvents(config, (gameState || {}).athlete || {}, qualifiedEvents || []);
  var selectedEvents = {};
  var selectedStrategy = null;

  function syncButton() {
    var btn = document.getElementById('btn-submit-race-plan');
    if (!btn) return;
    var ready = Object.keys(selectedEvents).length > 0 && !!selectedStrategy;
    if (ready) {
      btn.classList.remove('btn--disabled');
      btn.classList.add('btn--primary');
      btn.disabled = false;
    } else {
      btn.classList.remove('btn--primary');
      btn.classList.add('btn--disabled');
      btn.disabled = true;
    }
  }

  events.forEach(function (ev) {
    var card = document.querySelector('[data-week-event="' + String(ev).replace(/"/g, '\\"') + '"]');
    var cb = document.querySelector('[data-week-event-checkbox="' + String(ev).replace(/"/g, '\\"') + '"]');
    if (!card || !cb) return;
    card.addEventListener('click', function () {
      if (selectedEvents[ev]) delete selectedEvents[ev];
      else selectedEvents[ev] = true;
      var on = !!selectedEvents[ev];
      card.classList.toggle('card--selected', on);
      cb.classList.toggle('checkbox--checked', on);
      cb.innerHTML = on ? '<span class="checkbox__mark">&#10003;</span>' : '<span class="checkbox__mark"></span>';
      syncButton();
    });
  });

  var _throttleBody   = document.getElementById('throttle-body');
  var _throttleHandle = document.getElementById('throttle-handle');
  var _throttleFill   = document.getElementById('throttle-fill');
  var _throttleStrats = (strategies || []).slice().reverse();
  var _throttleTotal  = _throttleStrats.length;

  function _updateFill(handleTop) {
    if (!_throttleBody || !_throttleFill || !_throttleHandle) return;
    var trackH  = _throttleBody.offsetHeight;
    var handleH = _throttleHandle.offsetHeight;
    _throttleFill.style.height = Math.max(0, trackH - handleTop - handleH / 2) + 'px';
  }

  function _positionHandle(idx) {
    if (!_throttleBody || !_throttleHandle || _throttleTotal <= 0) return;
    var trackH  = _throttleBody.offsetHeight;
    var handleH = _throttleHandle.offsetHeight;
    var travel  = Math.max(0, trackH - handleH);
    var top     = _throttleTotal <= 1 ? 0 : Math.round((idx / (_throttleTotal - 1)) * travel);
    _throttleHandle.style.top     = top + 'px';
    _throttleHandle.style.opacity = '1';
    _updateFill(top);
  }

  function _updateThrottleInfo(strat) {
    var infoEl = document.getElementById('throttle-info');
    if (!infoEl) return;
    if (!strat) {
      infoEl.innerHTML = '<div class="tinfo-empty">Select a strategy<br>to see its profile.</div>';
      return;
    }
    var _athlete = (gameState || {}).athlete || {};
    var eMax    = _energyMax(gameState, config);
    var curE    = parseInt(_athlete.energy, 10) || 0;
    var cost    = parseInt(strat.energy_cost, 10) || 0;
    var afterE  = Math.max(0, curE - cost);
    var costPct = eMax > 0 ? Math.max(0, Math.min(100, Math.round(cost / eMax * 100))) : 0;

    var injuryPct = Math.round((parseFloat(strat.injury_risk) || 0) * 100);
    var injuryText = injuryPct === 0 ? 'None' : injuryPct + '%';
    var injuryCls  = injuryPct === 0 ? 'tinfo-risk-none' : (injuryPct < 5 ? 'tinfo-risk-low' : 'tinfo-risk-high');

    var BUILD_PRIMARY = {
      'Sprints': 'Speed', 'Hurdler': 'Speed',
      'Middle Distance': 'Stamina', 'Long Distance': 'Stamina',
      'Jumping': 'Agility', 'Throwing': 'Strength'
    };
    var statRanges = strat.stat_ranges || {};
    var gainLines  = [];

    var primGain = strat.primary_stat_gain;
    if (primGain && primGain[1] > 0) {
      var primStat = BUILD_PRIMARY[_athlete.build || ''] || 'build stat';
      gainLines.push({ text: '+' + primGain[1] + ' ' + primStat, neg: false });
    }
    Object.keys(statRanges).forEach(function (stat) {
      var r = statRanges[stat];
      if (!r || (r[0] === 0 && r[1] === 0)) return;
      var neg = r[1] <= 0;
      var val = neg ? r[0] : r[1];
      gainLines.push({ text: (val > 0 ? '+' : '') + val + ' ' + stat, neg: neg });
    });

    var gainsHtml = gainLines.length === 0
      ? '<div class="tinfo-gain-row tinfo-gain-none">No stat changes</div>'
      : gainLines.map(function (g) {
          return '<div class="tinfo-gain-row' + (g.neg ? ' tinfo-gain-row--neg' : '') + '">' + _escapeHtml(g.text) + '</div>';
        }).join('');

    infoEl.innerHTML =
      '<div class="tinfo-section">' +
      '<div class="tinfo-label">ENERGY COST</div>' +
      '<div class="tinfo-bar-wrap"><div class="tinfo-bar-fill" style="width:' + costPct + '%"></div></div>' +
      '<div class="tinfo-nums">−' + cost + ' energy · ' + afterE + '/' + eMax + ' after</div>' +
      '</div>' +
      '<div class="tinfo-section">' +
      '<div class="tinfo-label">AFTER THE RACE</div>' +
      '<div class="tinfo-risk">Injury risk: <span class="' + injuryCls + '">' + injuryText + '</span></div>' +
      gainsHtml +
      '</div>';
  }

  function _highlightLabel(idx) {
    document.querySelectorAll('.throttle-label').forEach(function (el) {
      el.classList.remove('throttle-label--selected');
    });
    var s = _throttleStrats[idx];
    if (!s) return;
    var lbl = document.querySelector('.throttle-label[data-week-strategy="' + String(s.id).replace(/"/g, '\\"') + '"]');
    if (lbl) lbl.classList.add('throttle-label--selected');
    _updateThrottleInfo(s);
  }

  _throttleStrats.forEach(function (s, i) {
    var label = document.querySelector('.throttle-label[data-week-strategy="' + String(s.id).replace(/"/g, '\\"') + '"]');
    if (!label) return;
    label.addEventListener('click', function () {
      _highlightLabel(i);
      _positionHandle(i);
      selectedStrategy = s.id;
      syncButton();
    });
  });

  if (_throttleHandle) {
    _throttleHandle.addEventListener('mousedown', function (e) {
      var dragStartY   = e.clientY;
      var dragStartTop = parseInt(_throttleHandle.style.top, 10) || 0;
      e.preventDefault();

      // Suppress spring animation during free drag so it tracks 1:1 with the mouse
      _throttleHandle.style.transition = 'opacity 0.15s ease';
      if (_throttleFill) _throttleFill.style.transition = 'none';

      function onMove(ev) {
        if (!_throttleBody || !_throttleHandle) return;
        var trackH  = _throttleBody.offsetHeight;
        var handleH = _throttleHandle.offsetHeight;
        var travel  = Math.max(0, trackH - handleH);
        var newTop  = Math.max(0, Math.min(travel, dragStartTop + ev.clientY - dragStartY));
        _throttleHandle.style.top = newTop + 'px';
        _updateFill(newTop);
        var nearIdx = Math.min(_throttleTotal - 1, Math.max(0, Math.round((newTop / (travel || 1)) * (_throttleTotal - 1))));
        _highlightLabel(nearIdx);
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        // Restore spring transition so the snap-to-grid fires with bounce
        _throttleHandle.style.transition = '';
        if (_throttleFill) _throttleFill.style.transition = '';
        if (!_throttleBody || !_throttleHandle) return;
        var trackH  = _throttleBody.offsetHeight;
        var handleH = _throttleHandle.offsetHeight;
        var travel  = Math.max(0, trackH - handleH);
        var curTop  = parseInt(_throttleHandle.style.top, 10) || 0;
        var idx     = Math.min(_throttleTotal - 1, Math.max(0, Math.round((curTop / (travel || 1)) * (_throttleTotal - 1))));
        _positionHandle(idx);
        selectedStrategy = _throttleStrats[idx] ? _throttleStrats[idx].id : null;
        syncButton();
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // Default to "Compete to Win" on load
  var _defaultIdx = 0;
  for (var _di = 0; _di < _throttleStrats.length; _di++) {
    if (_throttleStrats[_di].id === 'Compete to Win') { _defaultIdx = _di; break; }
  }
  _highlightLabel(_defaultIdx);
  _positionHandle(_defaultIdx);
  selectedStrategy = _throttleStrats[_defaultIdx] ? _throttleStrats[_defaultIdx].id : null;
  syncButton();

  var submit = document.getElementById('btn-submit-race-plan');
  if (submit) {
    submit.addEventListener('click', async function () {
      if (submit.disabled) return;
      var selectedEventsList = Object.keys(selectedEvents);
      submit.disabled = true;
      submit.classList.remove('btn--primary');
      submit.classList.add('btn--disabled');
      submit.textContent = 'Submitting...';
      try {
        var result = await api('submit_week', selectedEventsList, selectedStrategy);
        if (result && result.error) {
          if (result.season_end) {
            _routeSeasonEnd();
            return;
          }
          showError(result.error);
          submit.textContent = 'Submit Race Plan';
          syncButton();
          return;
        }
        State.gameState = result.game_state;
        State.weeklyPool = result.weekly_pool;
        State.lastReport = result.report;
        State.pendingRecruitingBeat = result.recruiting_beat || null;
        Router.go('results', { report: result.report });
      } catch (e) {
        showError('Error submitting week: ' + e);
        submit.textContent = 'Submit Race Plan';
        syncButton();
      }
    });
  }

  syncButton();
  _bindRivalDossierClicks();
}

function renderResultsScreen(report, gameState, config, worldEvents) {
  var rep = report || {};
  var gs = gameState || {};
  var athlete = gs.athlete || {};
  var meetResults = rep.meet_results || [];
  var historyMeets = ((gs.history || {}).meets) || [];
  var reportYear = parseInt(rep.year, 10) || 0;
  var reportWeek = parseInt(rep.week, 10) || 0;
  var _rsMeetInfo = ((config && config.season && config.season.schedule) || {})[String(reportWeek)] || {};
  var _meetNameStr = _rsMeetInfo.name || meetLabel(_rsMeetInfo.meet_type || 'regular_season');

  var pbMeet = meetResults.find(function (mr) {
    var ev = mr.event;
    var kind = ((mr.player_result || {}).kind) || 'time';
    var cur = (mr.player_result || {}).value;
    var curPb = (athlete.personal_bests || {})[ev];
    if (curPb == null || cur == null) return false;
    if (kind === 'mark') return cur >= curPb;
    return cur <= curPb;
  });

  var pbHtml = '';
  if (pbMeet) {
    var pbEvent = pbMeet.event;
    var pbKind = (pbMeet.player_result || {}).kind || 'time';
    var current = (pbMeet.player_result || {}).value;
    var previous = _previousBestForEvent(historyMeets, pbEvent, pbKind, reportYear, reportWeek);
    // Delta is always computed as new - old.
    // For time events, improvements are negative; for field marks, improvements are positive.
    var delta = previous == null ? null : (current - previous);
    if (delta != null && Math.abs(delta) < 0.005) delta = 0;
    var deltaText = 'NEW';
    if (delta != null) {
      var deltaSign = delta > 0 ? '+' : '';
      deltaText = deltaSign + delta.toFixed(2) + (pbKind === 'mark' ? 'm' : 's');
    }
    pbHtml =
      '<div class="pb-callout animate-pb">' +
      '<div class="pb-callout__star">&#9733;</div>' +
      '<div>' +
      '<div class="pb-callout__title">Personal Best \u2022 ' + _escapeHtml(pbEvent) + '</div>' +
      '<div class="pb-callout__detail">New: ' + _escapeHtml(_formatResultValue(pbKind, current)) +
      ' \u2022 Previous: ' + _escapeHtml(previous == null ? 'N/A' : _formatResultValue(pbKind, previous)) + '</div>' +
      '</div>' +
      '<div class="pb-callout__delta">' + _escapeHtml(deltaText) + '</div>' +
      '</div>';
  }

  function _buildRecordsHtmlForEvent(allBroken, eventName) {
    return (allBroken || []).filter(function (rb) {
      return rb.event === eventName;
    }).map(function (rb) {
      var label = rb.record_type === 'school' ? 'SCHOOL RECORD' : String(rb.meet_type_key || 'MEET RECORD');
      var kind = rb.kind || 'time';
      return (
        '<div class="record-callout animate-pb">' +
        '<div class="record-callout__icon">&#9670;</div>' +
        '<div>' +
        '<div class="record-callout__title">' + _escapeHtml(label) + ' • ' + _escapeHtml(rb.event) + '</div>' +
        '<div class="record-callout__detail">New: ' + _escapeHtml(_formatResultValue(kind, rb.new_value)) +
        ' • Previous: ' + _escapeHtml(_formatResultValue(kind, rb.prev_value)) +
        ' (' + _escapeHtml(rb.prev_holder) + ', ' + _escapeHtml(rb.prev_year_str) + ')' +
        '</div>' +
        '</div>' +
        '</div>'
      );
    }).join('');
  }

  var narrativeBeat = _resultsNarrativeBeat(rep, gs, State.world);
  if (narrativeBeat && narrativeBeat.id) {
    var recentIds = (State.resultsNarrativeRecent || []).slice();
    recentIds.push(narrativeBeat.id);
    if (recentIds.length > 3) recentIds = recentIds.slice(recentIds.length - 3);
    State.resultsNarrativeRecent = recentIds;
  }
  var narrativeLine = _reportNarrativeLine(rep) || _beatLineForReport(narrativeBeat, rep);
  var _gainedAchs = (rep.achievements_gained || []);
  var achievementUnlockHtml = '';
  if (_gainedAchs.length) {
    var _achBadges = _gainedAchs.map(function (a) {
      var achId = (a && a.id) ? a.id : a;
      return '<span class="badge badge--achievement badge--lg">' + _escapeHtml(_resolveAchievementName(achId, config, State.world || {})) + '</span>';
    }).join('');
    State._pendingGainedAchs = _gainedAchs;
    achievementUnlockHtml =
      '<button class="ach-unlock-strip animate-pb" id="btn-results-ach-strip">' +
      '<div class="ach-unlock-strip__header">ACHIEVEMENT' + (_gainedAchs.length > 1 ? 'S' : '') + ' UNLOCKED &#8250;</div>' +
      '<div class="ach-unlock-strip__badges">' + _achBadges + '</div>' +
      '</button>';
  }

  function performanceBreakdownContext(mr) {
    var stats = (athlete && athlete.stats) || {};
    var strategy = (mr && mr.strategy) || rep.strategy || 'Compete to Win';
    var placing = parseInt(((mr || {}).player_place), 10) || 0;
    var eventName = String(((mr || {}).event) || '');
    var experience = Number(stats.Experience || stats.experience || stats.Mentality || stats.mentality || 50);
    var technique = Number(stats.Technique || stats.technique || 50);
    var energy = Number(rep.energy != null ? rep.energy : athlete.energy || 0);
    return {
      event: eventName,
      strategy: strategy,
      placing: placing,
      energy: energy,
      experience: isFinite(experience) ? experience : 50,
      technique: isFinite(technique) ? technique : 50,
    };
  }

  function coachCardShell(mr, narrativeText) {
    var context = performanceBreakdownContext(mr);
    var quoteHtml = narrativeText
      ? '<div class="coach-card__quote">“' + _escapeHtml(narrativeText) + '”</div>' +
        '<div class="coach-card__divider"></div>'
      : '';
    return (
      '<div class="coach-card" data-perf-breakdown ' +
      'data-breakdown-context="' + _escapeHtml(JSON.stringify(context)) + '">' +
      '<div class="coach-card__header">COACH\'S NOTES</div>' +
      quoteHtml +
      '<div class="coach-card__lines">' +
      '<div class="coach-card__line" data-breakdown-role="fatigue">Fatigue: analyzing effort profile...</div>' +
      '<div class="coach-card__line" data-breakdown-role="pressure">Pressure: evaluating race context...</div>' +
      '<div class="coach-card__line" data-breakdown-role="execution">Execution: grading technical quality...</div>' +
      '</div>' +
      '</div>'
    );
  }

  var rivalryData = rep.rivalry || {};
  var levelUps   = rivalryData.level_ups   || [];
  var levelDowns = rivalryData.level_downs || [];

  function _npcInMrField(npcId, mrField) {
    if (!npcId) return false;
    var resolved = _resolveNpcName(npcId, State.world || {});
    return (mrField || []).some(function (e) { return e.is_rival && (e.npc_id === npcId || e.name === resolved); });
  }

  function _buildLevelUpHtml(list) {
    return (list || []).map(function (lu) {
      var npcId    = lu.npc_id || '';
      var newLevel = lu.new_level || 1;
      var rivalLabels = ((config || {}).rivalry_system || {}).rivalry_level_labels || {};
      var levelLabel  = rivalLabels[String(newLevel)] || ('Level ' + newLevel);
      var npcName     = _resolveNpcName(npcId, State.world || {});
      var templates   = ((State.world || {}).rivalry_levelup || {})[String(newLevel)] || [];
      var line = templates.length ? templates[Math.floor(Math.random() * templates.length)] : '';
      line = line.replace(/\{name\}/g, npcName);
      return (
        '<div class="rival-levelup-card">' +
        '<div class="rival-levelup-card__title">' + _escapeHtml(levelLabel) + ': ' + _escapeHtml(npcName) + '</div>' +
        (line ? '<div class="rival-levelup-card__text">' + _escapeHtml(line) + '</div>' : '') +
        '</div>'
      );
    }).join('');
  }

  function _buildLevelDownHtml(list) {
    return (list || []).map(function (ld) {
      var npcId    = ld.npc_id || '';
      var newLevel = ld.new_level || 0;
      var rivalLabels = ((config || {}).rivalry_system || {}).rivalry_level_labels || {};
      var levelLabel  = rivalLabels[String(newLevel)] || ('Level ' + newLevel);
      var npcName     = _resolveNpcName(npcId, State.world || {});
      var templates   = ((State.world || {}).rivalry_leveldown || {})[String(newLevel)] || [];
      var line = templates.length ? templates[Math.floor(Math.random() * templates.length)] : '';
      line = line.replace(/\{name\}/g, npcName);
      return (
        '<div class="rival-leveldown-card">' +
        '<div class="rival-leveldown-card__title">' + _escapeHtml(levelLabel) + ': ' + _escapeHtml(npcName) + '</div>' +
        (line ? '<div class="rival-leveldown-card__text">' + _escapeHtml(line) + '</div>' : '') +
        '</div>'
      );
    }).join('');
  }

  var unlockBannersHtml = (function () {
    var banners = [];
    (rep.milestones_completed || []).forEach(function (ms) {
      if (!ms) return;
      var name = ms.name || _humanizeId(ms.id || '', 'ms_');
      var desc = ms.description || '';
      banners.push(
        '<div class="unlock-banner">' +
        '<div class="unlock-banner__icon">&#11088;</div>' +
        '<div>' +
        '<div class="unlock-banner__label">Milestone Reached</div>' +
        '<div class="unlock-banner__name">' + _escapeHtml(name) + '</div>' +
        (desc ? '<div class="unlock-banner__desc">' + _escapeHtml(desc) + '</div>' : '') +
        '</div>' +
        '</div>'
      );
    });
    (rep.perks_unlocked || []).forEach(function (perkId) {
      if (!perkId) return;
      var def = _findPerkDef(perkId, config, State.world || {}) || {};
      var name = def.name || def.title || _humanizeId(perkId, 'perk_');
      var desc = def.description || '';
      banners.push(
        '<div class="unlock-banner">' +
        '<div class="unlock-banner__icon">&#9889;</div>' +
        '<div>' +
        '<div class="unlock-banner__label">Perk Unlocked</div>' +
        '<div class="unlock-banner__name">' + _escapeHtml(name) + '</div>' +
        (desc ? '<div class="unlock-banner__desc">' + _escapeHtml(desc) + '</div>' : '') +
        '</div>' +
        '</div>'
      );
    });
    return banners.join('');
  }());

  var resultBoardsHtml = meetResults.map(function (mr, _mrIdx) {
    var strategy = mr.strategy || rep.strategy || 'Compete to Win';
    var isLastBoard = (_mrIdx === meetResults.length - 1);
    // Backend field is ranked by finish place. For animation, assign visual
    // lanes independently so the race does not start in final order.
    var fieldRaw = (mr.field || []).slice();
    function laneHash(s) {
      var str = String(s || '');
      var h = 0;
      for (var i = 0; i < str.length; i += 1) {
        h = ((h * 31) + str.charCodeAt(i)) | 0;
      }
      return h;
    }
    var field = fieldRaw.slice().sort(function (a, b) {
      var ha = laneHash((a && a.name) || '') ^ laneHash((a && a.team) || '');
      var hb = laneHash((b && b.name) || '') ^ laneHash((b && b.team) || '');
      if (ha !== hb) return ha - hb;
      return String((a && a.name) || '').localeCompare(String((b && b.name) || ''));
    });
    // Safety guard: never allow exact finish-order visual start.
    var sameAsFinishOrder = field.length > 1 && field.every(function (entry, idx) {
      return entry === fieldRaw[idx];
    });
    if (sameAsFinishOrder) {
      field.push(field.shift());
    }
    var raceKind = (((field[0] || {}).result || {}).kind) || 'time';

    if (raceKind !== 'time') {
      var showFieldAnimation = !State.skipRaceAnimation;
      var fbAthletes = fieldRaw.slice().map(function (entry, fi) {
        return {
          id: fi + 1,
          name: entry.name || ('Athlete ' + (fi + 1)),
          team: entry.team || '',
          isPlayer: !!entry.is_player,
          distanceM: Number((entry.result || {}).value) || 0
        };
      });
      for (var fsi = fbAthletes.length - 1; fsi > 0; fsi--) {
        var fsj = Math.floor(Math.random() * (fsi + 1));
        var fst = fbAthletes[fsi]; fbAthletes[fsi] = fbAthletes[fsj]; fbAthletes[fsj] = fst;
      }
      for (var fli = 0; fli < fbAthletes.length; fli++) { fbAthletes[fli].id = fli + 1; }
      var fbMaxMark = 0;
      for (var fmi = 0; fmi < fbAthletes.length; fmi++) {
        if (fbAthletes[fmi].distanceM > fbMaxMark) { fbMaxMark = fbAthletes[fmi].distanceM; }
      }
      var fbRulerMax = Math.max(10, Math.ceil(fbMaxMark * 1.18 / 2) * 2);
      var fbCfgJson = JSON.stringify({
        eventName: mr.event || 'Field Event',
        rulerMaxM: fbRulerMax,
        athletes: fbAthletes
      }).replace(/'/g, '&#39;');
      var fbQueueRows = fbAthletes.map(function (a) {
        var pCls = a.isPlayer ? ' row-player' : '';
        var nCls = a.isPlayer ? ' field-name--player' : '';
        return (
          '<div class="field-athlete-row' + pCls + '" data-fb-id="' + a.id + '" data-fb-dist="0">' +
          '<span class="field-dot"></span>' +
          '<span class="field-name' + nCls + '">' + _escapeHtml(a.name) + (a.team ? '<span class="lane-school">\u00B7 ' + _escapeHtml(a.team) + '</span>' : '') + '</span>' +
          '<span class="field-distance text-tabular">\u2014</span>' +
          '<span class="field-rank"></span>' +
          '</div>'
        );
      }).join('');
      var _fbIsFirst   = (_mrIdx === 0);
      var _fbIsPbEvent = pbMeet && mr.event === pbMeet.event;
      var _fbRivalHtml = _buildLevelUpHtml(levelUps.filter(function (lu) { return _npcInMrField(lu.npc_id, mr.field); })) +
                         _buildLevelDownHtml(levelDowns.filter(function (ld) { return _npcInMrField(ld.npc_id, mr.field); }));
      var _fbTopBanners   = _buildRecordsHtmlForEvent(rep.records_broken, mr.event) + (_fbIsPbEvent ? pbHtml : '');
      var _fbRightContent = _fbIsFirst
        ? coachCardShell(mr, narrativeLine) + achievementUnlockHtml + unlockBannersHtml + _fbRivalHtml
        : _fbRivalHtml;
      var _fbBoardHtml = (
        '<div class="card field-board" data-race-board data-field-board="1" data-field-config=\'' + fbCfgJson + '\'>' +
        '<div class="heading-md">' + _escapeHtml(mr.event || 'Field Event') + ' Final Results</div>' +
        '<div class="label-sm" style="margin-bottom:10px">Strategy: ' + _escapeHtml(strategy) + '</div>' +
        (showFieldAnimation
          ? '<div class="field-svg-wrap" style="margin-bottom:10px">' +
            '<svg class="fb-svg" style="display:block;width:100%" height="218">' +
            '<g class="fb-ruler"></g>' +
            '<g class="fb-arcs"></g>' +
            '<g class="fb-markers"></g>' +
            '<g class="fb-dot"></g>' +
            '</svg>' +
            '</div>'
          : '') +
        '<div class="fb-queue-list" style="display:flex;flex-direction:column;gap:6px">' + fbQueueRows + '</div>' +
        '</div>'
      );
      return (
        (_fbTopBanners ? '<div class="results-top-banners">' + _fbTopBanners + '</div>' : '') +
        '<div class="results-split">' +
        '<div class="results-split__left">' + _fbBoardHtml + '</div>' +
        (_fbRightContent ? '<div class="results-right-col">' + _fbRightContent + '</div>' : '') +
        '</div>'
      );
    }

    var _animProfile = (function () {
      if (raceKind !== 'time') { return 'sprint'; }
      var _m = String(mr.event || '').match(/(\d+)\s*m/i);
      var _d = _m ? parseInt(_m[1], 10) : 0;
      return _d <= 400 ? 'sprint' : _d >= 800 ? 'distance' : 'middle';
    }());
    var _animAthletes = field.map(function (entry, idx) {
      return {
        id: idx + 1, lane: idx + 1,
        name: entry.is_player ? 'YOU' : (entry.name || ('Athlete ' + (idx + 1))),
        isPlayer: !!entry.is_player,
        finishPos: entry.place || (idx + 1),
        time: _formatResultValue((entry.result || {}).kind || 'time', (entry.result || {}).value || 0)
      };
    });
    var _animCfg = JSON.stringify({
      event: mr.event || 'Race',
      meetName: _meetNameStr,
      eventProfile: _animProfile,
      athletes: _animAthletes
    }).replace(/'/g, '&#39;');
    var lanes = field.map(function (entry, idx) {
      var place = entry.place || 0;
      var laneNo = idx + 1;
      var value = Number(((entry.result || {}).value) || 0);
      var rivalFlag = entry.is_rival ? '1' : '0';
      var rivalBadge = entry.is_rival ? '<span class="race-results-table__rival">RIVAL</span>' : '';
      var playerCls = entry.is_player ? ' race-lane--player' : '';
      var tag = entry.is_player ? '<span class="race-results-table__you">YOU</span>' : '';
      return (
        '<tr class="race-lane' + playerCls + '" data-race-lane data-race-rival="' + rivalFlag + '" data-race-lane-order="' + laneNo + '" data-race-final-place="' + place +
        '" data-race-athlete-name="' + _escapeHtml(entry.name || '') + '" data-race-value="' + value.toFixed(4) + '" data-race-time="' + _escapeHtml(_formatResultValue((entry.result || {}).kind || 'time', (entry.result || {}).value || 0)) + '">' +
        '<td class="race-results-table__place" data-race-lane-no>' + laneNo + '</td>' +
        '<td class="race-results-table__athlete">' + _escapeHtml(entry.name || '') + rivalBadge + tag + '</td>' +
        '<td class="race-results-table__school">' + _escapeHtml(entry.team || '') + '</td>' +
        '<td class="race-results-table__result text-tabular" data-race-time-text>--</td>' +
        '</tr>'
      );
    }).join('');
    var _isFirstBoard = (_mrIdx === 0);
    var _isPbEvent    = pbMeet && mr.event === pbMeet.event;
    var _rivalHtml    = _buildLevelUpHtml(levelUps.filter(function (lu) { return _npcInMrField(lu.npc_id, mr.field); })) +
                        _buildLevelDownHtml(levelDowns.filter(function (ld) { return _npcInMrField(ld.npc_id, mr.field); }));
    var _topBanners   = _buildRecordsHtmlForEvent(rep.records_broken, mr.event) + (_isPbEvent ? pbHtml : '');
    var _rightContent = _isFirstBoard
      ? coachCardShell(mr, narrativeLine) + achievementUnlockHtml + unlockBannersHtml + _rivalHtml
      : _rivalHtml;
    var _raceBoardHtml = (
      '<div class="race-board" data-race-board data-race-anim="1" data-race-anim-config=\'' + _animCfg + '\' data-race-event="' + _escapeHtml(mr.event || '') + '" data-race-kind="' + _escapeHtml(raceKind) + '">' +
      '<table class="race-results-table">' +
      '<caption>' +
      '<span class="race-results-table__title">' + _escapeHtml(mr.event || 'Event') + ' Final Results</span>' +
      '<span class="race-results-table__strategy">Strategy: ' + _escapeHtml(strategy) + '</span>' +
      '</caption>' +
      '<thead><tr>' +
      '<th class="race-results-table__place" data-race-place-header>Lane</th>' +
      '<th>Athlete</th><th>School</th>' +
      '<th class="race-results-table__result">Time</th>' +
      '</tr></thead>' +
      '<tbody data-race-lanes>' + lanes + '</tbody>' +
      '</table>' +
      '<div class="race-commentary" data-race-commentary></div>' +
      '</div>'
    );
    return (
      (_topBanners ? '<div class="results-top-banners">' + _topBanners + '</div>' : '') +
      '<div class="results-split">' +
      '<div class="results-split__left">' + _raceBoardHtml + '</div>' +
      (_rightContent ? '<div class="results-right-col">' + _rightContent + '</div>' : '') +
      '</div>'
    );
  }).join('');

  var dnqHtml = '';
  if (rep.bye_week && _RACE_PREVIEW_MEET_TYPES[rep.meet_type || '']) {
    var dnqMeetName = rep.meet_name || meetLabel(rep.meet_type || '');
    var dnqRequirements = {
      class_meet:    'finish top 3 at your league meet, or hit the qualifying standard',
      state_meet:    'finish top 3 at Class Meet, or hit the qualifying standard',
      regional_meet: 'finish top 2 at State Meet, or hit the qualifying standard',
      national_meet: 'finish top 1 at Regionals, or hit the qualifying standard',
    };
    var dnqReq = dnqRequirements[rep.meet_type] || 'qualify at the previous meet';
    var shadowHtml = '';
    var shadow = rep.shadow_meet;
    if (shadow && shadow.field && shadow.field.length) {
      var shadowPlaces = ['1st', '2nd', '3rd'];
      var shadowRows = shadow.field.slice(0, 3).map(function (entry, idx) {
        var res = entry.result || {};
        var mark = _formatResultValue(res.kind || 'time', res.value || 0);
        var rivalBadge = entry.is_rival ? '<span class="rival-badge">RIVAL</span>' : '';
        return (
          '<div class="dnq-shadow__row">' +
          '<span class="dnq-shadow__place">' + shadowPlaces[idx] + '</span>' +
          '<span class="dnq-shadow__name">' + _escapeHtml(entry.name || '') +
          (entry.team ? '<span class="dnq-shadow__team">\u00b7 ' + _escapeHtml(entry.team) + '</span>' : '') +
          rivalBadge + '</span>' +
          '<span class="dnq-shadow__mark text-tabular">' + _escapeHtml(mark) + '</span>' +
          '</div>'
        );
      }).join('');
      shadowHtml =
        '<div class="dnq-shadow">' +
        '<div class="dnq-shadow__title">What you missed \u2014 ' + _escapeHtml(shadow.event || '') + '</div>' +
        shadowRows +
        '</div>';
    }
    dnqHtml =
      '<div class="card dnq-card">' +
      '<div class="dnq-card__header">' +
      '<div class="dnq-card__meet">' + _escapeHtml(dnqMeetName) + '</div>' +
      '<div class="dnq-card__title">Did Not Qualify</div>' +
      '</div>' +
      '<div class="dnq-card__body">' +
      'To compete here, you needed to ' + _escapeHtml(dnqReq) + '. ' +
      'Keep grinding \u2014 qualify at the next level and earn your spot.' +
      '</div>' +
      shadowHtml +
      '<div class="dnq-card__footer">Your training this week still counts. Check your stat gains on the next screen.</div>' +
      '</div>';
  }

  return (
    '<div class="app app-results" id="results-app">' +
    renderSidebar(gs, config, rep.world_events || []) +
    '<main class="main-content">' +
    renderTopStatusBar(gs, config, { id: 'btn-next-week', text: 'Next Week \u2192', disabled: false }) +
    dnqHtml +
    resultBoardsHtml +
    '<div class="mt-auto results-controls">' +
    '<label class="results-skip-toggle">' +
    '<input type="checkbox" id="skip-race-animation-toggle"' + (State.skipRaceAnimation ? ' checked' : '') + '>' +
    '<span>Skip race animation</span>' +
    '</label>' +
    '</div>' +
    '</main>' +
    '</div>'
  );
}

function initResultsScreen(report) {
  var rep = report || {};
  (function initRaceBoardsAnimation() {
     = document.getElementById('results-app');
    var managements = document.querySelectorAll('.results-right-col, .results-top-banners');
    var controls = document.querySelector('.results-controls');
    var boards = document.querySelectorAll('[data-race-board]');

    if (app) app.classList.add('broadcast-mode');
    Array.prototype.forEach.call(managements, function (m) { m.classList.add('results-hidden'); });
    if (controls) controls.classList.add('results-hidden');

    function restoreManagementUi() {
      if (app) app.classList.remove('broadcast-mode');
      Array.prototype.forEach.call(managements, function (m) {
        m.classList.remove('results-hidden');
        m.classList.add('results-visible');
      });
      if (controls) {
        controls.classList.remove('results-hidden');
        controls.classList.add('results-visible');
      }
      if (boardsArray && boardsArray.length > 1 && boardsArray[0]) {
        var _firstSplit = boardsArray[0].closest('.results-split') || boardsArray[0];
        _firstSplit.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    function finalizeBoard(board, lanes, raceKind, lanesWrap, playerLaneCanonical, playerPlaceCanonical, marginSec) {
      board.classList.add('race-board--finished');

      var ranked = canonicalSort(lanes, raceKind);
      ranked.forEach(function (lane, idx) {
        if (!(parseInt(lane.getAttribute('data-race-final-place') || '0', 10) > 0)) {
          lane.setAttribute('data-race-final-place', String(idx + 1));
        }
      });

      ranked.forEach(function (lane) {
        var finalPlace = parseInt(lane.getAttribute('data-race-final-place') || '0', 10) || 0;
        var rankEl = lane.querySelector('[data-race-lane-no]');
        if (rankEl) rankEl.textContent = String(finalPlace || '-');
        if (finalPlace >= 1 && finalPlace <= 3) {
          lane.classList.add('race-lane--place-' + finalPlace);
        }
        var t = lane.querySelector('[data-race-time-text]');
        if (t) t.textContent = lane.getAttribute('data-race-time') || '--';
        lane.classList.add('race-lane--finished');
        var marker = lane.querySelector('[data-race-marker]');
        var progress = lane.querySelector('[data-race-progress]');
        if (marker) marker.style.transform = 'translate(100%, -50%)';
        if (progress) progress.style.width = '100%';
      });

      if (lanesWrap) {
        ranked.forEach(function (lane) {
          lanesWrap.appendChild(lane);
        });
      }
      var colHeader = board.querySelector('[data-race-place-header]');
      if (colHeader) colHeader.textContent = 'Place';
    }

    function hydratePerformanceBreakdowns() {
      var cards = document.querySelectorAll('[data-perf-breakdown]');
      if (!cards.length) return;
      cards.forEach(function (card) {
        var rawContext = card.getAttribute('data-breakdown-context') || '{}';
        var context = {};
        try {
          context = JSON.parse(rawContext);
        } catch (_) {
          context = {};
        }
        api('get_performance_breakdown', context).then(function (payload) {
          if (!payload || typeof payload !== 'object') return;
          ['fatigue', 'pressure', 'execution'].forEach(function (role) {
            var line = payload[role];
            var row = card.querySelector('[data-breakdown-role="' + role + '"]');
            if (row && line) row.textContent = String(line);
          });
        }).catch(function () {
          // Fail-safe: keep fallback placeholder copy on API/data failure.
        });
      });
    }

    hydratePerformanceBreakdowns();

    if (!boards.length) {
      restoreManagementUi();
      return;
    }

    function raceProfile(eventName, raceKind) {
      if (raceKind !== 'time') return 'generic';
      var m = String(eventName || '').match(/(\d+)\s*m/i);
      var dist = m ? parseInt(m[1], 10) : 0;
      if (dist > 0 && dist <= 400) return 'sprint';
      if (dist >= 800) return 'long';
      return 'middle';
    }

    function canonicalSort(lanes, raceKind) {
      return lanes.slice().sort(function (a, b) {
        var pa = parseInt(a.getAttribute('data-race-final-place') || '0', 10) || 0;
        var pb = parseInt(b.getAttribute('data-race-final-place') || '0', 10) || 0;
        if (pa > 0 && pb > 0 && pa !== pb) return pa - pb;
        if (raceKind === 'time') {
          var va = parseFloat(a.getAttribute('data-race-value') || '0') || 0;
          var vb = parseFloat(b.getAttribute('data-race-value') || '0') || 0;
          if (va > 0 && vb > 0 && va !== vb) return va - vb;
        }
        return 0;
      });
    }

    function finishMarginSeconds(ranked, raceKind) {
      if (raceKind !== 'time' || ranked.length < 2) return 0;
      var t1 = parseFloat(ranked[0].getAttribute('data-race-value') || '0') || 0;
      var t2 = parseFloat(ranked[1].getAttribute('data-race-value') || '0') || 0;
      if (t1 <= 0 || t2 <= 0) return 0;
      return Math.max(0, t2 - t1);
    }

    function finalCaptionText(playerLane, playerPlace, marginSec) {
      if (!playerLane) return marginSec >= 0.4 ? 'A decisive finish settles it.' : 'Official results confirmed.';
      if (playerPlace === 1) return marginSec >= 0.35 ? 'Player wins comfortably!' : 'Player takes the win!';
      if (playerPlace === 2 && marginSec <= 0.12) return 'Player just misses at the line.';
      if (playerPlace >= 3 && marginSec >= 0.35) return 'The winner pulls clear late.';
      return 'Official results are in.';
    }

    function progressCurve(profile, t) {
      var x = Math.max(0, Math.min(1, t));
      if (profile === 'sprint') {
        return 1 - Math.pow(1 - x, 2.2);
      }
      if (profile === 'long') {
        if (x < 0.22) return 0.30 * Math.pow(x / 0.22, 1.18);
        if (x < 0.82) return 0.30 + (0.46 * Math.pow((x - 0.22) / 0.60, 0.90));
        return 0.76 + (0.24 * Math.pow((x - 0.82) / 0.18, 0.72));
      }
      if (profile === 'middle') {
        if (x < 0.18) return 0.24 * Math.pow(x / 0.18, 1.10);
        if (x < 0.78) return 0.24 + (0.52 * ((x - 0.18) / 0.60));
        return 0.76 + (0.24 * Math.pow((x - 0.78) / 0.22, 0.80));
      }
      return x;
    }

    function baseTensionForProgress(raceProgress) {
      var p = Math.max(0, Math.min(1, raceProgress || 0));
      if (p < 0.20) return 20;
      if (p < 0.50) return 40;
      if (p < 0.75) return 60;
      if (p < 0.90) return 80;
      return 100;
    }

    function calculateRaceTension(raceProgress, leaderGapSec, positionChanges, rivalProximity) {
      var tension = baseTensionForProgress(raceProgress);
      if (typeof leaderGapSec === 'number' && isFinite(leaderGapSec)) {
        if (leaderGapSec < 0.3) tension += 15;
        if (leaderGapSec > 2.0) tension -= 15;
      }
      if (rivalProximity) tension += 20;
      if ((positionChanges || 0) > 0) tension += 10;
      tension = Math.max(0, Math.min(100, tension));
      return Math.round(tension);
    }

    function commentaryEventType(eventName, raceKind) {
      var ev = String(eventName || '').toLowerCase();
      if (/h/i.test(String(eventName || '')) && /m/i.test(String(eventName || ''))) return 'hurdles';
      if (ev.indexOf('jump') >= 0) return 'jumps';
      if (ev.indexOf('shot put') >= 0 || ev.indexOf('discus') >= 0 || ev.indexOf('javelin') >= 0) return 'throws';
      if (raceKind !== 'time') return null;
      var m = String(eventName || '').match(/(\d+)\s*m/i);
      var dist = m ? parseInt(m[1], 10) : 0;
      if (dist > 0 && dist <= 400) return 'sprint';
      if (dist >= 1600) return 'distance';
      if (dist >= 800) return 'middle_distance';
      return 'sprint';
    }

    function commentaryMilestones(eventType) {
      if (eventType === 'distance' || eventType === 'middle_distance') {
        return [
          { phase: 'start', at: 0.10 },
          { phase: 'mid', at: 0.40 },
          { phase: 'bell_lap', at: 0.75 },
          { phase: 'finish', at: 0.95 },
        ];
      }
      if (eventType === 'hurdles') {
        return [
          { phase: 'start', at: 0.10 },
          { phase: 'mid', at: 0.50 },
          { phase: 'finish', at: 0.95 },
        ];
      }
      if (eventType === 'sprint') {
        return [
          { phase: 'start', at: 0.10 },
          { phase: 'mid', at: 0.50 },
          { phase: 'finish', at: 0.95 },
        ];
      }
      if (eventType === 'jumps') {
        return [
          { phase: 'result', at: 0.95 },
        ];
      }
      if (eventType === 'throws') {
        return [
          { phase: 'result', at: 0.95 },
        ];
      }
      return [];
    }

    function commentaryMaxLines(eventType, eventName) {
      if (eventType === 'jumps' || eventType === 'throws') return 2;
      if (eventType === 'distance' || eventType === 'middle_distance') return 5;
      if (eventType === 'hurdles') return 3;
      if (eventType === 'sprint') {
        var m = String(eventName || '').match(/(\d+)\s*m/i);
        var dist = m ? parseInt(m[1], 10) : 0;
        if (dist > 0 && dist <= 100) return 3; // short races: 100m
        return 3;
      }
      return 3;
    }

    /* ── Field event arc animation ── */
    function runFieldBoard(board, onDone, skipAnim) {
      var FB_ARC_MS        = 700;
      var FB_POST_GAP_MS   = 900;
      var FB_REVEAL_MS     = 220;
      var FB_HEIGHT_BASE   = 90;
      var FB_HEIGHT_VAR    = 22;
      var FB_LPAD          = 62;
      var FB_RPAD          = 22;
      var FB_GROUND_Y      = 150;
      var FB_RULER_Y       = 167;
      var FB_LABEL_Y       = 188;
      var FB_TICK_H        = 6;
      var FB_RULER_STEP    = 2;
      var FB_ARC_W         = 2;
      var FB_PLAYER_ARC_W  = 2.5;
      var FB_DOT_R         = 5;
      var FB_MARKER_R      = 4;
      var FB_NPC_COLORS    = [
        '#c9944a', '#94a3b8', '#f97316', '#a78bfa', '#22c55e', '#14b8a6', '#f472b6'
      ];
      var FB_PLAYER_COLOR = 'var(--accent)';

      var cfg;
      try { cfg = JSON.parse(board.getAttribute('data-field-config') || '{}'); } catch (e) { cfg = {}; }
      var athletes  = cfg.athletes  || [];
      var rulerMaxM = cfg.rulerMaxM || 20;
      if (!athletes.length) { onDone(); return; }

      var colors = [];
      var npcIdx = 0;
      for (var ci = 0; ci < athletes.length; ci++) {
        if (athletes[ci].isPlayer) {
          colors.push(FB_PLAYER_COLOR);
        } else {
          colors.push(FB_NPC_COLORS[npcIdx % FB_NPC_COLORS.length]);
          npcIdx++;
        }
      }

      var NS = 'http://www.w3.org/2000/svg';
      function mkEl(tag) { return document.createElementNS(NS, tag); }
      function eio(t) { return t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t; }
      function jitter(i) { return Math.round(Math.sin(i * 1.4) * FB_HEIGHT_VAR); }
      function ordSfx(n) {
        var s = ['TH','ST','ND','RD'], v = n % 100;
        return n + (s[(v-20)%10] || s[v] || s[0]);
      }
      function rankBadge(rank) {
        var lbl = ordSfx(rank);
        if (rank === 1) return '<span class="place-badge place-badge--1">' + lbl + '</span>';
        if (rank === 2) return '<span class="place-badge place-badge--2">' + lbl + '</span>';
        if (rank === 3) return '<span class="place-badge place-badge--3">' + lbl + '</span>';
        return '<span class="field-rank-num">' + lbl + '</span>';
      }
      function rankFill(r) {
        if (r === 1) return 'var(--gold)';
        if (r === 2) return 'var(--silver)';
        if (r === 3) return 'var(--bronze)';
        return 'var(--text-muted)';
      }

      /* skip mode: show all results instantly */
      if (skipAnim) {
        for (var si = 0; si < athletes.length; si++) {
          var sa   = athletes[si];
          var sRow = board.querySelector('[data-fb-id="' + sa.id + '"]');
          if (!sRow) continue;
          var sDot = sRow.querySelector('.field-dot');
          if (sDot) sDot.style.background = colors[si];
          var sDist = sRow.querySelector('.field-distance');
          if (sDist) { sDist.textContent = sa.distanceM.toFixed(2) + 'm'; sDist.classList.add('revealed'); }
        }
        var skSorted = athletes.slice().sort(function (a, b) { return b.distanceM - a.distanceM; });
        for (var ski = 0; ski < skSorted.length; ski++) {
          var skRow = board.querySelector('[data-fb-id="' + skSorted[ski].id + '"]');
          var skRank = skRow && skRow.querySelector('.field-rank');
          if (skRank) skRank.innerHTML = rankBadge(ski + 1);
        }
        /* reorder rows by final distance (best first) */
        var skContainer = board.querySelector('.fb-queue-list');
        if (skContainer) {
          for (var skri = 0; skri < skSorted.length; skri++) {
            var skReorderRow = board.querySelector('[data-fb-id="' + skSorted[skri].id + '"]');
            if (skReorderRow) { skContainer.appendChild(skReorderRow); }
          }
        }
        onDone();
        return;
      }

      var svg  = board.querySelector('.fb-svg');
      if (!svg) { onDone(); return; }
      var svgW = svg.getBoundingClientRect().width || 600;

      function xFor(m) {
        var usable = svgW - FB_LPAD - FB_RPAD;
        var raw = FB_LPAD + (m / rulerMaxM) * usable;
        return Math.max(FB_LPAD, Math.min(svgW - FB_RPAD, raw));
      }

      /* draw ruler */
      var rulerGrp = svg.querySelector('.fb-ruler');
      var usable   = svgW - FB_LPAD - FB_RPAD;
      var gl = mkEl('line');
      gl.setAttribute('x1', FB_LPAD); gl.setAttribute('y1', FB_GROUND_Y);
      gl.setAttribute('x2', FB_LPAD + usable); gl.setAttribute('y2', FB_GROUND_Y);
      gl.style.stroke = 'var(--border-medium)'; gl.style.strokeWidth = '1';
      rulerGrp.appendChild(gl);
      var fl = mkEl('line');
      fl.setAttribute('x1', FB_LPAD); fl.setAttribute('y1', FB_GROUND_Y - 24);
      fl.setAttribute('x2', FB_LPAD); fl.setAttribute('y2', FB_GROUND_Y + 4);
      fl.style.stroke = 'var(--border-accent)'; fl.style.strokeWidth = '1.5';
      fl.style.strokeDasharray = '3 3';
      rulerGrp.appendChild(fl);
      var rl = mkEl('line');
      rl.setAttribute('x1', FB_LPAD); rl.setAttribute('y1', FB_RULER_Y);
      rl.setAttribute('x2', FB_LPAD + usable); rl.setAttribute('y2', FB_RULER_Y);
      rl.style.stroke = 'var(--border-medium)'; rl.style.strokeWidth = '1';
      rulerGrp.appendChild(rl);
      var rd = 0;
      while (rd <= rulerMaxM) {
        var rx = FB_LPAD + (rd / rulerMaxM) * usable;
        var tk = mkEl('line');
        tk.setAttribute('x1', rx); tk.setAttribute('y1', FB_RULER_Y);
        tk.setAttribute('x2', rx); tk.setAttribute('y2', FB_RULER_Y + FB_TICK_H);
        tk.style.stroke = 'var(--border-medium)'; tk.style.strokeWidth = '1';
        rulerGrp.appendChild(tk);
        var lb = mkEl('text');
        lb.setAttribute('x', rx); lb.setAttribute('y', FB_LABEL_Y);
        lb.setAttribute('text-anchor', 'middle');
        lb.style.fill = 'var(--text-dim)'; lb.style.fontSize = '9px';
        lb.style.fontFamily = 'var(--font-mono)';
        lb.textContent = rd + 'm';
        rulerGrp.appendChild(lb);
        rd += FB_RULER_STEP;
      }

      /* colour dots */
      for (var di = 0; di < athletes.length; di++) {
        var dRow = board.querySelector('[data-fb-id="' + athletes[di].id + '"]');
        var dEl  = dRow && dRow.querySelector('.field-dot');
        if (dEl) dEl.style.background = colors[di];
      }

      /* rank state */
      var thrown    = [];
      var mRankEls  = {};
      function updateRanks() {
        var sorted = thrown.slice().sort(function (a, b) { return b.distanceM - a.distanceM; });
        for (var ri = 0; ri < sorted.length; ri++) {
          var rA    = sorted[ri];
          var rank  = ri + 1;
          var rRow  = board.querySelector('[data-fb-id="' + rA.id + '"]');
          var rEl   = rRow && rRow.querySelector('.field-rank');
          if (rEl)  rEl.innerHTML = rankBadge(rank);
          var mEl   = mRankEls[rA.id];
          if (mEl)  { mEl.textContent = rank; mEl.style.fill = rankFill(rank); }
        }
      }
      function resortQueue() {
        var container = board.querySelector('.fb-queue-list');
        if (!container) return;
        var rows = Array.prototype.slice.call(container.querySelectorAll('[data-fb-id]'));
        rows.sort(function (a, b) {
          var da = parseFloat(a.getAttribute('data-fb-dist') || '0');
          var db = parseFloat(b.getAttribute('data-fb-dist') || '0');
          if (da === 0 && db === 0) return 0;
          if (da === 0) return 1;
          if (db === 0) return -1;
          return db - da;
        });
        for (var rqi = 0; rqi < rows.length; rqi++) { container.appendChild(rows[rqi]); }
      }

      /* arc animation loop */
      function animArc(pathEl, dotEl, totalLen, cb) {
        var start = null;
        function step(ts) {
          if (!start) { start = ts; }
          var raw  = Math.min((ts - start) / FB_ARC_MS, 1);
          var prog = eio(raw);
          pathEl.style.strokeDashoffset = totalLen * (1 - prog);
          var pt = pathEl.getPointAtLength(totalLen * prog);
          dotEl.setAttribute('cx', pt.x);
          dotEl.setAttribute('cy', pt.y);
          dotEl.style.opacity = '1';
          if (raw < 1) {
            requestAnimationFrame(step);
          } else {
            var fp = pathEl.getPointAtLength(totalLen);
            dotEl.setAttribute('cx', fp.x);
            dotEl.setAttribute('cy', fp.y);
            cb();
          }
        }
        requestAnimationFrame(step);
      }

      var fbTimers = [];
      function fbSt(fn, ms) { var id = setTimeout(fn, ms); fbTimers.push(id); return id; }

      function throwOne(idx) {
        if (idx >= athletes.length) { onDone(); return; }
        var a      = athletes[idx];
        var color  = colors[idx];
        var arcH   = FB_HEIGHT_BASE + jitter(idx);
        var landX  = xFor(a.distanceM);
        var ctrlX  = (FB_LPAD + landX) / 2;
        var ctrlY  = FB_GROUND_Y - arcH;
        var pd     = 'M ' + FB_LPAD + ',' + FB_GROUND_Y +
                     ' Q ' + ctrlX + ',' + ctrlY +
                     ' '   + landX + ',' + FB_GROUND_Y;
        var rowEl  = board.querySelector('[data-fb-id="' + a.id + '"]');
        var distEl = rowEl && rowEl.querySelector('.field-distance');
        if (rowEl) rowEl.classList.add('row-active');

        var arcsGrp    = svg.querySelector('.fb-arcs');
        var markersGrp = svg.querySelector('.fb-markers');
        var dotGrp     = svg.querySelector('.fb-dot');

        var path = mkEl('path');
        path.setAttribute('d', pd);
        path.setAttribute('fill', 'none');
        path.style.stroke      = color;
        path.style.strokeWidth = a.isPlayer ? FB_PLAYER_ARC_W : FB_ARC_W;
        path.style.opacity     = a.isPlayer ? '1' : '0.72';
        arcsGrp.appendChild(path);
        var tLen = path.getTotalLength();
        path.style.strokeDasharray  = tLen;
        path.style.strokeDashoffset = tLen;

        var dotSvg = mkEl('circle');
        dotSvg.setAttribute('r', FB_DOT_R);
        dotSvg.style.fill    = color;
        dotSvg.style.opacity = '0';
        dotGrp.appendChild(dotSvg);

        animArc(path, dotSvg, tLen, function () {
          dotSvg.style.opacity = '0';

          var mc = mkEl('circle');
          mc.setAttribute('cx', landX); mc.setAttribute('cy', FB_GROUND_Y);
          mc.setAttribute('r', FB_MARKER_R);
          mc.style.fill    = color;
          mc.style.opacity = a.isPlayer ? '1' : '0.82';
          markersGrp.appendChild(mc);

          var mt = mkEl('line');
          mt.setAttribute('x1', landX); mt.setAttribute('y1', FB_GROUND_Y);
          mt.setAttribute('x2', landX); mt.setAttribute('y2', FB_GROUND_Y + 10);
          mt.style.stroke = color; mt.style.strokeWidth = '1.5'; mt.style.opacity = '0.6';
          markersGrp.appendChild(mt);

          var mkRank = mkEl('text');
          mkRank.setAttribute('x', landX); mkRank.setAttribute('y', FB_GROUND_Y - 8);
          mkRank.setAttribute('text-anchor', 'middle');
          mkRank.style.fontSize = '9px'; mkRank.style.fontFamily = 'var(--font-mono)';
          mkRank.style.fontWeight = '700'; mkRank.style.fill = 'var(--text-dim)';
          mkRank.textContent = '\u2013';
          markersGrp.appendChild(mkRank);
          mRankEls[a.id] = mkRank;

          thrown.push(a);
          updateRanks();

          fbSt(function () {
            if (rowEl) rowEl.classList.remove('row-active');
            if (distEl) { distEl.textContent = a.distanceM.toFixed(2) + 'm'; distEl.classList.add('revealed'); }
            if (rowEl) { rowEl.setAttribute('data-fb-dist', String(a.distanceM)); }
            resortQueue();
          }, FB_REVEAL_MS);

          fbSt(function () { throwOne(idx + 1); }, FB_POST_GAP_MS);
        });
      }

      throwOne(0);
    }

    /* ── Track event iframe animation ── */
    function runRaceAnimBoard(board, onDone, skipAnim) {
      var lanes = Array.prototype.slice.call(board.querySelectorAll('[data-race-lane]'));
      var lanesWrap = board.querySelector('[data-race-lanes]');
      var raceKind = board.getAttribute('data-race-kind') || 'time';
      var ranked   = canonicalSort(lanes, raceKind);
      var margin   = finishMarginSeconds(ranked, raceKind);
      var playerLane  = ranked.filter(function (l) { return l.classList.contains('race-lane--player'); })[0] || null;
      var playerPlace = playerLane ? (parseInt(playerLane.getAttribute('data-race-final-place') || '0', 10) || (ranked.indexOf(playerLane) + 1)) : 0;

      if (skipAnim) {
        finalizeBoard(board, lanes, raceKind, lanesWrap, playerLane, playerPlace, margin);
        onDone();
        return;
      }

      var cfg;
      try { cfg = JSON.parse(board.getAttribute('data-race-anim-config') || '{}'); } catch (e) { cfg = {}; }

      if (lanesWrap) { lanesWrap.style.display = 'none'; }

      window._pendingRaceConfig = cfg;
      window._onRaceAnimComplete = function () {
        window._onRaceAnimComplete = null;
        window._pendingRaceConfig = null;
        var ifrm = board.querySelector('.race-anim-iframe');
        if (ifrm) { ifrm.parentNode.removeChild(ifrm); }
        if (lanesWrap) { lanesWrap.style.display = ''; }
        finalizeBoard(board, lanes, raceKind, lanesWrap, playerLane, playerPlace, margin);
        onDone();
      };

      var iframe = document.createElement('iframe');
      iframe.className = 'race-anim-iframe';
      iframe.src = 'race_animation.html';
      iframe.setAttribute('style', 'width:100%;height:560px;border:none;display:block;');
      var table = board.querySelector('.race-results-table');
      if (table) {
        board.insertBefore(iframe, table.nextSibling);
      } else {
        board.appendChild(iframe);
      }
    }

    var boardsArray = Array.prototype.slice.call(boards);
    function runBoard(idx) {
      if (idx >= boardsArray.length) {
        restoreManagementUi();
        return;
      }
      var board = boardsArray[idx];
      function onDone() { runBoard(idx + 1); }
      if (board.getAttribute('data-field-board') === '1') {
        board.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        runFieldBoard(board, onDone, State.skipRaceAnimation);
        return;
      }
      if (board.getAttribute('data-race-anim') === '1') {
        board.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        window._pendingRaceIsLast = (idx === boardsArray.length - 1);
        runRaceAnimBoard(board, onDone, State.skipRaceAnimation);
        return;
      }
      board.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      var commentaryEl = board.querySelector('[data-race-commentary]');
      var lanesWrap = board.querySelector('.race-lanes');
      function showRaceCommentary(line) {
        if (!commentaryEl || !line) return;
        var div = document.createElement('div');
        div.className = 'race-commentary-line';
        div.textContent = String(line);
        commentaryEl.appendChild(div);
        commentaryEl.scrollTop = commentaryEl.scrollHeight;
      }
      var lanes = Array.prototype.slice.call(board.querySelectorAll('[data-race-lane]'));
      if (!lanes.length) {
        onDone();
        return;
      }
      var raceKind = board.getAttribute('data-race-kind') || 'time';
      var rankedCanonical = canonicalSort(lanes, raceKind);
      var marginSec = finishMarginSeconds(rankedCanonical, raceKind);
      var playerLaneCanonical = rankedCanonical.find(function (l) { return l.classList.contains('race-lane--player'); }) || null;
      var playerPlaceCanonical = playerLaneCanonical ? (
        parseInt(playerLaneCanonical.getAttribute('data-race-final-place') || '0', 10) || (rankedCanonical.indexOf(playerLaneCanonical) + 1)
      ) : 0;

      if (State.skipRaceAnimation) {
        finalizeBoard(board, lanes, raceKind, lanesWrap, playerLaneCanonical, playerPlaceCanonical, marginSec);
        onDone();
        return;
      }

      lanes.forEach(function (lane) {
        var t = lane.querySelector('[data-race-time-text]');
        if (t) t.textContent = '--';
      });

      setTimeout(function () {
        if (commentaryEl) {
          commentaryEl.innerHTML = '';
        }
        var profile = raceProfile(board.getAttribute('data-race-event') || '', raceKind);
        var cEventName = board.getAttribute('data-race-event') || '';
        var cEventType = commentaryEventType(cEventName, raceKind);
        var cMilestones = commentaryMilestones(cEventType);
        var cFired = {};
        var cQueue = [];
        var cLastMs = -999999;
        var cCooldownMs = 2000;
        var cMaxLines = commentaryMaxLines(cEventType, cEventName);
        var cShown = 0;
        var cEnabled = true;
        var cStartPhase = cEventType === 'jumps'
          ? 'approach'
          : (cEventType === 'throws' ? 'windup' : null);
        function canQueueMore() {
          return (cShown + cQueue.length) < cMaxLines;
        }
        function disableCommentary() {
          cEnabled = false;
          cQueue = [];
        }
        function requestCommentary(evtType, phase, vars) {
          if (!cEnabled || !evtType) return;
          api('get_commentary', evtType, phase, vars).then(function (line) {
            if (!cEnabled) return;
            if (line && cShown < cMaxLines) {
              showRaceCommentary(line);
              cShown += 1;
            }
          }).catch(function () {
            // Fail-safe: commentary is optional; disable it if backend/data fails.
            disableCommentary();
          });
        }
        var states = [];
        var maxDuration = 0;
        var baseDurationMs = 8000;
        var spreadDurationMs = 2200;
        // Live-variance envelope prevents visual lock to final finish order.
        // Runners still start together and end in canonical order, but can trade
        // momentum during the race so the field stretches more naturally.
        var liveVarianceMax = 0.085;
        var previousLiveOrder = lanes.slice();
        var laneValues = lanes.map(function (lane) {
          return parseFloat(lane.getAttribute('data-race-value') || '0') || 0;
        }).filter(function (v) { return v > 0; });
        var fastest = laneValues.length ? Math.min.apply(null, laneValues) : 0;
        var slowest = laneValues.length ? Math.max.apply(null, laneValues) : fastest;
        var spread = Math.max(0, slowest - fastest);

        lanes.forEach(function (lane) {
          var raw = parseFloat(lane.getAttribute('data-race-value') || '0') || 0;
          var marker = lane.querySelector('[data-race-marker]');
          var progress = lane.querySelector('[data-race-progress]');
          var track = lane.querySelector('.lane-track');
          if (!marker || !progress || !track) return;

          var durationMs = baseDurationMs;
          if (raceKind === 'time' && raw > 0 && fastest > 0) {
            var normalized = spread > 0
              ? Math.max(0, Math.min(1, (raw - fastest) / spread))
              : 0;
            var compressed = Math.pow(normalized, 0.55);
            durationMs = baseDurationMs + (compressed * spreadDurationMs);
          } else {
            var place = parseInt(lane.getAttribute('data-race-final-place') || '0', 10) || 1;
            var laneSpread = Math.max(1, lanes.length - 1);
            var placeNorm = Math.max(0, Math.min(1, (Math.max(0, place - 1) / laneSpread)));
            var placeCompressed = Math.pow(placeNorm, 0.55);
            durationMs = baseDurationMs + (placeCompressed * spreadDurationMs);
          }
          var travel = Math.max(0, track.clientWidth - marker.offsetWidth);
          states.push({
            lane: lane,
            marker: marker,
            progress: progress,
            travel: travel,
            durationMs: durationMs,
            progress01: 0,
            prevProgress01: 0,
            pacePhase: (Math.random() * Math.PI * 2),
            paceSwing: (Math.random() * 2 - 1) * liveVarianceMax,
          });
          var fullMs = durationMs;
          if (fullMs > maxDuration) maxDuration = fullMs;

          marker.style.transform = 'translate(0px, -50%)';
          progress.style.width = '0%';
        });

        var t0 = (window.performance && window.performance.now) ? window.performance.now() : Date.now();

        // Field events get a pre-animation call so commentary frames the attempt.
        if (cEnabled && cStartPhase && cEventType && cShown < cMaxLines) {
          var preLeader = rankedCanonical.length ? rankedCanonical[0] : null;
          var preWinner = rankedCanonical.length ? rankedCanonical[0] : null;
          var preRival = lanes.find(function (lane) {
            return (lane.getAttribute('data-race-rival') || '') === '1';
          }) || null;
          var prePlayer = lanes.find(function (lane) {
            return lane.classList.contains('race-lane--player');
          }) || null;
          var preVars = {
            player_name: (prePlayer && prePlayer.getAttribute('data-race-athlete-name')) || '',
            rival_name: (preRival && preRival.getAttribute('data-race-athlete-name')) || '',
            leader_name: (preLeader && preLeader.getAttribute('data-race-athlete-name')) || '',
            winner_name: (preWinner && preWinner.getAttribute('data-race-athlete-name')) || '',
          };
          requestCommentary(cEventType, cStartPhase, preVars);
          cFired[cStartPhase] = true;
          cLastMs = 0;
        }

        (function tick(now) {
          var ts = now || ((window.performance && window.performance.now) ? window.performance.now() : Date.now());
          var elapsed = ts - t0;
          // Single shared tNorm: all runners finish simultaneously at maxDuration.
          var tNorm = maxDuration <= 0 ? 1 : Math.max(0, Math.min(1, elapsed / maxDuration));
          var allDone = tNorm >= 1;

          states.forEach(function (s) {
            // Remap tNorm per runner so faster runners lead throughout the race
            // while all reach the finish (p=1) at the same moment (tNorm=1).
            // effectiveTNorm = 1 - (1 - tNorm)^(maxDuration / durationMs)
            // Exponent > 1 for faster runners => they are consistently ahead.
            var exponent = (s.durationMs > 0 && maxDuration > 0) ? (maxDuration / s.durationMs) : 1;
            var rem = Math.max(0, 1 - tNorm);
            var effectiveTNorm = tNorm >= 1 ? 1 : (1 - Math.pow(rem, exponent));
            var baseP = progressCurve(profile, effectiveTNorm);
            // Offset is zero at start/end; mid-race it can be +/- to create
            // temporary surges without changing final outcome.
            var envelope = Math.sin(Math.PI * tNorm);
            var wave = Math.sin((2 * Math.PI * tNorm) + s.pacePhase);
            var offset = s.paceSwing * envelope * wave;
            var p = baseP + offset;
            if (p < s.prevProgress01) p = s.prevProgress01;
            if (p > 1) p = 1;
            if (p < 0) p = 0;
            s.prevProgress01 = p;
            s.progress01 = p;
            s.progress.style.width = (p * 100).toFixed(2) + '%';
            s.marker.style.transform = 'translate(' + (p * s.travel).toFixed(2) + 'px, -50%)';
          });

          var liveOrder = states.slice().sort(function (a, b) {
            if (b.progress01 !== a.progress01) return b.progress01 - a.progress01;
            return a.durationMs - b.durationMs;
          }).map(function (s) { return s.lane; });

          var prevPos = new Map();
          previousLiveOrder.forEach(function (lane, idx) { prevPos.set(lane, idx); });
          var positionChanges = 0;
          liveOrder.forEach(function (lane, idx) {
            if (prevPos.get(lane) !== idx) positionChanges += 1;
          });
          previousLiveOrder = liveOrder;

          var leaderGapSec = null;
          if (raceKind === 'time' && liveOrder.length >= 2) {
            var leadVal = parseFloat(liveOrder[0].getAttribute('data-race-value') || '0') || 0;
            var secondVal = parseFloat(liveOrder[1].getAttribute('data-race-value') || '0') || 0;
            if (leadVal > 0 && secondVal > 0) {
              leaderGapSec = Math.max(0, secondVal - leadVal);
            }
          }

          var playerPos = -1;
          var rivalPositions = [];
          var rivalLanes = [];
          liveOrder.forEach(function (lane, idx) {
            if (lane.classList.contains('race-lane--player')) playerPos = idx;
            if ((lane.getAttribute('data-race-rival') || '') === '1') {
              rivalPositions.push(idx);
              rivalLanes.push({ lane: lane, pos: idx });
            }
          });
          var rivalProximity = false;
          if (playerPos >= 0 && rivalPositions.length) {
            rivalProximity = rivalPositions.some(function (pos) {
              return Math.abs(pos - playerPos) <= 1;
            });
          }

          var raceProgress = maxDuration <= 0 ? 1 : Math.max(0, Math.min(1, elapsed / maxDuration));
          var tension = calculateRaceTension(raceProgress, leaderGapSec, positionChanges, rivalProximity);
          board.setAttribute('data-race-tension', String(tension));
          board._raceTension = tension;
          board.dispatchEvent(new CustomEvent('trackstar:race-tension', {
            detail: {
              tension: tension,
              race_progress: raceProgress,
              leader_gap: leaderGapSec,
              position_changes: positionChanges,
              rival_proximity: rivalProximity,
            },
          }));

          cMilestones.forEach(function (m) {
            if (!cFired[m.phase] && raceProgress >= m.at && canQueueMore()) {
              cQueue.push(m.phase);
              cFired[m.phase] = true;
            }
          });

          if (cEnabled && cQueue.length && cShown < cMaxLines && (elapsed - cLastMs) >= cCooldownMs) {
            var phase = cQueue.shift();
            cLastMs = elapsed;
            if (cEventType) {
              var leaderLane = liveOrder.length ? liveOrder[0] : null;
              var winnerLane = rankedCanonical.length ? rankedCanonical[0] : null;
              var playerLane = liveOrder.find(function (lane) {
                return lane.classList.contains('race-lane--player');
              }) || null;
              var rivalLane = null;
              var rivalWithinTwo = false;
              if (playerPos >= 0 && rivalLanes.length) {
                rivalLanes.sort(function (a, b) {
                  return Math.abs(a.pos - playerPos) - Math.abs(b.pos - playerPos);
                });
                rivalLane = rivalLanes[0].lane;
                rivalWithinTwo = Math.abs(rivalLanes[0].pos - playerPos) <= 2;
              }
              var vars = {
                player_name: (playerLane && playerLane.getAttribute('data-race-athlete-name')) || '',
                rival_name: (rivalLane && rivalLane.getAttribute('data-race-athlete-name')) || '',
                leader_name: (leaderLane && leaderLane.getAttribute('data-race-athlete-name')) || '',
                winner_name: (winnerLane && winnerLane.getAttribute('data-race-athlete-name')) || '',
              };
              var rivalryOverride = !!(rivalWithinTwo && vars.player_name && vars.rival_name && Math.random() < 0.30);
              var commentaryEventType = rivalryOverride ? 'rivalry' : cEventType;
              var commentaryPhase = rivalryOverride ? 'duel' : phase;
              requestCommentary(commentaryEventType, commentaryPhase, vars);
            }
          }

          if (!allDone) {
            requestAnimationFrame(tick);
          }
        })();

        setTimeout(function () {
          finalizeBoard(board, lanes, raceKind, lanesWrap, playerLaneCanonical, playerPlaceCanonical, marginSec);
          onDone();
        }, Math.round(maxDuration) + 1000);
      }, 800);
    }
    runBoard(0);
  })();

  var skipToggle = document.getElementById('skip-race-animation-toggle');
  if (skipToggle) {
    skipToggle.checked = !!State.skipRaceAnimation;
    skipToggle.addEventListener('change', function () {
      _saveSkipRaceAnimation(!!skipToggle.checked);
    });
  }

  var btn = document.getElementById('btn-next-week');
  if (!btn) return;
  btn.addEventListener('click', async function () {
    var gs = State.gameState;
    var config = State.config;
    var athlete = (gs && gs.athlete) || {};
    var week = athlete.week || 1;
    var wps = (config && config.season && config.season.weeks_per_season) || 12;
    // On étend la limite à 12 saisons
    var totalSeasons = (config && config.season && config.season.seasons_total) || 12;

    btn.disabled = true;
    btn.classList.remove('btn--primary');
    btn.classList.add('btn--disabled');

    if (week > wps) {
      if ((athlete.year || 1) >= totalSeasons) {
        try {
          var result = await api('finalize_career');
          State.gameState = result.game_state;
          if (result.recruiting_beat) {
            State.pendingRecruitingBeat = null;
            Router.go('recruiting_interstitial', { beat: result.recruiting_beat });
            return;
          }
          State.hof = result.hof || { entries: [] };
          Router.go('endgame', { endgame: result.endgame, hof: State.hof });
        } catch (e) {
          btn.disabled = false;
          showError('Error finalizing career: ' + e);
        }
      } else {
        try {
          var summary = await api('get_season_summary');
          State.gameState = summary.game_state;
          Router.go('season_summary', { goals: summary.goals_evaluated });
        } catch (e) {
          btn.disabled = false;
          showError('Error loading season summary: ' + e);
        }
      }
      return;
    }

    var breakingEvents = _breakingEventsFromReport(rep);
    var recruitingBeat = State.pendingRecruitingBeat;
    if (recruitingBeat) {
      State.pendingRecruitingBeat = null;
      if (breakingEvents.length) {
        State.pendingBreakingQueue = breakingEvents.slice();
        State.pendingScreen = { id: 'week_summary', data: { report: rep } };
        Router.go('recruiting_interstitial', { beat: recruitingBeat });
        return;
      }
      State.pendingScreen = { id: 'week_summary', data: { report: rep } };
      Router.go('recruiting_interstitial', { beat: recruitingBeat });
      return;
    }

    if (breakingEvents.length) {
      State.pendingBreakingQueue = breakingEvents.slice();
      State.pendingScreen = { id: 'week_summary', data: { report: rep } };
      Router.go('breaking_news', { event: State.pendingBreakingQueue[0], index: 0, total: State.pendingBreakingQueue.length });
      return;
    }

    Router.go('week_summary', { report: rep });
  });
}

function renderWeekSummaryScreen(report, gameState, config) {
  var rep = report || {};
  var gs = gameState || {};
  var worldEvents = rep.world_events || [];
  var trainingChanges = rep.training_changes || [];
  var sessions = State.weeklyPool || [];
  var statOrder = ['Speed', 'Agility', 'Strength', 'Stamina', 'Toughness', 'Mentality', 'Technique', 'Recovery'];
  var athlete = gs.athlete || {};
  var buildName = athlete.build || '';

  var weeklyDelta = {};
  Object.keys(rep.stat_gains || {}).forEach(function (k) {
    if (typeof rep.stat_gains[k] === 'number') weeklyDelta[k] = rep.stat_gains[k];
  });
  if (!Object.keys(weeklyDelta).length) {
    trainingChanges.forEach(function (tc) {
      Object.keys(tc || {}).forEach(function (k) {
        if (k === 'session' || k === 'injured') return;
        if (typeof tc[k] !== 'number') return;
        weeklyDelta[k] = (weeklyDelta[k] || 0) + tc[k];
      });
    });
  }
  (rep.race_changes || []).forEach(function (rc) {
    Object.keys(rc || {}).forEach(function (k) {
      if (k === 'strategy' || k === 'injured') return;
      if (typeof rc[k] !== 'number') return;
      weeklyDelta[k] = (weeklyDelta[k] || 0) + rc[k];
    });
  });
  var changedStats = statOrder.filter(function (k) { return (weeklyDelta[k] || 0) !== 0; });
  var injuredSessions = trainingChanges.filter(function (tc) { return tc.injured; });
  var currentEnergy = (athlete.energy || 0);
  var energyCfg = (config.energy_system || {});
  var veryLowThreshold = energyCfg.very_low_energy_threshold || 20;
  var lowThreshold = energyCfg.low_energy_threshold || 35;
  var injuryEnergyNote = currentEnergy <= veryLowThreshold
    ? ' (very low energy \u2014 2.5\u00D7 risk)'
    : currentEnergy <= lowThreshold
      ? ' (low energy \u2014 1.5\u00D7 risk)'
      : '';
  var injuryLinesHtml = injuredSessions.map(function (tc) {
    return '<div class="training-injury-line">' +
      '\u26A0 Injury: <span class="training-injury-line__session">' + _escapeHtml(tc.session) + '</span>' +
      ' \u2014 week\u2019s training gains lost, \u221215 energy' + _escapeHtml(injuryEnergyNote) +
      '</div>';
  }).join('');
  var trainingResultsHtml = (changedStats.length
    ? '<div class="training-results-compact">' + changedStats.map(function (k) {
        var delta = weeklyDelta[k] || 0;
        return '<span class="training-result-chip"><span class="training-result-chip__stat">' + _escapeHtml(k) +
          '</span> ' + (delta >= 0 ? '+' : '') + delta + '</span>';
      }).join('<span class="training-results-sep">&bull;</span>') + '</div>'
    : '<div class="label-sm">No measurable stat gains this week.</div>') +
    injuryLinesHtml;

  return (
    '<div class="app app-week-summary">' +
    renderSidebar(gs, config, []) +
    '<main class="main-content">' +
    renderTopStatusBar(gs, config, { id: 'btn-training-proceed', text: 'Select a session', disabled: true }) +
    '<div class="heading-lg">Training</div>' +
    '<div class="label-sm">' + _escapeHtml(buildName) + '</div>' +
    '<div class="divider-accent"></div>' +
    _renderTrainingColumns(gs, config, sessions, { worldEvents: worldEvents, resultsHtml: trainingResultsHtml }) +
    '</main>' +
    '</div>'
  );
}

function initWeekSummaryScreen(report) {
  initTrainingScreen(State.gameState, State.config, State.weeklyPool || []);
}

var WeekScreen = {
  render: function (data) {
    var d = data || {};
    return renderWeekScreen(
      State.gameState,
      State.config,
      State.qualifiedEvents || [],
      State.strategies || [],
      d.rivals || [],
      d.worldEvents || [],
      State.world
    );
  },
  init: function () {
    initWeekScreen(State.gameState, State.config, State.qualifiedEvents || [], State.strategies || []);
  },
};

var ResultsScreen = {
  render: function (data) {
    var d = data || {};
    var rep = d.report || State.lastReport || {};
    return renderResultsScreen(rep, State.gameState, State.config, d.worldEvents || rep.world_events || []);
  },
  init: function (data) {
    var d = data || {};
    initResultsScreen(d.report || State.lastReport || {});
  },
};

var WeekSummaryScreen = {
  render: function (data) {
    var d = data || {};
    var rep = d.report || State.lastReport || {};
    return renderWeekSummaryScreen(rep, State.gameState, State.config);
  },
  init: function (data) {
    var d = data || {};
    initWeekSummaryScreen(d.report || State.lastReport || {});
  },
};

function renderPreseasonScreen(gameState, config, world) {
  var gs = gameState || {};
  var athlete = gs.athlete || {};
  var cs = gs.current_season || {};
  var goals = cs.goals_active || [];
  var buildInfo = (((config || {}).event_groups || {})[athlete.build || '']) || {};

  var goalsHtml = goals.length ? goals.map(function (g) {
    var meta = _resolveGoalDisplay(g, config, world);
    return (
      '<div class="goal-card">' +
      '<div class="goal-title">' + _escapeHtml(meta.title) + '</div>' +
      '<div class="goal-description">' + _escapeHtml(meta.description) + '</div>' +
      (meta.rewardName ? '<div class="goal-reward">Reward: ' + _escapeHtml(meta.rewardName) + '</div>' : '') +
      '</div>'
    );
  }).join('') : '<div class="card"><div class="label-sm">No active goals yet.</div></div>';

  var seenRewards = {};
  var rewardsHtml = goals.map(function (g) {
    var rewardId = g.reward_perk || '';
    if (!rewardId || seenRewards[rewardId]) return '';
    seenRewards[rewardId] = true;
    var perkDef = _findPerkDef(rewardId, config, world) || {};
    var rewardName = perkDef.name || perkDef.title || _findPerkName(rewardId, config, world);
    var rewardDesc = perkDef.description || 'Unlock this perk by completing its linked goal.';
    return (
      '<div class="reward-card">' +
      '<div class="reward-name">' + _escapeHtml(rewardName) + '</div>' +
      '<div class="reward-desc">' + _escapeHtml(rewardDesc) + '</div>' +
      '</div>'
    );
  }).filter(function (x) { return !!x; }).join('');

  return (
    '<div class="app screen-enter">' +
    renderSidebar(gs, config, []) +
    '<main class="main-content">' +
    renderTopStatusBar(gs, config, { id: 'btn-begin-season', text: 'Begin Season', disabled: false }) +
    '<div class="label-xs">PRESEASON</div>' +
    '<div class="heading-lg">' + _escapeHtml(seasonLabel(athlete.year || 1)) + ' Season Kickoff</div>' +
    '<div class="card">' +
    '<div class="label-xs">BUILD</div>' +
    '<div class="heading-md">' + _escapeHtml(athlete.build || '') + '</div>' +
    '<div class="label-sm">' + _escapeHtml(buildInfo.flavor || '') + '</div>' +
    '</div>' +
    '<div class="label-xs">SEASON GOALS</div>' +
    '<div class="preseason-layout">' +
    '<div class="preseason-goals">' + goalsHtml + '</div>' +
    '<div class="preseason-rewards">' +
    '<div class="label-xs">REWARDS</div>' +
    (rewardsHtml || '<div class="card"><div class="label-sm">No reward perks defined.</div></div>') +
    '</div>' +
    '</div>' +
    '</main>' +
    '</div>'
  );
}

function initPreseasonScreen() {
  (async function () {
    try {
      var ensured = await api('ensure_goals');
      State.gameState = ensured.game_state;
      State.preseasonRecruitingBeat = State.preseasonRecruitingBeat || ensured.recruiting_beat || null;
      Root = document.getElementById('app');
      appRoot.innerHTML = renderPreseasonScreen(State.gameState, State.config, State.world);
      if (appRoot.firstElementChild) appRoot.firstElementChild.classList.add('screen-enter');
      bindBegin();
    } catch (e) {
      bindBegin();
    }
  })();

  function bindBegin() {
    var btn = document.getElementById('btn-begin-season');
    if (!btn) return;
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      try {
        await api('mark_preseason_seen');
      } catch (e) { /* ignore */ }
      if (State.preseasonRecruitingBeat) {
        var preseasonBeat = State.preseasonRecruitingBeat;
        State.preseasonRecruitingBeat = null;
        State.pendingScreen = { id: 'training', data: {} };
        Router.go('recruiting_interstitial', { beat: preseasonBeat });
        return;
      }
      Router.go('training');
    });
  }
}

function _seasonSummaryTierFromState(gameState) {
  var cs = ((gameState || {}).current_season) || {};
  var champs = cs.championship_results || [];
  if (!champs.length) return 'regular_season';
  var order = ['club_championship', 'class_meet', 'state_meet', 'regional_meet', 'national_meet'];
  var bestIdx = -1;
  champs.forEach(function (r) {
    var idx = order.indexOf(r.meet_type);
    if (idx > bestIdx) bestIdx = idx;
  });
  return bestIdx < 0 ? 'regular_season' : order[bestIdx];
}

function _seasonSummaryNarrative(world, tier) {
  var beats = ((((world || {}).narrative || {}).beats) || []);
  var match = beats.filter(function (b) {
    var t = (b.trigger || {}).type;
    return t === 'season_summary' && (b.trigger || {}).tier === tier;
  });
  if (!match.length) return 'Season complete. Review your progress and prepare for what comes next.';
  var text = match[0].text || [];
  return text[0] || 'Season complete.';
}

function _humanizeId(id, prefix) {
  if (!id) return '';
  var out = String(id);
  if (prefix && out.indexOf(prefix) === 0) out = out.slice(prefix.length);
  out = out.replace(/_/g, ' ').trim();
  if (!out) return '';
  return out.split(' ').map(function (part) {
    return part ? (part.charAt(0).toUpperCase() + part.slice(1)) : part;
  }).join(' ');
}

function _findGoalDef(goalId, config, world) {
  if (!goalId) return null;
  var worldGoals = (world && world.goals) || null;
  if (worldGoals) {
    if (!Array.isArray(worldGoals) && worldGoals[goalId]) return worldGoals[goalId];
    if (Array.isArray(worldGoals)) {
      for (var i = 0; i < worldGoals.length; i++) {
        if ((worldGoals[i] || {}).id === goalId) return worldGoals[i];
      }
    }
  }

  var seasonGoals = (config && config.season_goals) || {};
  var builds = Object.keys(seasonGoals);
  for (var b = 0; b < builds.length; b++) {
    var byYear = seasonGoals[builds[b]] || {};
    var years = Object.keys(byYear);
    for (var y = 0; y < years.length; y++) {
      var arr = byYear[years[y]] || [];
      for (var j = 0; j < arr.length; j++) {
        if ((arr[j] || {}).id === goalId) return arr[j];
      }
    }
  }
  return null;
}

function _findPerkName(perkId, config, world) {
  var perk = _findPerkDef(perkId, config, world);
  if (perk && (perk.name || perk.title)) return perk.name || perk.title || '';
  return _humanizeId(perkId, 'perk_');
}

function _findPerkDef(perkId, config, world) {
  if (!perkId) return null;
  var worldPerks = (world && world.perks) || null;
  if (worldPerks) {
    var worldPerk = null;
    if (!Array.isArray(worldPerks)) worldPerk = worldPerks[perkId] || null;
    else {
      for (var i = 0; i < worldPerks.length; i++) {
        if ((worldPerks[i] || {}).id === perkId) {
          worldPerk = worldPerks[i];
          break;
        }
      }
    }
    if (worldPerk) return worldPerk;
  }

  var cfgPerk = (((config || {}).perks || {})[perkId]) || null;
  if (cfgPerk) return cfgPerk;
  return null;
}

function _resolveGoalDisplay(goal, config, world) {
  var g = goal || {};
  var goalId = g.id || '';
  var def = _findGoalDef(goalId, config, world) || {};
  var rewardPerkId = g.reward_perk || def.reward || def.reward_perk || '';
  // Prefer the stored goal's own text: select_goals bakes per-category
  // variants into it, so the raw config def may show the wrong category.
  return {
    title: g.title || g.name || def.title || def.name || g.label || _humanizeId(goalId, '') || 'Goal',
    description: g.description || def.description || 'Complete this season objective.',
    rewardName: _findPerkName(rewardPerkId, config, world),
  };
}

function _seasonGoalsForDisplay(gameState, config, goalsEvaluated) {
  var gs = gameState || {};
  var athlete = gs.athlete || {};
  var cs = gs.current_season || {};
  var build = athlete.build || '';
  var year = String(athlete.year || 1);
  var explicit = goalsEvaluated || cs.goals_evaluated || [];
  if (explicit.length) return explicit;

  var active = cs.goals_active || [];
  if (active.length) {
    return active.map(function (g) {
      return { goal: g, completed: null };
    });
  }

  var cfgGoals = ((((config || {}).season_goals || {})[build] || {})[year] || []);
  return cfgGoals.map(function (g) {
    return { goal: g, completed: null };
  });
}

function _goalStatusFromCondition(goal, gameState) {
  var g = goal || {};
  var cond = g.condition || {};
  var t = cond.type || '';
  var gs = gameState || {};
  var cs = gs.current_season || {};
  var athlete = gs.athlete || {};
  var prs = cs.season_prs || {};
  var rivals = cs.rival_encounters || {};
  var champs = cs.championship_results || [];
  var achievementsSeason = cs.achievements || [];
  var unlockedSet = {};
  (athlete.achievements_unlocked || []).forEach(function (id) { unlockedSet[id] = true; });
  achievementsSeason.forEach(function (a) { if (a && a.id) unlockedSet[a.id] = true; });

  if (t === 'season_pbs_gte') {
    // cs.pb_count is what the backend evaluates against (goals.py _check);
    // counting season-PR events here diverged for multi-PB single events.
    var pbCount = Number(cs.pb_count || 0);
    var targetPb = Number(cond.value || 0);
    if (pbCount >= targetPb) return 'achieved';
    return Object.keys(prs).length ? 'failed' : 'pending';
  }
  if (t === 'season_rival_wins_gte') {
    var wins = 0;
    var encounters = 0;
    Object.keys(rivals).forEach(function (id) {
      var rv = rivals[id] || {};
      wins += Number(rv.wins || 0);
      encounters += Number(rv.wins || 0) + Number(rv.losses || 0);
    });
    var targetWins = Number(cond.value || 0);
    if (wins >= targetWins) return 'achieved';
    return encounters > 0 ? 'failed' : 'pending';
  }
  if (t === 'reach_meet_type') {
    var reached = champs.some(function (r) { return (r || {}).meet_type === cond.meet_type; });
    if (reached) return 'achieved';
    return champs.length ? 'failed' : 'pending';
  }
  if (t === 'championship_place_lte') {
    var best = null;
    champs.forEach(function (r) {
      var p = Number((r || {}).place || 0);
      if (p > 0 && (best == null || p < best)) best = p;
    });
    var targetPlace = Number(cond.value || 0);
    if (best != null && best <= targetPlace) return 'achieved';
    return best != null ? 'failed' : 'pending';
  }
  if (t === 'season_no_very_low_energy') {
    return cs.hit_very_low_energy ? 'failed' : 'achieved';
  }
  if (t === 'season_win_count_gte') {
    var winsSeason = Number(cs.season_win_count || 0);
    var targetSeasonWins = Number(cond.value || 0);
    if (winsSeason >= targetSeasonWins) return 'achieved';
    return winsSeason > 0 ? 'failed' : 'pending';
  }
  if (t === 'achievement_unlocked_this_season') {
    var achId = String(cond.achievement_id || '');
    if (achId && unlockedSet[achId]) return 'achieved';
    return Object.keys(unlockedSet).length ? 'failed' : 'pending';
  }
  if (t === 'value_lte_event') {
    var pr = prs[cond.event];
    if (!pr) return 'pending';
    var value = Number(pr.value || 0);
    var target = Number(cond.value || 0);
    if (value > 0 && value <= target) return 'achieved';
    return 'failed';
  }
  if (t === 'value_gte_event') {
    var prMark = prs[cond.event];
    if (!prMark) return 'pending';
    var markValue = Number(prMark.value || 0);
    var markTarget = Number(cond.value || 0);
    if (markValue > 0 && markValue >= markTarget) return 'achieved';
    return 'failed';
  }

  return 'pending';
}

function renderSeasonSummaryScreen(gameState, config, world, goalsEvaluated) {
  var gs = gameState || {};
  var athlete = gs.athlete || {};
  var cs = gs.current_season || {};
  var goals = _seasonGoalsForDisplay(gs, config, goalsEvaluated);
  var tier = _seasonSummaryTierFromState(gs);
  var narrative = _seasonSummaryNarrative(world, tier);
  var seasonPrs = cs.season_prs || {};
  var champs = cs.championship_results || [];
  var achs = cs.achievements || [];
  var milestones = gs.milestones_completed || [];

  var prsHtml = Object.keys(seasonPrs).length ? Object.keys(seasonPrs).map(function (ev) {
    var pr = seasonPrs[ev] || {};
    return '<div class="flex justify-between text-tabular"><span>' + _escapeHtml(ev) + '</span><span>' +
      _escapeHtml(_formatResultValue(pr.kind || 'time', pr.value || 0)) + '</span></div>';
  }).join('') : '<div class="label-sm">No season PRs recorded.</div>';

  var champsHtml = champs.length ? champs.map(function (c) {
    return '<div class="flex justify-between"><span>' + _escapeHtml(meetLabel(c.meet_type || '')) + ' \u00B7 ' + _escapeHtml(c.event || '') +
      '</span><span class="text-tabular">' + formatPlace(c.place || 0) + '</span></div>';
  }).join('') : '<div class="label-sm">No championship appearances this season.</div>';

  var goalsHtml = goals.length ? goals.map(function (g) {
    var goal = g.goal || g;
    var status = (typeof g.completed === 'boolean')
      ? (g.completed ? 'achieved' : 'failed')
      : _goalStatusFromCondition(goal, gs);
    var meta = _resolveGoalDisplay(goal, config, world);
    var statusIcon = status === 'achieved' ? '&#10003;' : (status === 'failed' ? '&#10007;' : '\u2022');
    var statusText = status === 'achieved' ? 'Achieved' : (status === 'failed' ? 'Failed' : 'Not attempted');
    return (
      '<div class="goal-card">' +
      '<div class="flex items-center justify-between"><div class="goal-title">' + _escapeHtml(meta.title) + '</div>' +
      '<span class="goal-status goal-status--' + status + '">' + statusIcon + ' ' + statusText + '</span></div>' +
      '<div class="goal-description">' + _escapeHtml(meta.description) + '</div>' +
      (meta.rewardName ? '<div class="goal-reward">Reward: ' + _escapeHtml(meta.rewardName) + '</div>' : '') +
      '</div>'
    );
  }).join('') : '<div class="label-sm">No goals evaluated.</div>';

  var achHtml = achs.length ? achs.map(function (a) {
    var achId = a && (a.id || a);
    return '<span class="badge badge--achievement badge--lg">' + _escapeHtml(_resolveAchievementName(achId, config, world)) + '</span>';
  }).join('') : '<span class="label-sm">None this season.</span>';

  var msHtml = milestones.length ? milestones.map(function (m) {
    return '<span class="badge badge--milestone badge--lg">' + _escapeHtml(_resolveMilestoneName(m, config, world)) + '</span>';
  }).join('') : '<span class="label-sm">None yet.</span>';

  return (
    '<div class="app screen-enter">' +
    renderSidebar(gs, config, []) +
    '<main class="main-content">' +
    renderTopStatusBar(gs, config, { id: 'btn-continue-offseason', text: 'Continue to Offseason', disabled: false }) +
    '<div class="label-xs">SEASON SUMMARY</div>' +
    '<div class="heading-lg">' + _escapeHtml(seasonLabel(athlete.year || 1)) + '</div>' +
    '<div class="narrative-text">' + _escapeHtml(narrative) + '</div>' +
    '<div class="season-section-hdr">Championship Results</div>' +
    '<div class="card">' + champsHtml + '</div>' +
    '<div class="season-section-hdr">Goals</div>' +
    '<div class="flex flex-col gap-8">' + goalsHtml + '</div>' +
    '<div class="season-section-hdr">Personal Bests</div>' +
    '<div class="card">' + prsHtml + '</div>' +
    '<div class="season-section-hdr">Performance Arc</div>' +
    '<div class="card"><canvas id="season-pb-graph" width="560" height="180" style="display:block;width:100%;max-width:560px;"></canvas><div id="season-pb-legend" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:10px;"></div></div>' +
    '<div class="season-section-hdr">Achievements</div>' +
    '<div class="card"><div class="flex gap-6" style="flex-wrap:wrap;">' + achHtml + '</div></div>' +
    '<div class="season-section-hdr">Milestones</div>' +
    '<div class="card"><div class="flex gap-6" style="flex-wrap:wrap;">' + msHtml + '</div></div>' +
    '</main>' +
    '</div>'
  );
}

function _drawSeasonPbGraph(gs) {
  var canvas = document.getElementById('season-pb-graph');
  var legendEl = document.getElementById('season-pb-legend');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.width;
  var H = canvas.height;
  var PAD = { top: 14, right: 20, bottom: 28, left: 12 };
  var chartW = W - PAD.left - PAD.right;
  var chartH = H - PAD.top - PAD.bottom;

  var athlete = (gs && gs.athlete) || {};
  var currentYear = athlete.year || 1;
  var meets = ((gs && gs.history && gs.history.meets) || []).filter(function (m) {
    return Number(m.year) === Number(currentYear);
  });

  var byEvent = {};
  for (var i = 0; i < meets.length; i++) {
    var m = meets[i];
    if (m.event == null || m.value == null) continue;
    if (!byEvent[m.event]) byEvent[m.event] = [];
    byEvent[m.event].push({ week: Number(m.week), value: Number(m.value), kind: m.kind || 'time', pb: !!m.pb });
  }
  var events = Object.keys(byEvent);
  if (!events.length) {
    ctx.fillStyle = 'rgba(180,170,150,0.4)';
    ctx.font = '12px monospace';
    ctx.fillText('No meet data this season.', PAD.left + 8, PAD.top + chartH / 2);
    return;
  }

  var COLORS = ['#C8A96E', '#7EAED4', '#82C996', '#D47E8B'];
  var minWeek = 99, maxWeek = 0;
  events.forEach(function (ev) {
    byEvent[ev].sort(function (a, b) { return a.week - b.week; });
    byEvent[ev].forEach(function (p) {
      if (p.week < minWeek) minWeek = p.week;
      if (p.week > maxWeek) maxWeek = p.week;
    });
  });
  if (minWeek === maxWeek) maxWeek = minWeek + 1;

  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(180,170,150,0.08)';
  ctx.lineWidth = 1;
  for (var g = 0; g <= 4; g++) {
    var gy = PAD.top + chartH - (g / 4) * chartH;
    ctx.beginPath(); ctx.moveTo(PAD.left, gy); ctx.lineTo(PAD.left + chartW, gy); ctx.stroke();
  }

  events.forEach(function (ev, ei) {
    var pts = byEvent[ev];
    var vals = pts.map(function (p) { return p.value; });
    var minVal = Math.min.apply(null, vals);
    var maxVal = Math.max.apply(null, vals);
    var range = maxVal - minVal || 1;
    var isTime = pts[0].kind !== 'mark';
    var color = COLORS[ei % COLORS.length];

    function toY(val) {
      var norm = isTime ? (maxVal - val) / range : (val - minVal) / range;
      return PAD.top + chartH - norm * chartH * 0.85 - chartH * 0.075;
    }
    function toX(week) {
      return PAD.left + ((week - minWeek) / (maxWeek - minWeek)) * chartW;
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (var j = 0; j < pts.length; j++) {
      var x = toX(pts[j].week);
      var y = toY(pts[j].value);
      if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    for (var k = 0; k < pts.length; k++) {
      var px = toX(pts[k].week);
      var py = toY(pts[k].value);
      ctx.beginPath();
      ctx.arc(px, py, pts[k].pb ? 5 : 3, 0, 2 * Math.PI);
      if (pts[k].pb) {
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.fill();
      }
    }

    if (legendEl) {
      var item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:11px;color:rgba(212,197,170,0.7);font-family:monospace;';
      var swatch = document.createElement('span');
      swatch.style.cssText = 'display:inline-block;width:10px;height:10px;border-radius:50%;background:' + color + ';';
      item.appendChild(swatch);
      item.appendChild(document.createTextNode(ev));
      legendEl.appendChild(item);
    }
  });

  ctx.fillStyle = 'rgba(180,170,150,0.4)';
  ctx.font = '10px monospace';
  for (var w = minWeek; w <= maxWeek; w++) {
    var wx = PAD.left + ((w - minWeek) / (maxWeek - minWeek)) * chartW;
    ctx.fillText(String(w), wx - 4, H - 6);
  }
}

function initSeasonSummaryScreen() {
  _drawSeasonPbGraph(State.gameState);
  var btn = document.getElementById('btn-continue-offseason');
  if (!btn) return;
  btn.addEventListener('click', async function () {
    var athlete = (State.gameState && State.gameState.athlete) || {};
    // On étend la limite à 12 saisons
    var totalSeasons = (((State.config || {}).season || {}).seasons_total) || 12;
    btn.disabled = true;

    if ((athlete.year || 1) >= totalSeasons) {
      // Fin de la carrière globale (Retraite)
      try {
        var finalRes = await api('finalize_career');
        State.gameState = finalRes.game_state;
        if (finalRes.recruiting_beat) {
          Router.go('recruiting_interstitial', { beat: finalRes.recruiting_beat });
          return;
        }
        State.hof = finalRes.hof || { entries: [] };
        Router.go('endgame', { endgame: finalRes.endgame, hof: State.hof });
      } catch (e) {
        btn.disabled = false;
        showError('Failed to finalize career: ' + e);
      }
      return;
    }
    
    // TRANSITIONS DE NIVEAU DE CARRIÈRE
    if ((athlete.year || 1) === 4) {
      // Fin du lycée : Transition vers la phase universitaire
      Router.go('college_commitment'); // Un nouvel écran que l'on va créer
    } else if ((athlete.year || 1) === 8) {
      // Fin de la fac : Transition vers le circuit Pro
      Router.go('pro_contract'); // Un nouvel écran que l'on va créer
    } else {
      // Année standard : Passage à la saison suivante
      Router.go('offseason');
    }
  });
}

function renderOffseasonScreen(gameState, config) {
  var gs = gameState || {};
  var athlete = gs.athlete || {};
  var year = athlete.year || 1;

  return (
    '<div class="app screen-enter">' +
    renderSidebar(gs, config, []) +
    '<main class="main-content">' +
    renderTopStatusBar(gs, config, null) +
    '<div class="label-xs">OFFSEASON</div>' +
    '<div class="heading-lg">Entering Year ' + (year + 1) + '</div>' +
    '<div class="label-sm" style="margin-bottom:16px;">Choose your training focus for the offseason.</div>' +
    '<div id="offseason-cards-container"><div class="label-sm">Loading\u2026</div></div>' +
    '<div style="margin-top:20px;"><button class="btn btn--primary" id="btn-advance-offseason" disabled>Advance to Next Season</button></div>' +
    '</main>' +
    '</div>'
  );
}

function _renderOffseasonCardHtml(card) {
  var effects = card.effects || {};
  var statBonus = effects.stat_bonus || {};
  var energyMod = effects.starting_energy_mod != null ? parseInt(effects.starting_energy_mod, 10) : 0;
  var statPills = Object.keys(statBonus).map(function (k) {
    return '<span class="stat-pill">' + _escapeHtml(k) + ' +' + statBonus[k] + '</span>';
  }).join('');
  var energyHtml = energyMod !== 0
    ? '<div class="training-meta"><span class="energy-cost"><span class="icon-energy"></span>' +
      _escapeHtml((energyMod > 0 ? '+' : '') + energyMod + ' Energy next season') + '</span></div>'
    : '';
  return (
    '<div class="card card--selectable training-card offseason-card" data-card-id="' + _escapeHtml(card.id) + '" style="flex:1;min-width:180px;">' +
    '<div class="heading-md">' + _escapeHtml(card.label) + '</div>' +
    '<div class="label-sm">' + _escapeHtml(card.description) + '</div>' +
    '<div class="training-stats">' + statPills + '</div>' +
    energyHtml +
    '</div>'
  );
}

function initOffseasonScreen() {
  api('get_offseason_cards').then(function (result) {
    var cards = (result && result.cards) || [];
    var container = document.getElementById('offseason-cards-container');
    if (!container) return;
    container.innerHTML = '<div class="flex gap-6" style="flex-wrap:wrap;">' +
      cards.map(_renderOffseasonCardHtml).join('') +
      '</div>';
    var cardEls = container.querySelectorAll('.offseason-card');
    var advanceBtn = document.getElementById('btn-advance-offseason');
    var selectedCardId = null;

    cardEls.forEach(function (el) {
      el.addEventListener('click', function () {
        cardEls.forEach(function (c) { c.classList.remove('selected'); });
        el.classList.add('selected');
        selectedCardId = el.getAttribute('data-card-id');
        if (advanceBtn) advanceBtn.disabled = false;
      });
    });

    if (advanceBtn) {
      advanceBtn.addEventListener('click', async function () {
        if (!selectedCardId) return;
        advanceBtn.disabled = true;
        cardEls.forEach(function (c) { c.style.pointerEvents = 'none'; });
        try {
          var off = await api('do_offseason', selectedCardId);
          State.gameState = off.game_state;
          State.weeklyPool = off.weekly_pool;
          State.preseasonRecruitingBeat = off.recruiting_beat || null;
          _routeAfterLoad(off.recruiting_beat || null);
        } catch (e) {
          advanceBtn.disabled = false;
          cardEls.forEach(function (c) { c.style.pointerEvents = ''; });
          showError('Error in offseason: ' + e);
        }
      });
    }
  }).catch(function (e) {
    var container = document.getElementById('offseason-cards-container');
    if (container) container.innerHTML = '<div class="label-sm">Error loading cards: ' + _escapeHtml(String(e)) + '</div>';
  });
}

function _formatCareerScore(score) {
  return Number(score || 0).toFixed(2);
}

function _hofBestPb(bestPbs, config, signatureEvent) {
  if (!bestPbs || typeof bestPbs !== 'object') return '';
  var keys = Object.keys(bestPbs);
  if (!keys.length) return '';
  var eventsCfg = (config && config.events) || {};
  var ev = (signatureEvent && bestPbs[signatureEvent] != null) ? signatureEvent : keys[0];
  var val = bestPbs[ev];
  if (val == null) return '';
  var kind = ((eventsCfg[ev] || {}).type) === 'field' ? 'mark' : 'time';
  return _escapeHtml(ev) + ': ' + _escapeHtml(_formatResultValue(kind, val));
}

function renderHofScreen(hof) {
  var entries = (hof && hof.entries) || [];
  var cfg = State.config || {};
  var cols = '60px minmax(140px, 1.5fr) minmax(120px, 1fr) 90px 130px 120px minmax(110px, 1fr)';
  var headerRow = (
    '<div class="label-xs" style="display:grid; grid-template-columns: ' + cols + '; gap:12px; padding:0 0 10px; border-bottom:1px solid var(--border-subtle);">' +
    '<span>Rank</span>' +
    '<span>Athlete Name</span>' +
    '<span>Build</span>' +
    '<span>Score</span>' +
    '<span>Championships</span>' +
    '<span>Achievements</span>' +
    '<span>Best PB</span>' +
    '</div>'
  );
  var rowsHtml = entries.length ? entries.map(function (entry, index) {
    var pbStr = _hofBestPb(entry.best_pbs, cfg, entry.signature_event);
    var catTag = entry.competition_category === 'women' ? ' (W)'
      : (entry.competition_category === 'men' ? ' (M)' : '');
    return (
      '<div style="display:grid; grid-template-columns: ' + cols + '; gap:12px; padding:12px 0; border-bottom:1px solid var(--border-subtle); align-items:center;">' +
      '<span class="text-tabular">' + (index + 1) + '</span>' +
      '<span>' + _escapeHtml(entry.athlete_name || 'Unknown Athlete') + '</span>' +
      '<span>' + _escapeHtml((entry.build || 'Unknown Build') + catTag) + '</span>' +
      '<span class="text-tabular">' + _escapeHtml(_formatCareerScore(entry.career_score)) + '</span>' +
      '<span class="text-tabular">' + _escapeHtml(String(entry.championships_won || 0)) + '</span>' +
      '<span class="text-tabular">' + _escapeHtml(String(entry.achievements_count || 0)) + '</span>' +
      '<span class="text-tabular">' + (pbStr || '<span class="label-sm">—</span>') + '</span>' +
      '</div>'
    );
  }).join('') : '<div class="label-sm">No careers completed yet.</div>';

  return (
    '<div class="screen screen-enter" style="max-width:1100px; margin:0 auto; padding:24px 16px 32px;">' +
    '<div class="heading-lg">HALL OF FAME</div>' +
    '<div class="card" style="background:var(--bg-card); border:1px solid var(--border-subtle); overflow-x:auto;">' +
    (entries.length ? headerRow + rowsHtml : rowsHtml) +
    '</div>' +
    '<div class="screen-actions"><button class="btn btn--secondary" id="btn-hof-back">Back</button></div>' +
    '</div>'
  );
}

function initHofScreen() {
  var btn = document.getElementById('btn-hof-back');
  if (!btn) return;
  btn.addEventListener('click', function () {
    Router.go('menu', { slots: State.slots || [], selectedSlot: State.selectedSlot || 1 });
  });
}

function _buildToEventGroup(build) {
  var map = {
    'Sprints': 'sprint',
    'Hurdler': 'hurdles',
    'Long Distance': 'distance',
    'Middle Distance': 'distance',
    'Throwing': 'throws',
    'Jumping': 'jumps'
  };
  return map[String(build || '')] || 'sprint';
}

function _careerSignatureText(sigTitle, build, world) {
  if (!sigTitle) return '';
  var sigs = (((world || {}).endgame || {}).career_signatures) || [];
  var match = null;
  for (var i = 0; i < sigs.length; i++) {
    if ((sigs[i] || {}).title === sigTitle) { match = sigs[i]; break; }
  }
  if (!match) return '';
  var eg = _buildToEventGroup(build);
  var variants = ((match.event_variants || {})[eg]) || [];
  if (variants.length) return String(variants[0]);
  var fallback = match.text || [];
  return Array.isArray(fallback) && fallback.length ? String(fallback[0]) : '';
}

function _buildAchievableCount(build, world, config, category) {
  var evList = _buildEventsForCategory(config, build, category || 'men');
  var buildEvents = {};
  evList.forEach(function (e) { buildEvents[e] = true; });
  var achs = (world && world.achievements) || [];
  if (!Array.isArray(achs)) return 25;
  var count = 0;
  for (var i = 0; i < achs.length; i++) {
    var conds = ((achs[i] || {}).conditions) || [];
    var evConds = [];
    for (var j = 0; j < conds.length; j++) {
      if (conds[j] && conds[j].event) evConds.push(conds[j].event);
    }
    if (!evConds.length) { count++; continue; }
    var hasMatch = false;
    for (var k = 0; k < evConds.length; k++) {
      if (buildEvents[evConds[k]]) { hasMatch = true; break; }
    }
    if (hasMatch) count++;
  }
  return count || 25;
}

function _bestPbForDisplay(pbs, build, category, config) {
  var eventsCfg = (config && config.events) || {};
  var evList = _buildEventsForCategory(config, build, category);
  var best = null;
  evList.forEach(function (ev) {
    if (!(ev in pbs)) return;
    var edef = eventsCfg[ev] || {};
    var catData = (edef.categories || {})[category] || {};
    var isField = edef.type === 'field';
    var value = Number(pbs[ev]);
    var score;
    if (isField) {
      var base = Number(catData.base_mark != null ? catData.base_mark : edef.base_mark);
      var max = Number(catData.max_mark != null ? catData.max_mark : edef.max_mark);
      score = max !== base ? (value - base) / (max - base) * 100 : 0;
    } else {
      var baseT = Number(catData.base_time != null ? catData.base_time : edef.base_time);
      var minT = Number(catData.min_time != null ? catData.min_time : edef.min_time);
      score = baseT !== minT ? (baseT - value) / (baseT - minT) * 100 : 0;
    }
    if (!best || score > best.score) {
      best = { event: ev, kind: isField ? 'mark' : 'time', value: value, score: score };
    }
  });
  if (best) return best;
  var pbKeys = Object.keys(pbs);
  if (!pbKeys.length) return null;
  var ev0 = pbKeys[0];
  return { event: ev0, kind: ((eventsCfg[ev0] || {}).type) === 'field' ? 'mark' : 'time', value: pbs[ev0] };
}

function _hofRankInfo(hofEntries, eg, athlete) {
  var entries = hofEntries || [];
  var score = Number((eg || {}).score || 0);
  var better = 0;
  var selfIncluded = false;
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i] || {};
    var eScore = Number(e.career_score || 0);
    if (eScore > score) better++;
    if (!selfIncluded && eScore === score && e.athlete_name === (athlete.name || '') && e.build === (athlete.build || '')) {
      selfIncluded = true;
    }
  }
  var total = selfIncluded ? entries.length : entries.length + 1;
  return { rank: better + 1, total: total, onlyEntry: total <= 1 };
}

function renderEndgameScreen(endgame, gameState, config, hof) {
  var eg = endgame || {};
  var gs = gameState || {};
  var athlete = gs.athlete || {};
  var hofEntries = (hof && hof.entries) || [];
  var comps = eg.components || {};
  var pbs = athlete.personal_bests || {};
  var achs = athlete.achievements_unlocked || [];
  var college = eg.college_offer || {};
  var ep = eg.epilogue || {};
  var world = State.world || {};
  var build = athlete.build || '';
  var category = _competitionCategory(athlete);
  var playerName = athlete.name || '';
  var recruitingSummary = eg.recruiting_summary || {};
  var recruitingTiers = (((config || {}).recruiting || {}).interest_tiers) || [];
  var schoolMeta = [athlete.team || '', build || ''].filter(Boolean).join(' \u00B7 ');

  var sigTitle = eg.career_signature || '';
  var sigText = _careerSignatureText(sigTitle, build, world);

  var outcome = eg.career_outcome || null;
  var kicker = '';
  var lead = '';
  if (outcome && outcome.title) {
    kicker = outcome.title;
    lead = outcome.text || '';
  } else if (sigTitle) {
    kicker = sigTitle;
    lead = sigText;
  }

  var hofInfo = _hofRankInfo(hofEntries, eg, athlete);
  var stampBottomHtml = hofInfo.onlyEntry
    ? '<div class="sp-stamp-rank" style="font-size:14px;">First career<br/>recorded</div>'
    : '<div class="sp-stamp-rank">#' + hofInfo.rank + ' of ' + hofInfo.total + '</div>' +
      '<div class="sp-stamp-pct">Top ' + Math.ceil((hofInfo.rank / hofInfo.total) * 100) + '%</div>';

  var bestPb = _bestPbForDisplay(pbs, build, category, config);
  var bestLabel = bestPb ? ('Best \u00B7 ' + bestPb.event) : 'Best';
  var bestValue = bestPb ? _formatResultValue(bestPb.kind, bestPb.value) : '\u2014';

  var achievableCount = _buildAchievableCount(build, world, config, category);

  var gsRecords = gs.records || {};
  var schoolCatRecs = (gsRecords.school || {})[category] || {};
  var heldRecords = [];
  Object.keys(schoolCatRecs).forEach(function (ev) {
    var r = schoolCatRecs[ev];
    if (r && r.holder === playerName) {
      heldRecords.push({ label: 'School', event: ev, value: r.value, kind: r.kind });
    }
  });
  var champMeetLabels = { class_meet: 'Class', state_meet: 'State', regional_meet: 'Regionals', national_meet: 'Nationals' };
  Object.keys(champMeetLabels).forEach(function (mt) {
    var catRecs = ((gsRecords.championship || {})[mt] || {})[category] || {};
    Object.keys(catRecs).forEach(function (ev) {
      var r = catRecs[ev];
      if (r && r.holder === playerName) {
        heldRecords.push({ label: champMeetLabels[mt], event: ev, value: r.value, kind: r.kind });
      }
    });
  });

  var rival = eg.career_rival || null;
  var hasRival = !!(rival && rival.name && Number(rival.encounters || 0) >= 2);

  var recruitingTierLabel = '';
  for (var rt = 0; rt < recruitingTiers.length; rt++) {
    if ((recruitingTiers[rt] || {}).id === recruitingSummary.final_tier) {
      recruitingTierLabel = recruitingTiers[rt].label || '';
      break;
    }
  }
  var nextNote = '';
  if (recruitingSummary.beats_seen) {
    var nextParts = [];
    if (recruitingTierLabel) nextParts.push('Senior recruiting closed at ' + recruitingTierLabel);
    if (recruitingSummary.score_progression && recruitingSummary.score_progression.length) {
      nextParts.push(recruitingSummary.score_progression.length + ' recruiting checkpoints');
    }
    nextNote = nextParts.join(' \u00B7 ');
  }
  var nextColHtml = '';
  if (college.offer) {
    nextColHtml =
      '<div>' +
      '<div class="sp-col-label">Next Chapter</div>' +
      '<div class="sp-col-title">' + _escapeHtml(college.offer) + '</div>' +
      (college.line ? '<p class="sp-col-desc">' + _escapeHtml(college.line) + '</p>' : '') +
      (nextNote ? '<div class="sp-col-note">' + _escapeHtml(nextNote) + '</div>' : '') +
      '</div>';
  }
  var rivalColHtml = '';
  if (hasRival) {
    var rivalRec = (rival.wins || 0) + '\u2013' + (rival.losses || 0);
    rivalColHtml =
      '<div>' +
      '<div class="sp-col-label">Career Rival</div>' +
      '<div class="sp-col-title">' + _escapeHtml(rival.name) + '</div>' +
      '<div class="sp-col-sub">' + _escapeHtml(String(rival.encounters)) + ' meetings \u00B7 ' + _escapeHtml(rivalRec) + '</div>' +
      (rival.summary ? '<p class="sp-col-desc">' + _escapeHtml(rival.summary) + '</p>' : '') +
      '</div>';
  }
  var colCount = (nextColHtml ? 1 : 0) + (rivalColHtml ? 1 : 0);
  var columnsHtml = colCount
    ? '<div class="sp-columns' + (colCount === 1 ? ' sp-columns--single' : '') + '">' + nextColHtml + rivalColHtml + '</div>'
    : '';

  var epilogueParas = [];
  if (ep.line) {
    epilogueParas = [ep.line];
  } else if (Array.isArray(ep.lines) && ep.lines.length) {
    epilogueParas = ep.lines;
  } else if (Array.isArray(ep.text) && ep.text.length) {
    epilogueParas = ep.text;
  } else if (typeof ep.text === 'string' && ep.text.trim()) {
    epilogueParas = [ep.text];
  }
  epilogueParas = epilogueParas.filter(function (s) { return String(s || '').trim(); });
  var afterHtml = '';
  if (epilogueParas.length) {
    afterHtml =
      '<div class="sp-after">' +
      '<div class="sp-after-rule"></div>' +
      '<div class="sp-after-label">After High School</div>' +
      epilogueParas.map(function (s) { return '<p class="sp-after-para">' + _escapeHtml(s) + '</p>'; }).join('') +
      '<div class="sp-after-rule"></div>' +
      '</div>';
  }

  var pbKeys = Object.keys(pbs);
  var pbHtml = pbKeys.length ? pbKeys.map(function (ev) {
    var eventsCfg = (config && config.events) || {};
    var kind = ((eventsCfg[ev] || {}).type) === 'field' ? 'mark' : 'time';
    return (
      '<div class="sp-pb-pair">' +
      '<div class="sp-pb-event">' + _escapeHtml(ev) + '</div>' +
      '<div class="sp-pb-mark">' + _escapeHtml(_formatResultValue(kind, pbs[ev])) + '</div>' +
      '</div>'
    );
  }).join('') : '<div class="label-sm">No personal bests recorded.</div>';

  var achBadgesHtml = achs.length ? achs.map(function (a) {
    return '<span class="badge badge--achievement badge--lg">' + _escapeHtml(_resolveAchievementName(a, config, world)) + '</span>';
  }).join('') : '<span class="label-sm">None</span>';

  var recordsListHtml = heldRecords.length ? heldRecords.map(function (r) {
    return '<div class="sp-record-row">' +
      '<span class="sp-record-type">' + _escapeHtml(r.label) + '</span>' +
      '<span class="sp-record-event">' + _escapeHtml(r.event) + '</span>' +
      '<span class="sp-record-mark">' + _escapeHtml(_formatResultValue(r.kind, r.value)) + '</span>' +
      '</div>';
  }).join('') : '<div class="label-sm">No records held.</div>';

  var pbRaw = Number(comps.personal_best || 0);
  var champRaw = Number(comps.championship || 0);
  var achRaw = Number(comps.achievements || 0);
  var champValCls = 'sp-breakdown-val' + (champRaw >= 100 ? ' sp-breakdown-val--gold' : '');
  var breakdownHtml =
    '<div class="sp-breakdown">' +
    '<div class="sp-breakdown-col"><div class="sp-breakdown-val">' + pbRaw.toFixed(0) + '</div><div class="sp-breakdown-label">Personal Best</div></div>' +
    '<div class="sp-breakdown-sep"></div>' +
    '<div class="sp-breakdown-col"><div class="' + champValCls + '">' + champRaw.toFixed(0) + '</div><div class="sp-breakdown-label">Championship</div></div>' +
    '<div class="sp-breakdown-sep"></div>' +
    '<div class="sp-breakdown-col"><div class="sp-breakdown-val">' + achRaw.toFixed(0) + '</div><div class="sp-breakdown-label">Achievements</div></div>' +
    '</div>';

  var archiveHtml =
    '<details class="sp-archive">' +
    '<summary>Full career archive</summary>' +
    '<div class="sp-archive-body">' +
    '<div class="sp-archive-section">' +
    '<div class="sp-archive-section-label">Personal Bests</div>' +
    '<div class="sp-pb-list">' + pbHtml + '</div>' +
    '<div class="sp-archive-section-label" style="margin-top:8px;">Career Breakdown</div>' +
    breakdownHtml +
    '</div>' +
    '<div class="sp-archive-section">' +
    '<div class="sp-archive-section-label">Achievements (' + achs.length + ' / ' + achievableCount + ')</div>' +
    '<div class="sp-ach-badges">' + achBadgesHtml + '</div>' +
    '<div class="sp-archive-section-label" style="margin-top:8px;">Records Held (' + heldRecords.length + ')</div>' +
    '<div style="display:flex;flex-direction:column;gap:6px;">' + recordsListHtml + '</div>' +
    '</div>' +
    '</div>' +
    '</details>';

  return (
    '<div class="screen screen-endgame screen-enter">' +
    '<div class="screen-actions"><button class="btn btn--secondary" id="btn-endgame-back">Back to Menu</button></div>' +
    '<div class="sp-card">' +
    '<div class="sp-toprule"></div>' +
    '<div class="sp-eyebrow">Career Retrospective \u00B7 Final Edition</div>' +
    '<div class="sp-headline">' +
    '<div>' +
    (kicker ? '<div class="sp-kicker">' + _escapeHtml(kicker) + '</div>' : '') +
    '<div class="sp-name">' + _escapeHtml(athlete.name || 'Athlete') + '</div>' +
    (schoolMeta ? '<div class="sp-meta">' + _escapeHtml(schoolMeta) + '</div>' : '') +
    (lead ? '<p class="sp-lead">' + _escapeHtml(lead) + '</p>' : '') +
    '</div>' +
    '<div class="sp-stamp">' +
    '<div class="sp-stamp-label">Final Score</div>' +
    '<div class="sp-stamp-score text-tabular">' + (eg.score || 0) + '</div>' +
    '<div class="sp-stamp-divider"></div>' +
    '<div class="sp-stamp-label">Hall of Fame</div>' +
    stampBottomHtml +
    '</div>' +
    '</div>' +
    '<div class="sp-strap">' +
    '<div class="sp-cell"><div class="sp-cell-label">Signature</div><div class="sp-cell-value">' + _escapeHtml(sigTitle || '\u2014') + '</div></div>' +
    '<div class="sp-cell"><div class="sp-cell-label">' + _escapeHtml(bestLabel) + '</div><div class="sp-cell-value tabular">' + _escapeHtml(bestValue) + '</div></div>' +
    '<div class="sp-cell"><div class="sp-cell-label">Achievements</div><div class="sp-cell-value">' + achs.length + ' / ' + achievableCount + '</div></div>' +
    '<div class="sp-cell"><div class="sp-cell-label">Records Held</div><div class="sp-cell-value">' + heldRecords.length + '</div></div>' +
    '</div>' +
    columnsHtml +
    afterHtml +
    '<div class="sp-actions">' +
    '<button class="sp-btn-play" id="btn-play-again">Play Again</button>' +
    '<button class="sp-btn-quit" id="btn-quit-to-menu">Main Menu</button>' +
    '</div>' +
    archiveHtml +
    '</div>' +
    '</div>'
  );
}

function initEndgameScreen() {
  function goMenu() {
    State.gameState = null;
    State.lastReport = null;
    api('list_slots').then(function (slots) {
      State.slots = slots;
      Router.go('menu', { slots: slots, selectedSlot: State.selectedSlot || 1 });
    }).catch(function () {
      Router.go('menu', { slots: [], selectedSlot: State.selectedSlot || 1 });
    });
  }
  var play = document.getElementById('btn-play-again');
  if (play) play.addEventListener('click', goMenu);
  var back = document.getElementById('btn-endgame-back');
  if (back) back.addEventListener('click', goMenu);
  var quit = document.getElementById('btn-quit-to-menu');
  if (quit) quit.addEventListener('click', goMenu);

  var scoreEl = document.querySelector('.sp-stamp-score');
  if (scoreEl) {
    var target = parseInt(scoreEl.textContent, 10) || 0;
    var startTime = null;
    var duration = 1100;
    scoreEl.textContent = '0';
    function animateScore(ts) {
      if (!startTime) startTime = ts;
      var progress = Math.min((ts - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      scoreEl.textContent = Math.round(eased * target);
      if (progress < 1) requestAnimationFrame(animateScore);
    }
    setTimeout(function () { requestAnimationFrame(animateScore); }, 650);
  }
}

function renderBreakingNewsScreen(event) {
  var ev = event || {};
  var headline = _breakingHeadline(ev);
  var paragraphs = _breakingNarrativeParagraphs(ev);
  var effectLine = _breakingEffectLine(ev);
  var bodyHtml = paragraphs.length
    ? paragraphs.map(function (p) { return '<p class="breaking-body-text">' + _escapeHtml(p) + '</p>'; }).join('')
    : '<p class="breaking-body-text">Major developments are unfolding this week.</p>';
  return (
    '<div class="breaking-overlay screen-enter">' +
    '<div class="breaking-card">' +
    '<div class="breaking-news-headline">BREAKING NEWS</div>' +
    '<div class="breaking-label">' + _escapeHtml(headline) + '</div>' +
    '<div class="breaking-body">' + bodyHtml + '</div>' +
    (effectLine ? '<div class="breaking-effect-line">Effect: ' + _escapeHtml(effectLine) + '</div>' : '') +
    '<button class="btn btn--primary" id="btn-breaking-to-results">Continue \u2192</button>' +
    '</div>' +
    '</div>'
  );
}

function initBreakingNewsScreen() {
  var btn = document.getElementById('btn-breaking-to-results');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var queue = State.pendingBreakingQueue || [];
    if (queue.length > 1) {
      queue.shift();
      State.pendingBreakingQueue = queue;
      Router.go('breaking_news', { event: queue[0], index: 0, total: queue.length });
      return;
    }

    State.pendingBreakingQueue = null;
    var next = State.pendingScreen;
    State.pendingScreen = null;
    if (next && next.id) {
      Router.go(next.id, next.data || {});
      return;
    }
    Router.go('results', { report: State.lastReport });
  });
}

function _recruitingMomentumBadge(momentum) {
  if (momentum === 'up') {
    return '<div class="recruiting-momentum recruiting-momentum--up">Trending Up</div>';
  }
  if (momentum === 'down') {
    return '<div class="recruiting-momentum recruiting-momentum--down">Interest Cooling</div>';
  }
  return '';
}

function renderRecruitingInterstitial(beat) {
  var data = beat || {};
  var isFinale = data.beat_id === 'finale';
  var offers = data.offers || [];
  var finaleHasChoices = isFinale && offers.length > 0;
  var athlete = (State.gameState && State.gameState.athlete) || {};
  var seasonContext = isFinale
    ? (seasonLabel(athlete.year || 4) + ' \u00B7 Week ' + (athlete.week || 1))
    : '';
  var offersHtml = '';
  var schoolsHtml = '';
  if (finaleHasChoices) {
    offersHtml = offers.map(function (offer, index) {
      return (
        '<button class="recruiting-offer-card" data-recruiting-offer="' + index + '">' +
        '<div class="recruiting-offer-school">' + _escapeHtml(offer.school || '') + '</div>' +
        '<div class="recruiting-offer-meta">' +
        '<span class="recruiting-tier-badge recruiting-tier-badge--small">' + _escapeHtml(offer.tier_label || '') + '</span>' +
        '<span class="recruiting-offer-scholarship">' + _escapeHtml(offer.scholarship || '') + '</span>' +
        '</div>' +
        '<div class="recruiting-offer-desc">' + _escapeHtml(offer.description || '') + '</div>' +
        '</button>'
      );
    }).join('');
  } else if (offers.length) {
    schoolsHtml = (
      '<div class="recruiting-school-list">' +
      offers.map(function (offer) {
        return '<span class="recruiting-school-pill">' + _escapeHtml(offer.school || '') + '</span>';
      }).join('') +
      '</div>'
    );
  }

  return (
    '<div class="recruiting-overlay screen-enter">' +
    '<div class="recruiting-card' + (isFinale ? ' recruiting-card--finale' : '') + '">' +
    (isFinale
      ? '<div class="recruiting-finale-header">' +
        '<span class="recruiting-finale-header-left">Official Recruiting Communication</span>' +
        '<span class="recruiting-finale-header-right">' + _escapeHtml(seasonContext) + '</span>' +
        '</div>'
      : '') +
    (isFinale ? '<div class="recruiting-finale-body">' : '') +
    '<div class="recruiting-kicker">' + (isFinale ? 'RECRUITING DECISION' : 'COLLEGE RECRUITING') + '</div>' +
    '<div class="recruiting-headline">' + _escapeHtml(data.headline || 'Recruiting Update') + '</div>' +
    (data.tier_label ? '<div class="recruiting-tier-row"><span class="recruiting-tier-badge">' + _escapeHtml(data.tier_label) + '</span>' + _recruitingMomentumBadge(data.momentum) + '</div>' : '') +
    '<div class="recruiting-body">' +
    (isFinale
      ? '<p class="recruiting-body-text">' + _escapeHtml(data.preamble || '') + '</p>'
      : '<p class="recruiting-body-text">' + _escapeHtml(data.text || '') + '</p>') +
    schoolsHtml +
    '</div>' +
    (finaleHasChoices
      ? '<div class="recruiting-offers-wrap">' + offersHtml + '</div>' +
        '<div class="recruiting-finale-footer">' +
        '<span class="recruiting-finale-sig">From the desk of your coach</span>' +
        '<div class="recruiting-confirm hidden" id="recruiting-confirm-box">' +
        '<div class="recruiting-confirm-text" id="recruiting-confirm-text"></div>' +
        '<div class="recruiting-confirm-actions">' +
        '<button class="btn btn--secondary" id="btn-recruiting-cancel">Cancel</button>' +
        '<button class="btn btn--primary" id="btn-recruiting-confirm">Confirm Choice</button>' +
        '</div>' +
        '</div>' +
        '</div>'
      : (isFinale
          ? '<div class="recruiting-finale-footer">' +
            '<span class="recruiting-finale-sig">From the desk of your coach</span>' +
            '<button class="btn btn--primary" id="btn-recruiting-continue">Continue \u2192</button>' +
            '</div>'
          : '<button class="btn btn--primary" id="btn-recruiting-continue">Continue \u2192</button>')) +
    (isFinale ? '</div>' : '') +
    '</div>' +
    '</div>'
  );
}

function initRecruitingInterstitial(data) {
  var beat = (data && data.beat) || {};
  if (beat.beat_id !== 'finale' || !(beat.offers || []).length) {
    var continueBtn = document.getElementById('btn-recruiting-continue');
    if (!continueBtn) return;
    continueBtn.addEventListener('click', async function () {
      if (beat.beat_id === 'finale') {
        try {
          var finalRes = await api('finalize_career');
          State.gameState = finalRes.game_state;
          State.hof = finalRes.hof || { entries: [] };
          Router.go('endgame', { endgame: finalRes.endgame, hof: State.hof });
        } catch (e) {
          showError('Failed to finalize career: ' + e);
        }
        return;
      }
      var queuedBreaking = State.pendingBreakingQueue || [];
      if (queuedBreaking.length) {
        Router.go('breaking_news', { event: queuedBreaking[0], index: 0, total: queuedBreaking.length });
        return;
      }
      var next = State.pendingScreen;
      State.pendingScreen = null;
      if (next && next.id) {
        Router.go(next.id, next.data || {});
        return;
      }
      Router.go('training');
    });
    return;
  }

  var selectedIndex = null;
  var confirmBox = document.getElementById('recruiting-confirm-box');
  var confirmText = document.getElementById('recruiting-confirm-text');
  var confirmBtn = document.getElementById('btn-recruiting-confirm');
  var cancelBtn = document.getElementById('btn-recruiting-cancel');

  document.querySelectorAll('[data-recruiting-offer]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-recruiting-offer]').forEach(function (node) {
        node.classList.remove('recruiting-offer-card--selected');
      });
      btn.classList.add('recruiting-offer-card--selected');
      selectedIndex = parseInt(btn.dataset.recruitingOffer, 10);
      var offer = (beat.offers || [])[selectedIndex] || {};
      if (confirmText) {
        confirmText.textContent = 'You have chosen ' + (offer.school || 'this school') + '. This is final.';
      }
      if (confirmBox) confirmBox.classList.remove('hidden');
    });
  });

  if (cancelBtn) {
    cancelBtn.addEventListener('click', function () {
      selectedIndex = null;
      document.querySelectorAll('[data-recruiting-offer]').forEach(function (node) {
        node.classList.remove('recruiting-offer-card--selected');
      });
      if (confirmBox) confirmBox.classList.add('hidden');
    });
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', async function () {
      if (selectedIndex == null) return;
      confirmBtn.disabled = true;
      try {
        var choiceRes = await api('select_recruiting_offer', selectedIndex);
        State.gameState = choiceRes.game_state;
        var finalRes = await api('finalize_career');
        State.gameState = finalRes.game_state;
        State.hof = finalRes.hof || { entries: [] };
        Router.go('endgame', { endgame: finalRes.endgame, hof: State.hof });
      } catch (e) {
        confirmBtn.disabled = false;
        showError('Failed to save recruiting choice: ' + e);
      }
    });
  }
}

function renderTutorialScreen(config) {
  var cfg = config || {};
  var groups = cfg.event_groups || {};

  var groupTags = Object.keys(groups).map(function (g) {
    return '<span class="htp-tag">' + _escapeHtml(g) + '</span>';
  }).join('');

  var es = cfg.energy_system || {};
  var lowThreshold = es.low_energy_threshold != null ? es.low_energy_threshold : 35;
  var veryLowThreshold = es.very_low_energy_threshold != null ? es.very_low_energy_threshold : 20;

  return (
    '<div class="screen screen-tutorial screen-enter">' +
    '<div class="htp-header">' +
    '<div><h1 class="htp-title">How to <span class="htp-title-accent">Play</span></h1>' +
    '<span class="htp-subtitle">Track Star Field Guide</span></div>' +
    '<button class="btn btn--secondary" id="btn-tutorial-back">Back to Menu</button>' +
    '</div>' +
    '<div class="htp-guide">' +
    '<nav class="htp-chapters" aria-label="Field guide chapters" role="tablist">' +
    '<div class="htp-chapters-label">Chapters</div>' +
    '<button class="htp-chapter-btn htp-chapter-btn--active" data-htp-chapter="career" role="tab" aria-selected="true"><span>01</span>Career</button>' +
    '<button class="htp-chapter-btn" data-htp-chapter="athlete" role="tab" aria-selected="false"><span>02</span>Your Athlete</button>' +
    '<button class="htp-chapter-btn" data-htp-chapter="week" role="tab" aria-selected="false"><span>03</span>Race Week</button>' +
    '<button class="htp-chapter-btn" data-htp-chapter="championships" role="tab" aria-selected="false"><span>04</span>Championships</button>' +
    '<button class="htp-chapter-btn" data-htp-chapter="legacy" role="tab" aria-selected="false"><span>05</span>Rivals &amp; Legacy</button>' +
    '</nav>' +
    '<div class="htp-article-wrap">' +

    '<article class="htp-article htp-article--active" data-htp-panel="career" role="tabpanel">' +
    '<div class="htp-article-kicker">Chapter 01</div>' +
    '<h2 class="htp-article-title">Build a four-year career</h2>' +
    '<p class="htp-lede">You play as a high school track &amp; field athlete across <strong>four seasons</strong>. Every week is a decision between developing your athlete now and preserving enough energy to perform when the meets matter.</p>' +
    '<div class="htp-flow" aria-label="Career loop">' +
    '<div class="htp-flow-step"><span>01</span><strong>Train</strong><small>Develop stats</small></div><i>&rarr;</i>' +
    '<div class="htp-flow-step"><span>02</span><strong>Compete</strong><small>Post results</small></div><i>&rarr;</i>' +
    '<div class="htp-flow-step"><span>03</span><strong>Qualify</strong><small>Earn your place</small></div><i>&rarr;</i>' +
    '<div class="htp-flow-step"><span>04</span><strong>Advance</strong><small>Chase a legacy</small></div>' +
    '</div>' +
    '<div class="htp-rule-list">' +
    '<div class="htp-rule"><span>Build your athlete</span><p>Choose a competition category, event group, and difficulty. Difficulty sets your starting point budget; your group gives bonuses to its primary stats.</p></div>' +
    '<div class="htp-rule"><span>Own the tradeoffs</span><p>Training improves the future, racing spends energy in the present, and qualification determines which stages you reach.</p></div>' +
    '<div class="htp-rule"><span>Finish the story</span><p>After senior year, your personal bests, championship performances, achievements, and recruiting determine the career you leave behind.</p></div>' +
    '</div>' +
    '</article>' +

    '<article class="htp-article" data-htp-panel="athlete" role="tabpanel" hidden>' +
    '<div class="htp-article-kicker">Chapter 02</div>' +
    '<h2 class="htp-article-title">Know what makes you fast</h2>' +
    '<p class="htp-lede">Every event reads a different combination of eight stats. Your event group defines your natural strengths, but you decide how specialized or balanced your athlete becomes.</p>' +
    '<div class="htp-stat-sheet">' +
    '<div><strong>Speed</strong><span>Raw pace</span></div><div><strong>Agility</strong><span>Movement and control</span></div>' +
    '<div><strong>Strength</strong><span>Force and power</span></div><div><strong>Stamina</strong><span>Sustained effort</span></div>' +
    '<div><strong>Toughness</strong><span>Handles physical strain</span></div><div><strong>Mentality</strong><span>Performs under pressure</span></div>' +
    '<div><strong>Technique</strong><span>Consistency and execution</span></div><div><strong>Recovery</strong><span>Restores weekly energy</span></div>' +
    '</div>' +
    '<div class="htp-subsection"><div class="htp-section-title">Event groups</div>' +
    '<p>Each group has its own events and primary stats. Choose the specialty that matches how you want to play.</p>' +
    '<div class="htp-tags">' + groupTags + '</div></div>' +
    '<div class="htp-subsection htp-energy-guide"><div class="htp-section-title">Energy is your weekly budget</div>' +
    '<div class="htp-energy-scale"><span class="htp-energy-safe" style="flex:' + (100 - lowThreshold) + '">Ready</span><span class="htp-energy-low" style="flex:' + (lowThreshold - veryLowThreshold) + '">Low</span><span class="htp-energy-danger" style="flex:' + veryLowThreshold + '">Critical</span></div>' +
    '<div class="htp-energy-labels"><span>100</span><span>Below ' + lowThreshold + ': penalties and more injury risk</span><span>Below ' + veryLowThreshold + ': severe penalties</span><span>0</span></div>' +
    '<p><strong>Recovery Run</strong> restores energy and bye weeks help, but low energy can compromise both results and health.</p></div>' +
    '</article>' +

    '<article class="htp-article" data-htp-panel="week" role="tabpanel" hidden>' +
    '<div class="htp-article-kicker">Chapter 03</div>' +
    '<h2 class="htp-article-title">Plan the week, then run it</h2>' +
    '<p class="htp-lede">A normal week moves from training into race setup, then results. The key decision is how much energy to invest at each step.</p>' +
    '<div class="htp-week-line">' +
    '<div><span>Mon&ndash;Fri</span><strong>Choose training</strong></div><i></i><div><span>Meet setup</span><strong>Enter events</strong></div><i></i><div><span>Race day</span><strong>Set effort</strong></div><i></i><div><span>Afterward</span><strong>Review results</strong></div>' +
    '</div>' +
    '<div class="htp-rule-list">' +
    '<div class="htp-rule"><span>Training</span><p>Choose up to <strong>five sessions</strong>: two universal sessions and three from your discipline. The fourth and fifth sessions cost extra. Recovery Run must be taken alone.</p></div>' +
    '<div class="htp-rule"><span>Multiple events</span><p>You may enter more than one event when eligible, but every additional event increases the meet\'s total energy cost.</p></div>' +
    '</div>' +
    '<div class="htp-subsection"><div class="htp-section-title">Race strategy throttle</div>' +
    '<div class="htp-strategy-scale"><span>Take It Easy</span><i></i><span>Compete to Win</span><i></i><span>All Out Effort</span></div>' +
    '<div class="htp-strategy-notes"><span>Lower cost<br>Lower ceiling</span><span>Balanced risk<br>Current fitness</span><span>Higher ceiling<br>More risk</span></div>' +
    '<p>Harder efforts raise your ceiling but add variance, energy cost, and injury risk. Easier efforts protect both your result and your legs.</p></div>' +
    '</article>' +

    '<article class="htp-article" data-htp-panel="championships" role="tabpanel" hidden>' +
    '<div class="htp-article-kicker">Chapter 04</div>' +
    '<h2 class="htp-article-title">Earn all four championship stages</h2>' +
    '<p class="htp-lede">After eight league meets and the Club Championship qualifier, the postseason has <strong>four championships</strong>: Class, State, Regional, and National.</p>' +
    '<div class="htp-championship-ladder" aria-label="Championship ladder">' +
    '<div class="htp-qualifier"><span>Qualifier</span><strong>Club Championship</strong><small>Earn entry to Class</small></div><i>&rarr;</i>' +
    '<div class="htp-champ-step"><span>01</span><strong>Class</strong></div><i>&rarr;</i>' +
    '<div class="htp-champ-step"><span>02</span><strong>State</strong></div><i>&rarr;</i>' +
    '<div class="htp-champ-step"><span>03</span><strong>Regional</strong></div><i>&rarr;</i>' +
    '<div class="htp-champ-step"><span>04</span><strong>National</strong></div>' +
    '</div>' +
    '<div class="htp-championship-count"><strong>4</strong><span>championship stages<br>every season</span></div>' +
    '<div class="htp-rule-list">' +
    '<div class="htp-rule"><span>How qualification works</span><p>Finish high enough at the previous stage or hit the qualifying standard at any eligible meet. You do not advance automatically.</p></div>' +
    '<div class="htp-rule"><span>Missing the cut</span><p>If you do not qualify for a stage, you sit that championship out. Qualification resets at the start of every season.</p></div>' +
    '<div class="htp-rule"><span>Why championships matter</span><p>Class, State, Regional, and National results award championship points that feed directly into your final career rating.</p></div>' +
    '</div>' +
    '</article>' +

    '<article class="htp-article" data-htp-panel="legacy" role="tabpanel" hidden>' +
    '<div class="htp-article-kicker">Chapter 05</div>' +
    '<h2 class="htp-article-title">Race people, not just the clock</h2>' +
    '<p class="htp-lede">Named competitors return across seasons and improve with you. Two meetings spark a rivalry; repeated results determine whether it intensifies or cools.</p>' +
    '<div class="htp-rival-progression"><span>First meeting</span><i>&rarr;</i><span>Rival</span><i>&rarr;</i><span>Fierce Rival</span><i>&rarr;</i><span>Nemesis</span></div>' +
    '<div class="htp-rule-list">' +
    '<div class="htp-rule"><span>Rival dossier</span><p>Select a rival to inspect the head-to-head record, match history, projected marks, and scouting report.</p></div>' +
    '<div class="htp-rule"><span>Career score</span><p>Your final rating combines <strong>Personal Bests + Championship Performance + Achievements</strong>.</p></div>' +
    '<div class="htp-rule"><span>Recruiting and Hall of Fame</span><p>Senior-year recruiting determines your next chapter. Exceptional completed careers are recorded in the Hall of Fame so future runs have a target.</p></div>' +
    '</div>' +
    '<div class="htp-score-formula"><span>PBs</span><b>+</b><span>Championships</span><b>+</b><span>Achievements</span><b>=</b><strong>Legacy</strong></div>' +
    '</article>' +

    '</div>' +
    '</div>' +
    '</div>'
  );
}

function initTutorialScreen() {
  var chapterButtons = Array.prototype.slice.call(document.querySelectorAll('[data-htp-chapter]'));
  var chapterPanels = Array.prototype.slice.call(document.querySelectorAll('[data-htp-panel]'));

  function activateChapter(id, focusButton) {
    chapterButtons.forEach(function (button) {
      var active = button.getAttribute('data-htp-chapter') === id;
      button.classList.toggle('htp-chapter-btn--active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.setAttribute('tabindex', active ? '0' : '-1');
      if (active && focusButton) button.focus();
    });
    chapterPanels.forEach(function (panel) {
      var active = panel.getAttribute('data-htp-panel') === id;
      panel.classList.toggle('htp-article--active', active);
      panel.hidden = !active;
    });
    var wrap = document.querySelector('.htp-article-wrap');
    if (wrap) wrap.scrollTop = 0;
  }

  chapterButtons.forEach(function (button, index) {
    button.addEventListener('click', function () {
      activateChapter(button.getAttribute('data-htp-chapter'), false);
    });
    button.addEventListener('keydown', function (event) {
      var nextIndex = index;
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = (index + 1) % chapterButtons.length;
      else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') nextIndex = (index - 1 + chapterButtons.length) % chapterButtons.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = chapterButtons.length - 1;
      else return;
      event.preventDefault();
      activateChapter(chapterButtons[nextIndex].getAttribute('data-htp-chapter'), true);
    });
  });

  activateChapter('career', false);

  var btn = document.getElementById('btn-tutorial-back');
  if (!btn) return;
  btn.addEventListener('click', async function () {
    var slots = [];
    try {
      slots = await api('list_slots');
      State.slots = slots;
    } catch (e) { /* ignore */ }
    Router.go('menu', { slots: slots, selectedSlot: State.selectedSlot || 1 });
  });
}

var PreseasonScreen = {
  render: function () {
    return renderPreseasonScreen(State.gameState, State.config, State.world);
  },
  init: function () {
    initPreseasonScreen();
  },
};

var SeasonSummaryScreen = {
  render: function (data) {
    var d = data || {};
    return renderSeasonSummaryScreen(State.gameState, State.config, State.world, d.goals || (((State.gameState || {}).current_season || {}).goals_evaluated || []));
  },
  init: function () {
    initSeasonSummaryScreen();
  },
};

var OffseasonScreen = {
  render: function () {
    return renderOffseasonScreen(State.gameState, State.config);
  },
  init: function () {
    initOffseasonScreen();
  },
};

var EndgameScreen = {
  render: function (data) {
    return renderEndgameScreen((data && data.endgame) || {}, State.gameState, State.config, (data && data.hof) || State.hof || { entries: [] });
  },
  init: function () {
    initEndgameScreen();
  },
};

var HofScreen = {
  render: function (data) {
    return renderHofScreen((data && data.hof) || State.hof || { entries: [] });
  },
  init: function () {
    initHofScreen();
  },
};

var BreakingNewsScreen = {
  render: function (data) {
    return renderBreakingNewsScreen((data && data.event) || {});
  },
  init: function () {
    initBreakingNewsScreen();
  },
};

var RecruitingInterstitialScreen = {
  render: function (data) {
    return renderRecruitingInterstitial((data && data.beat) || {});
  },
  init: function (data) {
    initRecruitingInterstitial(data || {});
  },
};

var TutorialScreen = {
  render: function () {
    return renderTutorialScreen(State.config);
  },
  init: function () {
    initTutorialScreen();
  },
};

// ---------------------------------------------------------------------------
// Settings screen
// ---------------------------------------------------------------------------
function renderSettingsScreen() {
  var slots = State.slots || [];
  var slotRowsHtml = slots.map(function (s) {
    if (s.empty) {
      return (
        '<div class="settings-slot-row" data-slot="' + Number(s.slot) + '">' +
        '<div class="settings-slot-row-main">' +
        '<span class="settings-slot-label settings-slot-label--empty">Slot ' + Number(s.slot) + ' \u2014 Empty</span>' +
        '</div>' +
        '</div>'
      );
    }
    var label = _escapeHtml('Slot ' + s.slot + ' \u00B7 ' + (s.name || 'Unnamed') + ' \u00B7 Year ' + s.year + ' Wk ' + s.week);
    return (
      '<div class="settings-slot-row" data-slot="' + Number(s.slot) + '">' +
      '<div class="settings-slot-row-main">' +
      '<span class="settings-slot-label">' + label + '</span>' +
      '<button class="settings-slot-delete-btn" data-slot-delete="' + Number(s.slot) + '">DELETE</button>' +
      '</div>' +
      '<div class="settings-slot-confirm" id="settings-slot-confirm-' + Number(s.slot) + '" style="display:none;">' +
      '<span class="settings-slot-confirm-text">Delete ' + _escapeHtml(s.name || 'this') + '\'s career? This cannot be undone.</span>' +
      '<div class="settings-slot-confirm-actions">' +
      '<button class="settings-slot-confirm-yes" data-slot-confirm="' + Number(s.slot) + '">CONFIRM</button>' +
      '<button class="settings-slot-confirm-no" data-slot-cancel="' + Number(s.slot) + '">CANCEL</button>' +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }).join('');

  return (
    '<div class="screen screen-settings screen-enter">' +
    '<div class="heading-lg">Settings</div>' +
    '<div class="settings-section">' +
    '<div class="settings-section-header">Display</div>' +
    '<div class="settings-row">' +
    '<span class="settings-row-label">SKIP RACE ANIMATION</span>' +
    '<label class="settings-toggle"><input type="checkbox" id="settings-skip-animation"' + (State.skipRaceAnimation ? ' checked' : '') + '><span class="settings-toggle-track"></span></label>' +
    '</div>' +
    '<div class="settings-row">' +
    '<span class="settings-row-label">FULLSCREEN (F11)</span>' +
    '<label class="settings-toggle"><input type="checkbox" id="settings-fullscreen"><span class="settings-toggle-track"></span></label>' +
    '</div>' +
    '<div class="settings-row">' +
    '<span class="settings-row-label">MAIN MENU (ESC)</span>' +
    '<span class="settings-row-value">Available on every in-game screen</span>' +
    '</div>' +
    '<div class="settings-row">' +
    '<span class="settings-row-label">QUIT GAME (CTRL+Q)</span>' +
    '<span class="settings-row-value">Closes the desktop app immediately</span>' +
    '</div>' +
    '</div>' +
    '<div class="settings-section">' +
    '<div class="settings-section-header">Saves</div>' +
    '<div class="settings-slot-list">' + slotRowsHtml + '</div>' +
    '</div>' +
    '<div class="screen-actions"><button class="btn btn--secondary" id="btn-settings-back">Back to Menu</button></div>' +
    '</div>'
  );
}

function initSettingsScreen() {
  var backBtn = document.getElementById('btn-settings-back');
  if (backBtn) {
    backBtn.addEventListener('click', function () {
      Router.go('menu', { slots: State.slots || [], selectedSlot: State.selectedSlot || 1 });
    });
  }

  var skipToggle = document.getElementById('settings-skip-animation');
  if (skipToggle) {
    skipToggle.addEventListener('change', function () {
      _saveSkipRaceAnimation(!!skipToggle.checked);
    });
  }

  var fsToggle = document.getElementById('settings-fullscreen');
  if (fsToggle) {
    fsToggle.addEventListener('change', function () {
      if (typeof pywebview !== 'undefined' && pywebview.api) {
        pywebview.api.toggle_fullscreen();
      }
    });
  }

  document.querySelectorAll('[data-slot-delete]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var slot = parseInt(btn.dataset.slotDelete, 10);
      var confirm = document.getElementById('settings-slot-confirm-' + slot);
      if (confirm) confirm.style.display = 'flex';
    });
  });

  document.querySelectorAll('[data-slot-cancel]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var slot = parseInt(btn.dataset.slotCancel, 10);
      var confirm = document.getElementById('settings-slot-confirm-' + slot);
      if (confirm) confirm.style.display = 'none';
    });
  });

  document.querySelectorAll('[data-slot-confirm]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      var slot = parseInt(btn.dataset.slotConfirm, 10);
      btn.disabled = true;
      try {
        var result = await api('delete_slot', slot);
        State.slots = result.slots || [];
        Router.go('settings');
      } catch (e) {
        showError('Failed to delete save: ' + e);
        btn.disabled = false;
      }
    });
  });
}

var SettingsScreen = {
  render: function () {
    return renderSettingsScreen();
  },
  init: function () {
    initSettingsScreen();
  },
};

// ---------------------------------------------------------------------------
// Rival Dossier Modal
// ---------------------------------------------------------------------------
function _openRivalDossier(npcId) {
  api('get_rival_dossier', npcId).then(function (dossier) {
    _renderDossierModal(dossier);
  }).catch(function (err) {
    showError('Could not load rival dossier: ' + err);
  });
}

function _renderDossierModal(d) {
  var existing = document.getElementById('dossier-overlay');
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

  var wins       = d.wins || 0;
  var losses     = d.losses || 0;
  var encounters = d.encounters || 0;
  var streak     = d.streak || 0;
  var matchLog   = d.match_log || [];
  var firstName  = (d.name || '').split(' ')[0] || 'Rival';
  var isFemale   = (d.competition_category || 'men') === 'women';
  var rivalPron  = isFemale ? 'HER' : 'HIM';
  var discipline = (d.events || []).slice(0, 3).join(' / ');

  var rivalLeads  = losses < wins ? false : losses > wins;
  var tied        = wins === losses && encounters > 0;
  var leadSubline = tied
    ? 'series is tied'
    : (rivalLeads
        ? _escapeHtml(firstName) + ' leads the rivalry'
        : 'you lead the rivalry');

  var rivalLabels = ((State.config || {}).rivalry_system || {}).rivalry_level_labels || {};
  var levelLabel  = d.level_label || rivalLabels[String(d.level)] || '';
  var pillHtml = levelLabel
    ? '<span class="dossier-nemesis-pill">&#9733; ' + _escapeHtml(levelLabel) + '</span>'
    : '';

  var stripEntries = matchLog.slice(-16);
  var momentumHtml = '';
  if (stripEntries.length) {
    momentumHtml =
      '<div class="dossier-momentum-header">' +
      '<span class="dossier-momentum-label">FIRST MEET</span>' +
      '<span class="dossier-momentum-label">LATEST</span>' +
      '</div>' +
      '<div class="dossier-momentum">' +
      stripEntries.map(function (m) {
        var sc = m.outcome === 'win' ? 'dossier-momentum__seg--win'
          : (m.outcome === 'loss' ? 'dossier-momentum__seg--loss' : 'dossier-momentum__seg--tie');
        return '<div class="dossier-momentum__seg ' + sc + '"></div>';
      }).join('') +
      '</div>';
  }

  var amberHtml = '';
  var flavorLine = (d.flavor_lines || [])[0] || '';
  if (flavorLine) {
    amberHtml = '<div class="dossier-amber-callout">&#9888;&#65038; ' + _escapeHtml(flavorLine) + '</div>';
  } else if (streak !== 0) {
    var streakDesc = streak > 0
      ? 'You\'ve won ' + streak + ' in a row.'
      : firstName + ' has won ' + Math.abs(streak) + ' straight.';
    amberHtml = '<div class="dossier-amber-callout">&#9888;&#65038; ' + _escapeHtml(streakDesc) + '</div>';
  }

  var bioText = d.dossier_bio || d.bio || '';
  var bioHtml = bioText
    ? '<div class="dossier-section">' +
      '<div class="label-xs dossier-section-label">SCOUTING REPORT</div>' +
      '<div class="dossier-bio">' + _escapeHtml(bioText) + '</div>' +
      '</div>'
    : '';

  var matchLogHtml = '';
  if (matchLog.length) {
    var logEntries = matchLog.slice().reverse().slice(0, 20);
    matchLogHtml =
      '<div class="dossier-match-log">' +
      '<div class="dossier-match-log__header">' +
      '<span class="label-xs">MATCH HISTORY</span>' +
      '<span class="label-xs dossier-match-log__mark-hdr">YOUR MARK vs ' + rivalPron + '\'S</span>' +
      '</div>' +
      logEntries.map(function (m) {
        var isWon  = m.outcome === 'win';
        var isLost = m.outcome === 'loss';
        var resultClass = isWon ? 'dossier-result-tag--won'
          : (isLost ? 'dossier-result-tag--lost' : 'dossier-result-tag--tie');
        var resultLabel = isWon ? 'WON' : (isLost ? 'LOST' : 'TIED');
        var meetName = meetLabel(m.meet_type || '');
        var mkind = m.mark_kind || 'time';

        var barsHtml = '';
        var pm = m.player_mark;
        var rm = m.rival_mark;
        if (pm != null && rm != null && pm > 0 && rm > 0) {
          var isTime = mkind === 'time';
          var pPct, rPct;
          if (isTime) {
            var mn = Math.min(pm, rm);
            pPct = Math.round(mn / pm * 100);
            rPct = Math.round(mn / rm * 100);
          } else {
            var mx = Math.max(pm, rm);
            pPct = Math.round(pm / mx * 100);
            rPct = Math.round(rm / mx * 100);
          }
          var pBarClass = isWon ? 'dossier-bar__fill--won' : 'dossier-bar__fill--muted';
          var rBarClass = isLost ? 'dossier-bar__fill--lost' : 'dossier-bar__fill--muted';
          barsHtml =
            '<div class="dossier-bars">' +
            '<div class="dossier-bar-row">' +
            '<span class="dossier-bar__who">YOU</span>' +
            '<div class="dossier-bar__track"><div class="dossier-bar__fill ' + pBarClass + '" style="width:' + pPct + '%"></div></div>' +
            '<span class="dossier-bar__mark">' + _escapeHtml(_formatResultValue(mkind, pm)) + '</span>' +
            '</div>' +
            '<div class="dossier-bar-row">' +
            '<span class="dossier-bar__who">' + rivalPron + '</span>' +
            '<div class="dossier-bar__track"><div class="dossier-bar__fill ' + rBarClass + '" style="width:' + rPct + '%"></div></div>' +
            '<span class="dossier-bar__mark">' + _escapeHtml(_formatResultValue(mkind, rm)) + '</span>' +
            '</div>' +
            '</div>';
        }

        var placesText = 'YOU ' + _ordinal(m.player_place) + ' · ' + rivalPron + ' ' + _ordinal(m.rival_place);

        return (
          '<div class="dossier-match-row">' +
          '<div class="dossier-match-row__left">' +
          '<div class="dossier-match-row__event">' + _escapeHtml(m.event || '') + '</div>' +
          '<div class="dossier-match-row__meet">Y' + (m.year || '?') + ' W' + (m.week || '?') + ' · ' + _escapeHtml(meetName) + '</div>' +
          '</div>' +
          barsHtml +
          '<div class="dossier-match-row__result">' +
          '<span class="dossier-result-tag ' + resultClass + '">' + resultLabel + '</span>' +
          '<div class="dossier-result-places">' + _escapeHtml(placesText) + '</div>' +
          '</div>' +
          '</div>'
        );
      }).join('') +
      '</div>';
  }

  var html =
    '<div class="dossier-overlay" id="dossier-overlay">' +
    '<div class="dossier-modal">' +

    '<div class="dossier-header">' +
    '<div>' +
    '<div class="dossier-header__name">' + _escapeHtml(d.name || 'Unknown') + '</div>' +
    '<div class="dossier-header__sub">' + _escapeHtml(d.team || '') + (discipline ? ' · ' + _escapeHtml(discipline) : '') + '</div>' +
    '</div>' +
    pillHtml +
    '</div>' +

    '<div class="dossier-hero">' +
    '<div class="dossier-hero__left">' +
    '<div class="dossier-hero__record-label">RECORD VS YOU</div>' +
    '<div class="dossier-score">' +
    '<span class="dossier-score__wins">' + wins + '</span>' +
    '<span class="dossier-score__dash">–</span>' +
    '<span class="dossier-score__losses">' + losses + '</span>' +
    '</div>' +
    '<div class="dossier-hero__sublabel">' + leadSubline + '</div>' +
    '</div>' +
    '<div class="dossier-hero__right">' +
    momentumHtml +
    amberHtml +
    '</div>' +
    '</div>' +

    bioHtml +
    matchLogHtml +

    '<div class="dossier-actions">' +
    '<button class="dossier-btn-secondary" id="dossier-close-btn">Close</button>' +
    '<button class="dossier-btn-primary" id="dossier-settle-btn">Settle It Next Race &#8594;</button>' +
    '</div>' +

    '</div>' +
    '</div>';

  var container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container.firstChild);

  var overlay = document.getElementById('dossier-overlay');

  function _closeDossier() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  var closeBtn   = document.getElementById('dossier-close-btn');
  var settleBtn  = document.getElementById('dossier-settle-btn');
  if (closeBtn)  closeBtn.addEventListener('click', _closeDossier);
  if (settleBtn) settleBtn.addEventListener('click', _closeDossier);
  if (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) _closeDossier();
    });
  }
}

function _renderRecordBookModal(data) {
  var records = (data && data.records) || {};
  var pbs = (data && data.personal_bests) || {};
  var events = (data && data.events) || [];
  var category = (data && data.category) || 'men';

  function _fmtRecord(entry, ev) {
    if (!entry) return '<span class="text-muted">—</span>';
    var kind = entry.kind || 'time';
    var val = _formatResultValue(kind, entry.value);
    var holder = _escapeHtml(entry.holder || '');
    var yr = _escapeHtml(entry.year_str || '');
    return _escapeHtml(val) + ' <span class="record-holder">(' + holder + ', ' + yr + ')</span>';
  }

  function _fmtPb(ev) {
    var pb = pbs[ev];
    if (pb == null) return '<span class="text-muted">No PB yet</span>';
    var kind = (records.school || {})[category] && ((records.school[category][ev] || {}).kind) || 'time';
    return _escapeHtml(_formatResultValue(kind, pb));
  }

  function _eventRows(recMap) {
    if (!events.length) return '<div class="label-sm">No events.</div>';
    return events.map(function (ev) {
      var entry = (recMap || {})[ev];
      return '<div class="record-book-row">' +
        '<span class="record-book-row__event">' + _escapeHtml(ev) + '</span>' +
        '<span class="record-book-row__mark">' + _fmtRecord(entry, ev) + '</span>' +
        '<span class="record-book-row__pb">PB: ' + _fmtPb(ev) + '</span>' +
        '</div>';
    }).join('');
  }

  var schoolRows = _eventRows((records.school || {})[category]);

  var champSections = [
    {key: 'class_meet',    label: 'Class Meet'},
    {key: 'state_meet',    label: 'State'},
    {key: 'regional_meet', label: 'Regionals'},
    {key: 'national_meet', label: 'Nationals'},
  ];
  var champHtml = champSections.map(function (s) {
    var recMap = ((records.championship || {})[s.key] || {})[category];
    return '<div class="record-book-tier">' +
      '<div class="record-book-tier__label">' + _escapeHtml(s.label) + '</div>' +
      _eventRows(recMap) +
      '</div>';
  }).join('');

  var html =
    '<div class="record-book-modal" id="record-book-modal">' +
    '<div class="record-book-modal__panel">' +
    '<div class="record-book-modal__header">' +
    '<div class="heading-lg">Record Book</div>' +
    '<button class="record-book-close" id="record-book-close-btn">&#x2715;</button>' +
    '</div>' +
    '<div class="record-book-section-label">SCHOOL RECORDS</div>' +
    '<div class="record-book-section">' + schoolRows + '</div>' +
    '<div class="record-book-section-label" style="margin-top:20px;">CHAMPIONSHIP RECORDS</div>' +
    '<div class="record-book-section">' + champHtml + '</div>' +
    '</div>' +
    '</div>';

  var existing = document.getElementById('record-book-modal');
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

  var container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container.firstChild);

  var modal = document.getElementById('record-book-modal');
  var closeBtn = document.getElementById('record-book-close-btn');

  function _closeModal() {
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
  }

  if (closeBtn) closeBtn.addEventListener('click', _closeModal);
  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) _closeModal();
    });
  }
}

function _openRecordBook() {
  api('get_records').then(function (data) {
    _renderRecordBookModal(data);
  }).catch(function (err) {
    showError('Could not load records: ' + err);
  });
}

var _rankingsView = { tab: 'league', event: null, data: null };
var _RANKINGS_YEAR_LABELS = { 1: 'Fr', 2: 'So', 3: 'Jr', 4: 'Sr' };

function _openRankingsModal() {
  api('get_rankings').then(function (data) {
    if (!data || !data.available) {
      showError('Rankings are not available for this save.');
      return;
    }
    _rankingsView.data = data;
    var events = data.events || [];
    if (!_rankingsView.event || events.indexOf(_rankingsView.event) === -1) {
      _rankingsView.event = events.length ? events[0] : null;
    }
    var tiers = data.tiers || [];
    if (tiers.indexOf(_rankingsView.tab) === -1) {
      _rankingsView.tab = tiers.length ? tiers[0] : 'league';
    }
    _renderRankingsModal();
  }).catch(function (err) {
    showError('Could not load rankings: ' + err);
  });
}

function _fmtRankingsMovement(movement) {
  if (movement == null || movement === 0) {
    return '<span class="rankings-row__move"></span>';
  }
  if (movement > 0) {
    return '<span class="rankings-row__move rankings-move--up">' + '\u25B2' + movement + '</span>';
  }
  return '<span class="rankings-row__move rankings-move--down">' + '\u25BC' + (-movement) + '</span>';
}

function _fmtRankingsRow(row, extraClass) {
  var classes = 'rankings-row' + (row.is_player ? ' rankings-row--player' : '') + (extraClass ? ' ' + extraClass : '');
  var yearLabel = _RANKINGS_YEAR_LABELS[row.class_year] || String(row.class_year || '');
  return '<div class="' + classes + '">' +
    '<span class="rankings-row__rank">#' + row.rank + '</span>' +
    '<span class="rankings-row__name">' + _escapeHtml(row.name) + (row.is_player ? ' <span class="rankings-you-tag">YOU</span>' : '') + '</span>' +
    '<span class="rankings-row__school">' + _escapeHtml(row.school || '') + '</span>' +
    '<span class="rankings-row__year">' + _escapeHtml(yearLabel) + '</span>' +
    '<span class="rankings-row__mark">' + _escapeHtml(_formatResultValue(row.kind || 'time', row.value)) + '</span>' +
    _fmtRankingsMovement(row.movement) +
    '</div>';
}

function _renderRankingsModal() {
  var data = _rankingsView.data || {};
  var tiers = data.tiers || [];
  var events = data.events || [];
  var tab = _rankingsView.tab;
  var event = _rankingsView.event;
  var board = ((data.boards || {})[event] || {})[tab] || { rows: [], pinned_player_row: null, player_nr: true, total: 0 };

  var tabsHtml = tiers.map(function (tier) {
    var selected = tier === tab ? ' rankings-tab--selected' : '';
    return '<button class="rankings-tab' + selected + '" data-rankings-tab="' + _escapeHtml(tier) + '">' + _escapeHtml(tier) + '</button>';
  }).join('');

  var eventToggleHtml = '';
  if (events.length > 1) {
    eventToggleHtml = '<div class="rankings-event-toggle">' + events.map(function (ev) {
      var selected = ev === event ? ' rankings-event-btn--selected' : '';
      return '<button class="rankings-event-btn' + selected + '" data-rankings-event="' + _escapeHtml(ev) + '">' + _escapeHtml(ev) + '</button>';
    }).join('') + '</div>';
  }

  var rowsHtml = (board.rows || []).map(function (row) {
    return _fmtRankingsRow(row, '');
  }).join('');
  if (!rowsHtml) {
    rowsHtml = '<div class="rankings-empty">No marks posted yet.</div>';
  }

  var footerHtml = '';
  if (board.pinned_player_row) {
    footerHtml = '<div class="rankings-pin-divider"></div>' + _fmtRankingsRow(board.pinned_player_row, 'rankings-row--pinned');
  } else if (board.player_nr) {
    footerHtml = '<div class="rankings-nr-note">You are NR \u2014 post a mark this season to enter the boards.</div>';
  }

  var metaHtml = 'Year ' + (data.year || 1) + ' \u00B7 Week ' + (data.week || 1) +
    (events.length === 1 ? ' \u00B7 ' + _escapeHtml(events[0]) : '');

  var html =
    '<div class="record-book-modal" id="rankings-modal">' +
    '<div class="record-book-modal__panel rankings-modal__panel">' +
    '<div class="record-book-modal__header">' +
    '<div class="heading-lg">Rankings</div>' +
    '<button class="record-book-close" id="rankings-close-btn">&#x2715;</button>' +
    '</div>' +
    '<div class="rankings-meta">' + metaHtml + '</div>' +
    '<div class="rankings-tabs">' + tabsHtml + '</div>' +
    eventToggleHtml +
    '<div class="record-book-section">' + rowsHtml + footerHtml + '</div>' +
    '</div>' +
    '</div>';

  var existing = document.getElementById('rankings-modal');
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

  var container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container.firstChild);

  var modal = document.getElementById('rankings-modal');
  var closeBtn = document.getElementById('rankings-close-btn');

  function _closeModal() {
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
  }

  if (closeBtn) closeBtn.addEventListener('click', _closeModal);
  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) {
        _closeModal();
        return;
      }
      var tier = e.target && e.target.getAttribute && e.target.getAttribute('data-rankings-tab');
      if (tier) {
        _rankingsView.tab = tier;
        _renderRankingsModal();
        return;
      }
      var ev = e.target && e.target.getAttribute && e.target.getAttribute('data-rankings-event');
      if (ev) {
        _rankingsView.event = ev;
        _renderRankingsModal();
      }
    });
  }
}

var _qualificationView = { tab: null };
var _QUAL_TIER_ORDER = ['class_meet', 'state_meet', 'regional_meet', 'national_meet'];
var _QUAL_TAB_LABELS = { class_meet: 'Class', state_meet: 'State', regional_meet: 'Regional', national_meet: 'National' };

function _qualStatusIcon(qualified) {
  return qualified
    ? '<span class="qual-modal-status qual-modal-status--yes">&#10003;</span>'
    : '<span class="qual-modal-status qual-modal-status--no">&#10005;</span>';
}

function _openQualificationModal() {
  var gs = State.gameState || {};
  var config = State.config || {};
  var athlete = gs.athlete || {};
  var week = athlete.week || 1;
  var schedule = (config.season || {}).schedule || {};
  var meetType = ((schedule[String(week)] || {}).meet_type) || 'regular_season';
  var defaultTab = _qualificationTargetMeet(meetType) || _QUAL_TIER_ORDER[0];
  if (!_qualificationView.tab || _QUAL_TIER_ORDER.indexOf(_qualificationView.tab) === -1) {
    _qualificationView.tab = defaultTab;
  }
  _renderQualificationModal();
}

function _renderQualificationModal() {
  var gs = State.gameState || {};
  var config = State.config || {};
  var athlete = gs.athlete || {};
  var category = _competitionCategory(athlete);
  var buildEvents = _buildEventsForCategory(config, athlete.build || '', category);
  var qualification = gs.qualification || {};
  var seasonPrs = (gs.current_season || {}).season_prs || {};
  var tab = _qualificationView.tab || _QUAL_TIER_ORDER[0];

  var tabsHtml = _QUAL_TIER_ORDER.map(function (tier) {
    var qualForTier = qualification[tier] || {};
    var qualCount = buildEvents.filter(function (ev) { return !!qualForTier[ev]; }).length;
    var selected = tier === tab ? ' rankings-tab--selected' : '';
    return '<button class="rankings-tab' + selected + '" data-qual-tab="' + tier + '">' +
      _escapeHtml(_QUAL_TAB_LABELS[tier] || tier) + ' (' + qualCount + '/' + buildEvents.length + ')' +
      '</button>';
  }).join('');

  var qualCfg = ((config.qualification || {})[tab] || {});
  var timeThresholds = (qualCfg.time_thresholds || {})[category] || (qualCfg.time_thresholds || {});
  var markThresholds = (qualCfg.mark_thresholds || {})[category] || (qualCfg.mark_thresholds || {});
  var qualForTab = qualification[tab] || {};

  var rowsHtml = buildEvents.length ? buildEvents.map(function (ev) {
    var qualified = !!qualForTab[ev];
    var seasonPr = (seasonPrs[ev] || {}).value;
    var threshold = (timeThresholds[ev] != null) ? timeThresholds[ev] : markThresholds[ev];
    var isTime = timeThresholds[ev] != null;
    var markText = seasonPr == null ? 'No mark' : (isTime ? formatTime(seasonPr) : formatMark(seasonPr));
    var standardText = threshold == null ? '\u2014' : _formatThreshold(ev, threshold, config);
    return (
      '<div class="qual-modal-row' + (qualified ? ' qual-modal-row--qualified' : '') + '">' +
      _qualStatusIcon(qualified) +
      '<span class="qual-modal-event">' + _escapeHtml(ev) + '</span>' +
      '<span class="qual-modal-values text-tabular">' + _escapeHtml(markText) + ' / ' + _escapeHtml(standardText) + '</span>' +
      '</div>'
    );
  }).join('') : '<div class="rankings-empty">No events for this build.</div>';

  var metaHtml = _escapeHtml(meetLabel(tab)) + ' \u00B7 Year ' + (athlete.year || 1) + ' \u00B7 Week ' + (athlete.week || 1);

  var html =
    '<div class="record-book-modal" id="qualification-modal">' +
    '<div class="record-book-modal__panel rankings-modal__panel">' +
    '<div class="record-book-modal__header">' +
    '<div class="heading-lg">Qualification</div>' +
    '<button class="record-book-close" id="qualification-close-btn">&#x2715;</button>' +
    '</div>' +
    '<div class="rankings-meta">' + metaHtml + '</div>' +
    '<div class="rankings-tabs">' + tabsHtml + '</div>' +
    '<div class="record-book-section">' + rowsHtml + '</div>' +
    '</div>' +
    '</div>';

  var existing = document.getElementById('qualification-modal');
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

  var container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container.firstChild);

  var modal = document.getElementById('qualification-modal');
  var closeBtn = document.getElementById('qualification-close-btn');

  function _closeModal() {
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
  }

  if (closeBtn) closeBtn.addEventListener('click', _closeModal);
  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) {
        _closeModal();
        return;
      }
      var tier = e.target && e.target.getAttribute && e.target.getAttribute('data-qual-tab');
      if (tier) {
        _qualificationView.tab = tier;
        _renderQualificationModal();
      }
    });
  }
}

function _openCollectionModal(title, kind, unlockedItems, badgeClass, resolveName) {
  var existing = document.getElementById('collection-modal');
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  var world = State.world || {};
  var cfg = State.config || {};
  var allIds = _collectionAllIds(kind);
  var lockedIds = allIds.length ? allIds.filter(function (id) { return unlockedItems.indexOf(id) === -1; }) : [];
  var total = allIds.length || unlockedItems.length;

  var unlockedHtml = unlockedItems.length ? unlockedItems.map(function (item) {
    return '<span class="badge ' + badgeClass + ' badge--lg">' + _escapeHtml(resolveName(item, cfg, world)) + '</span>';
  }).join('') : '<div class="record-book-row__event" style="padding:8px 0;color:var(--text-muted)">None unlocked yet.</div>';

  var lockedHtml = lockedIds.map(function (id) {
    var def = _collectionDef(kind, id) || {};
    var desc = def.description || '';
    return (
      '<div class="collection-locked-row">' +
      '<span class="badge ' + badgeClass + ' badge--lg badge--locked">' + _escapeHtml(resolveName(id, cfg, world)) + '</span>' +
      (desc ? '<span class="collection-locked-desc">' + _escapeHtml(desc) + '</span>' : '') +
      '</div>'
    );
  }).join('');

  var html =
    '<div class="record-book-modal" id="collection-modal">' +
    '<div class="record-book-modal__panel">' +
    '<div class="record-book-modal__header">' +
    '<div class="heading-lg">' + _escapeHtml(title) + '</div>' +
    '<button class="record-book-close" id="collection-modal-close">&#10005;</button>' +
    '</div>' +
    '<div class="rankings-meta">' + unlockedItems.length + ' / ' + total + ' unlocked</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:8px;padding-top:4px;">' + unlockedHtml + '</div>' +
    (lockedHtml ? '<div class="collection-locked-list">' + lockedHtml + '</div>' : '') +
    '</div>' +
    '</div>';
  document.body.insertAdjacentHTML('beforeend', html);
  function _close() {
    var m = document.getElementById('collection-modal');
    if (m && m.parentNode) m.parentNode.removeChild(m);
  }
  var closeBtn = document.getElementById('collection-modal-close');
  if (closeBtn) closeBtn.addEventListener('click', _close);
  var modal = document.getElementById('collection-modal');
  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) _close();
    });
  }
}

function _openAchievementsModal() {
  var gs = State.gameState || {};
  var athlete = gs.athlete || {};
  var items = athlete.achievements_unlocked || [];
  _openCollectionModal('Achievements', 'achievement', items, 'badge--achievement', _resolveAchievementName);
}

function _openAchievementsUnlockedModal(achList) {
  var existing = document.getElementById('collection-modal');
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  var world = State.world || {};
  var cfg = State.config || {};
  var rowsHtml = achList.map(function (a) {
    var achId = (a && a.id) ? a.id : a;
    var name = _resolveAchievementName(achId, cfg, world);
    var desc = (a && a.description) || (_findAchievementDef(achId, cfg, world) || {}).description || '';
    return '<div class="ach-modal-row">' +
      '<span class="badge badge--achievement badge--lg">' + _escapeHtml(name) + '</span>' +
      (desc ? '<div class="ach-modal-desc">' + _escapeHtml(desc) + '</div>' : '') +
      '</div>';
  }).join('');
  var html =
    '<div class="record-book-modal" id="collection-modal">' +
    '<div class="record-book-modal__panel">' +
    '<div class="record-book-modal__header">' +
    '<div class="heading-lg">Achievements Unlocked</div>' +
    '<button class="record-book-close" id="collection-modal-close">&#10005;</button>' +
    '</div>' +
    '<div class="ach-modal-list">' + rowsHtml + '</div>' +
    '</div>' +
    '</div>';
  document.body.insertAdjacentHTML('beforeend', html);
  function _close() {
    var m = document.getElementById('collection-modal');
    if (m && m.parentNode) m.parentNode.removeChild(m);
  }
  var closeBtn = document.getElementById('collection-modal-close');
  if (closeBtn) closeBtn.addEventListener('click', _close);
  var modal = document.getElementById('collection-modal');
  if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) _close(); });
}

function _openPerksModal() {
  var gs = State.gameState || {};
  var items = gs.perks_unlocked || [];
  _openCollectionModal('Perks', 'perk', items, 'badge--perk', _resolvePerkName);
}

function _openMilestonesModal() {
  var gs = State.gameState || {};
  var items = gs.milestones_completed || [];
  _openCollectionModal('Milestones', 'milestone', items, 'badge--milestone', _resolveMilestoneName);
}

function _ordinal(n) {
  var num = parseInt(n, 10) || 0;
  var s = ['th', 'st', 'nd', 'rd'];
  var v = num % 100;
  return num + (s[(v - 20) % 10] || s[v] || s[0]);
}

function _bindRivalDossierClicks() {
  var cards = document.querySelectorAll('[data-rival-npc-id]');
  for (var i = 0; i < cards.length; i++) {
    (function (card) {
      card.addEventListener('click', function () {
        var npcId = card.getAttribute('data-rival-npc-id');
        if (npcId) _openRivalDossier(npcId);
      });
    })(cards[i]);
  }
}

// ---------------------------------------------------------------------------
// Race Preview Screen
// ---------------------------------------------------------------------------
var _RACE_PREVIEW_MEET_TYPES = {
  class_meet: true,
  state_meet: true,
  regional_meet: true,
  national_meet: true
};

function renderRacePreviewScreen(previewData, gameState, config) {
  var gs = gameState || {};
  var athlete = gs.athlete || {};
  var week = athlete.week || 1;
  var schedule = (config && config.season && config.season.schedule) || {};
  var meetInfo = schedule[String(week)] || {};
  var meetName = meetInfo.name || meetLabel(meetInfo.meet_type || '');
  var fields = (previewData && previewData.fields) || {};
  var playerProjected = (previewData && previewData.player_projected) || {};
  var stakesText = (previewData && previewData.stakes_text) || '';
  var eventKeys = Object.keys(fields);

  var sectionsHtml = eventKeys.map(function (eventName) {
    var entries = fields[eventName] || [];
    var rivalsHtml = '';
    var namedHtml = '';
    var fillersHtml = '';

    var playerProj = playerProjected[eventName];
    var playerProjValue = (playerProj && playerProj.value != null)
      ? _formatResultValue(playerProj.kind || 'time', playerProj.value)
      : null;

    var playerRank = 1;
    if (playerProj && playerProj.value != null) {
      var pv = playerProj.value;
      var pk = playerProj.kind || 'time';
      entries.forEach(function (e) {
        if (e.projected && e.projected.value != null) {
          var better = pk === 'time' ? e.projected.value < pv : e.projected.value > pv;
          if (better) playerRank++;
        }
      });
    }
    var fieldSize = entries.length + 1;
    var coachLine = '';
    if (playerProjValue) {
      var stakesPlaces = {'class_meet': 3, 'state_meet': 2, 'regional_meet': 1, 'national_meet': 1};
      var advanceN = stakesPlaces[(previewData && previewData.meet_type) || ''] || 0;
      if (playerRank === 1) {
        coachLine = 'You\'re projected to lead this field. Protect that edge.';
      } else if (advanceN && playerRank <= advanceN) {
        coachLine = 'Projected ' + _ordinal(playerRank) + ' — you\'re inside the qualifying spots. Hold your position.';
      } else if (advanceN && playerRank === advanceN + 1) {
        coachLine = 'Projected ' + _ordinal(playerRank) + ' — one place outside. You can take it.';
      } else {
        coachLine = 'Projected ' + _ordinal(playerRank) + ' of ' + fieldSize + '. You\'ve got ground to make up.';
      }
    }

    var playerCardHtml = playerProjValue
      ? '<div class="preview-player-card">' +
        '<span class="preview-player-card__label">YOU</span>' +
        '<span class="preview-player-card__proj">Est. ' + _escapeHtml(playerProjValue) + '</span>' +
        (coachLine ? '<span class="preview-coach-line">' + _escapeHtml(coachLine) + '</span>' : '') +
        '</div>'
      : '';
    var recordProximities = (previewData.record_proximities || {})[eventName] || [];
    var recordWatchHtml = recordProximities.length
      ? '<div class="preview-record-watch">' +
        '<div class="preview-record-watch__label">RECORD WATCH</div>' +
        recordProximities.map(function (p) {
          return '<div class="preview-record-watch__row">' +
            _escapeHtml(p.label) + ': ' +
            _escapeHtml(_formatResultValue(p.kind, p.record_value)) +
            ' (' + _escapeHtml(p.holder) + ', ' + _escapeHtml(p.year_str) + ')' +
            '</div>';
        }).join('') +
        '</div>'
      : '';

    entries.forEach(function (e) {
      var projValue = (e.projected && e.projected.value != null)
        ? _formatResultValue(e.projected.kind || 'time', e.projected.value)
        : '—';

      if (e.is_rival) {
        var lvClass = e.rivalry_level >= 3 ? ' rival-preview--lv3'
          : (e.rivalry_level >= 2 ? ' rival-preview--lv2' : ' rival-preview--lv1');
        rivalsHtml +=
          '<div class="card rival-preview' + lvClass + '" data-rival-npc-id="' + _escapeHtml(e.npc_id || '') + '">' +
          '<div class="rival-preview__header">' +
          '<div class="rival-preview__name">' + _escapeHtml(e.name) + '</div>' +
          '<span class="rival-level">LV ' + e.rivalry_level + '</span>' +
          '</div>' +
          '<div class="rival-preview__row">' +
          '<div class="rival-preview__meta">' +
          _escapeHtml(e.team) +
          '<span class="rival-sep">&bull;</span>' +
          e.wins + 'W / ' + e.losses + 'L' +
          '</div>' +
          '<div class="rival-preview__proj">Est. ' + _escapeHtml(projValue) + '</div>' +
          '</div>' +
          (e.bio ? '<div class="rival-preview__bio">' + _escapeHtml(e.bio) + '</div>' : '') +
          '</div>';
      } else if (e.is_named) {
        namedHtml +=
          '<div class="preview-athlete preview-athlete--named">' +
          '<span class="preview-athlete__name">' + _escapeHtml(e.name) + '</span>' +
          '<span class="preview-athlete__team">' + _escapeHtml(e.team) + '</span>' +
          '<span class="preview-athlete__proj">Est. ' + _escapeHtml(projValue) + '</span>' +
          '</div>';
      } else {
        fillersHtml +=
          '<div class="preview-athlete preview-athlete--filler">' +
          '<span class="preview-athlete__name">' + _escapeHtml(e.name) + '</span>' +
          '<span class="preview-athlete__team">' + _escapeHtml(e.team) + '</span>' +
          '<span class="preview-athlete__proj">Est. ' + _escapeHtml(projValue) + '</span>' +
          '</div>';
      }
    });

    return (
      '<div class="preview-event-section">' +
      '<div class="heading-md">' + _escapeHtml(eventName) + '</div>' +
      '<div class="divider-accent"></div>' +
      recordWatchHtml +
      playerCardHtml +
      (rivalsHtml ? '<div class="label-xs" style="margin-top:8px;">RIVALS</div>' + rivalsHtml : '') +
      (namedHtml ? '<div class="label-xs" style="margin-top:8px;">CONTENDERS</div><div class="preview-athlete-list">' + namedHtml + '</div>' : '') +
      (fillersHtml ? '<div class="label-xs" style="margin-top:8px;">FIELD</div><div class="preview-athlete-list">' + fillersHtml + '</div>' : '') +
      '</div>'
    );
  }).join('');

  var stakesHtml = stakesText
    ? '<div class="preview-stakes">' + _escapeHtml(stakesText) + '</div>'
    : '';

  return (
    '<div class="app">' +
    renderSidebar(gs, config, []) +
    '<main class="main-content">' +
    renderTopStatusBar(gs, config, { id: 'btn-preview-proceed', text: 'Proceed to Meet', disabled: false }) +
    '<div class="card preview-header-card">' +
    '<div class="heading-lg">' + _escapeHtml(meetName) + '</div>' +
    '<div class="label-sm">Scouting Report</div>' +
    stakesHtml +
    '</div>' +
    sectionsHtml +
    '</main>' +
    '</div>'
  );
}

function initRacePreviewScreen() {
  var btn = document.getElementById('btn-preview-proceed');
  if (btn) {
    btn.addEventListener('click', function () {
      Router.go('week', { rivals: State.previewRivals || [] });
    });
  }
  _bindRivalDossierClicks();
}

var RacePreviewScreen = {
  render: function (data) {
    return renderRacePreviewScreen(
      (data && data.preview) || {},
      State.gameState,
      State.config
    );
  },
  init: function () {
    initRacePreviewScreen();
  },
};

// ---------------------------------------------------------------------------
// Internal routing helpers
// ---------------------------------------------------------------------------
function _routeSeasonEnd() {
  var gs = State.gameState;
  var config = State.config;
  var athlete = (gs && gs.athlete) || {};
  var totalSeasons = (config && config.season && config.season.seasons_total) || 12;

  if ((athlete.year || 1) >= totalSeasons) {
    api('finalize_career').then(function (result) {
      State.gameState = result.game_state;
      if (result.recruiting_beat) {
        Router.go('recruiting_interstitial', { beat: result.recruiting_beat });
        return;
      }
      State.hof = result.hof || { entries: [] };
      Router.go('endgame', { endgame: result.endgame, hof: State.hof });
    }).catch(function (e) {
      showError('Error finalizing career: ' + e);
    });
    return;
  }

  api('get_season_summary').then(function (summary) {
    State.gameState = summary.game_state;
    Router.go('season_summary', { goals: summary.goals_evaluated });
  }).catch(function (e) {
    showError('Error loading season summary: ' + e);
  });
}

function _routeAfterLoad(preloadedRecruitingBeat) {
  var gs = State.gameState;
  var config = State.config;
  var athlete = (gs && gs.athlete) || {};
  var week = athlete.week || 1;
  var cs = (gs && gs.current_season) || {};
  State.resultsNarrativeRecent = [];

  var wps = (config && config.season && config.season.weeks_per_season) || 13;
  if (week > wps) {
    // Saved after the season's final meet: there is no week to train for.
    _routeSeasonEnd();
    return;
  }

  if (week === 1 && !cs.preseason_seen) {
    // Show preseason first - ensure goals are set
    api('ensure_goals').then(function (result) {
      State.gameState = result.game_state;
      State.preseasonRecruitingBeat = preloadedRecruitingBeat || result.recruiting_beat || null;
      Router.go('preseason');
    });
  } else {
    Router.go('training');
  }
}


function _handleWeekDone(report) {
  // Always show race results first. Breaking-news interstitials are queued
  // from the Results -> Next Week flow so they interrupt before Week Summary.
  Router.go('results', { report: report });
}

// ---------------------------------------------------------------------------
// Error display
// ---------------------------------------------------------------------------
function showError(msg) {
  var existing = document.querySelector('.error-banner');
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  var banner = document.createElement('div');
  banner.className = 'error-banner';
  banner.textContent = msg;
  document.body.appendChild(banner);
  setTimeout(function () {
    if (banner.parentNode) banner.parentNode.removeChild(banner);
  }, 5000);
}

// ---------------------------------------------------------------------------
// NEW SCREENS: College Commitment & Pro Contract
// ---------------------------------------------------------------------------

function renderCollegeCommitmentScreen(gameState, world) {
  var gs = gameState || {};
  var athlete = gs.athlete || {};
  
  var collegeTeams = ((world || {}).teams || []).filter(function(t) {
    return String(t.id).indexOf('ncaa_d1') >= 0 || String(t.id).indexOf('ncaa_d2') >= 0;
  });
  
  if (!collegeTeams.length) {
    collegeTeams = [
      {id: 'ncaa_d1_1', name: 'Eugene Athletics'},
      {id: 'ncaa_d1_2', name: 'Austin Track Club'},
      {id: 'ncaa_d2_1', name: 'Fox Valley State'}
    ];
  }

  var offersHtml = collegeTeams.map(function(team) {
    return (
      '<div class="card card--selectable training-card offseason-card" data-college-id="' + _escapeHtml(team.id) + '" style="flex:1;min-width:200px;">' +
      '<div class="heading-md">' + _escapeHtml(team.name) + '</div>' +
      '<div class="label-sm">Athletic Scholarship Offer</div>' +
      '<div class="training-stats"><span class="stat-pill">NCAA Division</span></div>' +
      '</div>'
    );
  }).join('');

  return (
    '<div class="app screen-enter">' +
    '<aside class="sidebar"><div class="label-xs">NATIONAL SIGNING DAY</div><div class="label-sm">It\'s time to choose your future.</div></aside>' +
    '<main class="main-content">' +
    '<div class="top-status-bar"><div class="top-status-item top-status-item--primary">' + _escapeHtml(athlete.name) + '</div></div>' +
    '<div class="label-xs">COLLEGE COMMITMENT</div>' +
    '<div class="heading-lg">Welcome to the NCAA</div>' +
    '<div class="label-sm" style="margin-bottom:16px;">Congratulations! Your high school career has earned you multiple scholarship offers. Where will you sign?</div>' +
    '<div id="college-offers-container" class="flex gap-6" style="flex-wrap:wrap;">' + offersHtml + '</div>' +
    '<div style="margin-top:20px;"><button class="btn btn--primary" id="btn-sign-college" disabled>Sign National Letter of Intent</button></div>' +
    '</main>' +
    '</div>'
  );
}

function initCollegeCommitmentScreen() {
  var cards = document.querySelectorAll('[data-college-id]');
  var signBtn = document.getElementById('btn-sign-college');
  var selectedCollege = null;

  cards.forEach(function (el) {
    el.addEventListener('click', function () {
      cards.forEach(function (c) { c.classList.remove('selected'); });
      el.classList.add('selected');
      selectedCollege = el.getAttribute('data-college-id');
      if (signBtn) signBtn.disabled = false;
    });
  });

  if (signBtn) {
    signBtn.addEventListener('click', async function () {
      if (!selectedCollege) return;
      signBtn.disabled = true;
      signBtn.textContent = "Signing...";
      cards.forEach(function (c) { c.style.pointerEvents = 'none'; });
      
      try {
        var result = await api('commit_to_college', selectedCollege);
        State.gameState = result.game_state;
        Router.go('offseason');
      } catch (e) {
        signBtn.disabled = false;
        signBtn.textContent = "Sign National Letter of Intent";
        cards.forEach(function (c) { c.style.pointerEvents = ''; });
        showError('Error signing with college: ' + e);
      }
    });
  }
}

function renderProContractScreen(gameState, world) {
  var gs = gameState || {};
  var athlete = gs.athlete || {};
  
  var sponsors = [
    {id: 'pro_sponsor_1', name: 'Nike Bowerman Track Club', perk: '+Speed, +Recovery'},
    {id: 'pro_sponsor_2', name: 'Puma Elite', perk: '+Agility, +Technique'},
    {id: 'pro_sponsor_3', name: 'Adidas Pro Circuit', perk: '+Stamina, +Toughness'}
  ];

  var offersHtml = sponsors.map(function(sponsor) {
    return (
      '<div class="card card--selectable training-card offseason-card" data-sponsor-id="' + _escapeHtml(sponsor.id) + '" style="flex:1;min-width:200px;">' +
      '<div class="heading-md">' + _escapeHtml(sponsor.name) + '</div>' +
      '<div class="label-sm">Professional Contract Offer</div>' +
      '<div class="training-stats"><span class="stat-pill">' + _escapeHtml(sponsor.perk) + '</span></div>' +
      '</div>'
    );
  }).join('');

  return (
    '<div class="app screen-enter">' +
    '<aside class="sidebar"><div class="label-xs">TURNING PRO</div><div class="label-sm">Welcome to the big leagues.</div></aside>' +
    '<main class="main-content">' +
    '<div class="top-status-bar"><div class="top-status-item top-status-item--primary">' + _escapeHtml(athlete.name) + '</div></div>' +
    '<div class="label-xs">PROFESSIONAL CIRCUIT</div>' +
    '<div class="heading-lg">Sign Your Pro Contract</div>' +
    '<div class="label-sm" style="margin-bottom:16px;">You have graduated from the NCAA. It is time to sign with a major shoe brand and enter the global circuit.</div>' +
    '<div id="pro-offers-container" class="flex gap-6" style="flex-wrap:wrap;">' + offersHtml + '</div>' +
    '<div style="margin-top:20px;"><button class="btn btn--primary" id="btn-sign-pro" disabled>Sign Professional Contract</button></div>' +
    '</main>' +
    '</div>'
  );
}

function initProContractScreen() {
  var cards = document.querySelectorAll('[data-sponsor-id]');
  var signBtn = document.getElementById('btn-sign-pro');
  var selectedSponsor = null;

  cards.forEach(function (el) {
    el.addEventListener('click', function () {
      cards.forEach(function (c) { c.classList.remove('selected'); });
      el.classList.add('selected');
      selectedSponsor = el.getAttribute('data-sponsor-id');
      if (signBtn) signBtn.disabled = false;
    });
  });

  if (signBtn) {
    signBtn.addEventListener('click', async function () {
      if (!selectedSponsor) return;
      signBtn.disabled = true;
      signBtn.textContent = "Signing...";
      cards.forEach(function (c) { c.style.pointerEvents = 'none'; });
      
      try {
        var result = await api('sign_pro_contract', selectedSponsor);
        State.gameState = result.game_state;
        Router.go('offseason');
      } catch (e) {
        signBtn.disabled = false;
        signBtn.textContent = "Sign Professional Contract";
        cards.forEach(function (c) { c.style.pointerEvents = ''; });
        showError('Error signing pro contract: ' + e);
      }
    });
  }
}

var CollegeCommitmentScreen = {
  render: function () { return renderCollegeCommitmentScreen(State.gameState, State.world); },
  init: function () { initCollegeCommitmentScreen(); },
};

var ProContractScreen = {
  render: function () { return renderProContractScreen(State.gameState, State.world); },
  init: function () { initProContractScreen(); },
};

// ---------------------------------------------------------------------------
// App entry point
// ---------------------------------------------------------------------------
var App = {
  init: async function () {
    // Register all screens
    Router.register('menu', MenuScreen);
    Router.register('builder', BuilderScreen);
    Router.register('training', TrainingScreen);
    Router.register('week', WeekScreen);
    Router.register('race_preview', RacePreviewScreen);
    Router.register('results', ResultsScreen);
    Router.register('week_summary', WeekSummaryScreen);
    Router.register('offseason', OffseasonScreen);
    Router.register('season_summary', SeasonSummaryScreen);
    Router.register('preseason', PreseasonScreen);
    Router.register('endgame', EndgameScreen);
    Router.register('hof', HofScreen);
    Router.register('breaking_news', BreakingNewsScreen);
    Router.register('recruiting_interstitial', RecruitingInterstitialScreen);
    Router.register('tutorial', TutorialScreen);
    Router.register('settings', SettingsScreen);
    
    // NOUVEAUX ECRANS ICI :
    Router.register('college_commitment', CollegeCommitmentScreen);
    Router.register('pro_contract', ProContractScreen);

    // Load config and world in parallel
    try {
      var _startupData = await Promise.all([api('get_config'), api('get_world')]);
      State.config = _startupData[0];
      State.world = _startupData[1];
    } catch (e) {
      showError('Failed to load game data: ' + e);
      return;
    }

    // Load save slots for the main menu
    var slots = [];
    try {
      slots = await api('list_slots');
      State.slots = slots;
    } catch (e) { /* ignore */ }

    registerGlobalHotkeys();
    Router.go('menu', { slots: slots, selectedSlot: State.selectedSlot || 1 });
  },
};






