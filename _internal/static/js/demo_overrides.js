'use strict';

// ==========================================================================
// TRACK STAR DEMO — JS overrides
// Loaded AFTER app.js. Replaces specific screens and patches App.init.
// ES5 style: var, no arrow functions, no template literals, no destructuring.
// NO MOJIBAKE: use Unicode escapes only ('\u2714', '\u2192', etc.)
// ==========================================================================


// ---------------------------------------------------------------------------
// Demo badge
// ---------------------------------------------------------------------------

function injectDemoBadge() {
  if (document.getElementById('demo-badge')) return;
  var badge = document.createElement('div');
  badge.id = 'demo-badge';
  badge.className = 'demo-badge';
  badge.textContent = 'DEMO';
  document.body.appendChild(badge);
}

// Patch Router.go so the badge survives every screen transition.
(function () {
  var _origGo = Router.go;
  Router.go = function (id, data) {
    _origGo.call(Router, id, data);
    injectDemoBadge();
  };
}());


// ---------------------------------------------------------------------------
// Demo Menu Screen
// ---------------------------------------------------------------------------

function renderDemoMenuScreen() {
  var steamUrl = _escapeHtml((State.demoConfig || {}).steam_url || '');
  return (
    '<div class="menu-screen">' +
    '<div class="menu-stack">' +
    '<div class="menu-title-block">' +
    '<h1 class="menu-title"><span class="menu-title-track">TRACK</span><span class="menu-title-star">STAR</span></h1>' +
    '<div class="menu-demo-subtitle">DEMO</div>' +
    '</div>' +
    '<button class="menu-continue-btn" id="btn-demo-new-game">NEW GAME</button>' +
    '<div class="menu-secondary-row">' +
    '<button class="menu-secondary-btn" id="btn-demo-tutorial">HOW TO PLAY</button>' +
    '<button class="menu-secondary-btn demo-menu-wishlist-btn" id="btn-menu-wishlist" data-steam-url="' + steamUrl + '">WISHLIST ON STEAM</button>' +
    '</div>' +
    '</div>' +
    '</div>'
  );
}

function initDemoMenuScreen() {
  var newGame = document.getElementById('btn-demo-new-game');
  if (newGame) {
    newGame.addEventListener('click', function () {
      Router.go('builder', { slot: 1 });
    });
  }
  var tutorial = document.getElementById('btn-demo-tutorial');
  if (tutorial) {
    tutorial.addEventListener('click', function () {
      Router.go('tutorial');
    });
  }
  var wishlist = document.getElementById('btn-menu-wishlist');
  if (wishlist) {
    wishlist.addEventListener('click', function () {
      var url = wishlist.getAttribute('data-steam-url');
      if (url) window.open(url, '_blank');
    });
  }
}

var DemoMenuScreen = {
  render: renderDemoMenuScreen,
  init: initDemoMenuScreen,
};


// ---------------------------------------------------------------------------
// Demo Endgame Screen
// ---------------------------------------------------------------------------

function renderDemoEndgameScreen(data) {
  var d = data || {};
  var dc = State.demoConfig || {};

  var steamUrl = _escapeHtml(dc.steam_url || '');

  // ── Hero
  var heroHtml =
    '<div style="text-align:center; margin-bottom:24px;">' +
    '<div class="demo-eg-eyebrow">CAREER COMPLETE</div>' +
    '<div class="demo-eg-heading">DEMO COMPLETE</div>' +
    '<div class="demo-eg-tagline">' + _escapeHtml(dc.demo_end_message || '') + '</div>' +
    '</div>';

  // ── CTA (top — most important action)
  var ctaSection =
    '<div class="demo-eg-cta-section">' +
    '<div class="demo-eg-cta-label">ENJOYED THE DEMO?</div>' +
    '<button class="demo-cta-btn" id="btn-demo-wishlist">&#x2764; Wishlist on Steam</button>' +
    '</div>';

  // ── Full game features card
  var features = dc.full_game_features || [];
  var featuresHtml = features.length ? features.map(function (f) {
    return '<li>' + _escapeHtml(f) + '</li>';
  }).join('') : '';

  var featuresCard =
    '<div class="demo-eg-card">' +
    '<div class="demo-eg-card-label">WHAT AWAITS IN THE FULL GAME</div>' +
    '<ul class="demo-eg-feature-list">' + featuresHtml + '</ul>' +
    '</div>';

  // ── Roadmap card
  var roadmap = dc.roadmap_items || [];
  var roadmapHtml = roadmap.length ? roadmap.map(function (item) {
    return '<li>' + _escapeHtml(item) + '</li>';
  }).join('') : '';

  var roadmapCard =
    '<div class="demo-eg-card">' +
    '<div class="demo-eg-card-label">ON THE ROADMAP</div>' +
    '<ul class="demo-eg-feature-list demo-eg-roadmap-list">' + roadmapHtml + '</ul>' +
    '</div>';

  // ── Play again (bottom)
  var playAgain =
    '<div class="screen-actions">' +
    '<button class="btn btn--secondary" id="btn-demo-endgame-back">Back to Menu</button>' +
    '</div>' +
    '<div style="text-align:center; margin-top:8px; margin-bottom:32px;">' +
    '<button class="demo-play-again-btn" id="btn-demo-play-again">Play Again</button>' +
    '</div>';

  return (
    '<div class="screen screen-enter screen-demo-endgame" data-steam-url="' + steamUrl + '">' +
    heroHtml +
    ctaSection +
    featuresCard +
    roadmapCard +
    playAgain +
    '</div>'
  );
}

