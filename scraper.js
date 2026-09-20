/**
 * Streamic Live Sports Scraper Engine
 * Reverse-engineered scraper for Streamic.st live sports schedules & channel embeds.
 *
 * Features:
 * - Direct base64 API decoding (/api/getEvents.php + /api/J.php)
 * - Accurate Channel Name & Language parsing
 * - Indian Standard Time (IST, UTC+5:30) conversion
 * - Filter ONLY English & Famous/Top Sports events (removes obscure/minor events)
 * - User channel matching (filters to events you can actually stream from your sources)
 * - 20-minute pre-match activation window ("starting soon" & "active" filter)
 * - Auto-termination of expired/ended streams based on sport duration
 */

const https = require('https');
const { convertEventToMyChannels } = require('./converter');
const { getSonyLiveEvents } = require('./sony_epg');
const { getAllLiveScores, matchLiveScore } = require('./live_scores');
const { attachThumbnails } = require('./thumbnail_service');

const STREAMIC_HOST = 'streamic.st';
const STREAMIC_API_PATH = '/api/getEvents.php';
const STREAMIC_POPULAR_PATH = '/api/J.php';

// Official Streamic API signature & headers
const STREAMIC_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://streamic.st/',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Dest': 'empty',
  'X-SSIG': 'bytmo8xialhem066'
};

// Sport default match durations in minutes (used to auto-end streams)
const SPORT_DURATIONS = {
  pilkanozna: 115,           // Football / Soccer (90m + 15m half-time + stoppage)
  pilkanozna_wazne: 120,     // Major Football
  koszykowka: 150,           // Basketball (NBA ~2.5 hrs)
  tenis: 180,                // Tennis (~3 hrs)
  hokej: 160,                // Ice Hockey (~2.5 hrs)
  hokej_phl: 160,
  americanfootball: 210,     // NFL (~3.5 hrs)
  baseball: 190,             // MLB (~3 hrs)
  pilkareczna: 90,           // Handball (~1.5 hrs)
  futsal: 80,                // Futsal (~1.2 hrs)
  siatkowka: 120,            // Volleyball (~2 hrs)
  krykiet: 300,              // Cricket (T20/ODI ~4-6 hrs)
  dart: 120,                 // Darts (~2 hrs)
  snooker: 180,              // Snooker (~3 hrs)
  boks: 210,                 // Boxing / MMA (~3.5 hrs)
  mma: 210,
  motorsport: 130,           // F1 / Racing (~2 hrs)
  formula1: 130,
  australianfootball: 160,   // AFL (~2.5 hrs)
  default: 130
};

// Sport category names and emojis
const SPORT_INFO = {
  pilkanozna: { name: 'Football', emoji: '⚽' },
  pilkanozna_wazne: { name: 'Football (Top Match)', emoji: '⚽' },
  tenis: { name: 'Tennis', emoji: '🎾' },
  koszykowka: { name: 'Basketball', emoji: '🏀' },
  hokej: { name: 'Ice Hockey', emoji: '🏒' },
  hokej_phl: { name: 'Ice Hockey (PHL)', emoji: '🏒' },
  americanfootball: { name: 'American Football (NFL)', emoji: '🏈' },
  baseball: { name: 'Baseball (MLB)', emoji: '⚾' },
  pilkareczna: { name: 'Handball', emoji: '🤾' },
  futsal: { name: 'Futsal', emoji: '🥅' },
  siatkowka: { name: 'Volleyball', emoji: '🏐' },
  krykiet: { name: 'Cricket', emoji: '🏏' },
  dart: { name: 'Darts', emoji: '🎯' },
  snooker: { name: 'Snooker', emoji: '🎱' },
  boks: { name: 'Boxing', emoji: '🥊' },
  mma: { name: 'MMA / UFC', emoji: '🥊' },
  motorsport: { name: 'Motorsport', emoji: '🏎️' },
  formula1: { name: 'Formula 1', emoji: '🏎️' },
  australianfootball: { name: 'Australian Football', emoji: '🏉' },
  przypiete: { name: 'Featured Event', emoji: '📌' },
  default: { name: 'Live Sports', emoji: '🏆' }
};

// Famous & Top tier tournaments / leagues filter list
const FAMOUS_LEAGUES_KEYWORDS = [
  'premier league', 'la liga', 'serie a', 'bundesliga', 'ligue 1', 'champions league',
  'europa league', 'ucl', 'uel', 'fa cup', 'carabao', 'copa del rey', 'taça de portugal',
  'ufc', 'ksw', 'bellator', 'boxing', 'formula 1', 'f1', 'motogp',
  'nba', 'nfl', 'nhl', 'mlb', 'atp', 'wta', 'us open', 'wimbledon', 'australian open',
  'ipl', 't20', 'icc', 'cricket', 'afl', 'world cup',
  // Asian & Indian Competitions
  'asian games', 'asia cup', 'afc', 'afc champions league', 'afc cup', 'asian cup',
  'saudi pro league', 'saudi', 'isl', 'indian super league', 'ipl', 'bbl', 'psl',
  'j-league', 'j1 league', 'k-league', 'csl', 'al-nassr', 'al-hilal', 'al-ittihad'
];

