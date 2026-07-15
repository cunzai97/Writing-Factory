#!/usr/bin/env node
// ─── Novel Writer CLI ──────────────────────────
import * as path from "path";
import { projectDir, readNovelConfig, readState, readGlobalConfig, ensureDir, writeFileSafe, readFileSafe, readBeatFiles, readAssembled, readSummary, log, warn, error, } from "./utils.js";
import { writeSingleBeat } from "./write.js";
import { callModel, resolveModelConfig } from "./model.js";
import { readdirSync, existsSync, unlinkSync, readSync } from "fs";
const args = process.argv.slice(2);
if (args.length === 0) {
    usage();
    process.exit(0);
}
const cmd = args[0];
const cmdArgs = args.slice(1);
async function main() {
    switch (cmd) {
        case "init": return cmdInit();
        case "write": return cmdWrite();
        case "redo": return cmdRedo();
        case "undo": return cmdUndo();
        case "summarize": return cmdSummarize();
        case "preview": return cmdPreview();
        case "status": return cmdStatus();
        case "plan": return cmdPlan();
        case "export": return cmdExport();
        case "build": return cmdBuild();
        case "help":
        case "--help":
        case "-h": return usage();
        default:
            error(`未知命令: ${cmd}。运行 novel --help 查看帮助`);
    }
}
main().catch(err => {
    process.stderr.write(`✗ 运行错误: ${err.message}\n`);
    process.exit(1);
});
// ═══════════════════════════════════════════════
// Commands
// ═══════════════════════════════════════════════
function usage() {
    log(`novel v0.1.0 — 小说生成 CLI

用法:
  novel init                    交互式创建项目
  novel init --config <file>    从 JSON 配置文件创建项目
  novel write ch3               写第3章全部 beat
  novel write ch3 beat2         写第3章第2段
  novel write ch3 beat2 --req "偏重心理描写"
  novel redo ch3 beat2          重写某段（旧版存 backups/）
  novel redo ch3 beat2 --req "改得更紧张"
  novel undo                    恢复上一步写/重写的旧版本
  novel summarize ch3           调模型生成 Ch.3 摘要
  novel summarize ch3 --text "..."  手动写摘要
  novel preview ch3             预览第3章（拼合已写段落）
  novel status                  查看进度
  novel plan                    按 novel.json 自动写完所有待写章节
  novel export                  导出完整项目状态到 stdout
  novel build --desc "描述"      生成 output/novel.txt（含封面+简介+全文）
`);
}
async function cmdInit() {
    const root = process.cwd();
    // Check for --config flag first
    const configIdx = args.indexOf("--config");
    let configPath;
    let targetArgIdx = 1;
    if (configIdx > -1 && args[configIdx + 1]) {
        configPath = args[configIdx + 1];
        targetArgIdx = configIdx + 2; // dir arg comes after --config <file>
    }
    const targetDir = args[targetArgIdx] ? path.join(root, args[targetArgIdx]) : root;
    if (configPath) {
        const raw = readFileSafe(configPath);
        if (!raw)
            error(`配置文件不存在: ${configPath}`);
        const cfg = JSON.parse(raw);
        ensureDir(targetDir);
        writeFileSafe(path.join(targetDir, "novel.json"), JSON.stringify(cfg, null, 2) + "\n");
        ensureDir(path.join(targetDir, "chapters"));
        ensureDir(path.join(targetDir, "context", "summaries"));
        ensureDir(path.join(targetDir, "backups"));
        ensureDir(path.join(targetDir, "output"));
        log(`✅ 项目已创建: ${targetDir}/novel.json (from ${configPath})`);
        return;
    }
    // Interactive mode
    const title = promptSync("书名: ") || "未命名";
    const genre = promptSync("类型: ") || "webnovel";
    const wordCount = parseInt(promptSync("目标字数/章: ") || "4000");
    const chars = [];
    log("角色（每行一个，格式: 名字,年龄,角色,描述。留空结束）");
    while (true) {
        const line = promptSync("> ");
        if (!line.trim())
            break;
        chars.push(line);
    }
    log("章节（每行一个，格式: 章号,章节目标。留空结束）");
    const chLines = [];
    while (true) {
        const line = promptSync("> ");
        if (!line.trim())
            break;
        chLines.push(line);
    }
    const cfg = {
        config: { title, genre, targetWordCount: wordCount },
        style: { tone: "待填写", narrative: "第三人称", forbidden: [] },
        context: { fullChapters: 2 },
        characters: chars.map(c => {
            const [name, age, role, desc] = c.split(",").map(s => s.trim());
            return { name, age: age ? parseInt(age) : undefined, role: role || "主角", desc: desc || "" };
        }),
        chapters: chLines.map(ch => {
            const [num, goal] = ch.split(",").map(s => s.trim());
            return {
                chapter: parseInt(num),
                goal,
                beats: [
                    { label: "开场", wordBudget: Math.round(wordCount / 3), task: "待填写" },
                    { label: "发展", wordBudget: Math.round(wordCount / 3), task: "待填写" },
                    { label: "结尾", wordBudget: Math.round(wordCount / 3), task: "待填写" },
                ],
            };
        }),
    };
    ensureDir(targetDir);
    writeFileSafe(path.join(targetDir, "novel.json"), JSON.stringify(cfg, null, 2) + "\n");
    ensureDir(path.join(targetDir, "chapters"));
    ensureDir(path.join(targetDir, "context", "summaries"));
    ensureDir(path.join(targetDir, "backups"));
    ensureDir(path.join(targetDir, "output"));
    log(`✅ 项目已创建: ${targetDir}/novel.json`);
    log(`   请编辑 novel.json 填写 style、角色描述和段落任务后运行 novel plan`);
}
/** Parse "ch3" or "ch3 beat2 --req x" style args */
function parseWriteArgs(args) {
    const chMatch = args[0]?.match(/^ch(\d+)$/i);
    if (!chMatch)
        error(`请用 "ch3" 格式指定章节，如 novel write ch3`);
    const chapterNum = parseInt(chMatch[1]);
    let beatIndex;
    let extraReq;
    if (args[1] && args[1] !== "--req") {
        const bMatch = args[1].match(/^beat(\d+)$/i);
        if (bMatch)
            beatIndex = parseInt(bMatch[1]) - 1;
    }
    const reqIdx = args.indexOf("--req");
    if (reqIdx > -1 && args[reqIdx + 1]) {
        extraReq = args[reqIdx + 1];
    }
    return { chapterNum, beatIndex, extraReq };
}
async function cmdWrite() {
    const root = projectDir();
    const cfg = readNovelConfig(root);
    const { chapterNum, beatIndex, extraReq } = parseWriteArgs(cmdArgs);
    const chapterCfg = cfg.chapters.find(c => c.chapter === chapterNum);
    if (!chapterCfg)
        error(`novel.json 中无第 ${chapterNum} 章配置`);
    let failed = false;
    if (beatIndex !== undefined) {
        // Write single beat
        await writeSingleBeat(root, cfg, chapterNum, beatIndex, extraReq);
    }
    else {
        // Write all unwritten beats for this chapter
        log(`📖 正在写 Ch.${chapterNum}: ${chapterCfg.goal}`);
        for (let i = 0; i < chapterCfg.beats.length; i++) {
            const ok = await writeSingleBeat(root, cfg, chapterNum, i, extraReq);
            if (!ok) {
                warn(`  Ch.${chapterNum} Beat ${i + 1} 写入失败，跳过后续`);
                failed = true;
                break;
            }
        }
    }
    if (failed) {
        log(`\n⚠ Ch.${chapterNum} 部分完成。可运行 novel plan 或 novel write ch${chapterNum} beat<N> 续写`);
    }
    else {
        log(`\n✅ Ch.${chapterNum} 完成`);
    }
}
async function cmdRedo() {
    const root = projectDir();
    const cfg = readNovelConfig(root);
    const { chapterNum, beatIndex, extraReq } = parseWriteArgs(cmdArgs);
    if (beatIndex === undefined)
        error("redo 需指定段号，如 novel redo ch3 beat2");
    // 读取原文，供 redo 时注入 user prompt
    const chDir = path.join(root, "chapters", `ch${String(chapterNum).padStart(2, "0")}`);
    const beatFile = path.join(chDir, `${String(beatIndex + 1).padStart(2, "0")}.md`);
    const previousText = readFileSafe(beatFile) || undefined;
    log(`🔁 正在重写 Ch.${chapterNum} Beat ${beatIndex + 1}`);
    await writeSingleBeat(root, cfg, chapterNum, beatIndex, extraReq, previousText);
    log("✅ 重写完成。运行 novel undo 可恢复旧版本");
}
async function cmdUndo() {
    const root = projectDir();
    const cfg = readNovelConfig(root);
    const backupDir = path.join(root, "backups");
    const fs = { readdirSync, existsSync, unlinkSync };
    const files = fs.readdirSync(backupDir).filter((f) => f.endsWith(".md"));
    if (files.length === 0)
        error("无可用备份");
    for (const f of files) {
        const src = path.join(backupDir, f);
        // Backup file name format: "ch03-beat02.md"
        const match = f.match(/^(ch\d+)-beat(\d+\.md)$/i);
        if (!match)
            continue;
        const chDirName = match[1].toLowerCase(); // "ch03"
        const beatFileName = match[2]; // "02.md"
        const chDirPath = path.join(root, "chapters", chDirName);
        if (!fs.existsSync(chDirPath))
            continue;
        const target = path.join(chDirPath, beatFileName);
        const backupContent = readFileSafe(src);
        if (!backupContent)
            continue;
        log(`↩ 恢复 ${chDirName}/${beatFileName}`);
        writeFileSafe(target, backupContent);
        unlinkSync(src);
    }
    // Re-assemble chapters
    for (const ch of cfg.chapters) {
        const chDir = path.join(root, "chapters", `ch${String(ch.chapter).padStart(2, "0")}`);
        const beatFiles = readBeatFiles(chDir);
        if (beatFiles.length === 0)
            continue;
        const parts = beatFiles.map(bf => readFileSafe(path.join(chDir, bf))).filter(Boolean).join("\n\n");
        writeFileSafe(path.join(chDir, "assembled.md"), parts);
    }
    log("✅ 恢复完成");
}
async function cmdSummarize() {
    const root = projectDir();
    const cfg = readNovelConfig(root);
    const chMatch = cmdArgs[0]?.match(/^ch(\d+)$/i);
    if (!chMatch)
        error("请指定章节，如 novel summarize ch3");
    const chNum = parseInt(chMatch[1]);
    const textIdx = cmdArgs.indexOf("--text");
    if (textIdx > -1 && cmdArgs[textIdx + 1]) {
        // Manual summary
        const text = cmdArgs[textIdx + 1];
        writeFileSafe(path.join(root, "context", "summaries", `ch${String(chNum).padStart(2, "0")}.md`), text);
        log(`✅ Ch.${chNum} 摘要已手动写入`);
        return;
    }
    // Model-generated summary
    const chDir = path.join(root, "chapters", `ch${String(chNum).padStart(2, "0")}`);
    const assembledFile = path.join(chDir, "assembled.md");
    const chapterText = readFileSafe(assembledFile);
    if (!chapterText)
        error(`Ch.${chNum} 未找到 assembled.md。请先完成该章写作`);
    const globalCfg = readGlobalConfig();
    const modelCfg = resolveModelConfig(cfg, globalCfg);
    const prompt = `请为以下小说章节写一段简洁的摘要（200-400字），概括关键事件和情节推进。只输出摘要本身，不要加标题或解释。

章节正文：
${chapterText}`;
    log(`🤖 正在生成 Ch.${chNum} 摘要...`);
    const result = await callModel({
        rawPrompt: prompt,
        endpoint: modelCfg.endpoint,
        model: modelCfg.model,
        apiKey: modelCfg.apiKey,
        temperature: 0.5,
    });
    const summary = result.text.trim();
    writeFileSafe(path.join(root, "context", "summaries", `ch${String(chNum).padStart(2, "0")}.md`), summary);
    log(`✅ Ch.${chNum} 摘要已生成 (${summary.length} 字)`);
}
async function cmdPreview() {
    const root = projectDir();
    const cfg = readNovelConfig(root);
    const chMatch = cmdArgs[0]?.match(/^ch(\d+)$/i);
    if (!chMatch)
        error("请指定章节，如 novel preview ch3");
    const chNum = parseInt(chMatch[1]);
    const chDir = path.join(root, "chapters", `ch${String(chNum).padStart(2, "0")}`);
    const assembled = readFileSafe(path.join(chDir, "assembled.md"));
    if (!assembled) {
        // Try to assemble from individual beats
        const beatFiles = readBeatFiles(chDir);
        if (beatFiles.length === 0) {
            log("（该章节尚未写入任何段落）");
            return;
        }
        const parts = beatFiles.map(bf => readFileSafe(path.join(chDir, bf)) || "").join("\n\n");
        log(parts);
    }
    else {
        log(assembled);
    }
}
async function cmdStatus() {
    const root = projectDir();
    const cfg = readNovelConfig(root);
    const state = readState(root);
    let totalBeats = 0;
    let writtenBeats = 0;
    let totalWords = 0;
    log(`📚 ${cfg.config.title}`);
    log("");
    log(`类型: ${cfg.config.genre}  目标字数/章: ${cfg.config.targetWordCount}`);
    log("");
    for (const ch of cfg.chapters) {
        totalBeats += ch.beats.length;
        const chDir = path.join(root, "chapters", `ch${String(ch.chapter).padStart(2, "0")}`);
        const beatFiles = readBeatFiles(chDir);
        const written = beatFiles.length;
        writtenBeats += written;
        let chWords = 0;
        for (const bf of beatFiles) {
            const c = readFileSafe(path.join(chDir, bf)) || "";
            chWords += c.replace(/\s/g, "").length;
        }
        totalWords += chWords;
        const status = written === 0 ? "未开始" : written >= ch.beats.length ? `✅ ${chWords} 字` : `⏳ ${written}/${ch.beats.length} · ${chWords} 字`;
        log(`  Ch.${String(ch.chapter).padStart(2, "0")}  ${status}`);
    }
    log("");
    log(`总计: ${writtenBeats}/${totalBeats} 段 · ${totalWords} 字`);
}
async function cmdPlan() {
    const root = projectDir();
    const cfg = readNovelConfig(root);
    log(`🚀 auto-plan: ${cfg.config.title}`);
    log(`   共 ${cfg.chapters.length} 章, 按顺序执行...`);
    let failed = false;
    for (const ch of cfg.chapters) {
        const chDir = path.join(root, "chapters", `ch${String(ch.chapter).padStart(2, "0")}`);
        const beatFiles = readBeatFiles(chDir);
        if (beatFiles.length >= ch.beats.length) {
            log(`  Ch.${ch.chapter} 已完成，跳过`);
            continue;
        }
        log(`\n📖 Ch.${ch.chapter}: ${ch.goal}`);
        for (let i = 0; i < ch.beats.length; i++) {
            // Skip already written
            const bf = `${String(i + 1).padStart(2, "0")}.md`;
            if (beatFiles.includes(bf)) {
                log(`  ⏭ Beat ${i + 1} [${ch.beats[i].label}] 已写，跳过`);
                continue;
            }
            const ok = await writeSingleBeat(root, cfg, ch.chapter, i);
            if (!ok) {
                warn(`  失败。运行 novel plan 或 novel write ch${ch.chapter} beat${i + 1} 续写`);
                failed = true;
                break;
            }
        }
        if (failed)
            break;
        log(`  ✅ Ch.${ch.chapter} 完成`);
    }
    if (failed) {
        log("\n⚠ plan 部分完成。修正后重新运行 novel plan 续写");
    }
    else {
        // Output novel.txt
        log("\n📄 输出 novel.txt...");
        let full = "";
        for (const ch of cfg.chapters) {
            const chDir = path.join(root, "chapters", `ch${String(ch.chapter).padStart(2, "0")}`);
            const assembled = readFileSafe(path.join(chDir, "assembled.md"));
            if (assembled) {
                full += `\n\n## 第${ch.chapter}章\n\n${assembled}`;
            }
        }
        writeFileSafe(path.join(root, "output", "novel.txt"), full.trim());
        log("✅ plan 完成！输出: output/novel.txt");
    }
}
async function cmdBuild() {
    const root = projectDir();
    const cfg = readNovelConfig(root);
    // Parse --desc argument
    const descIdx = cmdArgs.indexOf("--desc");
    const desc = descIdx > -1 && cmdArgs[descIdx + 1] ? cmdArgs[descIdx + 1] : "";
    const lines = [];
    // ── 封面 ──
    const title = cfg.config.title || "Untitled";
    const genre = cfg.config.genre || "";
    lines.push("╔══════════════════════════════════════╗");
    lines.push(`║${centerPad(title, 38)}║`);
    if (genre)
        lines.push(`║${centerPad(genre, 38)}║`);
    lines.push("╚══════════════════════════════════════╝");
    lines.push("");
    // ── 描述 ──（宣传文案，不是全文概述）
    if (desc) {
        lines.push(desc);
        lines.push("");
    }
    // ── 正文 ──
    lines.push("═══════════════════════════════════════");
    lines.push("");
    for (const ch of cfg.chapters) {
        const chDir = path.join(root, "chapters", `ch${String(ch.chapter).padStart(2, "0")}`);
        const assembled = readAssembled(chDir);
        if (!assembled) {
            warn(`Ch.${ch.chapter} 未完成，跳过`);
            continue;
        }
        lines.push(`第${ch.chapter}章`);
        lines.push("");
        // 段落缩进（两个全角空格）
        const indented = assembled.split("\n").map(l => l.trim() ? "　　" + l.trim() : l).join("\n");
        lines.push(indented);
        lines.push("");
        lines.push("");
    }
    // ── 写入 ──
    const outputDir = path.join(root, "output");
    ensureDir(outputDir);
    const outputPath = path.join(outputDir, "novel.txt");
    writeFileSafe(outputPath, lines.join("\n"));
    log(`✅ 已生成 ${outputPath}`);
}
function centerPad(s, width) {
    const len = [...s].length;
    const pad = Math.max(0, width - len);
    const left = Math.floor(pad / 2);
    const right = pad - left;
    return " ".repeat(left) + s + " ".repeat(right);
}
async function cmdExport() {
    const root = projectDir();
    const cfg = readNovelConfig(root);
    const state = readState(root);
    // Collect chapter details
    const chapters = cfg.chapters.map(ch => {
        const chDir = path.join(root, "chapters", `ch${String(ch.chapter).padStart(2, "0")}`);
        const beatFiles = readBeatFiles(chDir);
        const beats = ch.beats.map((beat, i) => {
            const bf = `${String(i + 1).padStart(2, "0")}.md`;
            const written = beatFiles.includes(bf);
            const content = written ? (readFileSafe(path.join(chDir, bf)) || "") : null;
            const stateKey = `ch${String(ch.chapter).padStart(2, "0")}-beat${String(i + 1).padStart(2, "0")}`;
            const beatState = state.writtenBeats[stateKey];
            return {
                label: beat.label,
                wordBudget: beat.wordBudget,
                task: beat.task,
                written,
                wordCount: beatState?.wordCount ?? 0,
                content: written ? content : null,
            };
        });
        const assembled = readAssembled(chDir);
        const summary = readSummary(path.join(root, "context", "summaries"), ch.chapter);
        return {
            chapter: ch.chapter,
            goal: ch.goal,
            mustInclude: ch.mustInclude,
            forbidden: ch.forbidden,
            beats,
            assembled,
            summary,
        };
    });
    const exportData = {
        config: cfg.config,
        style: cfg.style,
        context: cfg.context,
        characters: cfg.characters,
        chapters,
        state: {
            currentChapter: state.currentChapter,
            currentBeat: state.currentBeat,
            totalChapters: state.totalChapters,
            writtenBeats: state.writtenBeats,
        },
    };
    process.stdout.write(JSON.stringify(exportData, null, 2) + "\n");
}
/** Simple synchronous prompt for init */
function promptSync(msg) {
    process.stdout.write(msg);
    const bufs = [];
    // Read from stdin one byte at a time until newline
    const chunk = Buffer.alloc(1);
    while (true) {
        const n = readSync(0, chunk, 0, 1, -1);
        if (n <= 0 || chunk[0] === 0x0a)
            break;
        if (chunk[0] !== 0x0d)
            bufs.push(Buffer.from([chunk[0]]));
    }
    return Buffer.concat(bufs).toString("utf-8").trim();
}
