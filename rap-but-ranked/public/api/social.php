<?php
declare(strict_types=1);
// Rap But Ranked: names, RP, the Feed and Leaderboards.
//
// HONESTLY: scores are worked out in the player's browser, so anything they
// send is a claim. This file works RP out again itself (social-ladder.php),
// caps and rate-limits it, only accepts WAVs made by the app's own export,
// and lets anyone report a track (3 reports hides it until an admin looks).
// That's the right level for a free game; it is not anti-cheat.
//
// Storage: SQLite + WAV files OUTSIDE the web root (same pattern as the shop's
// licence store): <parent of document root>/rbr-social, or RBR_SOCIAL_ROOT.
// Admins: names listed in RBR_ADMIN_NAMES (env, or scotty-shop-secrets.php
// next to the web root), or one per line in <data dir>/admins.txt.
require __DIR__ . '/social-ladder.php';
require __DIR__ . '/social-filter.php';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function fail(string $message, int $status = 400): never { http_response_code($status); header('Content-Type: application/json'); echo json_encode(['error' => $message]); exit; }
function ok(array $data): never { header('Content-Type: application/json'); echo json_encode($data, JSON_THROW_ON_ERROR); exit; }
function now(): int { return (int)round(microtime(true) * 1000); }
function str_in($v, int $max, bool $required = true): string {
  if (!is_string($v)) { if ($required) fail('Missing text.'); return ''; }
  $v = trim(preg_replace('/\s+/u', ' ', $v) ?? '');
  if (mb_strlen($v) > $max) fail('That text is too long.');
  if ($required && $v === '') fail('Missing text.');
  return $v;
}

