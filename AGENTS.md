# Repository Guidelines

This is a customized fork of **mindcraft** (LLM-driven Minecraft bots via Mineflayer), open-sourced as **Animecraft** (https://github.com/MAOewoqwq/Animecraft). On top of upstream, it adds a **character system**: bots that join a LAN world as named anime characters, each with a matching skin, voice, personality, and speech language. Characters are picked and launched entirely from the web UI. Current characters: **七海千秋 (Chiaki Nanami)** `chiaki.json` and **狛枝凪斗 (Nagito Komaeda)** `nagito.json` (plus `example.json`, a non-playable template).

Open-source design goal: a character should be a **self-describing, portable unit** — anyone can drop in a new character (name + skin + voice + persona) without code changes, using their own LLM/voice API keys. The generic `http` TTS provider, `.env` support, the `skins/` directory, and the character profile contract all exist to support this.

## Project Structure & Module Organization
- `main.js` — entry point; launches the MindServer and agent(s).
- `settings.js` — host/port, active `profiles`, `speak`, `language`, etc.
- `profiles/` — bot profiles. Character profiles live in `profiles/characters/` (e.g. `chiaki.json`).
- `profiles/defaults/_default.json` — base prompts (`conversing`, `coding`, …) and `$VARIABLES`.
- `profiles/defaults/assistant.json` — the active `base_profile`; **its `modes` map is what actually loads** (profile merge is whole-key replacement, not deep-merge, so `_default.json` `modes` is ignored when `assistant.json` defines one).
- `src/agent/speak.js` — TTS pipeline (system / OpenAI / Google / **fishaudio** / **generic `http`**); also has the system-voice fallback.
- `src/agent/agent.js` — `openChat()` builds chat output and triggers speech; `handleMessage()` speaks a short canned opening when an action command fires.
- `src/agent/modes.js` — tick-based reactive behaviors, incl. the data-driven `easter_eggs` mode.
- `src/utils/keys.js` — API-key lookup. Loads `.env` (zero-dep parser) into `process.env`, then resolves keys with precedence **keys.json > real env vars > .env**.
- `src/mindcraft/mindserver.js` — MindServer (socket.io hub + web UI host); has the `list-characters` endpoint.
- `src/mindcraft/public/index.html` — the web UI (Minecraft pixel theme, Simplified Chinese).
- `keys.json` — API keys (`DEEPSEEK_API_KEY`, `FISHAUDIO_API_KEY`). Not committed (gitignored). `.env` is an alternative, also gitignored; see `.env.example`.
- `profiles/characters/README.md` — **the character profile field contract** (which fields a character json may/should have).
- `profiles/characters/example.json` — full, commented template using the generic `http` TTS provider.
- `profiles/TTS.md` — the `speak_model` contract for every TTS provider + self-hosting GPT-SoVITS guide.
- `skins/` — **in-repo authoritative copies** of character skin PNGs (`skins/<name>.png`) + `skins/README.md`. Filename must equal the character `name`. These are the source; the runtime copy still lives mod-side (below).
- Skins (mod-side runtime, outside repo): `~/Library/Application Support/minecraft/CustomSkinLoader/LocalSkin/skins/<PlayerName>.png` — copy from `skins/` to here for the skin to take effect.
- Mob/entity reskins are **client resource packs**, not bot-side: `~/Library/Application Support/minecraft/resourcepacks/<Pack>/` (e.g. `MonokumaPanda/` overriding `assets/minecraft/textures/entity/panda/panda.png`).

## Build, Test, and Development Commands
- `nvm use 20` — use Node 20 LTS (**Node 24+ breaks native deps** with `ERR_INTERNAL_ASSERTION`). If a shell defaults to 24, launch with the explicit binary: `"$HOME/.nvm/versions/node/v20.20.2/bin/node" main.js`.
- `npm install` — install deps; `postinstall` applies `patches/`. mineflayer is pinned to `4.33.0`.
- `node main.js` — start the bot + MindServer (reads `settings.js` + `keys.json`/`.env`). UI at `http://localhost:8080`. With Node 20: `"$HOME/.nvm/versions/node/v20.20.2/bin/node" main.js`.
- Restart loop used during dev: `pkill -f "node main.js"` then relaunch. A crashed run can leave the MindServer holding port 8080 — free it with `lsof -ti tcp:8080 -sTCP:LISTEN | xargs kill` before restarting.

## Coding Style & Naming Conventions
- ES modules, 4-space indent, single quotes, semicolons. ESLint config in `eslint.config.js`.
- Bot names must match `^[a-zA-Z0-9_]{3,16}$` — **no spaces** (use `Chiaki_Nanami`).
- Skin filename must equal the bot name exactly.

## Custom Changes (this fork)
- **DeepSeek** as the chat/brain model.
- **FishAudio TTS** added in `speak.js` (`fishaudio` provider; `afplay` playback on macOS).
- **Generic `http` TTS provider** (`speak.js`) — config-driven, points at any backend (self-hosted GPT-SoVITS, CosyVoice, cloud API) with no code changes. See "Pluggable TTS" below and `profiles/TTS.md`.
- **`.env` support** (`src/utils/keys.js`) — see "API Keys" below.
- **Display Chinese, speak Japanese**: `speak_lang: "ja"` re-translates speech text via DeepSeek using an anime-style casual (タメ口) prompt — chat text stays Chinese.
- **Action narration stripped**: `*...*` removed in `openChat()` and forbidden in the prompt.
- **Character profile** `profiles/characters/chiaki.json` bundles name, `skin_file`, voice `reference_id`, language, persona, `greeting`, and `easter_eggs`.

## Parallel Speech / Text & Brevity (latest)
- **Dual-line parallelism** (`agent.js` `openChat()`): speech (`speak()`) fires *before* the display-text translation `await`, since speech only needs the original text. Voice + chat text + the (non-awaited) action all run concurrently instead of as a pipeline.
- **Instant action opening** (`agent.js` `handleMessage()`): when the model's response contains an action command (`isAction`), a short canned line is spoken immediately (random pick from `ACTION_OPENINGS`) so the voice isn't blocked by long model output. Skipped for self-prompt/goal loops.
- **Hard brevity cap** (`agent.js` `clampSpokenText()`, `MAX_SPOKEN_CHARS = 20`): truncates the spoken/displayed line at a sentence boundary. The prompt also enforces "≤15 chars, one short sentence"; the code cap is the backstop because the model often ignores the prompt.
- `settings.js` `show_command_syntax: "shortened"` so command syntax isn't read aloud.

## Easter Eggs (data-driven, per character)
- Generic `easter_eggs` mode in `src/agent/modes.js`: reads `agent.prompter.profile.easter_eggs` and, on a per-egg cooldown, says a random line when a configured entity is nearby. It only speaks (never calls `execute`), so it never interrupts the current action.
- Each egg: `{ "trigger": "<entityName>" | "hostile", "range": 12, "cooldown": 60, "lines": [...] }`.
  `trigger: "hostile"` matches any hostile mob (`mc.isHostile`); otherwise it matches `entity.name`.
- Register the mode once in `profiles/defaults/assistant.json` `modes` as `"easter_eggs": true` (the active base profile). Chiaki's eggs (Monokuma `panda`, generic `hostile`) live in `chiaki.json`.

## Pluggable TTS (`speak.js`) — provider abstraction
- `speak_model` (per character profile) selects the TTS backend. It can be a string (`"openai/tts-1/echo"`, `"system"`) or an object `{ "api": "...", ... }`. Dispatch is by `prov`/`api` in `fetchRemoteAudio()`. All providers reuse the shared `translateForSpeech` (JA re-translation) + `applyPronunciations` pipeline.
- **Providers**: `system` (OS voice — mac `say` / win SAPI / linux `espeak`), `openai`, `google`, `fishaudio` (author's own; `reference_id` voice slot, per-char billing), and **`http`** (generic, recommended for open-source users).
- **`http` provider** is fully config-driven — describe the request shape in the profile:
  - `url`, `method` (`POST`/`GET`), `headers` (values support `{{key:ENV_NAME}}` → resolved via `getKey()` so creds stay out of the repo), `body`/`query` templates (string `{{text}}` is replaced with the final spoken line), `response` (`binary` default / `base64` / `json:dotted.path`), `format` (audio container for temp-file playback, default `mp3`; GPT-SoVITS uses `wav`).
  - Helpers in `speak.js`: `fillTemplate()`, `resolveHeaders()`, `getByPath()`, `httpTTSRequest()`.
- **Graceful fallback**: if a non-`system` provider throws (bad config / server unreachable / no audio), the line falls back to the OS voice via `speakSystem()` instead of going silent.
- Full field docs + a "host your own GPT-SoVITS `api_v2.py` and point `http` at it" guide: `profiles/TTS.md`. The recommended low-latency/high-fidelity setup for the author is GPT-SoVITS self-hosted on a GPU, reached via the `http` provider.

## API Keys (`src/utils/keys.js`) — keys.json + .env coexist
- `getKey(name)` resolution order: **keys.json > real shell env var > .env file**. `keys.json` is optional now (was a hard requirement before).
- `loadDotEnv()` is a **zero-dependency** `.env` parser (no `dotenv` package — deliberately, since this project is Node-version-sensitive). It loads `.env` into `process.env` at import time and **never overwrites an already-set env var**. Strips surrounding quotes, skips `#` comments.
- Both `keys.json` and `.env` are gitignored. `.env.example` lists every recognized variable (empty) for open-source users to copy. You (author) can keep using `keys.json` with zero migration.

## Character profile contract & skins
- **Field contract** is documented in `profiles/characters/README.md`. A character json may have: `name` (required; `^[a-zA-Z0-9_]{3,16}$`, no spaces, = skin filename), `skin_file` (PNG name in `skins/`), `model`, `speak_model`, `greeting` (optional canned join lines), `easter_eggs`, `conversing` (persona prompt; must keep all `$VARIABLES`). `_comment_*` keys are an allowed JSON-comment convention (ignored by code).
- **Fields were aligned across characters**: both `chiaki.json` and `nagito.json` now carry `skin_file` and `greeting`; `example.json` is the canonical fully-populated, commented template.
- **`skin_file` is purely descriptive** — it makes the character↔skin link explicit in the profile; no code reads it. Actual skin loading is still CustomSkinLoader by filename (see below). The old upstream `/skin set`/`/skin clear` path in `agent.js` (Fabric Tailor, needs a `skin` field) is unused and left as-is.
- **Skins live in two places**: `skins/<name>.png` (in-repo authoritative source, version-controlled) **and** the CustomSkinLoader mod dir (runtime, where the game reads it). Always copy source → runtime: `cp skins/*.png "$HOME/Library/Application Support/minecraft/CustomSkinLoader/LocalSkin/skins/"`. See `skins/README.md` for per-OS paths.
- **Roadmap (not yet built)**: a Web UI "create character" form (name / skin upload / voice / persona) that saves a new `profiles/characters/*.json` via a new `save-character` backend event. The `create-agent` flow already accepts a full inline `profile` object, so sending a freshly-filled character into the world is largely already possible; persistence (writeFileSync) and skin upload are the missing backend pieces. Persona would be template-driven (player fills a personality blurb that's slotted into a fixed `conversing` skeleton). The field contract above is the prerequisite for that form.

## Web UI (MindServer) — character selector + pixel theme
- **Pick-a-character flow**: backend `list-characters` socket event (`mindserver.js`) scans `profiles/characters/*.json` and returns each full profile plus connection defaults read from the root `settings.js` (imported as `../../settings.js` — note `src/agent/settings.js` is a runtime-empty object, do **not** use it here). The UI top bar has a dropdown + "进入世界" button that reuses the existing `create-agent` flow.
- **Connection bar (host / auto-port)**: the character bar has a **地址** (host) box and a **自动找端口** checkbox (default on). When checked, "进入世界" sends `port: -1`, so `getServer()` in `mcserver.js` auto-scans the LAN (49000–65000) for the open world and connects — **no manual port lookup needed each session**. Uncheck it to enable the manual **端口** box. The chosen host/port override `settings.js` defaults at enter-world time (`enterWorldBtn` handler in `index.html`).
- **Pixel + Chinese UI** (`src/mindcraft/public/index.html`): Minecraft stone/dirt look (hard bevels, no rounded corners), pixel fonts (`Press Start 2P` for ASCII, `Zpix` CDN for Chinese with system fallback), all user-facing strings translated to Simplified Chinese. `<meta charset="UTF-8">` is required.

## Pure-UI Control & Online-State Handling (latest)
- **No autostart by default**: `settings.js` `profiles` is empty, so booting `main.js` only launches the MindServer — nobody auto-spawns. Pick a character in the UI to enter the world. (To autostart on boot instead, add a profile path back to `profiles`.)
- **Auto-evict stale records** (`mindserver.js` `create-agent`): an agent is blocked as "already online" **only if `in_game` is true**. A lingering process socket without `in_game` (failed/zombie run from a paused world or not-ready LAN) is auto-destroyed and recreated, so re-entering never needs a server restart. The UI `characterIsOnline()` mirror check also keys on `in_game` only.
- **Open-chat vs. /msg** (`agent.js` `bot.on('chat')` + `mindserver_proxy.js` `getNumOtherAgents()`): a bot answers **open (public) chat only when no *other* agent is in the world**. `getNumOtherAgents()` counts agents that are actually online (`in_game || socket_connected`, excluding self) — so a single online bot replies to public chat, but with 2+ bots you must `/msg <BotName>` (whisper) to avoid both replying / spamming.

## Multi-step Tasks & Two-line Brevity (latest)
- **Problem**: the persona prompt's hard "one short sentence" rule made the model stop after the first command (e.g. it would `!collectBlocks` a flower then chat, skipping `!givePlayer`), so multi-step requests like "摘花给我" never finished.
- **Fix (prompt)**: each character's `conversing` now enforces a **two-line contract** — exactly one short confirmation line at the start, **silence (commands only, no chat) during all intermediate steps**, and one short report line **only after the whole task is truly done** (item handed over via `!givePlayer`, etc.).
- **Fix (examples)**: added a "摘朵花给我" few-shot to `profiles/defaults/_default.json` `conversation_examples` demonstrating `!collectBlocks` → `!givePlayer` → final line. `settings.js` `num_examples` raised to `3` to improve its selection (word-overlap ranking when the embedding model is unavailable).

## Resource Packs (mob reskins)
- Mob textures (e.g. the Monokuma panda) are **client resource packs**, unrelated to bot code. Pack layout: `resourcepacks/<Name>/pack.mcmeta` + `assets/minecraft/textures/entity/panda/panda.png`. For MC **1.21.6** use `pack_format: 63` (with `supported_formats` range to avoid incompatibility warnings). Enable in-game via Options → Resource Packs. A bare texture PNG must be wrapped in this structure — dropping it straight into `resourcepacks/` does nothing.

## Adding a New Character (vision: many characters)
1. Copy `profiles/characters/example.json` → `profiles/characters/<name>.json` (it's the fully-commented template). Edit `name`.
2. Set `skin_file`, `speak_model` (use your own voice backend — `http` for self-hosted, or `fishaudio` with your `reference_id`; see `profiles/TTS.md`), `speak_lang`, the `conversing` persona (keep all `$VARIABLES`), and optionally `greeting` / `easter_eggs`.
3. Put the skin PNG as `skins/<name>.png` (in-repo source) **and** copy it to `LocalSkin/skins/<name>.png` (filename must equal `name` exactly). See `skins/README.md`.
4. **No code or `settings.js` edit needed**: refresh the web UI (`http://localhost:8080`), the character appears in the dropdown — select it, keep **自动找端口** checked, and click "进入世界". (Or, to autostart on boot, point `settings.js` `profiles` at the file.)

Field reference for the json: `profiles/characters/README.md`.

Standard session flow: open the world to LAN → refresh UI → pick character → "进入世界". If the first attempt fails (world was paused / LAN not ready), just click again — the stale record is auto-evicted, no restart needed.

Future direction: multiple characters online simultaneously, each with its own skin/voice/personality.

## Security & Configuration Tips
- Never commit `keys.json` or `.env` (both gitignored). Keep `allow_insecure_coding: false`.
- `reference_id` (a FishAudio voice slot) is **not** sensitive on its own — it's useless without the account's `FISHAUDIO_API_KEY`. The only real secret is the API key.
- LAN ports change each session, but the UI **自动找端口** (`port: -1` auto-scan) handles this — you no longer need to edit `settings.js` `port` on reconnect. Manually set `settings.js` `port` only when autostarting via `profiles`.

## Git / Open-Source (this fork)
- Remote: `https://github.com/MAOewoqwq/Animecraft` (default branch `main`). Local git identity is `MAOmeowmeow`.
- `.gitignore` correctly excludes `keys.json`, `.env`, `node_modules/`, and `bots/**/` runtime data (only `bots/execTemplate.js` + `bots/lintTemplate.js` are tracked code). Verified `node_modules` is **not** tracked.
- Before any push, sanity-check that no secret is staged: `git diff --cached --name-only | grep -E "keys\.json|^\.env$"` should be empty.
- Open-source caveats to remember: character profiles still carry the author's private FishAudio `reference_id`s (harmless without the key, but they point at private cloned voices) — swap to `http`/placeholder when distributing if desired. `bots/deepseek/` + `skins/deepseek.png` look like leftover test artifacts with no matching character profile.
