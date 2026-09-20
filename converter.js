/**
 * Channel Converter & Stream Router
 *
 * Automatically converts any Streamic event (even if it airs on foreign channels
 * like beIN Sports 1 Ina, Arena Sport, Nova Sport, Cosmote, or Canal+ Sport)
 * to YOUR OWN 24/7 streamable channels from timst.cfd.
 */

// User's available streamable channels
const USER_CHANNELS = {
  // Football / Soccer
  premierLeague: [
    { name: 'Sky Sports Premier League', url: 'https://timst.cfd/channel/sky-sports-premier-league' },
    { name: 'Sky Sports Main Event', url: 'https://timst.cfd/channel/sky-sports-main-event' },
    { name: 'TNT Sports 1', url: 'https://timst.cfd/channel/tnt-sports-1' }
  ],
  laLiga: [
    { name: 'Premier Sports 1', url: 'https://timst.cfd/channel/premier-sports-1-ie' },
    { name: 'DAZN LaLiga', url: 'https://timst.cfd/channel/dazn-laliga' },
    { name: 'ESPN', url: 'https://timst.cfd/channel/espn' },
    { name: 'Movistar LaLiga', url: 'https://timst.cfd/channel/movistar-laliga' }
  ],
  serieA: [
    { name: 'TNT Sports 1', url: 'https://timst.cfd/channel/tnt-sports-1' },
    { name: 'CBS Sports Network', url: 'https://timst.cfd/channel/cbs-sports-network' },
    { name: 'DAZN 1 Italia', url: 'https://timst.cfd/channel/dazn-1-italia' }
  ],
  bundesliga: [
    { name: 'Sky Sport Bundesliga', url: 'https://timst.cfd/channel/sky-sport-bundesliga' },
    { name: 'DAZN 1 Germany', url: 'https://timst.cfd/channel/dazn-1-germany' },
    { name: 'ESPN', url: 'https://timst.cfd/channel/espn' }
  ],
  championsLeague: [
    { name: 'TNT Sports 1', url: 'https://timst.cfd/channel/tnt-sports-1' },
    { name: 'TNT Sports 2', url: 'https://timst.cfd/channel/tnt-sports-2' },
    { name: 'CBS Sports Network', url: 'https://timst.cfd/channel/cbs-sports-network' }
  ],
  generalFootball: [
    { name: 'Sky Sports Football', url: 'https://timst.cfd/channel/sky-sports-football' },
    { name: 'FOX Sports 1', url: 'https://timst.cfd/channel/fox-sports-1' },
    { name: 'FOX Sports 2', url: 'https://timst.cfd/channel/fox-sports-2' },
    { name: 'SPORTDIGITAL FUSSBALL', url: 'https://timst.cfd/channel/sportdigital-fussball' }
  ],
  portugueseFootball: [
    { name: 'Sport TV1', url: 'https://timst.cfd/channel/sport-tv1' },
    { name: 'Sport TV2', url: 'https://timst.cfd/channel/sport-tv2' },
    { name: 'DAZN 1 Portugal', url: 'https://timst.cfd/channel/dazn-1-portugal' }
  ],
  asianFootball: [
    { name: 'Sony Sports Network', url: 'https://timst.cfd/channel/sony-sports-network' },
    { name: 'FOX Sports 2', url: 'https://timst.cfd/channel/fox-sports-2' },
    { name: 'beIN Sports', url: 'https://timst.cfd/channel/bein-sports' }
  ],
  // Other Sports
  cricket: [
    { name: 'Sky Sports Cricket', url: 'https://timst.cfd/channel/sky-sports-cricket' },
    { name: 'Willow Cricket', url: 'https://timst.cfd/channel/willow-cricket' },
    { name: 'Willow Cricket 2', url: 'https://timst.cfd/channel/willow-cricket-2' },
    { name: 'Sony Sports Network', url: 'https://timst.cfd/channel/sony-sports-network' },
    { name: 'Fox Sports 501 (Cricket)', url: 'https://timst.cfd/channel/fox-sports-501-cricket' }
  ],
  f1Motorsport: [
    { name: 'Sky Sports F1', url: 'https://timst.cfd/channel/sky-sports-f1' },
    { name: 'DAZN F1', url: 'https://timst.cfd/channel/dazn-f1' },
    { name: 'MotoGP Channel', url: 'https://timst.cfd/channel/motogp-channel' }
  ],
  combatMMA: [
    { name: 'UFC Fight Pass 24/7', url: 'https://timst.cfd/channel/ufc-fight-pass-24-7' },
    { name: 'TNT Sports 1', url: 'https://timst.cfd/channel/tnt-sports-1' },
    { name: 'Polsat Sport Fight', url: 'https://timst.cfd/channel/polsat-sport-fight' }
  ],
  tennis: [
    { name: 'Tennis Channel', url: 'https://timst.cfd/channel/tennis-channel' },
    { name: 'Sky Sports Tennis', url: 'https://timst.cfd/channel/sky-sports-tennis' }
  ],
  basketballNBA: [
    { name: 'NBA TV', url: 'https://timst.cfd/channel/nba-tv' },
    { name: 'ESPN', url: 'https://timst.cfd/channel/espn' },
    { name: 'TNT', url: 'https://timst.cfd/channel/tnt' }
  ],
  americanFootballNFL: [
    { name: 'NFL Network', url: 'https://timst.cfd/channel/nfl-network' },
    { name: 'ESPN', url: 'https://timst.cfd/channel/espn' }
  ],
  iceHockeyNHL: [
    { name: 'NHL Network', url: 'https://timst.cfd/channel/nhl-network' },
    { name: 'TNT Sports 1', url: 'https://timst.cfd/channel/tnt-sports-1' }
  ],
  baseballMLB: [
    { name: 'MLB Network', url: 'https://timst.cfd/channel/mlb-network' },
    { name: 'ESPN', url: 'https://timst.cfd/channel/espn' }
  ],
  aflAustralian: [
    { name: 'FOX Sports 2', url: 'https://timst.cfd/channel/fox-sports-2' },
    { name: 'Fox Sports 504 (Footy)', url: 'https://timst.cfd/channel/fox-sports-504-footy' }
  ]
};

