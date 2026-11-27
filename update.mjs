// Builds data.json for "פסיכו פאנטזי" from the public FPL API plus curated.json (the hand-written text).
// GitHub Actions: `node update.mjs _site` writes _site/data.json. In a fantasy.premierleague.com tab: window.UPD.build(get, curated).
// Nothing here needs a login or a secret: every endpoint used is public.
const CHIPHE = { wildcard: 'וויילדקארד', freehit: 'פרי היט', bboost: "בנץ' בוסט", '3xc': 'טריפל קפטן' };
const MONTH = { August: 'אוגוסט', September: 'ספטמבר', October: 'אוקטובר', November: 'נובמבר', December: 'דצמבר', January: 'ינואר', February: 'פברואר', March: 'מרץ', April: 'אפריל', May: 'מאי' };
const num = v => +v || 0, sum = a => a.reduce((x, y) => x + y, 0);

async function build(get, CUR, log = () => {}) {
  const LEAGUE = CUR.league, EXCLUDE = CUR.exclude || [], NICK = CUR.managers || {}, PFROM = CUR.previewFrom || 1;
  const bs = await get('bootstrap-static/'), FX = await get('fixtures/');
  const EL = {}; bs.elements.forEach(e => EL[e.id] = e);
  const TS = {}; bs.teams.forEach(t => TS[t.id] = t.short_name);
  const ev = bs.events, fin = ev.filter(e => e.finished).map(e => e.id), G = fin.length ? Math.max(...fin) : 0;
  const nxt = ev.find(e => e.is_next) || null, cur = ev.find(e => e.is_current) || null;
  const now = Date.now(), started = cur && !cur.finished && Date.parse(cur.deadline_time) < now ? cur.id : null; // a gameweek whose deadline passed but is not finished
  log(`finished GW ${G}, next ${nxt && nxt.id}, in progress ${started}`);
  // league
  const st = await get(`leagues-classic/${LEAGUE}/standings/`);
  const entries = st.standings.results.filter(r => !EXCLUDE.includes(r.entry));
  const ids = entries.map(r => r.entry);
  // mgr (the real name) is only used by applyCurated to vet the team name, and then removed
  const managers = entries.map(r => ({ id: r.entry, team: r.entry_name, mgr: r.player_name, he: (NICK[r.entry] || [r.entry_name])[0], slug: (NICK[r.entry] || [, 'c' + r.entry])[1] }));
  // per-manager data
  const H = {}, T = {}, PK = {};
  for (const id of ids) {
    H[id] = await get(`entry/${id}/history/`); T[id] = await get(`entry/${id}/transfers/`); PK[id] = {};
    const last = started || G;
    for (let g = 1; g <= last; g++) { try { PK[id][g] = await get(`entry/${id}/event/${g}/picks/`); } catch (e) { } }
  }
  const LV = {}; for (let g = 1; g <= (started || G); g++) { const l = await get(`event/${g}/live/`); LV[g] = {}; l.elements.forEach(e => LV[g][e.id] = e.stats); }
  const LVfin = Object.fromEntries(Object.entries(LV).filter(([g]) => +g <= G)); // the model only learns from finished gameweeks
  const pts = (g, el) => (LV[g] && LV[g][el] ? LV[g][el].total_points : 0), mins = (g, el) => (LV[g] && LV[g][el] ? LV[g][el].minutes : 0), nm = el => EL[el] ? EL[el].web_name : '?';
  const chipAt = (id, g) => (PK[id][g] && PK[id][g].active_chip) || null;
  // ---- manager arrays ----
  const m = {};
  for (const id of ids) {
    const hc = H[id].current.filter(x => x.event <= G).sort((a, b) => a.event - b.event), at = k => hc.find(x => x.event === k) || {};
    const A = f => Array.from({ length: G }, (_, k) => num(at(k + 1)[f]));
    const o = m[id] = { pts: A('points'), tot: A('total_points'), bench: A('points_on_bench'), hits: A('event_transfers_cost'), tc: A('event_transfers'), orank: A('overall_rank'), val: A('value'), bank: A('bank') };
    o.chips = H[id].chips.map(c => [c.name, c.event]);
    o.past = (H[id].past || []).map(p => [p.season_name.replace(/^20(\d\d)\/(\d\d)$/, '$1/$2').replace(/^(\d{2})\d{2}\/(\d\d)$/, '$1/$2'), p.total_points, p.rank]);
    o.d = []; o.cr = []; o.lr = [];
    for (let g = 1; g <= G; g++) {
      const P = PK[id][g]; if (!P) { o.d.push({ chip: null, cap: ['?', 0, 0], vc: ['?', 0], top: ['?', 0], bb: null, tr: [], subs: [] }); o.cr.push(0); o.lr.push(0); continue; }
      const chip = P.active_chip || null, pk = P.picks, capP = pk.find(p => p.is_captain), vcP = pk.find(p => p.is_vice_captain);
      const xi = pk.filter(p => p.multiplier > 0), bench = pk.filter(p => p.position > 11);
      const top = [...(chip === 'bboost' ? pk : pk.filter(p => p.position <= 11))].sort((a, b) => pts(g, b.element) - pts(g, a.element))[0];
      const bb = chip === 'bboost' ? null : [...bench].sort((a, b) => pts(g, b.element) - pts(g, a.element))[0];
      const trs = T[id].filter(t => t.event === g).map(t => [nm(t.element_in), pts(g, t.element_in), nm(t.element_out), pts(g, t.element_out)]);
      o.d.push({ chip, cap: [nm(capP.element), pts(g, capP.element), mins(g, capP.element) > 0 ? 1 : 0], vc: [nm(vcP.element), pts(g, vcP.element)], top: [nm(top.element), pts(g, top.element)], bb: bb ? [nm(bb.element), pts(g, bb.element)] : null, tr: trs, subs: (P.automatic_subs || []).map(s => [nm(s.element_in), nm(s.element_out)]) });
      // regret
      const mult = chip === '3xc' ? 3 : 2, all = pk.map(p => ({ el: p.element, pos: EL[p.element] ? EL[p.element].element_type : 3, v: pts(g, p.element) }));
      let opt;
      if (chip === 'bboost') opt = sum(all.map(z => z.v)) + Math.max(...all.map(z => z.v)) * (mult - 1);
      else { let best = -1e9; const by = k => all.filter(z => z.pos === k).sort((a, b) => b.v - a.v);
        for (let d = 3; d <= 5; d++) for (let mm = 2; mm <= 5; mm++) { const f = 10 - d - mm; if (f < 1 || f > 3) continue; const L = [by(1)[0], ...by(2).slice(0, d), ...by(3).slice(0, mm), ...by(4).slice(0, f)]; if (L.some(z => !z)) continue; const v = sum(L.map(z => z.v)) + Math.max(...L.map(z => z.v)) * (mult - 1); if (v > best) best = v; }
        opt = best; }
      const hp = num(at(g).points), counted = xi.map(p => pts(g, p.element));
      const effCap = mins(g, capP.element) > 0 ? capP : (vcP && mins(g, vcP.element) > 0 ? vcP : null);
      o.cr.push(Math.max(0, (Math.max(...counted) - (effCap ? pts(g, effCap.element) : 0)) * (mult - 1)));
      o.lr.push(Math.max(0, opt - hp));
    }
    // ledger
    const fh = new Set(o.chips.filter(c => c[0] === 'freehit').map(c => c[1]));
    const rows = [];
    T[id].filter(t => t.event <= G && !fh.has(t.event)).forEach(t => {
      const later = T[id].filter(u => u.element_out === t.element_in && u.event > t.event && !fh.has(u.event)).sort((a, b) => a.event - b.event)[0];
      const end = later ? later.event - 1 : G; let ip = 0, op = 0, n = 0;
      let lastG = t.event; for (let g = t.event; g <= end; g++) { if (fh.has(g)) continue; ip += pts(g, t.element_in); op += pts(g, t.element_out); n++; lastG = g; }
      const wc = chipAt(id, t.event) === 'wildcard';
      rows.push([t.event, nm(t.element_in), nm(t.element_out), ip, op, wc ? 1 : 0, wc ? 'wc' : '', lastG, n]);
    });
    rows.sort((a, b) => a[0] - b[0]); o.ledger = rows;
    const clean = rows.filter(r => !r[6]).map(r => ({ r, v: r[3] - r[4] }));
    const pick = f => { if (!clean.length) return null; const r = clean.reduce((a, b) => f(b.v, a.v) ? b : a).r; return [r[1], r[2], r[0], r[3] - r[4], r[7], r[8]]; };
    o.trBest = pick((a, b) => a > b); o.trWorst = pick((a, b) => a < b);
  }
  // validation: picks x live == history points
  let bad = 0; for (const id of ids) for (let g = 1; g <= G; g++) { const P = PK[id][g]; if (!P) continue; const v = sum(P.picks.map(p => p.multiplier * pts(g, p.element))); if (v !== m[id].pts[g - 1]) bad++; }
  log(`points check: ${bad} mismatches`);
  // ---- globals ----
  const glob = { avg: fin.sort((a, b) => a - b).map(g => ev.find(e => e.id === g).average_entry_score), high: fin.map(g => ev.find(e => e.id === g).highest_score) };
  const phases = (bs.phases || []).filter(p => p.name !== 'Overall').map(p => [MONTH[p.name] || p.name, p.start_event, p.stop_event]);
  // fixtures for the next 5 GWs
  const g0 = nxt ? nxt.id : G + 1, fixtures = {}; Object.values(TS).forEach(s => fixtures[s] = []);
  FX.filter(f => f.event && f.event >= g0 && f.event < g0 + 5).sort((a, b) => a.event - b.event).forEach(f => { fixtures[TS[f.team_h]].push([f.event, TS[f.team_a], 'H', f.team_h_difficulty]); fixtures[TS[f.team_a]].push([f.event, TS[f.team_h], 'A', f.team_a_difficulty]); });
  const gw = {};
  const kickOf = g => FX.filter(f => f.event === g).sort((a, b) => (a.kickoff_time || '').localeCompare(b.kickoff_time || '')).map(f => [TS[f.team_h], TS[f.team_a], f.kickoff_time]);
  const fdrOf = g => { const o = {}; FX.filter(f => f.event === g).forEach(f => { o[TS[f.team_h]] = f.team_h_difficulty; o[TS[f.team_a]] = f.team_a_difficulty; }); return o; };
  if (nxt) { const k = String(nxt.id); gw[k] = gw[k] || {}; gw[k].kick = kickOf(nxt.id); gw[k].fdr = fdrOf(nxt.id); }
  // ---- opening edition (deadline passed) ----
  const opening = g => {
    const k = String(g); gw[k] = gw[k] || {};
    const els = new Set(); ids.forEach(id => (PK[id][g] ? PK[id][g].picks : []).forEach(p => els.add(p.element)));
    // the same web_name twice in one list (e.g. two Palmers): the keeper becomes "Palmer (GK)", others get their team
    const cnt = {}; els.forEach(el => { const w = EL[el].web_name; cnt[w] = (cnt[w] || 0) + 1; });
    const nmG = el => { const e = EL[el]; if (!e) return nm(el); if (cnt[e.web_name] < 2) return e.web_name; if (e.element_type === 1) return e.web_name + ' (GK)'; return [...els].filter(x => EL[x].web_name === e.web_name && EL[x].element_type !== 1).length > 1 ? `${e.web_name} (${TS[e.team]})` : e.web_name; };
    const oppStr = team => FX.filter(f => f.event === g && (f.team_h === team || f.team_a === team)).map(f => f.team_h === team ? TS[f.team_a] + ':H' : TS[f.team_h] + ':A').join('/');
    const eo = [...els].map(el => { const e = EL[el], mu = {}; ids.forEach(id => { const p = PK[id][g] && PK[id][g].picks.find(q => q.element === el); mu[id] = p ? p.multiplier : null; });
      return [nmG(el), TS[e.team], oppStr(e.team), e.element_type, +e.selected_by_percent, g <= G ? pts(g, el) : 0, mu, g <= G ? mins(g, el) : 0, el]; });
    const caps = {}; ids.forEach(id => { const P = PK[id][g]; if (!P) return; const c = P.picks.find(p => p.is_captain); (caps[nmG(c.element)] = caps[nmG(c.element)] || []).push(id); });
    const chips = {}, hits = {}, transfers = {}; ids.forEach(id => { const P = PK[id][g]; if (!P) return; if (P.active_chip) chips[id] = P.active_chip; if (P.entry_history.event_transfers_cost) hits[id] = P.entry_history.event_transfers_cost; const tr = T[id].filter(t => t.event === g).map(t => [nmG(t.element_in), nm(t.element_out)]); if (tr.length) transfers[id] = tr; });
    const xiOf = id => new Set((PK[id][g] ? PK[id][g].picks : []).filter(p => p.multiplier > 0).map(p => p.element));
    const XI = {}; ids.forEach(id => XI[id] = xiOf(id));
    const template = eo.map(r => [r[0], ids.filter(id => r[6][id] > 0).length]).filter(r => r[1] >= 5).sort((a, b) => b[1] - a[1]);
    const diffs = eo.filter(r => ids.filter(id => r[6][id] > 0).length === 1).map(r => { const o = ids.find(id => r[6][id] > 0), op = r[2].split('/')[0] || ':'; return [r[0], o, r[1], op.split(':')[0], op.split(':')[1], (fdrOf(g))[r[1]] || 3, r[4]]; });
    const prs = []; for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) prs.push([ids[a], ids[b], [...XI[ids[a]]].filter(x => XI[ids[b]].has(x)).length]);
    const pairs = { similar: [...prs].sort((x, y) => y[2] - x[2]).slice(0, 3), different: [...prs].sort((x, y) => x[2] - y[2]).slice(0, 3) };
    const capTop = Object.entries(caps).sort((a, b) => b[1].length - a[1].length), he = id => (managers.find(x => x.id === id) || {}).he;
    const auto = capTop.length > 1 ? `${capTop[0][1].length === 1 ? 'אחד' : capTop[0][1].length} על ${capTop[0][0]}, ${capTop.slice(1).map(c => `${c[1].length === 1 ? 'אחד' : c[1].length} על ${c[0]}`).join(', ')}` : `כולם על ${capTop[0] ? capTop[0][0] : ''}`;
    const movers = Object.keys(transfers).map(Number);
    gw[k].preview = { headline: auto, dek: `לפני מחזור ${g}. ${movers.length ? `${movers.map(he).join(', ')} ${movers.length > 1 ? 'עשו' : 'עשה'} העברות` : 'אף אחד לא עשה העברה'}${Object.keys(chips).length ? `, ו${Object.keys(chips).map(id => `${he(+id)} הפעיל ${CHIPHE[chips[id]] || chips[id]}`).join(', ')}` : ''}.`,
      captains: Object.fromEntries(capTop), chips, transfers, hits, template, diffs, pairs, watch: [], jabs: [], eo };
    gw[k].kick = kickOf(g); gw[k].fdr = fdrOf(g);
    // finished: how the differentials did. In progress: a live snapshot (points so far)
    if (g <= G) gw[k].final = { check: { diffPts: Object.fromEntries(diffs.map(d => { const r = eo.find(z => z[0] === d[0]); return [d[0], r ? r[5] : 0]; })) } };
    else gw[k].live = { at: new Date().toISOString(), rows: eo.map(r => [...r.slice(0, 5), pts(g, r[8]), r[6], mins(g, r[8])]) };
    eo.forEach(r => r.length = 8);
  };
  for (let g = Math.max(1, PFROM); g <= (started || G); g++) if (ids.some(id => PK[id][g])) opening(g);
  // ---- planner ----
  const pg = started || G, C = {}, Eset = new Set();
  for (const id of ids) {
    const P = PK[id][pg]; if (!P) continue; const hc = H[id].current.find(x => x.event === pg) || {};
    const fh = new Set(m[id].chips.filter(c => c[0] === 'freehit').map(c => c[1]));
    const sq = P.picks.map(p => { let mp = 0, mw = 0, ms = 0, mc = 0; for (let g = 1; g <= G; g++) { if (fh.has(g)) continue; const q = PK[id][g] && PK[id][g].picks.find(z => z.element === p.element); if (!q) continue; mw++; if (q.multiplier > 0) ms++; if (q.is_captain) mc++; mp += q.multiplier * pts(g, p.element); } Eset.add(p.element); return [p.element, p.position, p.multiplier, p.is_captain ? 1 : p.is_vice_captain ? 2 : 0, mp, mw, ms, mc]; });
    // sell prices from purchase prices (transfers), initial squad bought at the start price
    const sell = {}; P.picks.forEach(p => { const e = EL[p.element], buy = [...T[id]].filter(t => t.element_in === p.element && !fh.has(t.event)).sort((a, b) => b.event - a.event)[0], pp = buy ? buy.element_in_cost : e.now_cost - e.cost_change_start; sell[p.element] = e.now_cost > pp ? pp + Math.floor((e.now_cost - pp) / 2) : e.now_cost; });
    C[id] = { bank: num(hc.bank), val: num(hc.value), chip: P.active_chip || null, sq, sell };
  }
  const Erow = e => [e.web_name, TS[e.team], e.element_type, e.now_cost, e.total_points, +e.form, +e.selected_by_percent, +e.ep_next, e.status, e.chance_of_playing_next_round, e.news, e.goals_scored, e.assists, e.clean_sheets, +e.expected_goal_involvements, e.minutes, e.cost_change_start, e.bonus, num(e.defensive_contribution), +e.points_per_game];
  const E = {}; Eset.forEach(el => E[el] = Erow(EL[el]));
  const planner = { gw: pg, C, E, asOf: new Date().toISOString().slice(0, 10), nextGw: nxt ? nxt.id : null };
  // players list for the transfer picker
  const tl = bs.teams.map(t => t.short_name);
  const players = { gw: nxt ? nxt.id : G, t: tl, r: bs.elements.filter(e => e.status !== 'u' && (e.minutes > 0 || Eset.has(e.id))).map(e => [e.id, e.web_name, e.team - 1, e.element_type, e.now_cost, +e.form, +e.points_per_game, e.total_points, +e.selected_by_percent, e.chance_of_playing_next_round == null ? null : e.chance_of_playing_next_round]) };
  // ---- prices (official predictor fields + recent changes) ----
  let price = null;
  try {
    const pc = await get('stats/price-changes/'), L = e => (e.price_change_projections || []).map(p => p.likelihood), Sx = {}, Mx = {};
    Eset.forEach(el => { const e = EL[el], l = L(e); Sx[el] = [Math.round(+e.price_change_percent || 0), l[0] || 0, l[1] || 0, l[2] || 0, e.price_change_locked_until ? e.price_change_locked_until.slice(5, 10) : 0]; });
    bs.elements.forEach(e => { if (!Eset.has(e.id) && Math.abs(L(e)[0] || 0) >= 4) Mx[e.id] = [Math.round(+e.price_change_percent || 0), L(e)[0]]; });
    const since = new Date(now - 8 * 864e5).toISOString();
    price = { at: new Date().toISOString().slice(0, 16), ev: G, S: Sx, M: Mx, H: (Array.isArray(pc) ? pc : []).filter(c => c.changed_at >= since).map(c => [c.element, c.cost_before, c.cost_after, c.changed_at.slice(5, 10)]) };
  } catch (e) { log('price changes unavailable'); }
  // ---- points model + backtest ----
  const MDL = makeModel(bs, FX, Object.fromEntries(Object.entries(LVfin).map(([g, o]) => [g, Object.fromEntries(Object.entries(o).map(([el, s]) => [el, { s }]))])));
  const OPT = { hl: 8, hlm: 2, xw: 0.5 }, PMx = MDL.PM(G + 1, OPT), r3 = Math.round;
  const pm = { gw: G, avg: PMx.avg, home: PMx.home, R: Object.fromEntries(Object.entries(PMx.R).map(([id, v]) => [TS[id], [r3(v.att * 1000) / 1000, r3(v.def * 1000) / 1000]])), P: Object.fromEntries(Object.entries(PMx.P).filter(([id, p]) => p.pS > 0 || p.pSub > 0).map(([id, p]) => [id, [r3(p.pS * 100), r3(p.pSub * 100), r3(p.mS), r3(p.p60 * 100), r3(p.xg * 1000), r3(p.xa * 1000), r3(p.bon * 1000), r3(p.sv * 100), r3(p.yc * 1000), r3(p.dc * 100)]])) };
  let calib = null;
  if (G >= 4) {
    const rows = [], top = []; let sp = 0, sa = 0;
    for (let g = 3; g <= G; g++) {
      const M = MDL.PM(g, OPT), Fm = {}; FX.filter(f => f.event === g).forEach(f => { (Fm[f.team_h] = Fm[f.team_h] || []).push([f.team_a, true]); (Fm[f.team_a] = Fm[f.team_a] || []).push([f.team_h, false]); });
      const av = el => (mins(g - 1, el) > 0 ? 1 : g > 2 && mins(g - 2, el) > 0 ? 0.6 : 0.15), x = el => (Fm[EL[el].team] || []).reduce((t, f) => t + MDL.XP(M, el, f[0], f[1], av(el)), 0);
      for (const id of ids) { const P = PK[id][g]; if (!P) continue; let v = 0; P.picks.forEach(p => { if (p.multiplier > 0) { const xx = x(p.element); v += xx * p.multiplier; sp += xx; sa += pts(g, p.element); } }); rows.push([g, ids.indexOf(id), v, m[id].pts[g - 1]]); }
      const L = bs.elements.filter(e => M.P[e.id] && (M.P[e.id].pS + M.P[e.id].pSub) > 0).map(e => ({ x: x(e.id), a: pts(g, e.id) })).sort((a, b) => b.x - a.x), avg = a => a.length ? a.reduce((s, o) => s + o.a, 0) / a.length : 0;
      top.push([g, +avg(L.slice(0, 20)).toFixed(1), +avg(L).toFixed(1)]);
    }
    const K = sp ? sa / sp : 1; calib = { at: new Date().toISOString().slice(0, 10), K: +K.toFixed(3), G0: 3, ids, rows: rows.map(r => [r[0], r[1], +(r[2] * K).toFixed(1), r[3]]), top, model: 'xg', gw: G };
  }
  // ---- assemble ----
  const out = { builtAt: new Date().toISOString(), updated: new Date().toISOString().slice(0, 10), league: { id: LEAGUE, name: st.league.name }, current: G, live: started, next: nxt ? { gw: nxt.id, deadline: nxt.deadline_time } : null, managers, glob, m, gw, phases, fixtures, planner, players, price, pm, calib };
  return applyCurated(out, CUR);
}