// User's streamable channels from timst.cfd
const USER_STREAMABLE_CHANNELS = [
  { name: 'ABC', slug: 'abc', url: 'https://timst.cfd/channel/abc' },
  { name: 'ACC Network', slug: 'acc-network', url: 'https://timst.cfd/channel/acc-network' },
  { name: 'beIN Sports', slug: 'bein-sports', url: 'https://timst.cfd/channel/bein-sports' },
  { name: 'beIN Sports Francais 1', slug: 'bein-sports-francais-1', url: 'https://timst.cfd/channel/bein-sports-francais-1' },
  { name: 'beIN Sports Francais 2', slug: 'bein-sports-francais-2', url: 'https://timst.cfd/channel/bein-sports-francais-2' },
  { name: 'beIN Sports Francais 3', slug: 'bein-sports-francais-3', url: 'https://timst.cfd/channel/bein-sports-francais-3' },
  { name: 'Big Ten Network', slug: 'big-ten-network', url: 'https://timst.cfd/channel/big-ten-network' },
  { name: 'CANAL+ Extra 1', slug: 'canal-extra-1', url: 'https://timst.cfd/channel/canal-extra-1' },
  { name: 'CANAL+ Extra 2', slug: 'canal-extra-2', url: 'https://timst.cfd/channel/canal-extra-2' },
  { name: 'CANAL+ Sport PL', slug: 'canal-sport-pl', url: 'https://timst.cfd/channel/canal-sport-pl' },
  { name: 'CANAL+ Sport 2 PL', slug: 'canal-sport-2-pl', url: 'https://timst.cfd/channel/canal-sport-2-pl' },
  { name: 'CANAL+ Sport 3 PL', slug: 'canal-sport-3-pl', url: 'https://timst.cfd/channel/canal-sport-3-pl' },
  { name: 'CANAL+ Sport 4 PL', slug: 'canal-sport-4-pl', url: 'https://timst.cfd/channel/canal-sport-4-pl' },
  { name: 'CANAL+ Sport 5 PL', slug: 'canal-sport-5-pl', url: 'https://timst.cfd/channel/canal-sport-5-pl' },
  { name: 'CANAL+ Sport 6 PL', slug: 'canal-sport-6-pl', url: 'https://timst.cfd/channel/canal-sport-6-pl' },
  { name: 'CBS Sports Network', slug: 'cbs-sports-network', url: 'https://timst.cfd/channel/cbs-sports-network' },
  { name: 'DAZN 1 Germany', slug: 'dazn-1-germany', url: 'https://timst.cfd/channel/dazn-1-germany' },
  { name: 'DAZN 2 Germany', slug: 'dazn-2-germany', url: 'https://timst.cfd/channel/dazn-2-germany' },
  { name: 'DAZN 1 Italia', slug: 'dazn-1-italia', url: 'https://timst.cfd/channel/dazn-1-italia' },
  { name: 'DAZN 1 Spain', slug: 'dazn-1-spain', url: 'https://timst.cfd/channel/dazn-1-spain' },
  { name: 'DAZN 2 Spain', slug: 'dazn-2-spain', url: 'https://timst.cfd/channel/dazn-2-spain' },
  { name: 'DAZN 1 Portugal', slug: 'dazn-1-portugal', url: 'https://timst.cfd/channel/dazn-1-portugal' },
  { name: 'DAZN 1 USA', slug: 'dazn-1-usa', url: 'https://timst.cfd/channel/dazn-1-usa' },
  { name: 'DAZN F1', slug: 'dazn-f1', url: 'https://timst.cfd/channel/dazn-f1' },
  { name: 'DAZN LaLiga', slug: 'dazn-laliga', url: 'https://timst.cfd/channel/dazn-laliga' },
  { name: 'Eleven Sports 1', slug: 'eleven-sports-1', url: 'https://timst.cfd/channel/eleven-sports-1' },
  { name: 'Eleven Sports 2', slug: 'eleven-sports-2', url: 'https://timst.cfd/channel/eleven-sports-2' },
  { name: 'Eleven Sports 3', slug: 'eleven-sports-3', url: 'https://timst.cfd/channel/eleven-sports-3' },
  { name: 'Eleven Sports 4', slug: 'eleven-sports-4', url: 'https://timst.cfd/channel/eleven-sports-4' },
  { name: 'ESPN', slug: 'espn', url: 'https://timst.cfd/channel/espn' },
  { name: 'ESPN Deportes', slug: 'espn-deportes', url: 'https://timst.cfd/channel/espn-deportes' },
  { name: 'ESPN2', slug: 'espn2', url: 'https://timst.cfd/channel/espn2' },
  { name: 'ESPNEWS', slug: 'espnews', url: 'https://timst.cfd/channel/espnews' },
  { name: 'ESPNU', slug: 'espnu', url: 'https://timst.cfd/channel/espnu' },
  { name: 'Fox Deportes', slug: 'fox-deportes', url: 'https://timst.cfd/channel/fox-deportes' },
  { name: 'Fox Sports 1', slug: 'fox-sports-1', url: 'https://timst.cfd/channel/fox-sports-1' },
  { name: 'Fox Sports 2', slug: 'fox-sports-2', url: 'https://timst.cfd/channel/fox-sports-2' },
  { name: 'Fox Sports 501 (Cricket)', slug: 'fox-sports-501-cricket', url: 'https://timst.cfd/channel/fox-sports-501-cricket' },
  { name: 'Fox Sports 502 (League)', slug: 'fox-sports-502-league', url: 'https://timst.cfd/channel/fox-sports-502-league' },
  { name: 'Fox Sports 503', slug: 'fox-sports-503', url: 'https://timst.cfd/channel/fox-sports-503' },
  { name: 'Fox Sports 504 (Footy)', slug: 'fox-sports-504-footy', url: 'https://timst.cfd/channel/fox-sports-504-footy' },
  { name: 'Fox Sports 505', slug: 'fox-sports-505', url: 'https://timst.cfd/channel/fox-sports-505' },
  { name: 'Fox Sports 506', slug: 'fox-sports-506', url: 'https://timst.cfd/channel/fox-sports-506' },
  { name: 'Fox Sports 507', slug: 'fox-sports-507', url: 'https://timst.cfd/channel/fox-sports-507' },
  { name: 'Go3 Sport 1', slug: 'go3-sport-1', url: 'https://timst.cfd/channel/go3-sport-1' },
  { name: 'Go3 Sport 2', slug: 'go3-sport-2', url: 'https://timst.cfd/channel/go3-sport-2' },
  { name: 'Go3 Sport 3', slug: 'go3-sport-3', url: 'https://timst.cfd/channel/go3-sport-3' },
  { name: 'GOLF Channel', slug: 'golf-channel', url: 'https://timst.cfd/channel/golf-channel' },
  { name: 'MLB Network', slug: 'mlb-network', url: 'https://timst.cfd/channel/mlb-network' },
  { name: 'MotoGP Channel', slug: 'motogp-channel', url: 'https://timst.cfd/channel/motogp-channel' },
  { name: 'Movistar Deportes', slug: 'movistar-deportes', url: 'https://timst.cfd/channel/movistar-deportes' },
  { name: 'Movistar Deportes 2', slug: 'movistar-deportes-2', url: 'https://timst.cfd/channel/movistar-deportes-2' },
  { name: 'Movistar Deportes 3', slug: 'movistar-deportes-3', url: 'https://timst.cfd/channel/movistar-deportes-3' },
  { name: 'Movistar LaLiga', slug: 'movistar-laliga', url: 'https://timst.cfd/channel/movistar-laliga' },
  { name: 'NBA TV', slug: 'nba-tv', url: 'https://timst.cfd/channel/nba-tv' },
  { name: 'NBC Sports Bay Area', slug: 'nbc-sports-bay-area', url: 'https://timst.cfd/channel/nbc-sports-bay-area' },
  { name: 'NBC Sports Philadelphia', slug: 'nbc-sports-philadelphia', url: 'https://timst.cfd/channel/nbc-sports-philadelphia' },
  { name: 'NFL Network', slug: 'nfl-network', url: 'https://timst.cfd/channel/nfl-network' },
  { name: 'NHL Network', slug: 'nhl-network', url: 'https://timst.cfd/channel/nhl-network' },
  { name: 'Polsat Sport 1', slug: 'polsat-sport-1', url: 'https://timst.cfd/channel/polsat-sport-1' },
  { name: 'Polsat Sport 2', slug: 'polsat-sport-2', url: 'https://timst.cfd/channel/polsat-sport-2' },
  { name: 'Polsat Sport 3', slug: 'polsat-sport-3', url: 'https://timst.cfd/channel/polsat-sport-3' },
  { name: 'Polsat Sport Fight', slug: 'polsat-sport-fight', url: 'https://timst.cfd/channel/polsat-sport-fight' },
  { name: 'Premier Sports 1 IE', slug: 'premier-sports-1-ie', url: 'https://timst.cfd/channel/premier-sports-1-ie' },
  { name: 'Premier Sports 2 IE', slug: 'premier-sports-2-ie', url: 'https://timst.cfd/channel/premier-sports-2-ie' },
  { name: 'RACER Network', slug: 'racer-network', url: 'https://timst.cfd/channel/racer-network' },
  { name: 'Sky Sport 1 NZ', slug: 'sky-sport-1-nz', url: 'https://timst.cfd/channel/sky-sport-1-nz' },
  { name: 'Sky Sport 2 NZ', slug: 'sky-sport-2-nz', url: 'https://timst.cfd/channel/sky-sport-2-nz' },
  { name: 'Sky Sport 3 NZ', slug: 'sky-sport-3-nz', url: 'https://timst.cfd/channel/sky-sport-3-nz' },
  { name: 'Sky Sport 4 NZ', slug: 'sky-sport-4-nz', url: 'https://timst.cfd/channel/sky-sport-4-nz' },
  { name: 'Sky Sport 5 NZ', slug: 'sky-sport-5-nz', url: 'https://timst.cfd/channel/sky-sport-5-nz' },
  { name: 'Sky Sport 6 NZ', slug: 'sky-sport-6-nz', url: 'https://timst.cfd/channel/sky-sport-6-nz' },
  { name: 'Sky Sport 7 NZ', slug: 'sky-sport-7-nz', url: 'https://timst.cfd/channel/sky-sport-7-nz' },
  { name: 'Sky Sport 8 NZ', slug: 'sky-sport-8-nz', url: 'https://timst.cfd/channel/sky-sport-8-nz' },
  { name: 'Sky Sport 9 NZ', slug: 'sky-sport-9-nz', url: 'https://timst.cfd/channel/sky-sport-9-nz' },
  { name: 'Sky Sport Select NZ', slug: 'sky-sport-select-nz', url: 'https://timst.cfd/channel/sky-sport-select-nz' },
  { name: 'Sky Sport Bundesliga', slug: 'sky-sport-bundesliga', url: 'https://timst.cfd/channel/sky-sport-bundesliga' },
  { name: 'Sky Sports+', slug: 'sky-sports-plus', url: 'https://timst.cfd/channel/sky-sports-plus' },
  { name: 'Sky Sports Action', slug: 'sky-sports-action', url: 'https://timst.cfd/channel/sky-sports-action' },
  { name: 'Sky Sports Cricket', slug: 'sky-sports-cricket', url: 'https://timst.cfd/channel/sky-sports-cricket' },
  { name: 'Sky Sports F1', slug: 'sky-sports-f1', url: 'https://timst.cfd/channel/sky-sports-f1' },
  { name: 'Sky Sports Football', slug: 'sky-sports-football', url: 'https://timst.cfd/channel/sky-sports-football' },
  { name: 'Sky Sports Golf', slug: 'sky-sports-golf', url: 'https://timst.cfd/channel/sky-sports-golf' },
  { name: 'Sky Sports Main Event', slug: 'sky-sports-main-event', url: 'https://timst.cfd/channel/sky-sports-main-event' },
  { name: 'Sky Sports Mix', slug: 'sky-sports-mix', url: 'https://timst.cfd/channel/sky-sports-mix' },
  { name: 'Sky Sports News', slug: 'sky-sports-news', url: 'https://timst.cfd/channel/sky-sports-news' },
  { name: 'Sky Sports Premier League', slug: 'sky-sports-premier-league', url: 'https://timst.cfd/channel/sky-sports-premier-league' },
  { name: 'Sky Sports Racing', slug: 'sky-sports-racing', url: 'https://timst.cfd/channel/sky-sports-racing' },
  { name: 'Sky Sports Tennis', slug: 'sky-sports-tennis', url: 'https://timst.cfd/channel/sky-sports-tennis' },
  { name: 'Sony Sports Network', slug: 'sony-sports-network', url: 'https://timst.cfd/channel/sony-sports-network' },
  { name: 'Sony Sports Network 2', slug: 'sony-sports-network-2', url: 'https://timst.cfd/channel/sony-sports-network-2' },
  { name: 'Sony Sports Network 3', slug: 'sony-sports-network-3', url: 'https://timst.cfd/channel/sony-sports-network-3' },
  { name: 'Sony Sports Network 4', slug: 'sony-sports-network-4', url: 'https://timst.cfd/channel/sony-sports-network-4' },
  { name: 'Sony Sports Network 5', slug: 'sony-sports-network-5', url: 'https://timst.cfd/channel/sony-sports-network-5' },
  { name: 'SPORTDIGITAL FUSSBALL', slug: 'sportdigital-fussball', url: 'https://timst.cfd/channel/sportdigital-fussball' },
  { name: 'Sport TV1', slug: 'sport-tv1', url: 'https://timst.cfd/channel/sport-tv1' },
  { name: 'Sport TV2', slug: 'sport-tv2', url: 'https://timst.cfd/channel/sport-tv2' },
  { name: 'Sport TV3', slug: 'sport-tv3', url: 'https://timst.cfd/channel/sport-tv3' },
  { name: 'Sport TV4', slug: 'sport-tv4', url: 'https://timst.cfd/channel/sport-tv4' },
  { name: 'Sport TV5', slug: 'sport-tv5', url: 'https://timst.cfd/channel/sport-tv5' },
  { name: 'Tennis Channel', slug: 'tennis-channel', url: 'https://timst.cfd/channel/tennis-channel' },
  { name: 'TNT Sports 1', slug: 'tnt-sports-1', url: 'https://timst.cfd/channel/tnt-sports-1' },
  { name: 'TNT Sports 2', slug: 'tnt-sports-2', url: 'https://timst.cfd/channel/tnt-sports-2' },
  { name: 'TNT Sports 3', slug: 'tnt-sports-3', url: 'https://timst.cfd/channel/tnt-sports-3' },
  { name: 'TNT Sports 4', slug: 'tnt-sports-4', url: 'https://timst.cfd/channel/tnt-sports-4' },
  { name: 'TSN1', slug: 'tsn1', url: 'https://timst.cfd/channel/tsn1' },
  { name: 'TUDN', slug: 'tudn', url: 'https://timst.cfd/channel/tudn' },
  { name: 'TYC Sports Internacional', slug: 'tyc-sports-internacional', url: 'https://timst.cfd/channel/tyc-sports-internacional' },
  { name: 'UFC Fight Pass 24/7', slug: 'ufc-fight-pass-24-7', url: 'https://timst.cfd/channel/ufc-fight-pass-24-7' },
  { name: 'WAPA Deportes', slug: 'wapa-deportes', url: 'https://timst.cfd/channel/wapa-deportes' },
  { name: 'Willow Cricket', slug: 'willow-cricket', url: 'https://timst.cfd/channel/willow-cricket' },
  { name: 'Willow Cricket 2', slug: 'willow-cricket-2', url: 'https://timst.cfd/channel/willow-cricket-2' },
  { name: 'Sky Sport 24', slug: 'sky-sport-24', url: 'https://timst.cfd/channel/sky-sport-24' },
  { name: 'Sky Sport Uno', slug: 'sky-sport-uno', url: 'https://timst.cfd/channel/sky-sport-uno' }
];

