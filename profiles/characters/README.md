# 角色 Profile 契约

本目录下每个 `*.json` 就是一个**可进入游戏的角色**。Web UI 启动时会扫描本目录
（`mindserver.js` 的 `list-characters`），把每个角色放进下拉框，选中即可「进入世界」。

一个角色 = 一个 `<角色>.json`（人设）+ 一张 `skins/<name>.png`（皮肤）+ 一个声音后端（自配）。
本文件定义这个 json **该有哪些字段**，让所有角色保持一致、便于将来在网页上自助创建/导入。

`example.json` 是一份字段齐全、带注释的可复制模板。

---

## 字段一览

| 字段 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `name` | ✅ | string | 机器人在游戏里的名字。必须匹配 `^[a-zA-Z0-9_]{3,16}$`，**不能有空格**（用 `Chiaki_Nanami`）。**皮肤文件名必须与它完全一致。** |
| `skin_file` | 建议 | string | 该角色皮肤 PNG 的文件名（应等于 `name` + `.png`），存放于仓库根的 `skins/`。纯描述字段，便于「角色↔皮肤」一目了然；实际加载靠 CustomSkinLoader，见 `skins/README.md`。 |
| `model` | ✅ | string | 对话用的 LLM，本仓库默认 `deepseek-chat`（需 `DEEPSEEK_API_KEY`）。 |
| `speak_model` | 建议 | object/string | 语音（TTS）后端配置。字段与各 provider（`fishaudio` / `http` / `openai` / …）详见 [`profiles/TTS.md`](../TTS.md)。 |
| `greeting` | 可选 | string[] | 进入世界时随机说的固定开场白（不调用模型）。省略则不说固定开场。 |
| `easter_eggs` | 可选 | object[] | 数据驱动彩蛋：某实体靠近时按冷却随机说一句。字段见 AGENTS.md「Easter Eggs」。 |
| `conversing` | ✅ | string | 角色的核心人设与行为提示词。务必保留其中所有 `$VARIABLES`（见下）。 |

> 也可放任意 `_comment_*` 字段做注释，JSON 不支持注释，这是约定俗成的替代（程序会忽略未知字段）。

---

## `conversing` 里必须保留的变量

提示词末尾这些占位符由运行时注入，**新增角色时照抄、不要删**：

```
$NAME $SELF_PROMPT $MEMORY $STATS $INVENTORY $COMMAND_DOCS $EXAMPLES
```

人设部分（性格、语气、说话规则）随角色自定义，但这套变量必须在。

---

## 新增 / 导入一个角色

1. 复制 `example.json` 为 `<角色>.json`，改 `name`。
2. 填 `speak_model`（用自己的声音后端，见 `TTS.md`）、`conversing`（人设），按需加 `greeting` / `easter_eggs`。
3. 把皮肤 PNG 命名为 `<name>.png` 放进仓库 `skins/`，并复制到 CustomSkinLoader 目录（见 `skins/README.md`）。
4. 刷新 Web UI（`http://localhost:8080`），角色出现在下拉框，选中 →「进入世界」。

> 路线图：未来计划支持在 Web UI 上直接填表创建角色（名称/皮肤/声音/人设）并保存为本目录下的 json。
> 本契约就是那套表单的字段依据——保持字段统一是前置条件。
