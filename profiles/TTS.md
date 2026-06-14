# 语音（TTS）接口说明

每个角色的语音都由其 profile 里的 `speak_model` 字段决定（见 `profiles/characters/*.json`）。
本项目把 TTS 做成**可插拔后端**：你可以用内置的云服务，也可以用通用的 `http` 接口接入
**任意自部署模型**（本地 / 远程 GPU 上的 GPT-SoVITS、CosyVoice、自建服务等），全部通过
**配置完成，无需改代码**。声音模型与成本由使用者自行承担——仓库里不含任何 API 凭证。

代码位置：`src/agent/speak.js`。是否启用语音由 `settings.js` 的 `speak` 控制。

---

## `speak_model` 的两种写法

### 1) 字符串简写（仅 system / openai / google）

```jsonc
"speak_model": "openai/tts-1/echo"        // 形如  provider/model/voice
"speak_model": "google/gemini-2.5-flash-preview-tts/Kore"
"speak_model": "system"                    // 用操作系统自带语音（mac 的 say / win 的 SAPI / linux 的 espeak）
```

### 2) 对象写法（推荐，所有 provider 都支持）

```jsonc
"speak_model": {
    "api": "fishaudio",        // provider 名：system | openai | google | fishaudio | http
    ...                        // 该 provider 的专属字段，见下
    "speak_lang": "ja",        // 见“通用字段”
    "pronunciations": { ... }
}
```

---

## 通用字段（除 system 外都适用）

| 字段 | 说明 |
| --- | --- |
| `speak_lang` | 朗读前把台词翻译成的语言。`ja` 会用 DeepSeek 翻成动漫风口语（タメ口），其他语言走 Google 翻译。留空＝不翻译，按原文朗读。聊天框显示的中文不受影响。 |
| `speak_persona` | 仅在 `speak_lang: "ja"` 时附加给翻译模型的人设提示（如第一人称、性别、语气），避免译错（例如给女性角色用了男性「おれ」）。 |
| `pronunciations` | 读音修正表，朗读前把 key 替换成 value（按 key 长度从长到短匹配）。用于纠正名字等易读错的词，例：`{ "七海千秋": "ななみちあき" }`。 |

朗读失败（配置错误 / 服务不可达）时会**自动回退到系统语音**，机器人不会变哑。

---

## 各 provider 专属字段

### `system`
无需额外字段。直接用操作系统语音，零成本、开箱即用，但音色固定。

### `openai`
`model`、`voice`、可选 `url`。需要 `OPENAI_API_KEY`。

### `google`
`model`、`voice`、可选 `url`。需要相应 Google key。

### `fishaudio`
`reference_id`（FishAudio 上的音色槽位 ID）。需要 `FISHAUDIO_API_KEY`。
按字符计费、音色槽位有限——这是本仓库作者自用的后端。

### `http`（通用接口，推荐开源用户使用）
把请求**整体形状**写在配置里，对接任意 HTTP TTS 后端。字段：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `url` | （必填） | 你的 TTS 服务地址。 |
| `method` | `POST` | `POST` 或 `GET`。 |
| `headers` | `{}` | 请求头。值里可用 `{{key:ENV_NAME}}` 占位，运行时从 `keys.json` / 环境变量取真实密钥（不会写进仓库）。 |
| `body` | `{ "text": "{{text}}" }` | POST 的 JSON 请求体模板。字符串里的 `{{text}}` 会被替换成最终朗读文本；其他字段原样发送。 |
| `query` | `{ "text": "{{text}}" }` | GET 的查询参数模板（同样支持 `{{text}}`）。 |
| `response` | `binary` | 如何解析返回的音频：`binary`（裸音频字节）/ `base64`（返回体是 base64 文本）/ `json:某.路径`（从 JSON 里取该路径的 base64 字符串，如 `json:data.audio`）。 |
| `format` | `mp3` | 返回音频的容器格式，用于本地播放的临时文件扩展名（GPT-SoVITS 一般为 `wav`）。 |

`{{text}}` 是已经过 `speak_lang` 翻译 + `pronunciations` 修正后的最终文本。

---

## 自部署 GPT-SoVITS 并对接

GPT-SoVITS 自带 `api_v2.py`，启动后提供 `/tts` 端点（裸音频流）。

1. 在本地（Apple Silicon 可用 MPS）或一台 GPU 机器上部署 GPT-SoVITS，放好该角色的参考音频。
2. 启动 API：`python api_v2.py`（默认监听 `9880`）。
3. 角色 profile 用通用 `http` provider 指过去（完整示例见 `profiles/characters/example.json`）：

```jsonc
"speak_model": {
    "api": "http",
    "url": "http://127.0.0.1:9880/tts",
    "method": "POST",
    "format": "wav",
    "response": "binary",
    "body": {
        "text": "{{text}}",
        "text_lang": "ja",
        "ref_audio_path": "ref/your_character.wav",
        "prompt_text": "",
        "prompt_lang": "ja"
    },
    "speak_lang": "ja"
}
```

> 想要近实时（<1.5s）建议把服务跑在 GPU 上并开启流式；本地 Apple Silicon 可用，但单句延迟通常在 2~5 秒。
> 远程服务记得把 `url` 换成你的地址，并通过 `headers` + `{{key:...}}` 加上鉴权。

---

## 新增一个用自定义音色的角色

1. 复制 `profiles/characters/example.json` 为 `profiles/characters/<name>.json`。
2. 改 `name`，把 `speak_model.body.ref_audio_path` 指向该角色的参考音频，按需调 `speak_lang` / `speak_persona` / `pronunciations`。
3. 刷新 Web UI，角色出现在下拉框，选中即可进入世界。换音色只需换参考音频，**无槽位限制、零边际成本**。
