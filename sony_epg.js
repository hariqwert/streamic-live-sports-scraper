/**
 * Sony Sports Network Live EPG Scraper & 24/7 Live Stream Mapper
 *
 * Covers ALL 5 Sony Sports Channels:
 * 1. Sony Sports Network (Ten 1)       -> https://timst.cfd/channel/sony-sports-network
 * 2. Sony Sports Network 2 (Ten 2)     -> https://timst.cfd/channel/sony-sports-network-2
 * 3. Sony Sports Network 3 (Ten 3)     -> https://timst.cfd/channel/sony-sports-network-3
 * 4. Sony Sports Network 4 (Ten 4)     -> https://timst.cfd/channel/sony-sports-network-4
 * 5. Sony Sports Network 5 (Ten 5)     -> https://timst.cfd/channel/sony-sports-network-5
 *
 * Anti-Replay & True Live Sports Engine:
 * - STRIKE-OUT REPLAYS: Discards past-year reruns (e.g. 2025, 2024, 2021 matches like "West Indies Tour of England 2025").
 * - STRIKE-OUT HIGHLIGHTS: Discards highlights, reviews, magazine programs, rewind, classics.
 * - STRIKE-OUT STUDIO TALK: Discards studio programs like "Sports Extraaa", "Fight O'Clock".
 * - STRIKE-OUT GENERIC FILLERS: Discards generic filler slots like "T20 Cricket", "Test Cricket" without live fixtures.
 * - REAL-TIME LIVE: Only genuine live tournament matches airing right now are marked 🔴 LIVE.
 * - 20-MIN PRE-MATCH WINDOW: Genuine upcoming live matches unlock strictly within 20m of kickoff.
 */

const https = require('https');

const SONY_EPG_CHANNELS = [
  {
    id: 162,
    name: 'Sony Sports Network (Ten 1)',
    shortName: 'Sony Ten 1 HD',
    language: 'English',
    url: 'https://timst.cfd/channel/sony-sports-network'
  },
  {
    id: 891,
    name: 'Sony Sports Network 2 (Ten 2)',
    shortName: 'Sony Ten 2 HD',
    language: 'English',
    url: 'https://timst.cfd/channel/sony-sports-network-2'
  },
  {
    id: 892,
    name: 'Sony Sports Network 3 (Ten 3 Hindi)',
    shortName: 'Sony Ten 3 HD Hindi',
    language: 'Hindi',
    url: 'https://timst.cfd/channel/sony-sports-network-3'
  },
  {
    id: 1774,
    name: 'Sony Sports Network 4 (Ten 4 Tamil/Telugu)',
    shortName: 'Sony Ten 4',
    language: 'Tamil / Telugu',
    url: 'https://timst.cfd/channel/sony-sports-network-4'
  },
  {
    id: 155,
    name: 'Sony Sports Network 5 (Ten 5)',
    shortName: 'Sony Ten 5 HD',
    language: 'English',
    url: 'https://timst.cfd/channel/sony-sports-network-5'
  }
];

const NON_LIVE_KEYWORDS = [
  'highlight', 'highlights', 'hl', 'h/ls',
  'replay', 'repeat', 'rerun', 're-run',
  'rewind', 'classic', 'classics', 'vault', 'flashback', 'golden moments', 'retro',
  'magazine', 'magazine programme', 'review', 'preview', 'the story of', 'documentary',
  'best of', 'top 10', 'greatest',
  'sports extraaa', 'extraaa innings', 'extraaa', 'fight o\'clock', 'pre-show', 'post-show', 'studio'
];

const GENERIC_FILLER_TITLES = [
  't20 cricket', 'test cricket', 'one-day international cricket',
  'cricket highlights', 'women\'s test cricket', 'cricket classics'
];

/**
 * Strict classifier for Genuine Live Sports:
 * Rejects repeats, archives, highlights, studio shows, and generic fillers.
 */
