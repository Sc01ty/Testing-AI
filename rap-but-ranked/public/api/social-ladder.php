<?php
declare(strict_types=1);
// Line-for-line copy of src/ranked/ladder.ts so the server works RP out itself.
// src/ranked/ladder.test.ts runs both against the same cases. Change one, change the other.
// Included by social.php; it answers nothing on its own.
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__ && PHP_SAPI !== 'cli') { http_response_code(404); exit; }

const RBR_PARS = [45, 55, 62, 68, 74, 80, 86, 90];
const RBR_TIER_NAMES = ['OPEN MIC', 'CYPHER', 'UNDERGROUND', 'BREAKOUT', 'MAINSTAGE', 'HEADLINER', 'ICON', 'HALL OF FAME'];
const RBR_TIER_IDS = ['open-mic', 'cypher', 'underground', 'breakout', 'mainstage', 'headliner', 'icon', 'hall-of-fame'];
const RBR_DIVISION_RP = 100;
const RBR_TIER_RP = 300;
const RBR_TOP = 7;
const RBR_HOF_RP = 2100;
const RBR_PLACEMENT_EVENTS = 3;
const RBR_PLACEMENT_CAP = 999;

// JS Math.round (halves go up, also for negatives)
function rbr_round(float $x): int { return (int)floor($x + 0.5); }
function rbr_clamp(float $x, float $lo, float $hi): float { return min($hi, max($lo, $x)); }
function rbr_tier_at(int $rp): int { return (int)min(RBR_TOP, max(0, intdiv(max(0, $rp), RBR_TIER_RP))); }

function rbr_rank_label(int $rp): string {
  $t = rbr_tier_at($rp);
  if ($t === RBR_TOP) return RBR_TIER_NAMES[$t];
  $d = intdiv($rp - $t * RBR_TIER_RP, RBR_DIVISION_RP);
  return RBR_TIER_NAMES[$t] . ' ' . ['III', 'II', 'I'][$d];
}

function rbr_par(int $rp): float {
  $rp = max(0, $rp);
  $t = rbr_tier_at($rp);
  if ($t === RBR_TOP) return rbr_round1(RBR_PARS[$t] + min(5, ($rp - RBR_HOF_RP) / 200));
  $through = ($rp - $t * RBR_TIER_RP) / RBR_TIER_RP;
  return rbr_round1(RBR_PARS[$t] + (RBR_PARS[$t + 1] - RBR_PARS[$t]) * $through);
}
function rbr_round1(float $x): float { return floor($x * 10 + 0.5) / 10; }

/** Returns the multiplier, or null for a malformed event. */
function rbr_multiplier(array $e): ?float {
  $kind = $e['kind'] ?? '';
  if ($kind === 'play') { $b = $e['bars'] ?? 0; return $b === 8 ? 0.6 : ($b === 16 ? 1.0 : ($b === 32 ? 1.6 : null)); }
  if ($kind === 'freestyle') { $s = $e['seconds'] ?? 0; if (!is_int($s) && !is_float($s)) return null; if ($s < 10 || $s > 600) return null; return $s <= 30 ? 0.4 : ($s <= 60 ? 0.7 : 1.0); }
  if ($kind === 'room') { $b = $e['bars'] ?? 0; if (!is_int($b) || $b < 2 || $b > 32) return null; return rbr_clamp($b / 16, 0.3, 1.6); }
  return null;
}

/** $s = ['rp'=>int,'events'=>int,'shield'=>int]. Returns null for a malformed event. */
function rbr_apply(array $s, array $e): ?array {
  $mult = rbr_multiplier($e);
  if ($mult === null || !is_numeric($e['score'] ?? null)) return null;
  $before = max(0, (int)$s['rp']);
  $score = (int)rbr_clamp(rbr_round((float)$e['score']), 0, 100);
  $par = rbr_par($before);
  $placement = $s['events'] < RBR_PLACEMENT_EVENTS;
  $hot = ($e['kind'] === 'play') && !empty($e['hot']);
  $raw = ($score - $par) * 3 + 10;
  $delta = $placement ? rbr_clamp($raw, 0, 150) * 2.2 * $mult : rbr_clamp($raw, -30, 60) * $mult;
  if ($hot && $delta > 0) $delta *= 1.1;
  $delta = rbr_round($delta);
  $after = max(0, $before + $delta);
  if ($placement && $before <= RBR_PLACEMENT_CAP) $after = min($after, RBR_PLACEMENT_CAP);
  $shield = (int)$s['shield'];
  $shielded = false;
  $from = rbr_tier_at($before);
  if ($delta < 0 && $shield >= 0) {
    if ($shield === $from && rbr_tier_at($after) < $from) { $after = $from * RBR_TIER_RP; $shielded = true; }
    $shield = -1;
  }
  if (rbr_tier_at($after) > $from) $shield = rbr_tier_at($after);
  return ['before' => $before, 'after' => $after, 'delta' => $after - $before, 'par' => $par, 'multiplier' => $mult, 'hot' => $hot, 'placement' => $placement, 'shielded' => $shielded, 'state' => ['rp' => $after, 'events' => $s['events'] + 1, 'shield' => $shield]];
}

// CLI: php social-ladder.php < cases.json  →  outcomes (used by the parity test)
if (PHP_SAPI === 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
  $cases = json_decode(stream_get_contents(STDIN), true);
  echo json_encode(array_map(fn($c) => rbr_apply($c['state'], $c['event']), $cases));
}
