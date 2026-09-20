/**
 * Streamic Live Scraper Test Suite
 * Validates:
 * 1. IST (UTC+5:30) timezone calculation
 * 2. 20-minute pre-match activation window logic
 * 3. Stream lifecycle auto-end logic
 * 4. Channel name parsing & language formatting
 * 5. End-to-end API fetch & Base64 decoding
 */

const assert = require('assert');
const { formatToIST, transformEvent, getSchedule, getChannels } = require('./scraper');

console.log('🧪 Running Streamic Scraper Automated Test Suite...\n');

// --- TEST 1: IST Timezone Conversion (+5:30) ---
console.log('Test 1: IST Timezone Conversion (+5:30)');
{
  // 12:00:00 UTC on 2026-09-20 should be exactly 17:30:00 (05:30 PM) IST
  const testUtcDate = new Date('2026-09-20T12:00:00.000Z');
  const istResult = formatToIST(testUtcDate);
  console.log(`   Input UTC: 12:00 PM UTC -> Output IST: ${istResult.istTime}`);
  assert.strictEqual(istResult.istTime, '05:30 PM IST', 'IST Time must be 05:30 PM IST for 12:00 UTC');
  assert.strictEqual(istResult.istDate, '20 Sep 2026', 'IST Date must be 20 Sep 2026');
  console.log('   ✅ PASS: Accurate IST conversion\n');
}

// --- TEST 2: 20-Minute Pre-Match Activation Window & Lifecycle Status ---
console.log('Test 2: Stream Lifecycle & 20-Minute Window Logic');
{
  const matchStartEpoch = 1789900000; // Reference match kickoff
  const footballDurationSec = 115 * 60; // 115 minutes
  const matchEndEpoch = matchStartEpoch + footballDurationSec;

  const mockRawEvent = {
    id: 'test_event_1',
    title: 'Arsenal vs Chelsea',
    category: 'pilkanozna',
    startTime: matchStartEpoch,
    _embeds: [
      {
        language: 'English | Sky Sports Premier League',
        embeds: { '1': { embed: 'https://test.embed/stream1', label: 'FHD' } }
      }
    ]
  };

  // Case A: 45 minutes before match (UPCOMING, canWatch = false)
  const tUpcoming = transformEvent(mockRawEvent, matchStartEpoch - (45 * 60));
  assert.strictEqual(tUpcoming.status, 'UPCOMING', 'Status must be UPCOMING 45m before');
  assert.strictEqual(tUpcoming.canWatch, false, 'canWatch must be false when > 20m before kickoff');
  assert.strictEqual(tUpcoming.isStartingSoon, false);
  console.log('   ✅ Case A: 45m before kickoff -> Status = UPCOMING, canWatch = false');

  // Case B: 15 minutes before match (STARTING_SOON, canWatch = true) - Inside 20-min window!
  const tStartingSoon = transformEvent(mockRawEvent, matchStartEpoch - (15 * 60));
  assert.strictEqual(tStartingSoon.status, 'STARTING_SOON', 'Status must be STARTING_SOON 15m before');
  assert.strictEqual(tStartingSoon.canWatch, true, 'canWatch must be true within 20m window');
  assert.strictEqual(tStartingSoon.isStartingSoon, true);
  console.log('   ✅ Case B: 15m before kickoff -> Status = STARTING_SOON, canWatch = true (20-min rule active!)');

  // Case C: 30 minutes into match (LIVE, canWatch = true)
  const tLive = transformEvent(mockRawEvent, matchStartEpoch + (30 * 60));
  assert.strictEqual(tLive.status, 'LIVE', 'Status must be LIVE during match');
  assert.strictEqual(tLive.canWatch, true, 'canWatch must be true while live');
  assert.strictEqual(tLive.isLive, true);
  console.log('   ✅ Case C: 30m into match -> Status = LIVE, canWatch = true');

  // Case D: After match ended (125m after start > 115m duration) -> ENDED, canWatch = false
  const tEnded = transformEvent(mockRawEvent, matchStartEpoch + (125 * 60));
  assert.strictEqual(tEnded.status, 'ENDED', 'Status must be ENDED after estimated duration');
  assert.strictEqual(tEnded.canWatch, false, 'canWatch must be false when stream is ended');
  assert.strictEqual(tEnded.isEnded, true);
  console.log('   ✅ Case D: Post match (>115m) -> Status = ENDED, canWatch = false (Auto-Terminated!)\n');
}

// --- TEST 3: Channel Name & Language Extraction ---
console.log('Test 3: Channel Name & Language Parsing');
{
  const mockEvent = {
    id: 'test_ch_1',
    title: 'Real Madrid vs Barcelona',
    category: 'pilkanozna',
    startTime: 1789900000,
    _embeds: [
      {
        language: 'English | TNT Sports 1',
        embeds: { '1': { embed: 'https://test/stream', label: 'UHD' } }
      },
      {
        language: 'Polski | Canal+ Sport 2',
        embeds: { '1': { embed: 'https://test/stream2', label: 'FHD' } }
      }
    ]
  };

  const transformed = transformEvent(mockEvent, 1789900000);
  assert.strictEqual(transformed.channels.length, 2);
  assert.strictEqual(transformed.channels[0].channelName, 'TNT Sports 1');
  assert.strictEqual(transformed.channels[0].language, 'English');
  assert.strictEqual(transformed.channels[1].channelName, 'Canal+ Sport 2');
  assert.strictEqual(transformed.channels[1].language, 'Polski');
  console.log('   ✅ PASS: Clean channel name & language segregation\n');
}

