# 角色皮肤（Skins）

本目录是各角色 Minecraft 皮肤 PNG 的**权威副本**，纳入版本库以便备份、换机、开源分发。
皮肤本身由客户端模组 **CustomSkinLoader** 按「玩家名 = 文件名」自动加载，与机器人代码无关。

## 命名规则

文件名必须**精确等于**角色的 `name`（见 `profiles/characters/<角色>.json`），区分大小写，无空格：

| 角色 | 文件 |
| --- | --- |
| 七海千秋 Chiaki Nanami | `Chiaki_Nanami.png` |
| 狛枝凪斗 Nagito Komaeda | `Nagito_Komaeda.png` |
| 江之岛盾子 Junko Enoshima | `Junko_Enoshima.png` |

## 怎么用（安装到游戏）

把本目录的 PNG 复制到 CustomSkinLoader 的本地皮肤目录（路径随系统不同）：

- **macOS**：`~/Library/Application Support/minecraft/CustomSkinLoader/LocalSkin/skins/`
- **Windows**：`%APPDATA%\.minecraft\CustomSkinLoader\LocalSkin\skins\`
- **Linux**：`~/.minecraft/CustomSkinLoader/LocalSkin/skins/`

例（macOS）：

```bash
cp skins/*.png "$HOME/Library/Application Support/minecraft/CustomSkinLoader/LocalSkin/skins/"
```

复制后进游戏即可生效（必要时重进世界 / 重载皮肤）。

## 新增一个角色的皮肤

1. 从任意免费皮肤站下载该角色的 64×64 皮肤 PNG。
2. 重命名为 `<角色name>.png`（与其 profile 的 `name` 完全一致）。
3. 放进本目录并提交，再按上面的命令复制到 CustomSkinLoader 目录。

> 说明：`src/agent/agent.js` 里还有一段基于 Fabric Tailor 的 `/skin set` 逻辑（需 profile 里有 `skin` 字段）。
> 本项目当前不走这条路，皮肤统一用 CustomSkinLoader 本地加载。
