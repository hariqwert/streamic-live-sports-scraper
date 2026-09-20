/**
 * Streamic Live Sports API Microservice & Dashboard
 * Runs on http://localhost:5050
 *
 * Endpoints:
 * - GET /api/schedule             (Returns full schedule in IST)
 * - GET /api/schedule?activeOnly=1(Returns only events starting within 20m or LIVE)
 * - GET /api/channels             (Returns all distinct broadcast channels)
 * - GET /api/playlist.m3u         (Dynamic M3U playlist of currently active streams)
 * - GET /                         (Interactive Web UI Dashboard in IST)
 */

const http = require('http');
const url = require('url');
const { getSchedule, getChannels, generateActiveM3U, getAllLiveScores } = require('./scraper');

const PORT = process.env.PORT || 5050;

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data, null, 2));
}

function sendHtml(res, html) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(html);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' });
    return res.end();
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  try {
    // 1. Schedule JSON API
    if (pathname === '/api/schedule') {
      const activeOnly = query.activeOnly === 'true' || query.activeOnly === '1';
      const onlyLive = query.live === 'true' || query.live === '1' || query.onlyLive === 'true' || query.onlyLive === '1';
      const hideEnded = query.hideEnded !== 'false' && query.hideEnded !== '0';
      const onlyEnglishAndFamous = query.includeObscure !== 'true' && query.all !== '1';
      const onlyMyChannels = query.myChannels === 'true' || query.myChannels === '1';
      const category = query.sport || query.category || null;
      const search = query.q || query.search || null;

      const schedule = await getSchedule({ activeOnly, onlyLive, hideEnded, onlyEnglishAndFamous, onlyMyChannels, category, search });
      return sendJson(res, 200, schedule);
    }

    // 2. Channels JSON API
    if (pathname === '/api/channels') {
      const channels = await getChannels();
      return sendJson(res, 200, channels);
    }

    // 3. Real-time Live Scores API (Football & Cricket)
    if (pathname === '/api/scores') {
      const scores = await getAllLiveScores();
      return sendJson(res, 200, scores);
    }

    // 4. Dynamic M3U Playlist
    if (pathname === '/api/playlist.m3u') {
      const onlyMyChannels = query.myChannels === '1';
      const m3u = await generateActiveM3U({ onlyMyChannels });
      res.writeHead(200, {
        'Content-Type': 'application/x-mpegURL',
        'Content-Disposition': 'inline; filename="active_sports.m3u"',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(m3u);
    }

    // 5. Interactive Live Sports Dashboard (HTML)
    if (pathname === '/') {
      const onlyLive = query.live === '1' || query.live === 'true';
      const activeOnly = !onlyLive && (query.activeOnly === 'true' || query.activeOnly === '1');
      const onlyMyChannels = query.myChannels === 'true' || query.myChannels === '1';
      const data = await getSchedule({ activeOnly, onlyLive, hideEnded: true, onlyMyChannels, onlyEnglishAndFamous: true });

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Live Sports Schedule & Real-Time Scores (IST)</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>body { font-family: 'Plus Jakarta Sans', sans-serif; }</style>
</head>
<body class="bg-[#0b0e17] text-slate-100 min-h-screen">
  <header class="border-b border-purple-900/30 bg-[#101426]/90 sticky top-0 z-50 backdrop-blur-md px-6 py-4 flex flex-wrap items-center justify-between gap-4">
    <div class="flex items-center gap-3">
      <span class="text-2xl">⚡</span>
      <div>
        <h1 class="text-lg font-bold text-white flex items-center gap-2">
          Streamic Live Sports
          <span class="text-xs bg-purple-600/30 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full font-mono">Live Scores & Posters</span>
          <span class="text-xs bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono">IST (UTC+5:30)</span>
        </h1>
        <p class="text-xs text-slate-400">Current Time: <span class="text-purple-300 font-semibold">${data.timestampIST}</span></p>
      </div>
    </div>
    <div class="flex items-center gap-2 flex-wrap">
      <a href="/?live=1${onlyMyChannels ? '&myChannels=1' : ''}" class="px-3 py-1.5 rounded-lg text-xs font-semibold ${onlyLive ? 'bg-red-600 text-white shadow-lg shadow-red-600/30' : 'bg-slate-800 text-slate-400 hover:text-white'}">🔴 Live Now (${data.counts.live})</a>
      <a href="/?activeOnly=1${onlyMyChannels ? '&myChannels=1' : ''}" class="px-3 py-1.5 rounded-lg text-xs font-semibold ${activeOnly ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30' : 'bg-slate-800 text-slate-400 hover:text-white'}">🟢 Active (≤20m / Live: ${data.counts.live + data.counts.startingSoon})</a>
      <a href="/?activeOnly=0${onlyMyChannels ? '&myChannels=1' : ''}" class="px-3 py-1.5 rounded-lg text-xs font-semibold ${!activeOnly && !onlyLive ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}">📋 Full Schedule (${data.totalEvents})</a>
      <a href="/?live=${onlyLive ? '1' : '0'}&activeOnly=${activeOnly ? '1' : '0'}&myChannels=${onlyMyChannels ? '0' : '1'}" class="px-3 py-1.5 rounded-lg text-xs font-semibold ${onlyMyChannels ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300 hover:text-white'}">🎯 ${onlyMyChannels ? 'In My Channels (Filtered)' : 'Filter: My Channels'}</a>
      <a href="/api/scores" target="_blank" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-900/60 hover:bg-cyan-800 text-cyan-200 border border-cyan-700/50 flex items-center gap-1">📊 Scores API</a>
      <a href="/api/playlist.m3u${onlyMyChannels ? '?myChannels=1' : ''}" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1">📥 M3U File</a>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-4 py-8">
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      ${data.events.map(ev => {
        const badgeColor = ev.status === 'LIVE' ? 'bg-red-500/30 text-red-300 border-red-500/50' : (ev.status === 'STARTING_SOON' ? 'bg-amber-500/30 text-amber-300 border-amber-500/50' : 'bg-slate-700/40 text-slate-300 border-slate-600/40');
        const primaryEmbed = ev.embedStreams[0]?.embedUrl || '';
        const thumbUrl = ev.thumbnail || 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&auto=format&fit=crop&q=80';
        return `
        <div class="bg-[#13182e] border border-purple-900/30 rounded-2xl overflow-hidden flex flex-col justify-between hover:border-purple-500/50 hover:shadow-xl hover:shadow-purple-950/30 transition duration-300 group">
          <div>
            <!-- Event High-Res Thumbnail / Banner -->
            <div class="relative w-full aspect-[16/9] overflow-hidden bg-black/50 border-b border-purple-900/30">
              <img src="${thumbUrl}" alt="${ev.title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" loading="lazy" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&auto=format&fit=crop&q=80';"/>
              <div class="absolute inset-0 bg-gradient-to-t from-[#13182e] via-[#13182e]/20 to-transparent"></div>
              <div class="absolute top-3 left-3">
                <span class="text-xs font-bold px-2.5 py-1 rounded-full border backdrop-blur-md ${badgeColor}">
                  ${ev.status === 'LIVE' ? '🔴 LIVE' : (ev.status === 'STARTING_SOON' ? '🟡 SOON' : '⚪ UPCOMING')}
                </span>
              </div>
              <div class="absolute bottom-2 right-3 text-[11px] text-slate-300 font-mono bg-black/70 backdrop-blur-md px-2.5 py-0.5 rounded-md border border-white/10">
                ${ev.countdown}
              </div>
              ${ev.thumbnailSource ? `
                <div class="absolute bottom-2 left-3 text-[10px] text-purple-200 font-medium bg-purple-950/80 backdrop-blur-md px-2 py-0.5 rounded-md border border-purple-500/30 flex items-center gap-1">
                  🏛️ <span>${ev.thumbnailSource}</span>
                </div>
              ` : ''}
            </div>

            <div class="p-5 pb-3">
              <h3 class="font-bold text-base text-white mb-1 flex items-start gap-2 leading-snug">
                <span class="text-lg">${ev.sportEmoji}</span>
                <span>${ev.title}</span>
              </h3>
              <p class="text-xs text-slate-400 mb-3">${ev.league || ev.sportName}</p>

              <!-- Real-Time Live Match Statistics / Score Widget -->
              ${ev.liveScore ? `
                <div class="bg-gradient-to-r from-purple-950/60 to-slate-900 border border-purple-700/50 rounded-xl p-3 mb-3 shadow-inner">
                  <div class="flex items-center justify-between text-[11px] font-semibold text-purple-300 mb-1.5">
                    <span class="flex items-center gap-1">📊 <span>Real-Time ${ev.liveScore.sport} Score</span></span>
                    <span class="text-amber-300 font-mono text-xs font-bold">${ev.liveScore.clock || ev.liveScore.detail || 'LIVE'}</span>
                  </div>
                  ${ev.liveScore.homeTeam ? `
                    <div class="flex items-center justify-between gap-2 text-xs py-1">
                      <div class="flex items-center gap-2 min-w-0 flex-1">
                        ${ev.liveScore.homeTeam.logo ? `<img src="${ev.liveScore.homeTeam.logo}" class="w-5 h-5 object-contain shrink-0"/>` : ''}
                        <span class="truncate font-medium text-white">${ev.liveScore.homeTeam.name}</span>
                      </div>
                      <span class="font-mono font-black text-base text-emerald-400 px-2 py-0.5 bg-black/40 rounded border border-emerald-500/30 shrink-0">
                        ${ev.liveScore.homeTeam.score} - ${ev.liveScore.awayTeam.score}
                      </span>
                      <div class="flex items-center gap-2 min-w-0 flex-1 justify-end">
                        <span class="truncate font-medium text-white text-right">${ev.liveScore.awayTeam.name}</span>
                        ${ev.liveScore.awayTeam.logo ? `<img src="${ev.liveScore.awayTeam.logo}" class="w-5 h-5 object-contain shrink-0"/>` : ''}
                      </div>
                    </div>
                  ` : `
                    <p class="text-xs font-medium text-emerald-300 font-mono">${ev.liveScore.summary}</p>
                  `}
                </div>
              ` : ''}

              <!-- Kickoff Details -->
              <div class="bg-[#0b0e1a] rounded-xl p-3 mb-3 space-y-1 text-xs border border-purple-950/30">
                <div class="flex justify-between text-slate-300">
                  <span class="text-slate-500">Kickoff (IST):</span>
                  <span class="font-semibold text-purple-300">${ev.timeIST}</span>
                </div>
                <div class="flex justify-between text-slate-300">
                  <span class="text-slate-500">Date:</span>
                  <span>${ev.dateIST}</span>
                </div>
                <div class="flex justify-between text-slate-300">
                  <span class="text-slate-500">Est. End:</span>
                  <span>${ev.endTimeIST}</span>
                </div>
              </div>

              <!-- Channels -->
              <div class="text-xs mb-3">
                <span class="text-slate-400 block mb-1.5 font-semibold">Broadcasting Channels (${ev.channelsCount}):</span>
                <div class="flex flex-wrap gap-1.5">
                  ${ev.channels.map(ch => `<span class="bg-purple-950/50 text-purple-200 border border-purple-800/40 px-2 py-0.5 rounded text-[11px]">${ch.channelName}</span>`).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- Watch Stream Action -->
          <div class="p-5 pt-0">
            <div class="pt-3 border-t border-slate-800">
              ${ev.canWatch && primaryEmbed ? `
                <a href="${primaryEmbed}" target="_blank" class="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold text-center block shadow-lg shadow-purple-600/30 transition">
                  ▶ Watch Stream
                </a>
              ` : `
                <button disabled class="w-full py-2.5 bg-slate-800/70 text-slate-500 rounded-xl text-xs font-semibold cursor-not-allowed">
                  Stream Link Active 20m Before Start
                </button>
              `}
            </div>
          </div>
        </div>
        `;
      }).join('')}
    </div>
  </main>
</body>
</html>`;
      return sendHtml(res, html);
    }

    // 404
    sendJson(res, 404, { error: 'Endpoint not found' });
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 Streamic Scraper Server running on http://localhost:${PORT}`);
  console.log(`   - Dashboard: http://localhost:${PORT}/`);
  console.log(`   - Schedule (IST): http://localhost:${PORT}/api/schedule`);
  console.log(`   - Active 20m Only: http://localhost:${PORT}/api/schedule?activeOnly=true`);
  console.log(`   - Dynamic M3U: http://localhost:${PORT}/api/playlist.m3u\n`);
});