function initDemoEndgameScreen() {
  var wishlist = document.getElementById('btn-demo-wishlist');
  if (wishlist) {
    wishlist.addEventListener('click', function () {
      var screen = document.querySelector('[data-steam-url]');
      var url = screen ? screen.getAttribute('data-steam-url') : '';
      if (url) window.open(url, '_blank');
    });
  }

  var playAgain = document.getElementById('btn-demo-play-again');
  if (playAgain) {
    playAgain.addEventListener('click', function () {
      State.gameState = null;
      State.lastReport = null;
      Router.go('menu');
    });
  }

  var back = document.getElementById('btn-demo-endgame-back');
  if (back) {
    back.addEventListener('click', function () {
      State.gameState = null;
      State.lastReport = null;
      Router.go('menu');
    });
  }
}

var DemoEndgameScreen = {
  render: renderDemoEndgameScreen,
  init: initDemoEndgameScreen,
};


// ---------------------------------------------------------------------------
// Demo Season Summary Screen
// Same render as original; only the Continue button routing differs.
// When year >= totalSeasons, routes to 'demo_endgame' instead of 'endgame'.
// ---------------------------------------------------------------------------

var DemoSeasonSummaryScreen = {
  render: SeasonSummaryScreen.render,
  init: function () {
    var btn = document.getElementById('btn-continue-offseason');
    if (!btn) return;
    btn.addEventListener('click', async function () {
      var athlete = (State.gameState && State.gameState.athlete) || {};
      var totalSeasons = (((State.config || {}).season || {}).seasons_total) || 2;
      btn.disabled = true;
      if ((athlete.year || 1) >= totalSeasons) {
        try {
          var finalRes = await api('finalize_career');
          State.gameState = finalRes.game_state;
          State.hof = finalRes.hof || { entries: [] };
          Router.go('demo_endgame', { endgame: finalRes.endgame, hof: State.hof });
        } catch (e) {
          btn.disabled = false;
          showError('Failed to finalize career: ' + e);
        }
        return;
      }
      Router.go('offseason');
    });
  },
};


// ---------------------------------------------------------------------------
// Demo Results Screen
// Same render as original; replaces the btn-next-week handler so that the
// final-season path routes to 'demo_endgame' instead of 'endgame'.
// ---------------------------------------------------------------------------

var DemoResultsScreen = {
  render: ResultsScreen.render,
  init: function (data) {
    var d = data || {};
    var rep = d.report || State.lastReport || {};

    // Run the original init — sets up race animation, commentary, etc.
    initResultsScreen(rep);

    // Clone btn-next-week to strip the original listener, then replace it.
    var btn = document.getElementById('btn-next-week');
    if (!btn) return;
    var fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);

    fresh.addEventListener('click', async function () {
      var gs = State.gameState;
      var config = State.config;
      var athlete = (gs && gs.athlete) || {};
      var week = athlete.week || 1;
      var wps = (config && config.season && config.season.weeks_per_season) || 12;
      var totalSeasons = (config && config.season && config.season.seasons_total) || 2;

      fresh.disabled = true;
      fresh.classList.remove('btn--primary');
      fresh.classList.add('btn--disabled');

      if (week > wps) {
        if ((athlete.year || 1) >= totalSeasons) {
          try {
            var result = await api('finalize_career');
            State.gameState = result.game_state;
            State.hof = result.hof || { entries: [] };
            Router.go('demo_endgame', { endgame: result.endgame, hof: State.hof });
          } catch (e) {
            fresh.disabled = false;
            showError('Error finalizing career: ' + e);
          }
        } else {
          try {
            var summary = await api('get_season_summary');
            State.gameState = summary.game_state;
            Router.go('season_summary', { goals: summary.goals_evaluated });
          } catch (e) {
            fresh.disabled = false;
            showError('Error loading season summary: ' + e);
          }
        }
        return;
      }

      var breakingEvents = _breakingEventsFromReport(rep);
      if (breakingEvents.length) {
        State.pendingBreakingQueue = breakingEvents.slice();
        State.pendingScreen = { id: 'week_summary', data: { report: rep } };
        Router.go('breaking_news', { event: State.pendingBreakingQueue[0], index: 0, total: State.pendingBreakingQueue.length });
        return;
      }

      Router.go('week_summary', { report: rep });
    });
  },
};


// ---------------------------------------------------------------------------
// App.init override
// Extends the original: also loads demoConfig and stores it on State.
// Registers demo screen overrides before routing to menu.
// ---------------------------------------------------------------------------

App.init = async function () {
  // Register all standard screens first (same order as original App.init)
  Router.register('builder', BuilderScreen);
  Router.register('training', TrainingScreen);
  Router.register('week', WeekScreen);
  Router.register('race_preview', RacePreviewScreen);
  Router.register('week_summary', WeekSummaryScreen);
  Router.register('offseason', OffseasonScreen);
  Router.register('preseason', PreseasonScreen);
  Router.register('hof', HofScreen);
  Router.register('breaking_news', BreakingNewsScreen);
  Router.register('recruiting_interstitial', RecruitingInterstitialScreen);
  Router.register('tutorial', TutorialScreen);
  Router.register('settings', SettingsScreen);

  // Register demo overrides
  Router.register('menu', DemoMenuScreen);
  Router.register('results', DemoResultsScreen);
  Router.register('season_summary', DemoSeasonSummaryScreen);
  Router.register('endgame', DemoEndgameScreen);
  Router.register('demo_endgame', DemoEndgameScreen);

  // Load config, world, and demo config in parallel
  try {
    var startupData = await Promise.all([
      api('get_config'),
      api('get_world'),
      api('get_demo_config'),
    ]);
    State.config = startupData[0];
    State.world = startupData[1];
    State.demoConfig = startupData[2];
  } catch (e) {
    showError('Failed to load game data: ' + e);
    return;
  }

  // Demo has no save slots
  State.slots = [];

  registerGlobalHotkeys();
  Router.go('menu');
};
