// ─── Context Builder ────────────────────────────
// Returns structured blocks. contextBlocks → assistant 块（已知信息，低注意力）
// task → user 块（写作要求，高优先级）
import * as path from "path";
import { readBeatFiles, readSummary, readAssembled, readFileSafe, error, } from "./utils.js";
export function buildContext(input) {
    const { root, cfg, chapterNum, beatIndex, beat, extraReq } = input;
    const contextBlocks = [];
    const fullChapters = cfg.context?.fullChapters ?? 2;
    // ── 1. Summaries for chapters beyond the full-text window ──
    const summaryStart = chapterNum - fullChapters - 1;
    if (summaryStart >= 1) {
        const summaryLines = [];
        let hasMissing = false;
        for (let c = summaryStart; c >= 1; c--) {
            const s = readSummary(path.join(root, "context", "summaries"), c);
            if (s) {
                summaryLines.push(`Ch.${c}: ${s}`);
            }
            else {
                summaryLines.push(`Ch.${c}: （摘要缺失）`);
                hasMissing = true;
            }
        }
        summaryLines.reverse();
        if (summaryLines.length > 0) {
            contextBlocks.push(`【前情摘要】\n${summaryLines.join("\n")}`);
            if (hasMissing)
                error("部分章节摘要缺失，运行 `novel summarize chN` 补充");
        }
    }
    // ── 3. Full text of recent N-1 chapters (before current) ──
    const fullTextStart = Math.max(1, chapterNum - fullChapters);
    for (let c = fullTextStart; c < chapterNum; c++) {
        const assembled = readAssembled(path.join(root, "chapters", chDirName(c)));
        if (assembled) {
            contextBlocks.push(`【Ch.${c} 全文】\n${assembled}`);
        }
    }
    // ── 4. Current chapter: beats before this one (full text) ──
    const currentChDir = path.join(root, "chapters", chDirName(chapterNum));
    const beatFiles = readBeatFiles(currentChDir);
    const prevBeats = [];
    for (const bf of beatFiles) {
        const idx = parseInt(bf) - 1;
        if (idx < beatIndex) {
            const content = readFileSafe(path.join(currentChDir, bf));
            if (content)
                prevBeats.push(content.trim());
        }
    }
    if (prevBeats.length > 0) {
        contextBlocks.push(`【当前章上文】\n${prevBeats.join("\n\n")}`);
    }
    // ── 5. Following chapters (full text if written) ──
    const nextChapter = chapterNum + 1;
    for (let c = nextChapter; c <= nextChapter + 1; c++) {
        if (c > cfg.chapters.length)
            break;
        const assembled = readAssembled(path.join(root, "chapters", chDirName(c)));
        if (assembled) {
            contextBlocks.push(`【Ch.${c} 全文（后续参考）】\n${assembled}`);
        }
    }
    // ── 6. Current task (user block — highest priority) ──
    // 不注入后续 beat 的 task，避免模型越界提前写后面的内容
    const reqLine = extraReq ? `\n额外要求: ${extraReq}` : "";
    const prevLine = input.previousText ? `\n【原文（请在此基础上修改，保留可用部分，仅修改需要改的地方）】\n${input.previousText}` : "";
    const task = `【当前任务：Ch.${chapterNum} Beat ${beatIndex + 1} ${beat.label}】
${beat.task}${reqLine}

字数目标: ${beat.wordBudget} 字
请只输出本段正文，不要加标题或元注释。${prevLine}`;
    return {
        system: `你是小说写作助手。根据已有设定和上文，只输出当前段落正文。

${styleBlock(cfg)}

${characterBlock(cfg)}`,
        contextBlocks,
        task,
    };
}
function styleBlock(cfg) {
    return `【文体设定】
风格基调: ${cfg.style.tone}
叙事方式: ${cfg.style.narrative}
禁止项: ${cfg.style.forbidden.join("、")}`;
}
function characterBlock(cfg) {
    const lines = cfg.characters.map(c => `${c.name}（${c.role}${c.age ? `, ${c.age}岁` : ""}）: ${c.desc}`);
    return `【角色】\n${lines.join("\n")}`;
}
function chDirName(chapterNum) {
    return `ch${String(chapterNum).padStart(2, "0")}`;
}