// ── storage ─────────────────────────────────────────────────────────
$outside = dirname((string)($_SERVER['DOCUMENT_ROOT'] ?? '') ?: __DIR__ . '/../..');
$root = getenv('RBR_SOCIAL_ROOT') ?: $outside . DIRECTORY_SEPARATOR . 'rbr-social';
if (!is_dir($root . '/audio') && !@mkdir($root . '/audio', 0700, true) && !is_dir($root . '/audio')) fail('Rap But Ranked storage is unavailable.', 503);
if (!class_exists('PDO') || !in_array('sqlite', PDO::getAvailableDrivers(), true)) fail('This server is missing SQLite (pdo_sqlite).', 503);
$db = new PDO('sqlite:' . $root . '/social.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$db->exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=4000; PRAGMA foreign_keys=ON;');
$db->exec(<<<SQL
CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, code_hash TEXT NOT NULL, rp INTEGER NOT NULL DEFAULT 0, peak INTEGER NOT NULL DEFAULT 0, events INTEGER NOT NULL DEFAULT 0, shield INTEGER NOT NULL DEFAULT -1, banned INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rp_events (account_id INTEGER NOT NULL, event_id TEXT NOT NULL, kind TEXT NOT NULL, score INTEGER NOT NULL, delta INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (account_id, event_id));
CREATE TABLE IF NOT EXISTS tracks (id TEXT PRIMARY KEY, account_id INTEGER NOT NULL, source_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, caption TEXT NOT NULL, lyrics TEXT NOT NULL, breakdown TEXT NOT NULL, rounds TEXT NOT NULL, score INTEGER NOT NULL, grade TEXT NOT NULL, bars INTEGER NOT NULL, duration REAL NOT NULL, beat TEXT NOT NULL, created INTEGER NOT NULL, plays INTEGER NOT NULL DEFAULT 0, likes INTEGER NOT NULL DEFAULT 0, reports INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0, removed INTEGER NOT NULL DEFAULT 0, UNIQUE (account_id, source_id));
CREATE TABLE IF NOT EXISTS plays (track_id TEXT NOT NULL, viewer TEXT NOT NULL, day INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (track_id, viewer, day));
CREATE TABLE IF NOT EXISTS likes (track_id TEXT NOT NULL, account_id INTEGER NOT NULL, PRIMARY KEY (track_id, account_id));
CREATE TABLE IF NOT EXISTS reports (track_id TEXT NOT NULL, reporter TEXT NOT NULL, reason TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (track_id, reporter));
CREATE TABLE IF NOT EXISTS rate (key TEXT PRIMARY KEY, since INTEGER NOT NULL, count INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS tracks_created ON tracks (created);
CREATE INDEX IF NOT EXISTS plays_at ON plays (at);
SQL);

function q(string $sql, array $args = []): PDOStatement { global $db; $s = $db->prepare($sql); $s->execute($args); return $s; }
function one(string $sql, array $args = []): ?array { $r = q($sql, $args)->fetch(); return $r ?: null; }

$limits = getenv('RBR_SOCIAL_LIMITS') !== 'off';
function rate(string $kind, string $who, int $limit, int $windowSec = 3600): void {
  global $limits;
  if (!$limits) return;
  $key = hash('sha256', $kind . '|' . $who);
  $r = one('SELECT since, count FROM rate WHERE key = ?', [$key]);
  $t = time();
  if (!$r || $r['since'] < $t - $windowSec) { q('INSERT OR REPLACE INTO rate (key, since, count) VALUES (?, ?, 1)', [$key, $t]); return; }
  if ($r['count'] >= $limit) fail('Slow down a little and try again later.', 429);
  q('UPDATE rate SET count = count + 1 WHERE key = ?', [$key]);
}
$ip = $_SERVER['REMOTE_ADDR'] ?? 'local';

function admin_names(string $root, string $outside): array {
  $names = getenv('RBR_ADMIN_NAMES') ?: '';
  $secrets = $outside . DIRECTORY_SEPARATOR . 'scotty-shop-secrets.php';
  if ($names === '' && is_file($secrets)) { $cfg = require $secrets; if (is_array($cfg)) $names = (string)($cfg['RBR_ADMIN_NAMES'] ?? ''); }
  if (is_file($root . '/admins.txt')) $names .= ',' . str_replace(["\r", "\n"], ',', (string)file_get_contents($root . '/admins.txt'));
  return array_values(array_filter(array_map(fn($n) => strtolower(trim($n)), explode(',', $names))));
}

// ── audio (GET, so <audio> can stream and seek) ─────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['audio'])) {
  $id = (string)$_GET['audio'];
  if (!preg_match('/^[a-z2-7]{12}$/', $id)) fail('Not found.', 404);
  $t = one('SELECT t.id FROM tracks t JOIN accounts a ON a.id = t.account_id WHERE t.id = ? AND t.removed = 0 AND t.hidden = 0 AND a.banned = 0', [$id]);
  $file = $root . '/audio/' . $id . '.wav';
  if (!$t || !is_file($file)) fail('Not found.', 404);
  $size = filesize($file); $start = 0; $end = $size - 1;
  header('Content-Type: audio/wav');
  header('Accept-Ranges: bytes');
  header('Cache-Control: public, max-age=86400');
  if (preg_match('/bytes=(\d*)-(\d*)/', $_SERVER['HTTP_RANGE'] ?? '', $m)) {
    if ($m[1] !== '') { $start = (int)$m[1]; if ($m[2] !== '') $end = min($end, (int)$m[2]); }
    elseif ($m[2] !== '') { $start = max(0, $size - (int)$m[2]); }
    if ($start > $end) { http_response_code(416); header("Content-Range: bytes */$size"); exit; }
    http_response_code(206);
    header("Content-Range: bytes $start-$end/$size");
  }
  header('Content-Length: ' . ($end - $start + 1));
  $f = fopen($file, 'rb'); fseek($f, $start); $left = $end - $start + 1;
  while ($left > 0 && !feof($f)) { $chunk = fread($f, min(65536, $left)); echo $chunk; $left -= strlen($chunk); }
  fclose($f);
  exit;
}

// ── everything else: POST JSON (or multipart for publish) ───────────
if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST required.', 405);
if (isset($_SERVER['HTTP_ORIGIN']) && parse_url($_SERVER['HTTP_ORIGIN'], PHP_URL_HOST) !== explode(':', $_SERVER['HTTP_HOST'])[0]) fail('Origin not allowed.', 403);
$raw = $_POST['payload'] ?? file_get_contents('php://input');
if (strlen((string)$raw) > 400000) fail('Request too large.', 413);
$body = json_decode((string)$raw, true);
if (!is_array($body)) fail('Invalid request.');
$action = (string)($body['action'] ?? '');
$device = is_string($body['device'] ?? null) && preg_match('/^[a-f0-9]{32}$/', $body['device']) ? $body['device'] : 'none';