// Hand-written text from curated.json goes over the computed data. Used after a build, and on the last
// deployed data when the FPL API is down (so a text-only change still goes live).
function applyCurated(out, cur) {
  const NICK = cur.managers || {};
  // the site is public: no real names. A team name that spells one out (a full name, a surname) is hidden too,
  // unless the nickname is that name anyway. curated.teams can set any team name by hand.
  const lat = x => String(x || '').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
  (out.managers || []).forEach(m => { if (m.mgr) { const parts = String(m.mgr).split(/\s+/).filter(Boolean), last = lat(parts[parts.length - 1]), tn = lat(m.team), slug = lat((NICK[m.id] || [])[1]);
      if ((parts.length > 1 && tn.includes(lat(parts[0])) && tn.includes(last)) || (last.length > 2 && tn.includes(last) && slug !== last)) m.team = ''; }
    delete m.mgr; const n = NICK[m.id]; if (n) { m.he = n[0]; m.slug = n[1]; } if (cur.teams && cur.teams[m.id] != null) m.team = cur.teams[m.id]; });
  if (cur.archive) out.archive = cur.archive; else delete out.archive;
  out.gw = out.gw || {};
  Object.entries(cur.gw || {}).forEach(([k, c]) => {
    const g = out.gw[k]; if (!g) return;
    if (c.preview && g.preview) ['headline', 'dek', 'watch', 'jabs', 'prediction'].forEach(f => { if (c.preview[f] != null) g.preview[f] = c.preview[f]; });
    if (c.final && +k <= out.current) { const ck = (g.final && g.final.check) || null; g.final = { ...(g.final || {}), ...JSON.parse(JSON.stringify(c.final)) }; if (ck || c.final.check) g.final.check = { ...(ck || {}), ...(c.final.check || {}) }; }
  });
  return out;
}

