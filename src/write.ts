// ─── Write Command ──────────────────────────────
// Handles: novel write ch3, novel write ch3 beat2 --req "..."
// Also serves as the engine for `novel plan`.

import * as path from "path";
import type { NovelConfig, ProjectState } from "./types.js";
import { readNovelConfig, readState, writeState, readGlobalConfig, log, warn, error, ensureDir, writeFileSafe, readFileSafe, beatFileName } from "./utils.js";
import { buildContext } from "./context.js";
import { callModel, resolveModelConfig } from "./model.js";
import { validateBeat } from "./validate.js";

/** Backup a beat file before overwriting (for undo) */
function backupBeforeWrite(root: string, filePath: string, chapterNum: number) {
  const backupDir = path.join(root, "backups");
  ensureDir(backupDir);
  const bn = path.basename(filePath);
  const backupName = `${chDirStr(chapterNum)}-beat${bn}`;
  const backupPath = path.join(backupDir, backupName);
  if (readFileSafe(filePath)) {
    writeFileSafe(backupPath, readFileSafe(filePath)!);
    return backupPath;
  }
  return null;
}

/** Assemble all beats of a chapter into assembled.md */
function assembleChapter(root: string, chapterNum: number, cfg: NovelConfig) {
  const chDir = path.join(root, "chapters", chDirStr(chapterNum));
  const chapterCfg = cfg.chapters.find(c => c.chapter === chapterNum);
  if (!chapterCfg) return;

  const parts: string[] = [];
  for (let i = 0; i < chapterCfg.beats.length; i++) {
    const f = path.join(chDir, beatFileName(i));
    const content = readFileSafe(f);
    if (content) parts.push(content.trim());
  }

  if (parts.length > 0) {
    writeFileSafe(path.join(chDir, "assembled.md"), parts.join("\n\n"));
  }
}

/** Write a single beat. Returns true on success. */
export async function writeSingleBeat(
  root: string,
  cfg: NovelConfig,
  chapterNum: number,
  beatIndex: number,
  extraReq?: string,
  previousText?: string,
): Promise<boolean> {
  const chapterCfg = cfg.chapters.find(c => c.chapter === chapterNum);
  if (!chapterCfg) error(`novel.toml 中没有第 ${chapterNum} 章配置`);

  const beat = chapterCfg.beats[beatIndex];
  if (!beat) error(`第 ${chapterNum} 章没有第 ${beatIndex + 1} 段`);

  const globalCfg = readGlobalConfig();
  const modelCfg = resolveModelConfig(cfg, globalCfg);

  // Build context
  const ctx = buildContext({ root, cfg, chapterNum, beatIndex, beat, extraReq, previousText });

  // Ensure directories
  const chDir = path.join(root, "chapters", chDirStr(chapterNum));
  ensureDir(chDir);

  // Backup before write
  const beatFile = path.join(chDir, beatFileName(beatIndex));
  backupBeforeWrite(root, beatFile, chapterNum);

  // Call model
  log(`  🤖 正在写 Ch.${chapterNum} Beat ${beatIndex + 1} [${beat.label}]...`);
  log(`     目标: ${beat.wordBudget} 字`);

  let text: string;
  try {
    const result = await callModel({
      context: ctx,
      endpoint: modelCfg.endpoint,
      model: modelCfg.model,
      apiKey: modelCfg.apiKey,
      debugPrompt: beatIndex === 0,
    });
    text = result.text;
  } catch (err: any) {
    warn(`  模型调用失败: ${err.message}`);
    return false;
  }

  // Validate
  const validation = validateBeat(text, beat.wordBudget);
  log(`  ✅ 已写入 (${validation.charCount} 字, 中文 ${validation.cnRatio})`);
  for (const issue of validation.issues) {
    warn(`  校验问题: ${issue}`);
  }
  for (const w of validation.warnings) {
    warn(`  提醒: ${w}`);
  }

  if (!validation.valid) {
    warn("  校验未通过，但草稿已保存。可用 `novel redo` 重写。");
  }

  // Write beat file
  writeFileSafe(beatFile, text.trim());

  // Assemble chapter
  assembleChapter(root, chapterNum, cfg);

  // Update state
  const state = readState(root);
  state.writtenBeats[`ch${String(chapterNum).padStart(2, "0")}-beat${String(beatIndex + 1).padStart(2, "0")}`] = {
    status: validation.valid ? "written" : "written",
    wordCount: validation.charCount,
    writtenAt: new Date().toISOString(),
  };
  writeState(root, state);

  return validation.valid;
}

function chDirStr(chapterNum: number): string {
  return `ch${String(chapterNum).padStart(2, "0")}`;
}