/** The signed-in account (name + recovery code), or null. */
function account_from(array $body): ?array {
  $a = $body['auth'] ?? null;
  if (!is_array($a) || !is_string($a['name'] ?? null) || !is_string($a['code'] ?? null)) return null;
  $row = one('SELECT * FROM accounts WHERE name = ?', [trim($a['name'])]);
  if (!$row || !hash_equals($row['code_hash'], hash('sha256', strtoupper(trim($a['code']))))) return null;
  return $row;
}
$me = account_from($body);
function need_account(?array $me): array { if (!$me) fail('Claim a name first (top of the Feed or in Settings).', 401); if ($me['banned']) fail('This name has been banned from Rap But Ranked.', 403); return $me; }

function world_rank(array $a): ?int {
  if ($a['events'] < RBR_PLACEMENT_EVENTS || $a['banned']) return null;
  return 1 + (int)one('SELECT COUNT(*) n FROM accounts WHERE banned = 0 AND events >= ? AND (rp > ? OR (rp = ? AND created < ?))', [RBR_PLACEMENT_EVENTS, $a['rp'], $a['rp'], $a['created']])['n'];
}
function public_profile(array $a): array {
  $s = one('SELECT COUNT(*) n, COALESCE(SUM(plays), 0) p FROM tracks WHERE account_id = ? AND removed = 0 AND hidden = 0', [$a['id']]);
  return ['name' => $a['name'], 'rp' => (int)$a['rp'], 'peak' => (int)$a['peak'], 'events' => (int)$a['events'], 'worldRank' => world_rank($a), 'tracks' => (int)$s['n'], 'listens' => (int)$s['p'], 'joined' => (int)$a['created']];
}
function me_profile(array $a, string $root, string $outside): array {
  return public_profile($a) + ['shield' => (int)$a['shield'], 'admin' => in_array(strtolower($a['name']), admin_names($root, $outside), true), 'banned' => (bool)$a['banned']];
}
function is_admin(?array $me, string $root, string $outside): bool { return $me && !$me['banned'] && in_array(strtolower($me['name']), admin_names($root, $outside), true); }

const CARD_SQL = 'SELECT t.*, a.name creator_name, a.rp creator_rp, a.events creator_events FROM tracks t JOIN accounts a ON a.id = t.account_id';
function card(array $t, ?array $me, bool $admin = false): array {
  $c = ['id' => $t['id'], 'title' => $t['title'], 'caption' => $t['caption'], 'kind' => $t['kind'], 'creator' => ['name' => $t['creator_name'], 'rp' => (int)$t['creator_rp'], 'events' => (int)$t['creator_events']], 'score' => (int)$t['score'], 'grade' => $t['grade'], 'bars' => (int)$t['bars'], 'duration' => (float)$t['duration'], 'beat' => $t['beat'], 'plays' => (int)$t['plays'], 'likes' => (int)$t['likes'], 'liked' => $me ? (bool)one('SELECT 1 x FROM likes WHERE track_id = ? AND account_id = ?', [$t['id'], $me['id']]) : false, 'created' => (int)$t['created']];
  if ($admin) $c += ['hidden' => (bool)$t['hidden'], 'reports' => (int)$t['reports']];
  return $c;
}
const VISIBLE = 't.removed = 0 AND t.hidden = 0 AND a.banned = 0';
const TRENDING = '(SELECT COALESCE(SUM(1.0 / (1 + (? - p.at) / 86400000.0)), 0) FROM plays p WHERE p.track_id = t.id AND p.at > ?)';

function valid_event($e): ?array {
  if (!is_array($e) || !is_string($e['id'] ?? null) || !preg_match('/^[\w:.-]{3,120}$/', $e['id'])) return null;
  $kind = $e['kind'] ?? '';
  if (!in_array($kind, ['play', 'freestyle', 'room'], true) || !is_numeric($e['score'] ?? null)) return null;
  $clean = ['id' => $e['id'], 'kind' => $kind, 'score' => (float)$e['score']];
  if ($kind === 'play') $clean += ['bars' => $e['bars'] ?? null, 'hot' => !empty($e['hot'])];
  if ($kind === 'freestyle') $clean += ['seconds' => $e['seconds'] ?? null];
  if ($kind === 'room') $clean += ['bars' => $e['bars'] ?? null];
  return rbr_multiplier($clean) === null ? null : $clean;
}