// --- the xG points model (same as model.js) ---
function makeModel(B, FX, LV) {
  const POSG = { 1: 10, 2: 6, 3: 5, 4: 4 }, CSP = { 1: 4, 2: 4, 3: 1, 4: 0 }, DCT = { 1: 99, 2: 10, 3: 12, 4: 12 };
  const PM = (upto, opt = {}) => {
    const HL = opt.hl || 6, HLM = opt.hlm || 3, KT = opt.kt || 4, K90 = opt.k90 || 5, XW = opt.xw ?? 0.7;
    const gws = Object.keys(LV).map(Number).filter(g => g < upto).sort((a, b) => a - b), last = gws[gws.length - 1] || 0;
    const w = (g, hl) => Math.pow(0.5, (last - g) / hl);
    const EL = {}; B.elements.forEach(e => EL[e.id] = e);
    const fxg = {}; FX.forEach(f => { if (f.event && f.finished && f.event < upto) (fxg[f.event] = fxg[f.event] || []).push(f); });
    const T = {}; B.teams.forEach(t => T[t.id] = { gf: 0, ga: 0, xf: 0, xa: 0, n: 0 });
    let hg = 0, ag = 0, nf = 0;
    gws.forEach(g => {
      const xg = {}; Object.entries(LV[g]).forEach(([el, v]) => { const e = EL[el]; if (!e) return; xg[e.team] = (xg[e.team] || 0) + num(v.s.expected_goals); });
      const games = {}; (fxg[g] || []).forEach(f => { games[f.team_h] = (games[f.team_h] || 0) + 1; games[f.team_a] = (games[f.team_a] || 0) + 1; hg += f.team_h_score; ag += f.team_a_score; nf++; });
      (fxg[g] || []).forEach(f => { const wg = w(g, HL);
        [[f.team_h, f.team_a, f.team_h_score, f.team_a_score], [f.team_a, f.team_h, f.team_a_score, f.team_h_score]].forEach(([a, b, s, c]) => { const t = T[a]; t.gf += wg * s; t.ga += wg * c; t.xf += wg * (xg[a] || 0) / games[a]; t.xa += wg * (xg[b] || 0) / games[b]; t.n += wg; }); });
    });
    const avg = nf ? (hg + ag) / (2 * nf) : 1.35, home = nf ? Math.sqrt(Math.max(0.8, Math.min(1.5, hg / Math.max(ag, 1)))) : 1.1, R = {};
    Object.entries(T).forEach(([id, t]) => { R[id] = { att: (XW * t.xf + (1 - XW) * t.gf + KT * avg) / (t.n + KT) / avg, def: (XW * t.xa + (1 - XW) * t.ga + KT * avg) / (t.n + KT) / avg }; });
    const teamGames = (team, g) => (fxg[g] || []).filter(f => f.team_h === team || f.team_a === team).length, acc = {};
    gws.forEach(g => Object.entries(LV[g]).forEach(([el, v]) => {
      const e = EL[el]; if (!e) return; const s = v.s, tg = teamGames(e.team, g); if (!tg) return;
      const a = acc[el] = acc[el] || { ws: 0, wsub: 0, wg: 0, min: 0, mS: 0, nS: 0, n60: 0, xg: 0, xa: 0, bon: 0, sv: 0, yc: 0, dcHit: 0, dcN: 0 };
      const wm = w(g, HLM), stt = num(s.starts), mn = num(s.minutes);
      a.ws += wm * Math.min(stt, tg); a.wsub += wm * (mn > 0 && stt < tg ? Math.min(1, tg - stt) : 0); a.wg += wm * tg;
      a.min += mn; a.xg += num(s.expected_goals); a.xa += num(s.expected_assists); a.bon += num(s.bonus); a.sv += num(s.saves); a.yc += num(s.yellow_cards);
      if (stt) { a.mS += mn; a.nS += stt; if (mn >= 60 * stt) a.n60 += stt; }
      if (mn >= 60) { a.dcN++; if (num(s.defensive_contribution) >= DCT[e.element_type] * tg) a.dcHit++; }
    }));
    const pr = {};
    [1, 2, 3, 4].forEach(k => { let mm = 0, xg = 0, xa = 0, b = 0, sv = 0, yc = 0, dh = 0, dn = 0;
      Object.entries(acc).forEach(([el, a]) => { if (EL[el].element_type !== k || a.min < 270) return; mm += a.min; xg += a.xg; xa += a.xa; b += a.bon; sv += a.sv; yc += a.yc; dh += a.dcHit; dn += a.dcN; });
      const n = Math.max(mm / 90, 1); pr[k] = { xg: xg / n, xa: xa / n, bon: b / n, sv: sv / n, yc: yc / n, dc: dn ? dh / dn : 0 }; });
    const P = {};
    Object.entries(acc).forEach(([el, a]) => { const k = EL[el].element_type, n90 = a.min / 90, q = pr[k], sh = (x, p) => (x + p * K90) / (n90 + K90);
      P[el] = { pS: a.wg ? Math.min(1, a.ws / a.wg) : 0, pSub: a.wg ? Math.min(1, a.wsub / a.wg) : 0, mS: a.nS ? a.mS / a.nS : 75, p60: a.nS ? (a.n60 + 1) / (a.nS + 1.25) : 0.7, xg: sh(a.xg, q.xg), xa: sh(a.xa, q.xa), bon: sh(a.bon, q.bon), sv: sh(a.sv, q.sv), yc: sh(a.yc, q.yc), dc: (a.dcHit + q.dc * 3) / (a.dcN + 3), pos: k, team: EL[el].team }; });
    return { R, P, avg, home, upto };
  };
  const XP = (M, el, opp, isHome, avail = 1) => {
    const p = M.P[el]; if (!p) return 0; const Tt = M.R[p.team], O = M.R[opp]; if (!Tt || !O) return 0;
    const h = isHome ? M.home : 1 / M.home, k = p.pos, lamA = M.avg * O.att * Tt.def / h, mult = O.def * h, m90 = (p.pS * p.mS + p.pSub * 20) / 90, on60 = p.pS * p.p60;
    let x = p.pS * (1 + p.p60) + p.pSub + p.xg * m90 * mult * POSG[k] + p.xa * m90 * mult * 3 + CSP[k] * Math.exp(-lamA) * on60;
    if (k <= 2) x -= 0.5 * lamA * on60; if (k === 1) x += p.sv * m90 * (O.att / h) / 3;
    return (x + p.bon * m90 * (0.7 + 0.3 * mult) + 2 * p.dc * on60 - p.yc * m90) * avail;
  };
  return { PM, XP };
}

