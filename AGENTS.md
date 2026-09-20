# AGENTS.md — Streamic Live Sports Scraper Engine

> **Specification & Operational Guide for AI Agents and Engineers**  
> Comprehensive documentation for scraping, normalizing, and managing live sports streams, channel mappings, Indian Standard Time (IST) scheduling, 20-minute pre-match activation windows, automated stream termination, multi-engine thumbnail scrapers, and real-time live match statistics/scores.

---

## 1. System Overview & Core Capabilities

The **Streamic Live Sports Scraper** is a production-grade sports aggregation and enrichment engine designed to extract, transform, and manage live sports broadcast events from `streamic.st`, official Indian Sony Sports EPG feeds, and live sports telemetry APIs.

### Key Features
1. **Multi-Engine Event Thumbnails (`thumbnail_service.js`)**: Real-time high-resolution posters and match artwork automatically extracted from Bing Image Search, official Sony EPG assets (JioTV CDN), and team logos, backed by persistent disk/memory caching (`.thumbnail_cache.json`).
2. **Real-Time Live Scores & Statistics (`live_scores.js`)**: Genuine live score telemetries (no dummy data) for Football (Premier League, La Liga, Serie A, Champions League, Europa League, Bundesliga, Ligue 1) and Cricket (Asian Games, Bilateral Tours, CPL, ICC, One-Day Cups). Matches live game clocks, team crests, goals, wickets, overs, and match states.
3. **Anti-Replay & True Live Sports Engine**: Strict rejection of archived replays (e.g. 2025/2024 reruns like "West Indies Tour of England 2025"), highlights, and studio talk shows ("Sports Extraaa"). Only genuine live sports are marked 🔴 LIVE.
4. **English & Famous Events Filtering**: Automatically discards obscure, tier-3 local foreign matches, restricting the schedule to English commentary streams and top-tier world sports leagues.
5. **User Channel Source Integration (`timst.cfd`)**: Directly maps and cross-references your 174 24/7 streamable channels with live broadcasts, enabling you to filter the entire schedule to events you can actually watch.
6. **Intelligent Rights Router (`converter.js`)**: Maps missing foreign broadcast channels (e.g. `beIN Sports 1 Ina`, `Arena Sport`, `Canal 11`) to equivalent 24/7 streamable channels the user owns on `https://timst.cfd/channel/...`.
7. **Indian Standard Time (IST, UTC+5:30) Conversion**: Automatically converts all epoch timestamps to standard 12-hour IST formats (`08:30 PM IST`, `DD Mon YYYY`) with countdown timers.
8. **20-Minute Pre-Match Activation Window**: Stream player links are held in a protected state and **only activated ≤ 20 minutes before kickoff** (when broadcast streams spin up).
9. **Automated Stream Termination (Auto-End)**: Dynamically calculates match conclusion based on sport-specific duration models and auto-drops ended events so dead players are never served.
10. **Multi-Protocol Delivery**: Available as a Node.js programmatic library, interactive CLI tool, REST microservice API, dynamic `#EXTM3U` playlist generator, and interactive HTML Dashboard.

---

## 2. Real-Time Live Scores & Statistics Engine (`live_scores.js`)

Provides **100% genuine live sports telemetry** directly integrated into the schedule and dashboard.

### 2.1 Supported Telemetry Sources
* **Football Scoreboard API**:
  * Leagues: English Premier League (`eng.1`), Spanish La Liga (`esp.1`), Italian Serie A (`ita.1`), German Bundesliga (`ger.1`), UEFA Champions League (`uefa.champions`), UEFA Europa League (`uefa.europa`), French Ligue 1 (`fra.1`), MLS (`usa.1`).
  * Telemetry: Real-time match minute/clock (`67'`, `HT`, `FT`), live scores, team names, official transparent team crest logos, match period, and status details.