/** Apply one event to an account (inside a transaction). Returns the delta, or null if it was already counted. */
function award(array &$acct, array $e): ?int {
  if (one('SELECT 1 x FROM rp_events WHERE account_id = ? AND event_id = ?', [$acct['id'], $e['id']])) return null;
  $o = rbr_apply(['rp' => (int)$acct['rp'], 'events' => (int)$acct['events'], 'shield' => (int)$acct['shield']], $e);
  if ($o === null) return null;
  q('INSERT INTO rp_events (account_id, event_id, kind, score, delta, at) VALUES (?, ?, ?, ?, ?, ?)', [$acct['id'], $e['id'], $e['kind'], (int)rbr_round($e['score']), $o['delta'], now()]);
  $acct['rp'] = $o['state']['rp']; $acct['events'] = $o['state']['events']; $acct['shield'] = $o['state']['shield']; $acct['peak'] = max((int)$acct['peak'], $o['after']);
  q('UPDATE accounts SET rp = ?, events = ?, shield = ?, peak = ? WHERE id = ?', [$acct['rp'], $acct['events'], $acct['shield'], $acct['peak'], $acct['id']]);
  return $o['delta'];
}

function recovery_code(): string {
  $alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  $groups = [];
  for ($g = 0; $g < 4; $g++) { $s = ''; for ($i = 0; $i < 4; $i++) $s .= $alphabet[random_int(0, strlen($alphabet) - 1)]; $groups[] = $s; }
  return implode('-', $groups);
}

