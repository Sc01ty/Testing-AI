<?php
declare(strict_types=1);
// Words that can't appear on the Feed. Included by social.php; answers nothing on its own.
//
// Two levels, on purpose:
//  - lyrics ($strict = false): hard slurs only. It's a rap app, so swearing and
//    reclaimed words used in rap stay allowed; Report catches the rest.
//  - names, titles, captions ($strict = true): the hard list plus the
//    reclaimed/softer ones, because those show on every card and leaderboard.
// Edit the lists to change the policy. Matching ignores case, spacing,
// repeated letters and common l33t swaps.
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }

// matched anywhere once text is squashed (no spaces / punctuation)
const RBR_HARD_ANYWHERE = ['nigger', 'faggot', 'kike', 'wetback', 'tranny', 'raghead', 'towelhead', 'beaner', 'spearchucker', 'jigaboo', 'porchmonkey', 'gasthejews', 'heilhitler', 'siegheil'];
// matched as whole words only (they hide inside normal words otherwise)
const RBR_HARD_WORDS = ['coon', 'coons', 'spic', 'spics', 'chink', 'chinks', 'gook', 'gooks', 'paki', 'pakis', 'kyke', 'dyke', 'dykes', 'fag', 'fags', 'retard', 'retards', 'retarded', 'nazi', 'nazis', 'kkk'];
// extra for names/titles/captions
const RBR_STRICT_ANYWHERE = ['nigga', 'whore', 'hitler'];
const RBR_STRICT_WORDS = ['cunt', 'cunts', 'slut', 'sluts', 'rapist', 'rapists', 'pedo', 'pedos', 'paedo', 'paedos'];

function rbr_normalise(string $text): string {
  $t = mb_strtolower($text);
  $t = strtr($t, ['0' => 'o', '1' => 'i', '!' => 'i', '3' => 'e', '4' => 'a', '@' => 'a', '5' => 's', '$' => 's', '7' => 't', '+' => 't', '8' => 'b', '|' => 'i']);
  return preg_replace('/[^a-z\s]+/u', '', $t) ?? '';
}

/** 'nigger' → n+i+g{2,}e+r+ : stretched letters still match, but a doubled letter must stay doubled (so "Nigeria" doesn't). */
function rbr_pattern(string $word): string {
  preg_match_all('/(.)\1*/', $word, $runs);
  return implode('', array_map(fn($run) => preg_quote($run[0], '/') . (strlen($run) > 1 ? '{' . strlen($run) . ',}' : '+'), $runs[0]));
}

function rbr_blocked(string $text, bool $strict): bool {
  $words = rbr_normalise($text);
  $squashed = str_replace(' ', '', $words);
  foreach ($strict ? array_merge(RBR_HARD_ANYWHERE, RBR_STRICT_ANYWHERE) : RBR_HARD_ANYWHERE as $w)
    if (preg_match('/' . rbr_pattern($w) . '/', $squashed)) return true;
  $tokens = preg_split('/\s+/', trim($words)) ?: [];
  foreach ($strict ? array_merge(RBR_HARD_WORDS, RBR_STRICT_WORDS) : RBR_HARD_WORDS as $w) {
    $re = '/^' . rbr_pattern($w) . '$/';
    foreach ($tokens as $tok) if (preg_match($re, $tok)) return true;
  }
  return false;
}