/**
 * Convert any Streamic event to YOUR OWN 24/7 stream channels
 *
 * @param {Object} event - Transformed event from scraper.js
 * @returns {Array} Array of matched and converted channels from timst.cfd
 */
function convertEventToMyChannels(event) {
  const myChannels = [];
  const seenUrls = new Set();

  function addChannel(ch, matchType, reason) {
    if (!ch || !ch.url || seenUrls.has(ch.url)) return;
    seenUrls.add(ch.url);
    myChannels.push({
      channelName: ch.name,
      url: ch.url,
      matchType, // 'DIRECT_MATCH' or 'LEAGUE_CONVERTED'
      reason
    });
  }

  // STEP 1: Direct channel matches (if Streamic streams on a channel you own)
  (event.channels || []).forEach(sc => {
    if (sc.userHasChannel && sc.userChannelUrl) {
      addChannel(
        { name: sc.channelName, url: sc.userChannelUrl },
        'DIRECT_MATCH',
        `Direct broadcast match: ${sc.channelName}`
      );
    }
  });

  // STEP 2: Intelligent League Rights Converter
  const l = (event.league || '').toLowerCase();
  const t = (event.title || '').toLowerCase();
  const cat = (event.category || '').toLowerCase();

  // Premier League
  if (l.includes('premier league') || l.includes('anglia') || t.includes('premier league')) {
    USER_CHANNELS.premierLeague.forEach(ch => addChannel(ch, 'LEAGUE_CONVERTED', 'Official Premier League broadcaster'));
  }
  // La Liga
  else if (l.includes('laliga') || l.includes('la liga') || l.includes('hiszpania')) {
    USER_CHANNELS.laLiga.forEach(ch => addChannel(ch, 'LEAGUE_CONVERTED', 'Official La Liga broadcaster'));
  }
  // Serie A
  else if (l.includes('serie a') || l.includes('włochy') || l.includes('italy')) {
    USER_CHANNELS.serieA.forEach(ch => addChannel(ch, 'LEAGUE_CONVERTED', 'Official Italian Serie A broadcaster'));
  }
  // Bundesliga
  else if (l.includes('bundesliga') || l.includes('niemcy')) {
    USER_CHANNELS.bundesliga.forEach(ch => addChannel(ch, 'LEAGUE_CONVERTED', 'Official Bundesliga broadcaster'));
  }
  // Champions League / Europa League
  else if (l.includes('champions league') || l.includes('europa league') || l.includes('ucl') || l.includes('uel')) {
    USER_CHANNELS.championsLeague.forEach(ch => addChannel(ch, 'LEAGUE_CONVERTED', 'Official UEFA Champions/Europa League broadcaster'));
  }
  // Portuguese League / Cup
  else if (l.includes('portugalia') || l.includes('taça de portugal') || l.includes('liga portugal')) {
    USER_CHANNELS.portugueseFootball.forEach(ch => addChannel(ch, 'LEAGUE_CONVERTED', 'Official Portuguese football broadcaster'));
  }
  // Asian Games / AFC / Saudi Pro League / ISL
  else if (l.includes('afc') || l.includes('asian') || l.includes('saudi') || l.includes('isl') || l.includes('j-league') || l.includes('k-league') || l.includes('asia cup')) {
    USER_CHANNELS.asianFootball.forEach(ch => addChannel(ch, 'LEAGUE_CONVERTED', 'Official Asian / Saudi / AFC sports broadcaster'));
  }
  // Cricket
  else if (cat === 'krykiet' || l.includes('cricket') || l.includes('ipl') || l.includes('t20') || l.includes('one-day cup') || l.includes('icc')) {
    USER_CHANNELS.cricket.forEach(ch => addChannel(ch, 'LEAGUE_CONVERTED', 'Official 24/7 Cricket broadcaster'));
  }
  // Formula 1 & Motorsports
  else if (cat === 'formula1' || cat === 'motorsport' || l.includes('f1') || l.includes('motogp')) {
    USER_CHANNELS.f1Motorsport.forEach(ch => addChannel(ch, 'LEAGUE_CONVERTED', 'Official Motorsport & F1 broadcaster'));
  }
  // MMA / UFC / Boxing
  else if (cat === 'mma' || cat === 'boks' || l.includes('ufc') || l.includes('ksw') || l.includes('boxing')) {
    USER_CHANNELS.combatMMA.forEach(ch => addChannel(ch, 'LEAGUE_CONVERTED', 'Official Combat / UFC broadcaster'));
  }
  // Tennis
  else if (cat === 'tenis' || l.includes('atp') || l.includes('wta') || l.includes('us open') || l.includes('wimbledon')) {
    USER_CHANNELS.tennis.forEach(ch => addChannel(ch, 'LEAGUE_CONVERTED', 'Official Tennis broadcaster'));
  }
  // Basketball (NBA)
  else if (cat === 'koszykowka' || l.includes('nba') || l.includes('wnba')) {
    USER_CHANNELS.basketballNBA.forEach(ch => addChannel(ch, 'LEAGUE_CONVERTED', 'Official NBA / Basketball broadcaster'));
  }
  // NFL (American Football)
  else if (cat === 'americanfootball' || l.includes('nfl')) {
    USER_CHANNELS.americanFootballNFL.forEach(ch => addChannel(ch, 'LEAGUE_CONVERTED', 'Official NFL broadcaster'));
  }
  // NHL (Ice Hockey)
  else if (cat === 'hokej' || l.includes('nhl')) {
    USER_CHANNELS.iceHockeyNHL.forEach(ch => addChannel(ch, 'LEAGUE_CONVERTED', 'Official NHL Ice Hockey broadcaster'));
  }
  // Australian Football (AFL)
  else if (cat === 'australianfootball' || l.includes('afl')) {
    USER_CHANNELS.aflAustralian.forEach(ch => addChannel(ch, 'LEAGUE_CONVERTED', 'Official AFL broadcaster'));
  }
  // General Football fallback
  else if (cat.includes('pilkanozna')) {
    USER_CHANNELS.generalFootball.forEach(ch => addChannel(ch, 'LEAGUE_CONVERTED', 'General football sports broadcast'));
  }

  return myChannels;
}

module.exports = {
  convertEventToMyChannels,
  USER_CHANNELS
};
