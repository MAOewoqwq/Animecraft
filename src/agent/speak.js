import { exec, spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { TTSConfig as gptTTSConfig } from '../models/gpt.js';
import { TTSConfig as geminiTTSConfig } from '../models/gemini.js';
import { getKey } from '../utils/keys.js';
import translate from 'google-translate-api-x';

const ANIME_JA_PROMPT = `あなたは中国語のセリフを日本語に翻訳する声優です。次のルールに厳密に従ってください：
1. 原文の意味に忠実に訳す。勝手に内容を足したり、削ったり、言い換えで意味を変えたりしない。
2. 必ずタメ口（非敬語・常体）で訳す。「です・ます」は使わない。
3. アニメ風の親しみやすい話し言葉にし、堅い表現は避ける。
4. 「〜だよ」「〜ね」「〜よ」「〜かな」などの自然な語尾を使う。
5. 翻訳結果だけを出力する。説明・補足・引用符は一切付けない。`;

async function translateForSpeech(text, lang, persona) {
    if (!lang) return text;
    // 日本語はDeepSeekでアニメ風タメ口に翻訳
    if (lang === 'ja' || lang === 'jp' || lang === 'japanese') {
        try {
            const apiKey = getKey('DEEPSEEK_API_KEY');
            // Append a per-character persona hint (e.g. first-person pronoun / gender) so the
            // translation matches the character. Without it the model sometimes guesses wrong
            // (e.g. using male 「おれ」 for a female character).
            const systemPrompt = persona ? `${ANIME_JA_PROMPT}\n6. ${persona}` : ANIME_JA_PROMPT;
            const res = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: text }
                    ],
                    temperature: 0.3
                })
            });
            if (!res.ok) throw new Error(`DeepSeek translate failed (${res.status})`);
            const data = await res.json();
            const out = data.choices?.[0]?.message?.content?.trim();
            if (out) return out;
            throw new Error('empty translation');
        } catch (err) {
            console.error('[TTS] DeepSeek translate error, falling back to Google:', err.message);
        }
    }
    // その他の言語（またはフォールバック）はGoogle翻訳
    try {
        const result = await translate(text, { to: lang });
        return result.text || text;
    } catch (err) {
        console.error('[TTS] translate error, speaking original:', err.message);
        return text;
    }
}

// Force fixed readings for names/words the TTS would otherwise mispronounce.
// Replacements run longest-key-first so multi-char names win over their parts.
function applyPronunciations(text, pronunciations) {
    if (!pronunciations || typeof text !== 'string') return text;
    const keys = Object.keys(pronunciations).sort((a, b) => b.length - a.length);
    let out = text;
    for (const key of keys) {
        if (!key) continue;
        out = out.split(key).join(pronunciations[key]);
    }
    return out;
}

// Recursively replace the {{text}} placeholder in a request body/query template.
// Strings get {{text}} swapped for the spoken line; objects/arrays are walked; other
// values pass through untouched. Used by the generic `http` TTS provider so users can
// describe any backend's request shape purely in their profile config.
function fillTemplate(value, text) {
    if (typeof value === 'string') {
        return value.split('{{text}}').join(text);
    }
    if (Array.isArray(value)) {
        return value.map(v => fillTemplate(v, text));
    }
    if (value && typeof value === 'object') {
        const out = {};
        for (const k of Object.keys(value)) out[k] = fillTemplate(value[k], text);
        return out;
    }
    return value;
}

// Resolve {{key:ENV_NAME}} placeholders in header values to real API keys/env vars,
// so open-source users keep their own credentials in keys.json / env and never in the repo.
function resolveHeaders(headers) {
    if (!headers || typeof headers !== 'object') return {};
    const out = {};
    for (const k of Object.keys(headers)) {
        let v = headers[k];
        if (typeof v === 'string') {
            v = v.replace(/\{\{key:([A-Z0-9_]+)\}\}/g, (_, name) => getKey(name));
        }
        out[k] = v;
    }
    return out;
}

