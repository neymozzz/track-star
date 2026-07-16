'use strict';

// ---------------------------------------------------------------------------
// formatTime(seconds) -> "4:58.10" for long times, "11.23" for short sprints
// ---------------------------------------------------------------------------
function formatTime(seconds) {
  if (seconds == null || isNaN(seconds)) return '—';
  if (seconds >= 60) {
    var mins = Math.floor(seconds / 60);
    var secs = seconds - mins * 60;
    return mins + ':' + (secs < 10 ? '0' : '') + secs.toFixed(2);
  }
  return parseFloat(seconds).toFixed(2);
}

// ---------------------------------------------------------------------------
// formatMark(meters) -> "6.42m"
// ---------------------------------------------------------------------------
function formatMark(meters) {
  if (meters == null || isNaN(meters)) return '—';
  return parseFloat(meters).toFixed(2) + 'm';
}

// ---------------------------------------------------------------------------
// seasonLabel(year) -> Affiche le bon niveau de carrière
// ---------------------------------------------------------------------------
function seasonLabel(year) {
  var labels = { 
    1: 'HS Freshman', 2: 'HS Sophomore', 3: 'HS Junior', 4: 'HS Senior',
    5: 'College Freshman', 6: 'College Sophomore', 7: 'College Junior', 8: 'College Senior',
    9: 'Pro Rookie', 10: 'Pro Year 2', 11: 'Pro Year 3', 12: 'Pro Year 4',
    13: 'Pro Year 5', 14: 'Pro Year 6', 15: 'Pro Year 7', 16: 'Pro Year 8'
  };
  return labels[year] || 'Pro Year ' + (year - 8);
}

// ---------------------------------------------------------------------------
// energyClass(energy, config) -> CSS class string
// energyClass(energy) uses hardcoded thresholds if config unavailable
// ---------------------------------------------------------------------------
function energyClass(energy, config) {
  var midThreshold = 50;
  var lowThreshold = 25;
  if (config) {
    var es = config.energy_system || {};
    midThreshold = es.mid_threshold != null ? es.mid_threshold : midThreshold;
    lowThreshold = es.low_threshold != null ? es.low_threshold : lowThreshold;
  }
  if (energy >= midThreshold) return 'energy-high';
  if (energy >= lowThreshold) return 'energy-mid';
  return 'energy-low';
}

// ---------------------------------------------------------------------------
// formatStat(value) -> integer string
// ---------------------------------------------------------------------------
function formatStat(value) {
  if (value == null) return '0';
  return Math.round(value).toString();
}

// ---------------------------------------------------------------------------
// capitalize(str)
// ---------------------------------------------------------------------------
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ---------------------------------------------------------------------------
// formatPlace(n) -> "1st", "2nd", "3rd", "4th", …
// ---------------------------------------------------------------------------
function formatPlace(n) {
  if (n == null) return '—';
  var s = ['th', 'st', 'nd', 'rd'];
  var v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ---------------------------------------------------------------------------
// meetLabel(meetType) -> human-readable meet name
// ---------------------------------------------------------------------------
function meetLabel(meetType) {
  var labels = {
    local_meet: 'Local Meet',
    club_meet: 'Club Meet',
    class_meet: 'Class Championships',
    state_meet: 'State Championships',
    regional_meet: 'Regional Championships',
    national_meet: 'National Championships',
    bye: 'Bye Week',
  };
  return labels[meetType] || capitalize((meetType || '').replace(/_/g, ' '));
}
