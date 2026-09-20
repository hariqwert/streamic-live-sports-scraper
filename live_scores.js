/**
 * Real-Time Live Sports Scores & Statistics Engine
 *
 * Sources:
 * - Football: ESPN Live Scoreboard APIs (Premier League, La Liga, Serie A, Bundesliga, Champions League, Europa League, Ligue 1)
 * - Cricket: ESPN Cricket Scorepanel (Asian Games, Bilateral Tours, CPL, ICC, One-Day Cups, T20s)
 *
 * Features:
 * - 100% Real-Time Data (No dummy scores)
 * - Auto-fuzzy matching between Streamic/Sony event titles and live fixtures
 * - Team logos, scores, live match clock (e.g. 67', HT, FT), overs, wickets, and run targets
 * - In-memory smart caching (30s TTL) to prevent rate limiting
 */

const http = require('http');

const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.google.com/'
};

const FOOTBALL_LEAGUES = [
  { code: 'eng.1', name: 'English Premier League' },
  { code: 'esp.1', name: 'Spanish La Liga' },
  { code: 'ita.1', name: 'Italian Serie A' },
  { code: 'ger.1', name: 'German Bundesliga' },
  { code: 'uefa.champions', name: 'UEFA Champions League' },
  { code: 'uefa.europa', name: 'UEFA Europa League' },
  { code: 'fra.1', name: 'French Ligue 1' },
  { code: 'usa.1', name: 'Major League Soccer' }
];

let cachedFootballScores = null;
let lastFootballFetch = 0;

let cachedCricketScores = null;
let lastCricketFetch = 0;

const CACHE_TTL_MS = 30 * 1000; // 30 seconds