// Pull a base64 audio string out of a JSON response at a dotted path (e.g. "data.audio").
function getByPath(obj, dottedPath) {
    return dottedPath.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

// Generic, fully config-driven HTTP TTS provider. Lets users point at any backend
// (local GPT-SoVITS api_v2.py, CosyVoice, a self-hosted service, or a cloud API) with
// profile config alone — no code changes. Returns audio as base64 like the others.
async function httpTTSRequest(text, model) {
    const method = (model.method || 'POST').toUpperCase();
    const headers = resolveHeaders(model.headers);
    let url = model.url;
    if (!url) throw new Error('http TTS provider requires a "url" field');

    const options = { method, headers };

    if (method === 'GET') {
        // Build query string from a {{text}}-templated `query` object (or default ?text=).
        const queryTemplate = model.query || { text: '{{text}}' };
        const filled = fillTemplate(queryTemplate, text);
        const usp = new URLSearchParams();
        for (const k of Object.keys(filled)) usp.append(k, String(filled[k]));
        url += (url.includes('?') ? '&' : '?') + usp.toString();
    } else {
        const bodyTemplate = model.body || { text: '{{text}}' };
        const filled = fillTemplate(bodyTemplate, text);
        options.body = JSON.stringify(filled);
        if (!headers['Content-Type'] && !headers['content-type']) {
            options.headers = { ...headers, 'Content-Type': 'application/json' };
        }
    }

    const res = await fetch(url, options);
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`http TTS failed (${res.status}): ${errText}`);
    }

    const responseKind = model.response || 'binary';
    if (responseKind === 'binary') {
        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer).toString('base64');
    }
    if (responseKind === 'base64') {
        return (await res.text()).trim();
    }
    if (responseKind.startsWith('json:')) {
        const path = responseKind.slice('json:'.length);
        const data = await res.json();
        const b64 = getByPath(data, path);
        if (typeof b64 !== 'string') {
            throw new Error(`http TTS: no base64 string at JSON path "${path}"`);
        }
        return b64;
    }
    throw new Error(`http TTS: unknown response kind "${responseKind}"`);
}

async function fishAudioRequest(text, referenceId) {
    const apiKey = getKey('FISHAUDIO_API_KEY');
    const res = await fetch('https://api.fish.audio/v1/tts', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'model': 's1'
        },
        body: JSON.stringify({
            text: text,
            reference_id: referenceId,
            format: 'mp3',
            mp3_bitrate: 128,
            normalize: true,
            latency: 'normal'
        })
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`FishAudio TTS failed (${res.status}): ${errText}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer).toString('base64');
}

let speakingQueue = []; // each item: {text, model, audioData, ready}
let isSpeaking = false;

export function speak(text, speak_model) {
    const model = speak_model || 'system';

    // Audio container format for temp-file playback (afplay/ffplay). Defaults to mp3
    // to match openai/google/fishaudio; the generic `http` provider can override it
    // (e.g. GPT-SoVITS api_v2.py returns wav).
    const format = (typeof model === 'object' && model.format) ? model.format : 'mp3';

    const item = { text, model, format, audioData: null, ready: null };

    if (model === 'system') {
        // no preprocessing needed
        item.ready = Promise.resolve();
    } else {
    item.ready = fetchRemoteAudio(text, model)
        .then(data => { item.audioData = data; })
        .catch(err => { item.error = err; });
    }

    speakingQueue.push(item);
    if (!isSpeaking) processQueue();
}

async function fetchRemoteAudio(txt, model) {
    function getModelUrl(prov) {
        if (prov === 'openai') return gptTTSConfig.baseUrl;
        if (prov === 'google') return geminiTTSConfig.baseUrl;
        return 'https://api.openai.com/v1';
    }

    let prov, mdl, voice, url;
    if (typeof model === 'string') {
        [prov, mdl, voice] = model.split('/');
        url = getModelUrl(prov);
    } else {
        prov = model.api;
        mdl = model.model;
        voice = model.voice;
        url = model.url || getModelUrl(prov);
    }

    if (prov === 'openai') {
        return gptTTSConfig.sendAudioRequest(txt, mdl, voice, url);
    } else if (prov === 'google') {
        return geminiTTSConfig.sendAudioRequest(txt, mdl, voice, url);
    }
    else if (prov === 'fishaudio') {
        const referenceId = model.reference_id || mdl;
        // Fix readings before translation (so the translator keeps the kana name)
        // and again after, as a backstop in case the name survived as kanji.
        const preFixed = applyPronunciations(txt, model.pronunciations);
        const speechText = await translateForSpeech(preFixed, model.speak_lang, model.speak_persona);
        const finalText = applyPronunciations(speechText, model.pronunciations);
        return fishAudioRequest(finalText, referenceId);
    }
    else if (prov === 'http') {
        // Generic config-driven backend (e.g. self-hosted GPT-SoVITS). Same
        // translation + pronunciation pipeline as fishaudio, then POST/GET per config.
        const preFixed = applyPronunciations(txt, model.pronunciations);
        const speechText = await translateForSpeech(preFixed, model.speak_lang, model.speak_persona);
        const finalText = applyPronunciations(speechText, model.pronunciations);
        return httpTTSRequest(finalText, model);
    }
    else {
        throw new Error(`TTS Provider ${prov} is not supported.`);
    }
}

// Speak via the OS built-in voice. Used both for the `system` provider and as a
// graceful fallback when a remote/http provider is misconfigured or unreachable,
// so the bot keeps talking instead of going silent.
function speakSystem(txt, done) {
    const isWin = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    const cmd = isWin
        ? `powershell -NoProfile -Command "Add-Type -AssemblyName System.Speech; \
        $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate=2; \
        $s.Speak('${txt.replace(/'/g,"''")}'); $s.Dispose()"`
        : isMac
        ? `say -v Tingting "${txt.replace(/"/g,'\\"')}"`
        : `espeak "${txt.replace(/"/g,'\\"')}"`;
    exec(cmd, err => {
        if (err) console.error('TTS error', err);
        done();
    });
}

