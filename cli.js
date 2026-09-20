#!/usr/bin/env node

/**
 * Streamic Live Sports Scraper - CLI
 *
 * Usage:
 *   node cli.js --active         (Only English & Famous events starting within 20 mins or LIVE)
 *   node cli.js --my-channels    (Only events broadcast on channels YOU HAVE in your timst.cfd list!)
 *   node cli.js --all            (Show all English & Famous events for the entire day)
 *   node cli.js --include-all    (Disable English/Famous filter and include all obscure minor leagues)
 *   node cli.js --channels       (List channels you have vs channels you don't have)
 *   node cli.js --sport football (Filter by sport name)
 *   node cli.js --search premier (Search by team, league, or channel)
 *   node cli.js --m3u            (Export M3U playlist file)
 *   node cli.js --json           (Output raw JSON)
 */

const fs = require('fs');
const path = require('path');
const { getSchedule, getChannels, generateActiveM3U } = require('./scraper');

const args = process.argv.slice(2);

function hasFlag(flag) {
  return args.includes(flag);
}

function getOption(name) {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return null;
}

async function run() {
  const showScores = hasFlag('--scores');
  const strictlyLiveOnly = hasFlag('--live');
  const showActiveOnly = strictlyLiveOnly ? false : (hasFlag('--active') || (!hasFlag('--all') && !hasFlag('--channels') && !hasFlag('--m3u') && !hasFlag('--my-channels') && !showScores));
  const onlyMyChannels = hasFlag('--my-channels');
  const showChannels = hasFlag('--channels');
  const exportM3U = hasFlag('--m3u');
  const outputJson = hasFlag('--json');
  const includeAllObscure = hasFlag('--include-all');
  const sportFilter = getOption('--sport');
  const searchFilter = getOption('--search');

  console.log('\n📡 Streamic Live Sports Scraper (English & Famous Events | IST Timezone)');
  console.log('='.repeat(70));

  if (showScores) {
    console.log('Fetching real-time Football & Cricket scores...\n');
    const { getAllLiveScores } = require('./live_scores');
    const scores = await getAllLiveScores(true);

    console.log(`⚽ REAL-TIME FOOTBALL MATCHES (${scores.football.length}):`);
    console.log('-'.repeat(70));
    scores.football.forEach((fb, i) => {
      const statusBadge = fb.isLive ? `🔴 LIVE ${fb.clock}` : (fb.isFinal ? '🏁 FT' : '⚪ ' + fb.detail);
      console.log(`${(i + 1).toString().padStart(2, ' ')}. [${fb.league}] ${fb.homeTeam.name} ${fb.homeTeam.score} - ${fb.awayTeam.score} ${fb.awayTeam.name} [${statusBadge}]`);
    });

    console.log(`\n🏏 REAL-TIME CRICKET MATCHES (${scores.cricket.length}):`);
    console.log('-'.repeat(70));
    scores.cricket.forEach((cr, i) => {
      const statusBadge = cr.isLive ? '🔴 LIVE' : (cr.isFinal ? '🏁 FINAL' : '⚪ ' + cr.detail);
      const teamsSummary = cr.teams.map(t => `${t.name} (${t.score}${t.overs ? `, ${t.overs} ov` : ''})`).join(' vs ');
      console.log(`${(i + 1).toString().padStart(2, ' ')}. [${cr.league}] ${teamsSummary} [${statusBadge}]`);
    });

    return;
  }

  if (exportM3U) {
    console.log('Generating active M3U playlist...');
    const m3u = await generateActiveM3U({ onlyEnglishAndFamous: !includeAllObscure, onlyMyChannels });
    const outPath = path.join(__dirname, 'active_sports.m3u');
    fs.writeFileSync(outPath, m3u);
    console.log(`✅ Saved active M3U playlist to: ${outPath}`);
    return;
  }

  if (showChannels) {
    console.log('Analyzing channels for English & Famous events...\n');
    const res = await getChannels({ onlyEnglishAndFamous: !includeAllObscure });

    const userHas = res.channels.filter(c => c.userHasChannel);
    const userDoesNotHave = res.channels.filter(c => !c.userHasChannel);

    console.log(`\n✅ CHANNELS YOU HAVE IN YOUR STREAMABLE SOURCES (${userHas.length}):`);
    console.log('-'.repeat(70));
    userHas.forEach((c, i) => {
      console.log(`${(i + 1).toString().padStart(2, ' ')}. [${c.language}] ${c.channelName} (${c.activeEvents.length} events) -> ${c.userChannelUrl}`);
    });

    console.log(`\n❌ CHANNELS YOU DO NOT HAVE (${userDoesNotHave.length}):`);
    console.log('-'.repeat(70));
    userDoesNotHave.forEach((c, i) => {
      console.log(`${(i + 1).toString().padStart(2, ' ')}. [${c.language}] ${c.channelName} (${c.activeEvents.length} events) [${c.isEnglish ? 'English' : 'Foreign'}]`);
    });

    return;
  }

  // Fetch Schedule
  const res = await getSchedule({
    onlyEnglishAndFamous: !includeAllObscure,
    onlyMyChannels,
    activeOnly: showActiveOnly,
    onlyLive: strictlyLiveOnly,
    hideEnded: true,
    category: sportFilter,
    search: searchFilter
  });

  if (outputJson) {
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  const timingModeStr = strictlyLiveOnly 
    ? '🔴 Strictly LIVE Matches Only (Broadcasting Right Now)'
    : (showActiveOnly ? '🟢 Active Window Only (≤ 20m before start or LIVE)' : '📋 All Scheduled Events');

  console.log(`Current IST Time: ${res.timestampIST}`);
  console.log(`Event Filter:     ${!includeAllObscure ? '🌟 English Commentary & Famous Leagues Only (Obscure events & replays removed)' : 'All Events'}`);
  console.log(`Timing Mode:      ${timingModeStr}`);
  if (onlyMyChannels) console.log(`Channel Scope:    🎯 My Streamable Channels Only (timst.cfd)`);
  if (sportFilter) console.log(`Sport Filter:     ${sportFilter}`);
  if (searchFilter) console.log(`Search Keyword:   ${searchFilter}`);
  console.log(`Counts:           🔴 ${res.counts.live} LIVE | 🟡 ${res.counts.startingSoon} STARTING SOON | ⚪ ${res.counts.upcoming} UPCOMING`);
  console.log('='.repeat(70));

  if (res.events.length === 0) {
    console.log('\n⚠️ No events currently matching the filter criteria.');
    if (showActiveOnly) {
      console.log('💡 Tip: Run "node cli.js --all" to view upcoming English & famous events throughout the day.');
    }
    return;
  }

  res.events.forEach((ev, idx) => {
    const statusIcon = ev.status === 'LIVE' ? '🔴' : (ev.status === 'STARTING_SOON' ? '🟡' : '⚪');
    const myChannelBadge = ev.userHasChannel ? ' [🌟 IN YOUR CHANNELS]' : '';
    console.log(`\n${(idx + 1).toString().padStart(3, ' ')}. ${statusIcon} [${ev.status}] ${ev.sportEmoji} ${ev.title}${myChannelBadge}`);
    console.log(`     🏆 League:   ${ev.league || 'Sports Event'} (${ev.sportName})`);
    console.log(`     ⏰ Time IST: ${ev.timeIST}  |  Ends: ~${ev.endTimeIST}  (${ev.countdown})`);
    if (ev.liveScore?.hasScore) {
      console.log(`     📊 Live Score: ${ev.liveScore.summary} [${ev.liveScore.clock || ev.liveScore.detail || 'Live'}]`);
    }
    if (ev.thumbnail) {
      console.log(`     🖼️  Thumbnail:  ${ev.thumbnail}`);
      if (ev.thumbnailSource) {
        console.log(`     🏛️  Artwork:    ${ev.thumbnailSource}`);
      }
    }
    
    if (ev.channels.length > 0) {
      console.log('     📺 Broadcasting Channels:');
      ev.channels.forEach(ch => {
        const qualities = ch.streams.map(s => s.quality).join(', ');
        const streamUrl = ch.streams[0]?.embedUrl || '';
        const hasTag = ch.userHasChannel ? ' [✅ YOU HAVE]' : ' [❌ YOU DO NOT HAVE]';
        console.log(`        • [${ch.language}] ${ch.channelName} (${qualities})${hasTag}`);
        if (ev.canWatch) {
          console.log(`          ▶ Stream Embed: ${streamUrl}`);
          if (ch.userChannelUrl) {
            console.log(`          ▶ Your 24/7 Source: ${ch.userChannelUrl}`);
          }
        }
      });
    }

    if (ev.myConvertedChannels && ev.myConvertedChannels.length > 0) {
      console.log('     🔄 Stream on YOUR Own Channels:');
      ev.myConvertedChannels.slice(0, 3).forEach(mc => {
        const badge = mc.matchType === 'DIRECT_MATCH' ? '⭐ DIRECT MATCH' : '⚡ BROADCAST RIGHTS';
        console.log(`        👉 [${badge}] ${mc.channelName}`);
        console.log(`           ▶ ${mc.url}`);
      });
    }
  });

  console.log('\n' + '='.repeat(70));
  console.log(`Total events listed: ${res.events.length}`);
}

run().catch(err => {
  console.error('\n❌ Error running scraper:', err.message);
  process.exit(1);
});