function fetchHttpJson(url) {
  return new Promise((resolve) => {
    http.get(url, { headers: HTTP_HEADERS, timeout: 6000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch(e) { resolve(null); }
        } else {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

/**
 * Fetch all live football scores across top European & International leagues
 */
async function getFootballLiveScores(force = false) {
  const now = Date.now();
  if (!force && cachedFootballScores && (now - lastFootballFetch < CACHE_TTL_MS)) {
    return cachedFootballScores;
  }

  const promises = FOOTBALL_LEAGUES.map(l =>
    fetchHttpJson(`http://site.api.espn.com/apis/site/v2/sports/soccer/${l.code}/scoreboard`)
  );

  const results = await Promise.allSettled(promises);
  const matches = [];

  results.forEach((r, idx) => {
    if (r.status !== 'fulfilled' || !r.value || !r.value.events) return;
    const leagueMeta = FOOTBALL_LEAGUES[idx];

    r.value.events.forEach(ev => {
      const comp = ev.competitions?.[0];
      if (!comp) return;

      const home = comp.competitors?.find(c => c.homeAway === 'home');
      const away = comp.competitors?.find(c => c.homeAway === 'away');
      if (!home || !away) return;

      const homeName = home.team?.displayName || home.team?.name || '';
      const awayName = away.team?.displayName || away.team?.name || '';
      const homeScore = home.score !== undefined ? String(home.score) : '0';
      const awayScore = away.score !== undefined ? String(away.score) : '0';

      const state = ev.status?.type?.state; // 'pre', 'in', 'post'
      const isLive = state === 'in';
      const isFinal = state === 'post';
      const clock = ev.status?.displayClock || '';
      const detail = ev.status?.type?.detail || '';

      matches.push({
        id: `fb_${ev.id}`,
        sport: 'football',
        league: r.value.leagues?.[0]?.name || leagueMeta.name,
        name: ev.name || `${homeName} vs ${awayName}`,
        homeTeam: {
          name: homeName,
          shortName: home.team?.shortDisplayName || homeName,
          abbreviation: home.team?.abbreviation || '',
          score: homeScore,
          logo: home.team?.logo || ''
        },
        awayTeam: {
          name: awayName,
          shortName: away.team?.shortDisplayName || awayName,
          abbreviation: away.team?.abbreviation || '',
          score: awayScore,
          logo: away.team?.logo || ''
        },
        isLive,
        isFinal,
        clock,
        detail,
        summary: `${homeName} ${homeScore} - ${awayScore} ${awayName}${isLive ? ` (${clock || 'Live'})` : ''}`
      });
    });
  });

  cachedFootballScores = matches;
  lastFootballFetch = now;
  return matches;
}

/**
 * Fetch all live cricket scores across ongoing tournaments
 */
async function getCricketLiveScores(force = false) {
  const now = Date.now();
  if (!force && cachedCricketScores && (now - lastCricketFetch < CACHE_TTL_MS)) {
    return cachedCricketScores;
  }

  const json = await fetchHttpJson('http://site.api.espn.com/apis/site/v2/sports/cricket/scorepanel');
  const matches = [];

  if (json && Array.isArray(json.scores)) {
    json.scores.forEach(s => {
      const leagueName = s.leagues?.[0]?.name || 'Cricket Match';
      (s.events || []).forEach(ev => {
        const comp = ev.competitions?.[0];
        if (!comp) return;

        const competitors = (comp.competitors || []).map(c => ({
          name: c.team?.displayName || c.team?.name || '',
          shortName: c.team?.shortDisplayName || c.team?.abbreviation || '',
          score: c.score || 'Yet to bat',
          overs: c.currentOvers || c.overs || '',
          logo: c.team?.logo || ''
        }));

        if (competitors.length < 2) return;

        const state = ev.status?.type?.state; // 'pre', 'in', 'post'
        const isLive = state === 'in' || /live/i.test(ev.status?.type?.detail || '');
        const isFinal = state === 'post' || /final|won by|result/i.test(ev.status?.type?.detail || '');
        const detail = ev.status?.type?.detail || '';
        const summary = competitors.map(c => `${c.name}: ${c.score}`).join(' vs ');

        matches.push({
          id: `cr_${ev.id}`,
          sport: 'cricket',
          league: leagueName,
          name: ev.name || summary,
          teams: competitors,
          isLive,
          isFinal,
          detail,
          summary
        });
      });
    });
  }

  cachedCricketScores = matches;
  lastCricketFetch = now;
  return matches;
}

/**
 * Clean & normalize a team name for fuzzy matching
 */
function normalizeTeamName(str) {
  return (str || '')
    .toLowerCase()
    .replace(/\b(fc|afc|cf|sc|united|city|town|athletic|club|w|women|men)\b/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Match an event to a live score
 *
 * @param {Object} event
 * @param {Object} [allScores]
 */
function matchLiveScore(event, allScores = null) {
  if (!allScores) return null;
  const title = (event.rawTitle || event.title || '').toLowerCase();
  const category = (event.category || '').toLowerCase();

  // 1. Check Football matches
  if (category.includes('pilkanozna') || category.includes('football') || category.includes('soccer') || allScores.football) {
    for (const fb of (allScores.football || [])) {
      const homeNorm = normalizeTeamName(fb.homeTeam.name);
      const awayNorm = normalizeTeamName(fb.awayTeam.name);

      // Check if both home and away team names (or main words) appear in event title
      const homeWords = homeNorm.split(' ').filter(w => w.length >= 3);
      const awayWords = awayNorm.split(' ').filter(w => w.length >= 3);

      const hasHome = homeWords.some(w => title.includes(w));
      const hasAway = awayWords.some(w => title.includes(w));

      if (hasHome && hasAway) {
        return {
          hasScore: true,
          sport: 'Football',
          league: fb.league,
          isLive: fb.isLive,
          isFinal: fb.isFinal,
          clock: fb.clock,
          detail: fb.detail,
          homeTeam: fb.homeTeam,
          awayTeam: fb.awayTeam,
          summary: fb.summary
        };
      }
    }
  }

  // 2. Check Cricket matches
  if (category.includes('krykiet') || category.includes('cricket') || title.includes('cricket') || allScores.cricket) {
    for (const cr of (allScores.cricket || [])) {
      if (cr.teams.length >= 2) {
        const t1Words = normalizeTeamName(cr.teams[0].name).split(' ').filter(w => w.length >= 3);
        const t2Words = normalizeTeamName(cr.teams[1].name).split(' ').filter(w => w.length >= 3);

        const hasT1 = t1Words.some(w => title.includes(w));
        const hasT2 = t2Words.some(w => title.includes(w));

        if (hasT1 && hasT2) {
          return {
            hasScore: true,
            sport: 'Cricket',
            league: cr.league,
            isLive: cr.isLive,
            isFinal: cr.isFinal,
            detail: cr.detail,
            teams: cr.teams,
            summary: cr.summary
          };
        }
      }
    }
  }

  return null;
}

/**
 * Fetch all current live sports scores
 */
async function getAllLiveScores(force = false) {
  const [football, cricket] = await Promise.all([
    getFootballLiveScores(force),
    getCricketLiveScores(force)
  ]);

  return {
    timestamp: new Date().toISOString(),
    totalMatches: football.length + cricket.length,
    liveMatchesCount: football.filter(m => m.isLive).length + cricket.filter(m => m.isLive).length,
    football,
    cricket
  };
}

module.exports = {
  getAllLiveScores,
  getFootballLiveScores,
  getCricketLiveScores,
  matchLiveScore
};