async function processQueue() {
    isSpeaking = true;
    if (speakingQueue.length === 0) {
        isSpeaking = false;
        return;
    }
    const item = speakingQueue.shift();
    const { text: txt, model, format } = item;
    const next = () => { isSpeaking = false; processQueue(); };
    if (txt.trim() === '') {
        next();
        return;
    }

    const isWin = process.platform === 'win32';
    const isMac = process.platform === 'darwin';

    // wait for preprocessing if needed
    try {
        await item.ready;
        if (item.error) throw item.error;
    } catch (err) {
        console.error('[TTS] preprocess error, falling back to system voice:', err.message || err);
        speakSystem(txt, next);
        return;
    }

    if (model === 'system') {
        speakSystem(txt, next);
    } 
    else {
        // audioData was already fetched in speak()
        const audioData = item.audioData;

        if (!audioData) {
            console.error('[TTS] No audio data ready, falling back to system voice');
            speakSystem(txt, next);
            return;
        }

        const ext = format || 'mp3';
        try {
            if (isWin) {
                const tmpPath = path.join(os.tmpdir(), `tts_${Date.now()}.${ext}`);
                await fs.writeFile(tmpPath, Buffer.from(audioData, 'base64'));

                const player = spawn('ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', tmpPath], {
                    stdio: 'ignore', windowsHide: true
                });
                player.on('error', async (err) => {
                    console.error('[TTS] ffplay error', err);
                    try { await fs.unlink(tmpPath); } catch {}
                    next();
                });
                player.on('exit', async () => {
                    try { await fs.unlink(tmpPath); } catch {}
                    next();
                });

            } else if (isMac) {
                const tmpPath = path.join(os.tmpdir(), `tts_${Date.now()}.${ext}`);
                await fs.writeFile(tmpPath, Buffer.from(audioData, 'base64'));

                const player = spawn('afplay', [tmpPath], { stdio: 'ignore' });
                player.on('error', async (err) => {
                    console.error('[TTS] afplay error', err);
                    try { await fs.unlink(tmpPath); } catch {}
                    next();
                });
                player.on('exit', async () => {
                    try { await fs.unlink(tmpPath); } catch {}
                    next();
                });

            } else {
                const player = spawn('ffplay', ['-nodisp','-autoexit','pipe:0'], {
                    stdio: ['pipe','ignore','ignore']
                });
                player.stdin.write(Buffer.from(audioData, 'base64'));
                player.stdin.end();
                player.on('exit', () => {
                    next();
                });
            }
        } catch (e) {
            console.error('[TTS] Audio error', e);
            next();
        }
    }
}