switch ($action) {
  case 'claim': {
    rate('claim', $ip, 6);
    $name = str_in($body['name'] ?? null, 20);
    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9_.-]{2,19}$/', $name)) fail('Names are 3–20 letters, numbers, _ . or -, starting with a letter or number.');
    if (rbr_blocked($name, true) || in_array(strtolower($name), ['admin', 'administrator', 'mod', 'moderator', 'rapbutranked', 'rap-but-ranked', 'rbr', 'system', 'null', 'undefined', 'anonymous', 'support', 'scottysystems'], true)) fail('Pick a different name.');
    if (one('SELECT 1 x FROM accounts WHERE name = ?', [$name])) fail('That name is taken. Try another.', 409);
    $code = recovery_code();
    $db->beginTransaction();
    q('INSERT INTO accounts (name, code_hash, created) VALUES (?, ?, ?)', [$name, hash('sha256', $code), now()]);
    $acct = one('SELECT * FROM accounts WHERE name = ?', [$name]);
    // this device's history, replayed with the server's own maths; an import can't go past Breakout
    $events = is_array($body['events'] ?? null) ? array_slice($body['events'], -300) : [];
    foreach ($events as $e) if (($e = valid_event($e)) !== null) award($acct, $e);
    if ($acct['rp'] > RBR_PLACEMENT_CAP) { $acct['rp'] = RBR_PLACEMENT_CAP; $acct['peak'] = min((int)$acct['peak'], RBR_PLACEMENT_CAP); q('UPDATE accounts SET rp = ?, peak = ? WHERE id = ?', [$acct['rp'], $acct['peak'], $acct['id']]); }
    $db->commit();
    ok(['code' => $code, 'me' => me_profile($acct, $root, $outside)]);
  }
  case 'restore': {
    if (!$me) { rate('restore-fail', $ip, 20); fail('That name and recovery code don’t match.', 403); }
    ok(['me' => me_profile($me, $root, $outside)]);
  }
  case 'me': {
    if (!$me) fail('Signed out.', 401);
    ok(['me' => me_profile($me, $root, $outside)]);
  }
  case 'rp': {
    $acct = need_account($me);
    $e = valid_event($body['event'] ?? null);
    if (!$e) fail('Invalid result.');
    $db->beginTransaction();
    $acct = one('SELECT * FROM accounts WHERE id = ?', [$acct['id']]);
    if (!one('SELECT 1 x FROM rp_events WHERE account_id = ? AND event_id = ?', [$acct['id'], $e['id']])) rate('rp', (string)$acct['id'], 40);
    $delta = award($acct, $e);
    $db->commit();
    ok(['me' => me_profile($acct, $root, $outside), 'delta' => $delta ?? 0, 'duplicate' => $delta === null]);
  }
  case 'publish': {
    $acct = need_account($me);
    rate('publish', (string)$acct['id'], 12, 86400);
    $m = $body['meta'] ?? null;
    if (!is_array($m)) fail('Missing track details.');
    $kind = $m['kind'] ?? '';
    if (!in_array($kind, ['track', 'freestyle', 'room'], true)) fail('Only tracks made in Rap But Ranked can be published.');
    $source = str_in($m['sourceId'] ?? null, 120);
    if (!preg_match('/^[\w:.-]+$/', $source)) fail('Invalid track.');
    $title = str_in($m['title'] ?? null, 60);
    $caption = str_in($m['caption'] ?? '', 200, false);
    $lyrics = $m['lyrics'] ?? null;
    if (!is_array($lyrics) || count($lyrics) > 120) fail('Invalid lyrics.');
    $lyrics = array_map(fn($l) => str_in($l, 400, false), $lyrics);
    foreach ([$title, $caption] as $text) if (rbr_blocked($text, true)) fail('Your title or caption has a word that isn’t allowed on the Feed.');
    if (rbr_blocked(implode(' ', $lyrics), false)) fail('Your lyrics have a slur that isn’t allowed on the Feed.');
    $score = $m['score'] ?? null; $bars = $m['bars'] ?? null; $duration = $m['duration'] ?? null;
    if (!is_int($score) || $score < 0 || $score > 100 || !in_array($m['grade'] ?? '', ['D', 'C', 'B', 'A', 'S'], true)) fail('Invalid score.');
    if (!is_int($bars) || $bars < 1 || $bars > 128 || !is_numeric($duration) || $duration < 3 || $duration > 600) fail('Invalid length.');
    $beat = str_in($m['beat'] ?? '', 80, false);
    $clip = fn($xs, $n) => is_array($xs) ? array_values(array_map(fn($x) => ['label' => is_string($x['label'] ?? null) ? mb_substr($x['label'], 0, 40) : '', 'grade' => is_string($x['grade'] ?? null) ? substr($x['grade'], 0, 1) : '', 'score' => (int)($x['score'] ?? 0)], array_slice(array_filter($xs, 'is_array'), 0, $n))) : [];
    $breakdown = array_map(fn($x) => ['label' => $x['label'], 'score' => $x['score']], $clip($m['breakdown'] ?? [], 12));
    $rounds = array_map(fn($x) => ['grade' => $x['grade'], 'score' => $x['score']], $clip($m['rounds'] ?? [], 64));
    if (one('SELECT id FROM tracks WHERE account_id = ? AND source_id = ? AND removed = 0', [$acct['id'], $source])) fail('You’ve already published this one.', 409);
    $file = $_FILES['audio'] ?? null;
    if (!$file || $file['error'] !== UPLOAD_ERR_OK) fail('The audio didn’t upload. Retry.', 400);
    if ($file['size'] > 14000000) fail('That track is too long to publish.', 413);
    $head = (string)file_get_contents($file['tmp_name'], false, null, 0, 12);
    if (substr($head, 0, 4) !== 'RIFF' || substr($head, 8, 4) !== 'WAVE') fail('Expected the app’s WAV export.');
    $alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
    do { $id = ''; for ($i = 0; $i < 12; $i++) $id .= $alphabet[random_int(0, 31)]; } while (one('SELECT 1 x FROM tracks WHERE id = ?', [$id]));
    if (!move_uploaded_file($file['tmp_name'], $root . '/audio/' . $id . '.wav')) fail('Could not store the audio.', 503);
    q('DELETE FROM tracks WHERE account_id = ? AND source_id = ? AND removed = 1', [$acct['id'], $source]);
    q('INSERT INTO tracks (id, account_id, source_id, kind, title, caption, lyrics, breakdown, rounds, score, grade, bars, duration, beat, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [$id, $acct['id'], $source, $kind, $title, $caption, json_encode($lyrics), json_encode($breakdown), json_encode($rounds), $score, $m['grade'], $bars, (float)$duration, $beat, now()]);
    ok(['track' => card(one(CARD_SQL . ' WHERE t.id = ?', [$id]), $acct)]);
  }
  case 'unpublish': {
    $acct = need_account($me);
    $t = one('SELECT id FROM tracks WHERE id = ? AND account_id = ? AND removed = 0', [str_in($body['id'] ?? null, 20), $acct['id']]);
    if (!$t) fail('Not found.', 404);
    q('UPDATE tracks SET removed = 1 WHERE id = ?', [$t['id']]);
    @unlink($root . '/audio/' . $t['id'] . '.wav');
    ok(['ok' => true]);
  }
  case 'published': {
    $acct = need_account($me);
    $ids = array_slice(array_filter(is_array($body['sourceIds'] ?? null) ? $body['sourceIds'] : [], 'is_string'), 0, 400);
    $map = [];
    foreach (q('SELECT id, source_id FROM tracks WHERE account_id = ? AND removed = 0', [$acct['id']])->fetchAll() as $t) if (in_array($t['source_id'], $ids, true)) $map[$t['source_id']] = $t['id'];
    ok(['published' => (object)$map]);
  }
  case 'feed': {
    rate('read', $ip, 1500);
    $sort = ($body['sort'] ?? 'new') === 'trending' ? 'trending' : 'new';
    if ($sort === 'trending') {
      $t = now();
      $rows = q(CARD_SQL . ' WHERE ' . VISIBLE . ' ORDER BY ' . TRENDING . ' DESC, t.created DESC LIMIT 30', [$t, $t - 7 * 86400000])->fetchAll();
      ok(['tracks' => array_map(fn($r) => card($r, $me), $rows), 'next' => null]);
    }
    $before = is_int($body['before'] ?? null) ? $body['before'] : PHP_INT_MAX;
    $rows = q(CARD_SQL . ' WHERE ' . VISIBLE . ' AND t.created < ? ORDER BY t.created DESC LIMIT 20', [$before])->fetchAll();
    ok(['tracks' => array_map(fn($r) => card($r, $me), $rows), 'next' => count($rows) === 20 ? (int)end($rows)['created'] : null]);
  }
  case 'track': {
    $admin = is_admin($me, $root, $outside);
    $t = one(CARD_SQL . ' WHERE t.id = ? AND t.removed = 0' . ($admin ? '' : ' AND t.hidden = 0 AND a.banned = 0'), [str_in($body['id'] ?? null, 20)]);
    if (!$t) fail('This track isn’t available.', 404);
    ok(['track' => card($t, $me, $admin) + ['lyrics' => json_decode($t['lyrics'], true), 'breakdown' => json_decode($t['breakdown'], true), 'rounds' => json_decode($t['rounds'], true)]]);
  }
  case 'play': {
    rate('play', $ip, 600);
    $t = one('SELECT t.id FROM tracks t JOIN accounts a ON a.id = t.account_id WHERE t.id = ? AND ' . VISIBLE, [str_in($body['id'] ?? null, 20)]);
    if (!$t) fail('Not found.', 404);
    $viewer = $me ? 'a:' . $me['id'] : 'd:' . $device;
    $n = q('INSERT OR IGNORE INTO plays (track_id, viewer, day, at) VALUES (?, ?, ?, ?)', [$t['id'], $viewer, intdiv(now(), 86400000), now()])->rowCount();
    if ($n) q('UPDATE tracks SET plays = plays + 1 WHERE id = ?', [$t['id']]);
    ok(['plays' => (int)one('SELECT plays FROM tracks WHERE id = ?', [$t['id']])['plays']]);
  }
  case 'like': {
    $acct = need_account($me);
    rate('like', (string)$acct['id'], 300);
    $t = one('SELECT t.id FROM tracks t JOIN accounts a ON a.id = t.account_id WHERE t.id = ? AND ' . VISIBLE, [str_in($body['id'] ?? null, 20)]);
    if (!$t) fail('Not found.', 404);
    $n = !empty($body['on'])
      ? q('INSERT OR IGNORE INTO likes (track_id, account_id) VALUES (?, ?)', [$t['id'], $acct['id']])->rowCount()
      : -q('DELETE FROM likes WHERE track_id = ? AND account_id = ?', [$t['id'], $acct['id']])->rowCount();
    if ($n) q('UPDATE tracks SET likes = MAX(0, likes + ?) WHERE id = ?', [$n, $t['id']]);
    ok(['likes' => (int)one('SELECT likes FROM tracks WHERE id = ?', [$t['id']])['likes'], 'liked' => !empty($body['on'])]);
  }
  case 'report': {
    rate('report', $ip, 30);
    $t = one('SELECT id FROM tracks WHERE id = ? AND removed = 0', [str_in($body['id'] ?? null, 20)]);
    if (!$t) fail('Not found.', 404);
    $reason = str_in($body['reason'] ?? '', 200, false);
    $reporter = $me ? 'a:' . $me['id'] : 'd:' . $device . ':' . hash('sha256', $ip);
    $n = q('INSERT OR IGNORE INTO reports (track_id, reporter, reason, at) VALUES (?, ?, ?, ?)', [$t['id'], $reporter, $reason, now()])->rowCount();
    if ($n) q('UPDATE tracks SET reports = reports + 1, hidden = CASE WHEN reports + 1 >= 3 THEN 1 ELSE hidden END WHERE id = ?', [$t['id']]);
    ok(['ok' => true]);
  }
  case 'leaderboard': {
    rate('read', $ip, 1500);
    $board = (string)($body['board'] ?? 'ranked');
    if ($board === 'ranked') {
      $rows = q('SELECT name, rp, events FROM accounts WHERE banned = 0 AND events >= ? ORDER BY rp DESC, created ASC LIMIT 100', [RBR_PLACEMENT_EVENTS])->fetchAll();
      ok(['rows' => array_map(fn($r, $i) => ['kind' => 'player', 'position' => $i + 1, 'name' => $r['name'], 'rp' => (int)$r['rp'], 'events' => (int)$r['events']], $rows, array_keys($rows))]);
    }
    $t = now();
    [$order, $args] = match ($board) {
      'listened' => ['t.plays DESC, t.created DESC', []],
      'scores' => ['t.score DESC, t.plays DESC, t.created ASC', []],
      'trending' => [TRENDING . ' DESC, t.created DESC', [$t, $t - 7 * 86400000]],
      default => fail('Unknown leaderboard.'),
    };
    $rows = q(CARD_SQL . ' WHERE ' . VISIBLE . ' ORDER BY ' . $order . ' LIMIT 50', $args)->fetchAll();
    ok(['rows' => array_map(fn($r, $i) => ['kind' => 'track', 'position' => $i + 1, 'track' => card($r, $me)], $rows, array_keys($rows))]);
  }
  case 'profile': {
    rate('read', $ip, 1500);
    $a = one('SELECT * FROM accounts WHERE name = ? AND banned = 0', [str_in($body['name'] ?? null, 20)]);
    if (!$a) fail('No one by that name.', 404);
    $rows = q(CARD_SQL . ' WHERE t.account_id = ? AND ' . VISIBLE . ' ORDER BY t.created DESC LIMIT 60', [$a['id']])->fetchAll();
    ok(['profile' => public_profile($a), 'tracks' => array_map(fn($r) => card($r, $me), $rows)]);
  }
  case 'admin_queue': {
    if (!is_admin($me, $root, $outside)) fail('Admins only.', 403);
    $rows = q(CARD_SQL . ' WHERE t.removed = 0 AND (t.reports > 0 OR t.hidden = 1) ORDER BY t.hidden DESC, t.reports DESC, t.created DESC LIMIT 100')->fetchAll();
    ok(['tracks' => array_map(fn($r) => card($r, $me, true), $rows), 'banned' => array_column(q('SELECT name FROM accounts WHERE banned = 1 ORDER BY name')->fetchAll(), 'name')]);
  }
  case 'admin_track': {
    if (!is_admin($me, $root, $outside)) fail('Admins only.', 403);
    $id = str_in($body['id'] ?? null, 20);
    $op = $body['op'] ?? '';
    if ($op === 'hide') q('UPDATE tracks SET hidden = 1 WHERE id = ?', [$id]);
    elseif ($op === 'restore') { q('UPDATE tracks SET hidden = 0, reports = 0 WHERE id = ?', [$id]); q('DELETE FROM reports WHERE track_id = ?', [$id]); }
    elseif ($op === 'remove') { q('UPDATE tracks SET removed = 1 WHERE id = ?', [$id]); @unlink($root . '/audio/' . preg_replace('/[^a-z2-7]/', '', $id) . '.wav'); }
    else fail('Unknown action.');
    ok(['ok' => true]);
  }
  case 'admin_ban': {
    if (!is_admin($me, $root, $outside)) fail('Admins only.', 403);
    $name = str_in($body['name'] ?? null, 20);
    if (strtolower($name) === strtolower($me['name'])) fail('You can’t ban yourself.');
    if (!one('SELECT 1 x FROM accounts WHERE name = ?', [$name])) fail('No one by that name.', 404);
    q('UPDATE accounts SET banned = ? WHERE name = ?', [!empty($body['on']) ? 1 : 0, $name]);
    ok(['ok' => true]);
  }
  default:
    fail('Unknown action.');
}