// --- TEST 5: Anti-Replay & Strict Live Verification ---
console.log('Test 5: Anti-Replay & True Live Sports Filter');
{
  const { evaluateSonyShow } = require('./sony_epg');

  // Case A: Archived replay from past year (2025 in 2026)
  const replay2025 = evaluateSonyShow({
    showname: 'West Indies Tour Of England 2025',
    description: 'England scored 400, West Indies collapsed chasing 401 to lose the 1st ODI by a huge margin.',
    showCategory: 'Sports event',
    willRepeat: false
  });
  assert.strictEqual(replay2025.isLiveSport, false, 'Must reject 2025 archived tour in 2026');
  console.log('   ✅ Case A: Past year match "West Indies Tour Of England 2025" -> REJECTED (Archived replay)');

  // Case B: Highlights program
  const highlights = evaluateSonyShow({
    showname: '2026 Asian Games Highlights',
    description: 'Daily wrap-up of events from Nagoya, Japan',
    showCategory: 'Sports non-event',
    willRepeat: true
  });
  assert.strictEqual(highlights.isLiveSport, false, 'Must reject highlights');
  console.log('   ✅ Case B: "2026 Asian Games Highlights" -> REJECTED (Non-live highlights)');

  // Case C: Studio analysis program (Sports Extraaa)
  const talkShow = evaluateSonyShow({
    showname: 'Sports Extraaa',
    description: 'Prominent sportscasters and sports personalities present their expert opinions.',
    showCategory: 'Sports non-event',
    willRepeat: false
  });
  assert.strictEqual(talkShow.isLiveSport, false, 'Must reject studio talk show');
  console.log('   ✅ Case C: Studio analysis "Sports Extraaa" -> REJECTED (Non-live talk show)');

  // Case D: Genuine live sports match
  const genuineLive = evaluateSonyShow({
    showname: 'Live Asian Games 2026',
    description: 'Coverage of the 20th edition of the multi-sport event.',
    showCategory: 'Sports event',
    willRepeat: false
  });
  assert.strictEqual(genuineLive.isLiveSport, true, 'Must accept genuine live event');
  console.log('   ✅ Case D: "Live Asian Games 2026" -> ACCEPTED as Genuine Live Sport!\n');
}

// --- TEST 6: Official Thumbnail & Artwork Verification ---
console.log('Test 6: Official Thumbnail Sources & Anti-Scraper Audit');
{
  const { isOfficialDomain, fetchTheSportsDbEvent } = require('./thumbnail_service');

  // Whitelist assert
  assert.strictEqual(isOfficialDomain('http://rjio.tmsimg.com/assets/p123.jpg'), true, 'TMS CDN must be official');
  assert.strictEqual(isOfficialDomain('https://r2.thesportsdb.com/images/media/event/thumb/abc.jpg'), true, 'TheSportsDB must be official');
  assert.strictEqual(isOfficialDomain('https://a.espncdn.com/i/teamlogos/soccer/500/364.png'), true, 'ESPN CDN must be official');
  assert.strictEqual(isOfficialDomain('https://thumb.wikimedia.org/wikipedia/en/thumb/4/4d/logo.png'), true, 'Wikimedia must be official');
  
  // Blacklist assert (reject unofficial scrapers)
  assert.strictEqual(isOfficialDomain('https://www.bing.com/images/search'), false, 'Bing search must NOT be allowed');
  assert.strictEqual(isOfficialDomain('https://c8.alamy.com/comp/poster.jpg'), false, 'Alamy watermarks must NOT be allowed');
  assert.strictEqual(isOfficialDomain('https://bettingsite.com/preview.jpg'), false, 'Betting sites must NOT be allowed');
  assert.strictEqual(isOfficialDomain('https://masteez.com/tshirt.jpg'), false, 'Merch stores must NOT be allowed');
  console.log('   ✅ PASS: Official Domain Whitelist enforced (Unofficial scrapers blocked)');
}

// --- TEST 4: Live API End-to-End Fetch ---
console.log('\nTest 4: Live API End-to-End Execution');
getSchedule().then(res => {
  const { isOfficialDomain } = require('./thumbnail_service');
  assert.strictEqual(res.success, true);
  assert(res.totalEvents > 0, 'Should fetch non-zero live events');
  console.log(`   ✅ PASS: Successfully fetched & decoded ${res.totalEvents} live sports events from Streamic & Sony!`);
  console.log(`      - Current IST Time: ${res.timestampIST}`);
  console.log(`      - LIVE Events: ${res.counts.live}`);
  console.log(`      - Starting Soon (≤20m): ${res.counts.startingSoon}`);
  console.log(`      - Upcoming: ${res.counts.upcoming}`);

  // Assert all resolved thumbnails are from official domains
  let officialCount = 0;
  let unapprovedCount = 0;
  res.events.forEach(e => {
    if (e.thumbnail) {
      if (isOfficialDomain(e.thumbnail)) {
        officialCount++;
      } else {
        unapprovedCount++;
        console.error('Unapproved thumbnail found:', e.thumbnail);
      }
    }
  });

  assert.strictEqual(unapprovedCount, 0, 'Zero unapproved/third-party thumbnail domains permitted');
  console.log(`   ✅ PASS: 100% of thumbnails (${officialCount}/${officialCount}) verified from official CDNs!`);
  console.log('\n🎉 ALL 6 TEST SUITES PASSED SUCCESSFULLY!\n');
}).catch(err => {
  console.error('❌ Test Execution Failed:', err);
  process.exit(1);
});