function evaluateSonyShow(show) {
  const name = (show.showname || '').trim();
  const desc = (show.description || show.episode_desc || '').trim();
  const fullText = (name + ' ' + desc).toLowerCase();
  const isExplicitLive = /\blive\b/i.test(name);

  // 1. Check for past years (e.g., 2025, 2024, 2023, 2022, 2021) - today is 2026!
  // Any show referencing a previous year is an archived replay.
  const pastYearRegex = /\b(19\d\d|20[0-1]\d|202[0-5])\b/;
  const pastYearMatch = fullText.match(pastYearRegex);
  if (pastYearMatch) {
    return { isLiveSport: false, reason: `Archived replay from ${pastYearMatch[0]}` };
  }

  // 2. Check for past match result description (e.g. beat, defeated, collapsed, scored, won by)
  const pastResultRegex = /\b(beat|defeated|collapsed|won by|dismissed|lost by|scored\s+\d+)\b/i;
  if (pastResultRegex.test(desc) && !isExplicitLive) {
    return { isLiveSport: false, reason: 'Past match result in description' };
  }

  // 3. Check for non-live keywords in title or desc
  for (const kw of NON_LIVE_KEYWORDS) {
    const regex = new RegExp('\\b' + kw + '\\b', 'i');
    if (regex.test(name) || regex.test(desc)) {
      return { isLiveSport: false, reason: `Non-live show type: ${kw}` };
    }
  }

  // 4. Generic filler titles without fixture
  if (GENERIC_FILLER_TITLES.includes(name.toLowerCase())) {
    return { isLiveSport: false, reason: `Generic filler replay slot: ${name}` };
  }

  // 5. willRepeat flag
  if (show.willRepeat === true && !isExplicitLive) {
    return { isLiveSport: false, reason: 'willRepeat is true' };
  }

  // 6. Category check - must be Sports event
  if (show.showCategory !== 'Sports event' && !isExplicitLive) {
    return { isLiveSport: false, reason: `Category is ${show.showCategory}` };
  }

  return { isLiveSport: true, reason: isExplicitLive ? 'Live in Title' : 'Genuine Live Event' };
}

function fetchChannelEpg(channelId, offset = 0) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'jiotv.data.cdn.jio.com',
      path: `/apis/v1.3/getepg/get?channel_id=${channelId}&offset=${offset}&langId=6`,
      method: 'GET',
      headers: { 'User-Agent': 'okhttp/4.2.2' },
      timeout: 8000
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.epg || []);
        } catch (e) {
          resolve([]);
        }
      });
    });

    req.on('error', () => resolve([]));
    req.on('timeout', () => {
      req.destroy();
      resolve([]);
    });
    req.end();
  });
}

function formatEpgDateIST(dateObj) {
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
    istFull: `${day} ${month} ${year}, ${hoursStr}:${minutes} ${ampm} IST`
  };
}

function getSportMetadata(name, desc) {
  const text = (name + ' ' + (desc || '')).toLowerCase();
  if (text.includes('asian games') || text.includes('asia cup')) {
    return { emoji: '🌏', category: 'asian_games', name: 'Asian Games / Asian Sports' };
  }
  if (text.includes('cricket') || text.includes('t20') || text.includes('odi') || text.includes('ashes') || text.includes('ipl')) {
    return { emoji: '🏏', category: 'krykiet', name: 'Cricket' };
  }
  if (text.includes('football') || text.includes('soccer') || text.includes('ucl') || text.includes('uefa') || text.includes('champions league') || text.includes('nations league') || text.includes('saudi')) {
    return { emoji: '⚽', category: 'pilkanozna', name: 'Football' };
  }
  if (text.includes('tennis') || text.includes('open') || text.includes('atp') || text.includes('wta')) {
    return { emoji: '🎾', category: 'tenis', name: 'Tennis' };
  }
  if (text.includes('wwe') || text.includes('smackdown') || text.includes('raw') || text.includes('nxt') || text.includes('ufc')) {
    return { emoji: '🥊', category: 'mma', name: 'WWE / Combat Sports' };
  }
  if (text.includes('rally') || text.includes('f1') || text.includes('motogp') || text.includes('cycling')) {
    return { emoji: '🏎️', category: 'motorsport', name: 'Motorsport / Racing' };
  }
  return { emoji: '🏆', category: 'live_sports', name: 'Live Sports' };
}

/**
 * Fetch and return live & upcoming events across ALL 5 Sony Sports channels.
 * Strictly filters out replays, repeats, highlights, and studio shows.
 *
 * @param {Object} options
 * @param {boolean} [options.onlyActive=false] - If true, only returns currently LIVE or starting in ≤20m.
 * @param {boolean} [options.onlyLive=false] - If true, only returns currently LIVE ON-AIR matches.
 */