// Fields that change on every run even when nothing real happened; ignored when deciding whether to deploy.
const VOLATILE = o => { const c = JSON.parse(JSON.stringify(o || {})); delete c.builtAt; delete c.updated; if (c.planner) delete c.planner.asOf; if (c.price) delete c.price.at; if (c.calib) delete c.calib.at; Object.values(c.gw || {}).forEach(g => { if (g.live) delete g.live.at; }); return JSON.stringify(c); };

if (typeof window !== 'undefined') window.UPD = { build, applyCurated, VOLATILE };
if (typeof process !== 'undefined' && process.argv && process.argv[1] && process.argv[1].endsWith('update.mjs')) {
  const fs = await import('node:fs');
  const outDir = process.argv[2] || '.', SITE = (process.env.SITE_URL || '').replace(/\/?$/, '/'), FORCE = process.env.FORCE === 'true';
  const say = (k, v) => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); console.log(`${k}=${v}`); };
  const get = async (p, tries = 4) => { for (let i = 0; i < tries; i++) { try { const r = await fetch('https://fantasy.premierleague.com/api/' + p, { headers: { 'User-Agent': 'Mozilla/5.0 (psycho-fantasy league recap)' } }); if (r.ok) return await r.json(); if (r.status === 404) throw new Error('404 ' + p); } catch (e) { if (String(e).includes('404')) throw e; } await new Promise(r => setTimeout(r, 2000 * (i + 1))); } throw new Error('failed ' + p); };
  const cur = JSON.parse(fs.readFileSync('curated.json', 'utf8'));
  // the data that is live right now (to skip quiet runs, and as a fallback when the API is down)
  let prev = null;
  if (SITE !== '/') { try { const r = await fetch(SITE + 'data.json?x=' + Date.now()); if (r.ok) prev = await r.json(); } catch (e) { } }
  else if (fs.existsSync('data.json')) prev = JSON.parse(fs.readFileSync('data.json', 'utf8'));
  console.log('live data:', prev ? `built ${prev.builtAt || prev.updated}` : 'none');
  // scheduled runs only rebuild when something can have changed: a match in play, the hours around a deadline, or every ~3 hours
  if (!FORCE && prev && prev.builtAt) {
    const now = Date.now(), age = (now - Date.parse(prev.builtAt)) / 6e4, dl = prev.next ? Date.parse(prev.next.deadline) : NaN;
    let live = false; try { live = (await get('fixtures/', 2)).some(f => f.kickoff_time && Date.parse(f.kickoff_time) <= now && now - Date.parse(f.kickoff_time) < 3 * 36e5); } catch (e) { live = true; }
    const nearDl = !isNaN(dl) && now > dl - 6 * 36e5 && now < dl + 5 * 36e5;
    if (!live && !nearDl && age < 170) { console.log(`quiet: built ${Math.round(age)} min ago, no match in play`); say('deploy', 'false'); process.exit(0); }
  }
  let out;
  try { out = await build(get, cur, console.log); }
  catch (e) {
    console.log(`::warning::FPL API unavailable (${e.message})`);
    if (!prev) process.exit(1);
    if (!FORCE) { say('deploy', 'false'); process.exit(0); }
    out = applyCurated(JSON.parse(JSON.stringify(prev)), cur); delete out.market; // a text or design change still goes live on the last data
  }
  // keep the pre-deadline page of the gameweek in progress: freeze the last pre-deadline data (planner, prices, model) as it was
  if (out.live && prev) {
    if (prev.next && prev.next.gw === out.live && !prev.live && prev.planner) out.preSnap = { gw: out.live, at: prev.builtAt || prev.updated, next: prev.next, planner: prev.planner, price: prev.price, pm: prev.pm, players: prev.players, calib: prev.calib };
    else if (prev.preSnap && prev.preSnap.gw === out.live) out.preSnap = prev.preSnap;
  }
  if (!out.live) delete out.preSnap;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outDir + '/data.json', JSON.stringify(out));
  const changed = !prev || VOLATILE(prev) !== VOLATILE(out);
  console.log(`data.json written (${JSON.stringify(out).length} bytes), ${changed ? 'changed' : 'no real change'}`);
  say('deploy', FORCE || changed ? 'true' : 'false');
}
export { build, applyCurated };