function cleanStr(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Check if a Streamic channel name matches any of the user's streamable channels
 */
function findUserChannelMatch(streamicChannelName) {
  const sClean = cleanStr(streamicChannelName);
  const sNum = streamicChannelName.match(/\d+/)?.[0];

  return USER_STREAMABLE_CHANNELS.find(u => {
    const uClean = cleanStr(u.name);
    const uSlug = cleanStr(u.slug);
    const uNum = u.name.match(/\d+/)?.[0];

    if (sNum && uNum && sNum !== uNum) return false;
    if (uClean === sClean || uSlug === sClean) return true;

    if (sClean === 'beinsportsus' && uSlug === 'beinsports') return true;
    if (sClean.includes('skysport') && sClean.includes('premierleague') && uSlug === 'skysportspremierleague') return true;
    if (sClean.includes('skysport') && sClean.includes('football') && uSlug === 'skysportsfootball') return true;
    if (sClean.includes('skysport') && sClean.includes('cricket') && uSlug === 'skysportscricket') return true;
    if (sClean.includes('skysport') && sClean.includes('mainevent') && uSlug === 'skysportsmainevent') return true;
    if (sClean.startsWith('skysport') && sNum && uSlug === `skysport${sNum}nz`) return true;
    if (sClean.startsWith('tntsport') && sNum && uSlug === `tntsports${sNum}`) return true;
    if (sClean.startsWith('premiersport') && sNum && uSlug === `premiersports${sNum}ie`) return true;
    if (sClean === 'foxsports2' && uSlug === 'foxsports2') return true;
    if (sClean === 'nhlnetwork' && uSlug === 'nhlnetwork') return true;
    if (sClean === 'cbssportsnetwork' && uSlug === 'cbssportsnetwork') return true;

    if (sClean.startsWith('canal+sport') && sNum && (uSlug === `canalsport${sNum}pl` || uSlug === `canalsport${sNum}`)) return true;
    if (sClean.startsWith('canal+extra') && sNum && uSlug === `canalextra${sNum}`) return true;
    if (sClean.startsWith('elevensports') && sNum && uSlug === `elevensports${sNum}`) return true;
    if (sClean.startsWith('polsatsport') && sNum && uSlug === `polsatsport${sNum}`) return true;
    if (sClean.startsWith('sporttv') && sNum && uSlug === `sporttv${sNum}`) return true;
    if (sClean.includes('daznlaliga') && uSlug === 'daznlaliga') return true;
    if (sClean.startsWith('dazn1') && uSlug.includes('dazn1')) return true;
    if (sClean === 'espn' && uSlug === 'espn') return true;
    if (sClean === 'espn3' && uSlug === 'espn') return true;
    if (sClean === 'tudnusa' && uSlug === 'tudn') return true;
    if (sClean.includes('tycsport') && uSlug === 'tycsportsinternacional') return true;

    return false;
  }) || null;
}

/**
 * Perform HTTPS GET request with timeout and error handling
 */
function fetchHttps(path, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: STREAMIC_HOST,
      port: 443,
      path,
      method: 'GET',
      headers: { ...STREAMIC_HEADERS, ...customHeaders },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, body: data });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request to ${path} timed out after 10s`));
    });
    req.end();
  });
}

/**
 * Format Date to Indian Standard Time (IST, UTC+5:30)
 */
function formatToIST(dateObj) {
  const utcTime = dateObj.getTime() + (dateObj.getTimezoneOffset() * 60000);
  const istOffsetMs = (5 * 60 + 30) * 60000;
  const istDate = new Date(utcTime + istOffsetMs);

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = istDate.getDate().toString().padStart(2, '0');
  const month = months[istDate.getMonth()];
  const year = istDate.getFullYear();

  let hours = istDate.getHours();
  const minutes = istDate.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hoursStr = hours.toString().padStart(2, '0');

  return {
    istTime: `${hoursStr}:${minutes} ${ampm} IST`,
    istDate: `${day} ${month} ${year}`,
    istFull: `${day} ${month} ${year}, ${hoursStr}:${minutes} ${ampm} IST`,
    isoString: istDate.toISOString()
  };
}

/**
 * Clean & normalize channel names
 */
function parseChannelInfo(rawLangString) {
  if (!rawLangString || typeof rawLangString !== 'string') {
    return { channelName: 'Sports Live', language: 'International', isEnglish: false };
  }

  const isEnglish = rawLangString.toLowerCase().includes('english');
  const parts = rawLangString.split('|').map(s => s.trim());
  let language = parts[0] || 'International';
  let channelName = parts.slice(1).join(' | ').trim();

  if (!channelName) {
    channelName = language;
    language = 'International';
  }

  channelName = channelName.replace(/^([a-z]{2})\s*-\s*/i, '').trim();

  return { channelName, language, isEnglish };
}

/**
 * Check if event qualifies as Famous / Top Event
 */
function isFamousEvent(raw) {
  if (raw.category === 'pilkanozna_wazne' || raw.category === 'przypiete' || raw.category === 'formula1' || raw.category === 'mma') {
    return true;
  }
  const l = (raw.league || '').toLowerCase();
  const t = (typeof raw.title === 'string' ? raw.title : JSON.stringify(raw.title || '')).toLowerCase();
  return FAMOUS_LEAGUES_KEYWORDS.some(k => l.includes(k) || t.includes(k));
}

/**
 * Transform a raw Streamic event into an IST event with stream lifecycle
 */
function transformEvent(raw, nowEpochSec) {
  const startTime = Number(raw.startTime);
  const startDate = new Date(startTime * 1000);
  const ist = formatToIST(startDate);

  const categoryKey = raw.category || 'default';
  const durationMin = SPORT_DURATIONS[categoryKey] || SPORT_DURATIONS.default;
  const durationSec = durationMin * 60;
  const endTime = startTime + durationSec;
  const endDate = new Date(endTime * 1000);
  const istEnd = formatToIST(endDate);

  const secUntilStart = startTime - nowEpochSec;
  const minUntilStart = Math.round(secUntilStart / 60);
  const secElapsed = nowEpochSec - startTime;
  const minElapsed = Math.round(secElapsed / 60);

  let status = 'UPCOMING';
  let isStartingSoon = false;
  let isLive = false;
  let isEnded = false;
  let canWatch = false;
  let countdownText = '';

  if (nowEpochSec >= endTime) {
    status = 'ENDED';
    isEnded = true;
    canWatch = false;
    const minSinceEnd = Math.round((nowEpochSec - endTime) / 60);
    countdownText = minSinceEnd > 60 
      ? `Ended ${Math.round(minSinceEnd / 60)}h ago` 
      : `Ended ${minSinceEnd}m ago`;
  } else if (nowEpochSec >= startTime) {
    status = 'LIVE';
    isLive = true;
    canWatch = true;
    countdownText = `🔴 LIVE now (${minElapsed}m in)`;
  } else if (secUntilStart <= 20 * 60) {
    status = 'STARTING_SOON';
    isStartingSoon = true;
    canWatch = true; // Unlocks in 20-min window!
    countdownText = minUntilStart <= 1 ? 'Starting in < 1 min' : `Starting in ${minUntilStart} mins`;
  } else {
    status = 'UPCOMING';
    canWatch = false;
    const hoursUntil = Math.floor(minUntilStart / 60);
    const remMin = minUntilStart % 60;
    countdownText = hoursUntil > 0 
      ? `Starts in ${hoursUntil}h ${remMin}m` 
      : `Starts in ${minUntilStart}m`;
  }

  const channels = [];
  const embedStreams = [];
  let hasEnglish = false;
  const userMatchingChannels = [];

  (raw._embeds || []).forEach(block => {
    const { channelName, language, isEnglish } = parseChannelInfo(block.language);
    if (isEnglish) hasEnglish = true;

    // Check if user has this channel in their timst.cfd streamable list
    const userMatch = findUserChannelMatch(channelName);
    if (userMatch) {
      if (!userMatchingChannels.some(u => u.slug === userMatch.slug)) {
        userMatchingChannels.push(userMatch);
      }
    }

    const streamList = [];
    Object.entries(block.embeds || {}).forEach(([key, stream]) => {
      if (stream && stream.embed) {
        streamList.push({
          quality: stream.label || 'HD',
          embedUrl: stream.embed
        });
        embedStreams.push({
          channelName,
          language,
          isEnglish,
          quality: stream.label || 'HD',
          embedUrl: stream.embed,
          userStreamUrl: userMatch?.url || null
        });
      }
    });

    if (streamList.length > 0) {
      channels.push({
        channelName,
        language,
        isEnglish,
        userHasChannel: !!userMatch,
        userChannelUrl: userMatch?.url || null,
        streams: streamList
      });
    }
  });

  const sport = SPORT_INFO[categoryKey] || SPORT_INFO.default;
  const famous = isFamousEvent(raw);

  let title = raw.title;
  if (typeof title === 'object' && title !== null) {
    if (title.pl) {
      title = `${title.pl.home || ''} vs ${title.pl.away || ''}`.trim();
    } else {
      title = Object.values(title).join(' vs ');
    }
  }

  return {
    id: raw.id,
    title: title || 'Live Sports Event',
    category: categoryKey,
    sportName: sport.name,
    sportEmoji: sport.emoji,
    league: raw.league || '',
    countryCode: (raw.countryCode || '').toUpperCase(),
    startTime,
    endTime,
    durationMinutes: durationMin,
    // IST
    timeIST: ist.istTime,
    dateIST: ist.istDate,
    fullIST: ist.istFull,
    endTimeIST: istEnd.istTime,
    // Lifecycle
    status,
    isLive,
    isStartingSoon,
    isEnded,
    canWatch,
    countdown: countdownText,
    // English & Famous flags
    hasEnglish,
    isFamous: famous,
    // User channel mapping & intelligent converter
    userHasChannel: userMatchingChannels.length > 0,
    userMatchingChannels,
    myConvertedChannels: convertEventToMyChannels({
      id: raw.id,
      title: title || '',
      category: categoryKey,
      league: raw.league || '',
      channels
    }),
    // Channels
    channelsCount: channels.length,
    channels,
    embedStreams
  };
}

/**
 * Fetch and parse Streamic schedule with English & Famous filters
 *
 * @param {Object} options
 * @param {boolean} [options.onlyEnglishAndFamous=true] - Filters ONLY events with English commentary OR top famous leagues.
 * @param {boolean} [options.onlyMyChannels=false] - Filters ONLY events broadcast on channels the user has in timst.cfd.
 * @param {boolean} [options.activeOnly=false] - Only events starting within 20m or currently LIVE.
 * @param {boolean} [options.hideEnded=true] - Auto-drops finished matches.
 * @param {string} [options.category] - Filter by sport.
 * @param {string} [options.search] - Filter by keyword.
 */
async function getSchedule(options = {}) {
  const onlyEnglishAndFamous = options.onlyEnglishAndFamous ?? true;
  const onlyMyChannels = options.onlyMyChannels ?? false;
  const activeOnly = options.activeOnly ?? false;
  const onlyLive = options.onlyLive ?? false;
  const hideEnded = options.hideEnded ?? true;
  const categoryFilter = options.category ? options.category.toLowerCase() : null;
  const searchFilter = options.search ? options.search.toLowerCase() : null;
  const nowEpochSec = options.customNow || Math.floor(Date.now() / 1000);

  let rawList = [];
  let sonyEvents = [];
  let liveScores = null;

  const [streamicRes, sonyRes, scoresRes] = await Promise.allSettled([
    fetchHttps(STREAMIC_API_PATH),
    getSonyLiveEvents({ onlyActive: activeOnly, onlyLive }),
    getAllLiveScores()
  ]);

  if (scoresRes.status === 'fulfilled' && scoresRes.value) {
    liveScores = scoresRes.value;
  }

  if (streamicRes.status === 'fulfilled' && streamicRes.value && streamicRes.value.body) {
    try {
      const decodedJson = Buffer.from(streamicRes.value.body.trim(), 'base64').toString('utf8');
      const parsed = JSON.parse(decodedJson);
      if (Array.isArray(parsed)) rawList = parsed;
    } catch (e) {}
  }

  if (rawList.length === 0) {
    try {
      const popRes = await fetchHttps(STREAMIC_POPULAR_PATH);
      if (popRes.status === 200 && popRes.body) {
        const parsed = JSON.parse(popRes.body);
        if (Array.isArray(parsed)) rawList = parsed;
      }
    } catch (popErr) {}
  }

  if (sonyRes.status === 'fulfilled' && Array.isArray(sonyRes.value)) {
    sonyEvents = sonyRes.value;
  }

  let events = [
    ...rawList.map(raw => transformEvent(raw, nowEpochSec)),
    ...sonyEvents
  ];

  // Discard any past year replays (2025, 2024, etc.) or highlights from any source
  const pastYearRegex = /\b(19\d\d|20[0-1]\d|202[0-5])\b/;
  const nonLiveTitleRegex = /\b(highlights?|replay|repeat|rewind|classic|vault|magazine)\b/i;
  events = events.filter(e => {
    if (pastYearRegex.test(e.title)) return false;
    if (nonLiveTitleRegex.test(e.title)) return false;
    return true;
  });

  // 1. Filter ONLY English & Famous Events (removes all random local tier-3 games)
  if (onlyEnglishAndFamous) {
    events = events.filter(e => e.hasEnglish || e.isFamous);
  }

  // 2. Filter ONLY events where User has the broadcast channel
  if (onlyMyChannels) {
    events = events.filter(e => e.userHasChannel);
  }

  // 3. Category & Search filters
  if (categoryFilter) {
    events = events.filter(e => 
      e.category.toLowerCase().includes(categoryFilter) || 
      e.sportName.toLowerCase().includes(categoryFilter)
    );
  }
  if (searchFilter) {
    events = events.filter(e => 
      e.title.toLowerCase().includes(searchFilter) ||
      e.league.toLowerCase().includes(searchFilter) ||
      e.channels.some(c => c.channelName.toLowerCase().includes(searchFilter))
    );
  }

  // 4. Hide Ended
  if (hideEnded) {
    events = events.filter(e => !e.isEnded);
  }

  // 5. Filter for strictly LIVE matches
  if (onlyLive) {
    events = events.filter(e => e.isLive);
  } else if (activeOnly) {
    // 6. Active Window Only (≤20m or LIVE)
    events = events.filter(e => e.canWatch);
  }

  // Attach Real-Time Live Match Statistics / Scores
  events.forEach(e => {
    e.liveScore = matchLiveScore(e, liveScores);
  });

  // Attach High-Resolution Event Thumbnails (Bing / Official EPG Assets / Cache)
  await attachThumbnails(events, 6);

  const statusRank = { LIVE: 0, STARTING_SOON: 1, UPCOMING: 2, ENDED: 3 };
  events.sort((a, b) => {
    if (statusRank[a.status] !== statusRank[b.status]) {
      return statusRank[a.status] - statusRank[b.status];
    }
    return a.startTime - b.startTime;
  });

  return {
    success: true,
    totalEvents: events.length,
    timestampIST: formatToIST(new Date(nowEpochSec * 1000)).istFull,
    filtersApplied: {
      onlyEnglishAndFamous,
      onlyMyChannels,
      activeOnly,
      onlyLive,
      hideEnded,
      category: categoryFilter,
      search: searchFilter
    },
    counts: {
      live: events.filter(e => e.status === 'LIVE').length,
      startingSoon: events.filter(e => e.status === 'STARTING_SOON').length,
      upcoming: events.filter(e => e.status === 'UPCOMING').length,
      ended: events.filter(e => e.status === 'ENDED').length
    },
    liveScoresSummary: liveScores ? {
      totalFootballMatches: liveScores.football?.length || 0,
      totalCricketMatches: liveScores.cricket?.length || 0,
      activeLiveMatches: liveScores.liveMatchesCount || 0
    } : null,
    events
  };
}

/**
 * Extract distinct channels list
 */
async function getChannels(options = {}) {
  const scheduleData = await getSchedule(options);
  const channelMap = new Map();

  scheduleData.events.forEach(event => {
    event.channels.forEach(ch => {
      const key = `${ch.channelName}__${ch.language}`;
      if (!channelMap.has(key)) {
        channelMap.set(key, {
          channelName: ch.channelName,
          language: ch.language,
          isEnglish: ch.isEnglish,
          userHasChannel: ch.userHasChannel,
          userChannelUrl: ch.userChannelUrl,
          activeEvents: []
        });
      }

      channelMap.get(key).activeEvents.push({
        eventId: event.id,
        title: event.title,
        sport: event.sportName,
        timeIST: event.timeIST,
        status: event.status,
        canWatch: event.canWatch,
        streams: ch.streams
      });
    });
  });

  const channels = [...channelMap.values()].sort((a, b) => 
    b.activeEvents.length - a.activeEvents.length
  );

  return {
    success: true,
    totalChannels: channels.length,
    timestampIST: scheduleData.timestampIST,
    channels
  };
}

/**
 * Generate M3U playlist of currently watchable streams (LIVE or within 20 mins)
 */
async function generateActiveM3U(options = {}) {
  const result = await getSchedule({ ...options, activeOnly: true });
  let m3u = '#EXTM3U name="Streamic Active English & Famous Live Sports (IST)"\n\n';

  result.events.forEach(event => {
    event.channels.forEach(ch => {
      const stream = ch.streams[0];
      if (stream && stream.embedUrl) {
        m3u += `#EXTINF:-1 tvg-name="${ch.channelName}" group-title="${event.sportName}" tvg-language="${ch.language}",[${event.status}] ${ch.channelName} — ${event.title} (${event.timeIST})\n`;
        m3u += `${stream.embedUrl}\n\n`;
      }
    });
  });

  return m3u;
}

module.exports = {
  getSchedule,
  getChannels,
  generateActiveM3U,
  getAllLiveScores,
  formatToIST,
  transformEvent,
  findUserChannelMatch,
  USER_STREAMABLE_CHANNELS,
  SPORT_DURATIONS,
  SPORT_INFO
};