* **Cricket Scoreboard & Broadcast Infrastructure**:
  * **Broadcast Sources**: Sony Sports Network 1 (`sony-sports-network`), Ten 2 (`sony-sports-network-2`), Ten 3 Hindi (`sony-sports-network-3`), and Ten 5 (`sony-sports-network-5`), integrated with user's 24/7 `timst.cfd` streamable accounts.
  * **Competitions Covered**: International Bilateral Tours (India, England, Australia, South Africa, Pakistan, Sri Lanka, New Zealand, West Indies), ICC Tournaments, Asian Games Cricket, Caribbean Premier League (CPL), Indian Premier League (IPL), Big Bash League (BBL), Royal London One-Day Cup, President's Trophy, CSA 4-Day Series.
  * **Live Telemetry**: Innings, live scores, wickets, overs (e.g. `178/2 (17.5/20 ov, target 178)`), run rates, match status, and official 500x500 cricket team emblems.
  * **Artwork & Thumbnails**: Sony Broadcaster EPG TMS CDN 16:9 posters (`rjio.tmsimg.com`), TheSportsDB venue stadium fanarts (Lord's, MCG, The Oval, Eden Gardens, Edgbaston), and Wikimedia Commons official vectors (IPL, CPL, BBL, The Ashes).

### 2.2 Telemetry Schema (`event.liveScore`)
```json
{
  "hasScore": true,
  "sport": "Football",
  "league": "English Premier League",
  "isLive": true,
  "isFinal": false,
  "clock": "67'",
  "detail": "Second Half",
  "homeTeam": {
    "name": "AFC Bournemouth",
    "shortName": "Bournemouth",
    "score": "1",
    "logo": "https://a.espncdn.com/i/teamlogos/soccer/500/349.png"
  },
  "awayTeam": {
    "name": "Liverpool",
    "shortName": "Liverpool",
    "score": "2",
    "logo": "https://a.espncdn.com/i/teamlogos/soccer/500/364.png"
  },
  "summary": "AFC Bournemouth 1 - 2 Liverpool (67')"
}
```

---

## 3. 100% Official Sports Artwork & Thumbnail Engine (`thumbnail_service.js`)

Attaches verified, official high-resolution matchday posters, stadium photography, tournament vectors, and club crests directly from authoritative CDNs and databases.

### 3.1 Strict Prohibition on Unofficial Scrapers
To ensure pristine broadcast visual fidelity, **all third-party web scrapers (Bing, Yahoo, Google Images) are strictly forbidden and eliminated**. No watermarked stock photos (Alamy, Getty), fan-made merchandise/t-shirts, betting prediction sites, or random blog screenshots are ever permitted into the catalog.

### 3.2 Official Artwork Resolution Hierarchy
1. **Tier 1: Broadcaster Direct TMS CDN (`Sony Broadcaster TMS`)**:
   - Source: JioTV TMS CDN (`http://rjio.tmsimg.com/...`)
   - Description: Official 16:9 promotional broadcast posters provided directly by Sony Sports Network EPG.
2. **Tier 2: TheSportsDB Official Matchday Artwork (`TheSportsDB Matchday Artwork`)**:
   - Source: TheSportsDB Event API (`searchevents.php?e=...`)
   - Description: Official 1920x1080 match posters (`strPoster`) and match thumbnails (`strThumb`) hosted on `https://r2.thesportsdb.com/images/media/event/...`. Supports team name normalization and bi-directional fixture search (`home vs away` and `away vs home`).
3. **Tier 3: TheSportsDB Venue Stadium Fanart (`TheSportsDB Venue Stadium Fanart`)**:
   - Source: TheSportsDB Team API (`searchteams.php?t=...`)
   - Description: 1920x1080 official matchday stadium fanarts (`strFanart1`) of the home team venue where the fixture takes place (e.g. Anfield for Liverpool, Santiago Bernabéu for Real Madrid, Stade Vélodrome for Marseille).
4. **Tier 4: ESPN Global Akamai CDN Telemetry (`ESPN Official Telemetry`)**:
   - Source: ESPN Live Scoreboard APIs (`https://a.espncdn.com/i/teamlogos/...`)
   - Description: Official 500x500 transparent club badges and cricket emblems attached during live telemetry polling.
5. **Tier 5: Wikimedia Commons Tournament Vectors (`Wikimedia Commons`)**:
   - Source: Wikipedia / Wikimedia REST API (`https://thumb.wikimedia.org/...`)
   - Description: Official vector tournament logos and competition emblems (2026 Asian Games, UEFA Champions League, Premier League, Davis Cup, PDC Darts, UFC).
6. **Tier 6: Curated 4K League Covers (`Official 4K League Artwork`)**:
   - Source: High-definition official sports venue backdrops without watermarks or text clutter.

### 3.3 Whitelist Audit & Persistent Caching
- **Domain Whitelist**: Every resolved asset must pass `isOfficialDomain()`, asserting ownership by `rjio.tmsimg.com`, `r2.thesportsdb.com`, `thesportsdb.com`, `espncdn.com`, `wikimedia.org`, `wikipedia.org`, or `images.unsplash.com`.
- **Persistent Disk Cache**: Validated entries are cached to `.thumbnail_cache.json` with `{ url, source }` metadata for **0ms instant delivery** across client reloads.

---

## 4. Reverse-Engineered Streamic.st Protocol

Streamic operates as a single-page sports aggregator that serves schedule data via an authenticated internal endpoint.

### 4.1 Main Events Endpoint (`/api/getEvents.php`)
* **URL**: `https://streamic.st/api/getEvents.php`
* **Method**: `GET`
* **Required Headers**:
  ```http
  Referer: https://streamic.st/
  Sec-Fetch-Site: same-origin
  X-SSIG: bytmo8xialhem066
  User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...
  ```
* **Payload Format**: Base64-encoded UTF-8 string.

---

## 5. Indian Standard Time (IST, UTC+5:30) Specification

All timestamps from the upstream source are Unix epoch seconds (`startTime`). The engine standardizes all user-facing schedules into **Indian Standard Time**:

```
IST = UTC + 5 Hours 30 Minutes (+19,800 seconds)
```

### Formatted Fields Generated for Every Event:
* `timeIST`: Kickoff time in 12-hour format with AM/PM (e.g. `08:30 PM IST`)
* `dateIST`: Formatted calendar date (e.g. `20 Sep 2026`)
* `fullIST`: Full timestamp string (e.g. `20 Sep 2026, 08:30 PM IST`)
* `endTimeIST`: Estimated match completion time (e.g. `10:25 PM IST`)
* `countdown`: Dynamic relative time string (e.g. `"🔴 LIVE now (45m in)"`, `"Starting in 14 mins"`, `"Starts in 2h 15m"`)

---

## 6. The 20-Minute Pre-Match Window & Lifecycle Rules

Broadcast streams typically do not come online until 15–20 minutes before kickoff. Displaying player links hours before the event leads to dead screens and broken iframes.

| State | Condition | `canWatch` Flag | Presentation |
|---|---|:---:|---|
| `UPCOMING` | `now < (startTime - 20m)` | `false` | Shows kickoff in IST & countdown. Stream player held in locked state. |
| `STARTING_SOON` | `(startTime - 20m) <= now < startTime` | `true` | **Active Window**: Player URLs unlocked. Pre-match coverage accessible. |
| `LIVE` | `startTime <= now < endTime` | `true` | **Ongoing**: Red live badge, live minute clock, active streams. |
| `ENDED` | `now >= endTime` | `false` | **Expired**: Automatically terminated & excluded from active playlists. |

---

## 7. Software Architecture & File Manifest

Located at `c:\Users\HP\Pictures\Screenshots\ANIM\streamic-live-scraper`:

```
streamic-live-scraper/
├── AGENTS.md               # This specification guide
├── package.json            # Package manifest & scripts
├── scraper.js              # Core scraping, IST conversion, scores & thumbnail integration
├── live_scores.js          # Real-time live scoreboard & statistics engine (Football & Cricket)
├── thumbnail_service.js    # Multi-engine image scraper & persistent cache
├── converter.js            # Intelligent Competition & Channel Rights Router
├── sony_epg.js             # Real-time Indian EPG for Sony Sports Network (Anti-Replay)
├── cli.js                  # Command-line interface with interactive filters
├── server.js               # HTTP REST API server & Web Dashboard (Port 5050)
└── test.js                 # 5-stage automated unit & integration test suite
```

---

## 8. Command-Line Usage (`cli.js`)

| Command | Description |
|---|---|
| `node cli.js --live` | **Strictly LIVE**: Shows only matches broadcasting right this second |
| `node cli.js --active` | **Active Window**: Shows matches currently LIVE or starting in ≤ 20 mins |
| `node cli.js --scores` | **Real-Time Scores**: Displays live scoreboard for all current Football & Cricket games |
| `node cli.js --my-channels` | Shows only events broadcast on channels you own in `timst.cfd` |
| `node cli.js --all` | Displays the full schedule for the entire day with countdowns |
| `node cli.js --channels` | Lists all broadcasting TV channels and their upcoming matches |
| `node cli.js --sport football` | Filters schedule by sport |
| `node cli.js --search "Asian Games"` | Searches by keyword, team, tournament, or channel |
| `node cli.js --m3u` | Exports `active_sports.m3u` playlist |
| `node cli.js --json` | Dumps raw parsed JSON output |

---

## 9. HTTP Microservice Endpoints (`server.js`)

Start the background service:
```bash
node server.js
```

### HTTP Endpoints:
* `GET http://localhost:5050/`  
  Interactive Web Dashboard with event thumbnails, real-time score widgets, and 1-click stream players.
* `GET http://localhost:5050/?live=1`  
  Dashboard filtered strictly for currently ongoing LIVE matches.
* `GET http://localhost:5050/api/schedule`  
  Full schedule JSON in Indian Standard Time with thumbnails and live scores.
* `GET http://localhost:5050/api/schedule?live=1`  
  Strictly live matches JSON.
* `GET http://localhost:5050/api/schedule?activeOnly=1`  
  Events starting within 20 minutes or LIVE (auto-terminates ended matches).
* `GET http://localhost:5050/api/scores`  
  Real-time live scoreboard telemetry across all Football & Cricket matches.
* `GET http://localhost:5050/api/channels`  
  List of all distinct TV channels and their events.
* `GET http://localhost:5050/api/playlist.m3u`  
  Direct dynamic M3U playlist file importable into VLC, IPTVnator, TiviMate, or CineStream.

---

## 10. Automated Test Suite (`test.js`)

Run the 5-suite verification:
```bash
node test.js
```

1. **Test 1**: IST Timezone Conversion (+5:30 accurate hour/minute math).
2. **Test 2**: 20-Minute Pre-Match Activation Window & Lifecycle Status (`UPCOMING` -> `STARTING_SOON` -> `LIVE` -> `ENDED`).
3. **Test 3**: Channel Name & Language Parsing.
4. **Test 4**: Anti-Replay & True Live Sports Filter (discards 2025 reruns, highlights, and talk shows).
5. **Test 5**: End-to-End Live API Execution with scores and thumbnail attachment.
