# The rap coach (intelligence layer)

`src/coach/` is its own system. Play, Improve and Help call it; it doesn't depend on any screen. It is built so that **the player writes the rap, and the system challenges, analyses, teaches and adapts**. It never writes bars.

## Two engines, kept apart

| | Rules (deterministic, always on) | Local model (Rap AI, when it's running) |
| --- | --- | --- |
| What it judges | Anything measurable or lexicon-based: syllables, stress, rhyme by sound, rhyme pocket, multis across word boundaries, internal rhyme, semantic-world links and chains, candidate double meanings and homophones, possible rhyme-first filler, word order bent for a rhyme, cadence vs bar length, constraint checks, timing from the recording, help usage, history | Language: is the meaning clear, is a word forced, does a double meaning actually land, is it over-explained, what's the strongest thing, what's the one next step |
| Output | `BarAnalysis` (typed, `engine: 'rules'`) | JSON (schema-constrained), then parsed, repaired, validated and **grounded** (any word it names must be in the bars), plus a ghostwriting check. Merged in as `engine: 'local-ai'` |
| When it fails | n/a | The rules' result stands, labelled as the rules'. Nothing breaks. |

## Modules

| File | Role |
| --- | --- |
| `lexicon.ts`, `data/lexicon.json` | ~43k common words with CMU pronunciations (stress-marked), built by `scripts/build-lexicon.mjs` from SCOWL + CMUdict, lazy-loaded (~370 KB gzipped). Slang and unknown words get a spelling-based guess flagged `known: false`. |
| `phonetics.ts` | Rhyme by sound: multi / perfect / slant / assonance / consonance / identical (homophone). Line stress, rhyme pocket, multisyllabic matches across word boundaries (weak syllables may bend, as in rap). `lyrics/text.ts → rhymeStrength` uses this once the lexicon is loaded. |
| `semantics.ts` | Semantic worlds (money, time, the sea, photos, law, music…), words with second meanings tied to worlds, bridges (cheque → ink → squid), homophones from the dictionary, connection branches. |
| `analyse.ts` | Deterministic `BarAnalysis` of one round. It finds candidates, labels them as candidates, and never auto-confirms wordplay. |
| `score.ts` | Explainable scoring (see below), coaching focus, strengths and assistance summary. |
| `profile.ts` | Rolling skill profile from the last 24 scored rounds across tracks. It needs at least 4 rounds of evidence before labelling anything. |
| `purpose.ts` | Gives each challenge a purpose (`ChallengeSpec`: type, skill, difficulty, constraints, context, reason) and turns it into one checkable instruction appended to the story prompt. |
| `help.ts` | THOUGHT / CONNECTIONS / RHYMES / FLIP / FLOW / CRITIQUE at three levels, plus the `ghostwrites()` guard. |
| `context.ts` | The concise `CoachContext` sent with every model request: the topic, BPM, bars left, the story direction, the last 4 lines, the current challenge and its purpose, the rhyme pocket, the last focus, a one-line profile and the help used. |
| `prompts.ts` | Versioned prompt templates (`PROMPT_VERSION`), kept separate from the UI. |
| `llmCoach.ts` | Model refine step, parse/repair/validate/ground/merge, and model-assisted help. |

## Scoring

**Writing** dimensions, each with reasons:

| Dimension | What it reflects |
| --- | --- |
| Meaning | On the brief, connects to the song, imagery. Possible filler costs a little; likely filler costs more. |
| Rhyme | By sound. The end rhyme carries most of it; internal rhymes help with diminishing returns. |
| Cadence | Syllables against the bar at this tempo, and balance between the two bars. |
| Naturalness | Inversions, archaic or padding words, rhyme-forced wording. |
| Structure | Continuity and progression across the song. |
| Originality | Clichés, repeats, the most obvious rhymes. |
| Wordplay | Only present when something was attempted. It can lift the writing score and never lowers it. |

**Performance** (only when there's a recording) covers what a mic can measure: how close syllable onsets land to the beat grid, how much of the bars is rapped through, and dead gaps. Round score = 75% writing + 25% performance, or writing alone with no recording.

**Help used** is reported ("Completed with one semantic nudge") and stored per round. It never changes the score.

## Help: coach, don't ghostwrite

- **Level 1, nudge:** one question or observation.
- **Level 2, direction:** a few doors (questions, worlds, rhyme families, meanings).
- **Level 3, deep coaching:** walks through the thought process.

Rhyme help gives words and short phrases, never a line. "Write it for me" gets the strongest idea so far plus directions to explore, never bars. Every model answer is checked by `ghostwrites()`: quoted new lines, "try: …" lines, new lines that rhyme with each other, or a new line that completes the player's own bar. Anything flagged falls back to the rules' help.

## The director

Story first, as before. The rules (or the model) decide where the song goes next: a person just mentioned, a detail, or the arc stage. Then `purpose.ts` picks what to **train**, in this order: the coach's focus on the latest bars, then the profile's recurring weakness, then (every other round, for higher levels) a stretch goal such as an invisible punchline. The constraint is added by the rules, so the model can't drift from it. The rules check it when it can be checked; subjective ones ("hide a double meaning") are marked "needs a reader".

## What it can't genuinely judge

- **Whether a double meaning is clever.** The rules find candidates from a lexicon; only a reader (or the model, imperfectly) can say it lands. Phrase-level sound-alikes ("checkmate" / "cheques made") are left to the model.
- **Meaning in general.** The world lexicon is hand-built and finite. Words outside it can't be linked, so the rules stay quiet rather than guess (they only flag filler when the whole line is cut off from the song, or it's a tacked-on simile).
- **Voice quality, confidence, breath, emphasis, intelligibility.** None of these are scored.
- **Rhyme across accents.** CMU is American English; UK pronunciations sometimes differ (the cot / caught merger is handled).
- **The local model is small (1.5B).** It's used for narrow, checked judgements, never trusted blindly.
