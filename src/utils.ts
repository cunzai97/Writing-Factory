// ─── File Utils ────────────────────────────────

import * as fs from "fs";
import * as path from "path";

export function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function readFileSafe(p: string): string | null {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : null;
}

export function writeFileSafe(p: string, content: string) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, content, "utf-8");
}

export function readDirFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith(".md")).sort();
}

export function readBeatFiles(beatDir: string): string[] {
  const files = readDirFiles(beatDir);
  return files.filter(f => /^\d+\.md$/.test(f)).sort((a, b) => {
    return parseInt(a) - parseInt(b);
  });
}

export function readAssembled(chapterDir: string): string | null {
  return readFileSafe(path.join(chapterDir, "assembled.md"));
}

export function readSummary(summaryDir: string, chNum: number): string | null {
  return readFileSafe(path.join(summaryDir, `ch${String(chNum).padStart(2, "0")}.md`));
}

export function beatFileName(beatIdx: number): string {
  return `${String(beatIdx + 1).padStart(2, "0")}.md`;
}

export function projectDir(): string {
  // Walk up from CWD to find novel.json
  let dir = process.cwd();
  while (dir !== "/") {
    if (fs.existsSync(path.join(dir, "novel.json"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error("未找到 novel.json，请在项目目录下执行，或用 novel init 创建项目");
}

import type { NovelConfig, ProjectState, GlobalConfig } from "./types.js";

export function readNovelConfig(root: string): NovelConfig {
  const raw = readFileSafe(path.join(root, "novel.json"));
  if (!raw) throw new Error("novel.json 不存在");
  return JSON.parse(raw) as NovelConfig;
}

export function writeNovelConfig(root: string, cfg: NovelConfig) {
  writeFileSafe(path.join(root, "novel.json"), JSON.stringify(cfg, null, 2) + "\n");
}

export function readState(root: string): ProjectState {
  const p = path.join(root, "state.json");
  const raw = readFileSafe(p);
  if (raw) return JSON.parse(raw) as ProjectState;
  // Default state
  const cfg = readNovelConfig(root);
  return {
    currentChapter: 1,
    currentBeat: 0,
    totalChapters: cfg.chapters.length,
    writtenBeats: {},
  };
}

export function writeState(root: string, state: ProjectState) {
  writeFileSafe(path.join(root, "state.json"), JSON.stringify(state, null, 2) + "\n");
}

export function readGlobalConfig(): GlobalConfig {
  const home = process.env.HOME || process.env.USERPROFILE || "~";
  const p = path.join(home, ".config", "novel", "config.json");
  const raw = readFileSafe(p);
  if (raw) return JSON.parse(raw) as GlobalConfig;
  return {
    defaultModel: "qwen-14b",
    defaultEndpoint: "http://localhost:1236/v1/chat/completions",
    defaultApiKey: "",
  };
}

export function log(msg: string) {
  process.stderr.write(`${msg}\n`);
}

export function warn(msg: string) {
  process.stderr.write(`⚠ ${msg}\n`);
}

export function error(msg: string): never {
  process.stderr.write(`✗ ${msg}\n`);
  process.exit(1);
}
