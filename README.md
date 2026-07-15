# 写作工厂

> **Writing Factory** — A beat-level novel pipeline that separates planning (you + pi) from writing (LLM), with automatic context management for long-form works, in-place revision instead of blind rewrites, and one-click final output — so you ship a book, not a chat log.

基于 LLM 的小说生成 CLI。把你和 pi 策划的骨架交给模型逐段写作，自动管理长文上下文，修订时不盲写，一键成书。

## 安装

```bash
cd novel-writer && npm install && npm link
```

> 确保 `~/.config/novel/config.json` 存在，见[全局配置](#全局配置)。

## 快速开始

```bash
# Agent 和你讨论大纲 → Agent 生成 novel.json
novel init --config novel.json my-book
cd my-book

novel write ch1                        # 逐段写作
novel redo ch1 beat2 --req "这里太急了"  # 修订（原文自动注入）
novel status                           # 进度
novel build --desc "一段吸引读者的宣传语"  # 成书
# → output/novel.txt
```

## 核心设计

**骨架即约束。** `novel.json` 里每个 beat 的 `task` 不是灵感提示，是精确的故事骨架——具体动作、数量、边界。模型只负责填肉，不越界。

**策划与写作分离。** Agent 负责立意、人物、大纲、审稿。LLM 负责按 beat 生成正文。人决定写什么，模型决定怎么写。

**修订是改不是重写。** `novel redo` 自动把原文注入 prompt（`【原文（请在此基础上修改）】`），模型在原文基础上精准修改，不是从头盲写。

**上下文自动管理。** 前 2 章完整原文注入 + 更早章节摘要压缩。写第 50 章也行，不会丢设定。

## 工作原理

```
novel.json                    项目配置：文体、角色、章节骨架
     │
     ▼
buildContext()      ┌─ system    → 角色定位 + 文体设定 + 角色卡
     │               │
     ▼               │  assistant → Ch.1 全文（前2章完整原文）
builtPrompt()  ─────┤  assistant → Ch.2 全文
     │               │  assistant → 当前章上文
     ▼               │  user      → 当前 beat task + 字数目标
LLM API ─────────────┤  user      → [redo 时] 原文（请在此基础上修改）
     │
     ▼
validate + save → chapters/ch03/02.md + assembled.md
```

### 上下文注入策略

| 内容 | 位置 | 角色 |
|------|------|------|
| 角色定位 + 文体设定 + 角色卡 | `system` | 全局约束 |
| 前 2 章完整原文 | `assistant` | 已知信息 |
| 更早章节摘要 | `assistant` | 已知信息 |
| 当前章已写上文 | `assistant` | 已知信息 |
| 当前 beat 写作任务 | `user` | **高优先级** |
| 原文（redo 时） | `user` | 修改参考 |

## 全局配置

`~/.config/novel/config.json`：

```json
{
  "defaultModel": "qwen-14b",
  "defaultEndpoint": "http://localhost:1236/v1/chat/completions",
  "defaultApiKey": ""
}
```

## 项目配置

### `novel.json` 示例

```json
{
  "config": { "title": "镜城", "genre": "science-fiction", "targetWordCount": 4000 },
  "style": {
    "tone": "冷峻、潮湿、霓虹下的疏离感。必须用中文写作。",
    "narrative": "第三人称限制视角",
    "forbidden": ["过度抒情", "网络用语", "过多对话", "内心独白说教"]
  },
  "context": { "fullChapters": 2 },
  "characters": [
    { "name": "苏沉", "age": 28, "role": "主角", "desc": "镜城底层的义体翻新工。沉默、内疚驱动。左手是二手义体，偶尔不受控。" },
    { "name": "阿九", "age": 19, "role": "主角", "desc": "从镜城上层坠落的少女。失去了身份芯片，不能被任何系统识别。不说话，只用眼神。" }
  ],
  "chapters": [
    {
      "chapter": 1,
      "goal": "建立镜城的世界观和苏沉的日常，结尾他发现阿九藏在回收站。",
      "mustInclude": ["镜城的垂直分层视觉", "义体翻新的工业感", "苏沉工作的机械重复"],
      "forbidden": ["过早揭示阿九的来历", "苏沉和阿九对话超过两句"],
      "beats": [
        { "label": "城市俯视", "wordBudget": 600, "task": "从苏沉的工作间窗口望向镜城全貌。悬浮的上层区把阳光反射回地面，底层永远活在阴影里。霓虹和雨水混在一起。不要写到阿九。" },
        { "label": "日常", "wordBudget": 800, "task": "苏沉的例行工作——拆解上层区回收的义体，翻新，分类。他今天收到一批异常的回收件：外壳上残留着某种他不认识的痕迹。他的左手义体在拆解时抽搐了一下。" },
        { "label": "发现", "wordBudget": 600, "task": "深夜下班，苏沉在回收站后巷听到微弱的呼吸声。他翻开堆积的废弃义体壳，下面蜷缩着一个少女。她看着他。没有说一个字。不要写对话。" }
      ]
    }
  ]
}
```

> task 末尾的"不要写到XXX"是防越界的关键——明确告诉模型这个 beat 的边界在哪。

## 命令

| 命令 | 说明 |
|------|------|
| `novel init --config <file> [dir]` | 从 JSON 配置创建项目 |
| `novel write ch3` | 写第 3 章全部 beat |
| `novel write ch3 beat2 --req "..."` | 带额外要求写 |
| `novel redo ch3 beat2 --req "..."` | 修订（原文自动注入 prompt） |
| `novel undo` | 恢复 redo 前的旧版本 |
| `novel summarize ch3` | 调模型生成章节摘要 |
| `novel preview ch3` | 预览已写段落的拼合 |
| `novel status` | 进度概览 |
| `novel plan` | 全自动写完所有待写章节 |
| `novel build --desc "宣传语"` | 生成 `output/novel.txt`（封面+宣传语+全文，段落缩进） |
| `novel export` | 导出完整项目状态到 stdout |

## 项目目录结构

```
my-book/
├── novel.json              # 项目配置（一切规划的来源）
├── state.json              # 进度状态（自动生成）
├── chapters/
│   ├── ch01/
│   │   ├── 01.md           # 第 1 段
│   │   ├── 02.md           # 第 2 段
│   │   └── assembled.md    # 拼合成品
│   └── ch02/
│       └── ...
├── context/
│   └── summaries/
│       ├── ch01.md         # 章节摘要（上下文窗口压缩用）
│       └── ch02.md
├── backups/                # undo 备份
└── output/
    └── novel.txt           # build 生成的成品
```

## Agent 配合

本项目配有一个 [Agent Skill](.pi/skills/novel-writing/SKILL.md)。加载此 skill 后，Agent 成为创作 partner：讨论立意 → 构建世界观和人物 → 编排章节骨架 → 生成 novel.json → 调用 CLI 写作 → 审稿修订。

## Tips

- **写作前先验证**：第一章第一段跑一次，确认模型输出中文。英文微调模型（如 `Uncensored-Heretic`）需要在 `style.tone` 最前面加 `必须用中文写作，不得使用英文。`
- **task 是骨架**：越精确越好——写清楚具体动作、数量、边界（"四次见面，不要写第五次"）
- **写完一章立刻 summarize**：忘了后续章节会因摘要缺失中断
- **redo 比重新写高效**：原文自动注入，模型只改你要改的地方
- 每个 beat 自动校验：字数偏差 >50% 警告，中文比例 <50% 报错但保留草稿
- 调试：每章第一个 beat 的完整 messages 自动存 `/tmp/novel-debug-prompt-*.json`