async function getSonyLiveEvents(options = {}) {
  const nowMs = Date.now();
  const nowEpochSec = Math.floor(nowMs / 1000);
  const onlyActive = options.onlyActive ?? false;
  const onlyLive = options.onlyLive ?? false;
  const events = [];

  const promises = SONY_EPG_CHANNELS.map(async (ch) => {
    const [todayShows, tomorrowShows] = await Promise.all([
      fetchChannelEpg(ch.id, 0),
      fetchChannelEpg(ch.id, 1)
    ]);
    const allShows = [...todayShows, ...tomorrowShows];

    allShows.forEach(s => {
      const startMs = Number(s.startEpoch);
      const endMs = Number(s.endEpoch);

      // Skip ended shows
      if (endMs <= nowMs) return;

      // 1. Strict Filter: Reject replays, past years, highlights, talk shows, generic fillers
      const evalRes = evaluateSonyShow(s);
      if (!evalRes.isLiveSport) return;

      const isCurrentOnAir = nowMs >= startMs && nowMs < endMs;

      // Filter: onlyLive mode
      if (onlyLive && !isCurrentOnAir) return;

      // Filter: activeOnly mode (current live OR starting within 20 mins)
      if (onlyActive && !isCurrentOnAir) {
        const secUntil = Math.floor(startMs / 1000) - nowEpochSec;
        if (secUntil > 20 * 60) return;
      }

      const name = (s.showname || '').trim();
      const desc = (s.description || s.episode_desc || '').trim();

      const startSec = Math.floor(startMs / 1000);
      const endSec = Math.floor(endMs / 1000);
      const istStart = formatEpgDateIST(new Date(startMs));
      const istEnd = formatEpgDateIST(new Date(endMs));
      const durationMin = Math.round((endMs - startMs) / 60000);

      const secUntilStart = startSec - nowEpochSec;
      const minUntilStart = Math.round(secUntilStart / 60);
      const secElapsed = nowEpochSec - startSec;
      const minElapsed = Math.round(secElapsed / 60);

      let status = 'UPCOMING';
      let isLive = false;
      let isStartingSoon = false;
      let canWatch = false;
      let countdown = '';

      if (isCurrentOnAir) {
        status = 'LIVE';
        isLive = true;
        canWatch = true;
        countdown = `🔴 LIVE NOW on ${ch.shortName} (${minElapsed}m in)`;
      } else if (secUntilStart <= 20 * 60) {
        status = 'STARTING_SOON';
        isStartingSoon = true;
        canWatch = true;
        countdown = minUntilStart <= 1 ? 'Starting in < 1 min' : `Starting in ${minUntilStart} mins`;
      } else {
        status = 'UPCOMING';
        canWatch = false;
        const h = Math.floor(minUntilStart / 60);
        const m = minUntilStart % 60;
        countdown = h > 0 ? `Starts in ${h}h ${m}m` : `Starts in ${minUntilStart}m`;
      }

      const sportMeta = getSportMetadata(name, desc);
      const formattedTitle = isCurrentOnAir && !/^\s*live\b/i.test(name)
        ? `[LIVE] ${name}`
        : name;

      let officialPoster = null;
      if (s.assets?.['16:9']?.originalProgram) {
        officialPoster = s.assets['16:9'].originalProgram;
      } else if (s.assets?.['16:9']?.program) {
        officialPoster = `https://jiotvimages.cdn.jio.com/dare_images/${s.assets['16:9'].program}`;
      } else if (s.episodePoster) {
        officialPoster = `https://jiotvimages.cdn.jio.com/dare_images/${s.episodePoster}`;
      }

      events.push({
        id: `sony_${ch.id}_${startSec}`,
        title: formattedTitle,
        rawTitle: name,
        category: sportMeta.category,
        sportName: sportMeta.name,
        sportEmoji: sportMeta.emoji,
        league: s.showGenre?.[0] || 'Sony Sports Network India',
        description: desc,
        countryCode: 'IN',
        startTime: startSec,
        endTime: endSec,
        durationMinutes: durationMin,
        officialPosterUrl: officialPoster,
        thumbnail: officialPoster,
        // IST Timestamps
        timeIST: istStart.istTime,
        dateIST: istStart.istDate,
        fullIST: istStart.istFull,
        endTimeIST: istEnd.istTime,
        // Stream Lifecycle Status
        status,
        isLive,
        isStartingSoon,
        isEnded: false,
        canWatch,
        countdown,
        // Flags
        hasEnglish: ch.language.includes('English'),
        isFamous: true,
        source: 'SONY_OFFICIAL_EPG',
        // User Channel Direct Source
        userHasChannel: true,
        userMatchingChannels: [{ name: ch.name, slug: ch.name, url: ch.url }],
        myConvertedChannels: [{
          channelName: ch.name,
          url: ch.url,
          matchType: 'DIRECT_MATCH',
          reason: `Official 24/7 stream on ${ch.shortName}`
        }],
        channelsCount: 1,
        channels: [{
          channelName: ch.name,
          language: ch.language,
          isEnglish: ch.language.includes('English'),
          userHasChannel: true,
          userChannelUrl: ch.url,
          streams: [{ quality: 'HD 1080p', embedUrl: ch.url }]
        }],
        embedStreams: [{
          channelName: ch.name,
          language: ch.language,
          isEnglish: ch.language.includes('English'),
          quality: 'HD 1080p',
          embedUrl: ch.url,
          userStreamUrl: ch.url
        }]
      });
    });
  });

  await Promise.all(promises);

  // Sort: Current LIVE shows first, then chronologically by start time
  const statusRank = { LIVE: 0, STARTING_SOON: 1, UPCOMING: 2, ENDED: 3 };
  events.sort((a, b) => {
    if (statusRank[a.status] !== statusRank[b.status]) {
      return statusRank[a.status] - statusRank[b.status];
    }
    return a.startTime - b.startTime;
  });

  return events;
}

module.exports = {
  getSonyLiveEvents,
  evaluateSonyShow,
  SONY_EPG_CHANNELS,
  fetchChannelEpg
};
