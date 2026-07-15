// ─── File Utils ────────────────────────────────
import * as fs from "fs";
import * as path from "path";
export function ensureDir(dir) {
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
}
export function readFileSafe(p) {
    return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : null;
}
export function writeFileSafe(p, content) {
    ensureDir(path.dirname(p));
    fs.writeFileSync(p, content, "utf-8");
}
export function readDirFiles(dir) {
    if (!fs.existsSync(dir))
        return [];
    return fs.readdirSync(dir).filter(f => f.endsWith(".md")).sort();
}
export function readBeatFiles(beatDir) {
    const files = readDirFiles(beatDir);
    return files.filter(f => /^\d+\.md$/.test(f)).sort((a, b) => {
        return parseInt(a) - parseInt(b);
    });
}
export function readAssembled(chapterDir) {
    return readFileSafe(path.join(chapterDir, "assembled.md"));
}
export function readSummary(summaryDir, chNum) {
    return readFileSafe(path.join(summaryDir, `ch${String(chNum).padStart(2, "0")}.md`));
}
export function beatFileName(beatIdx) {
    return `${String(beatIdx + 1).padStart(2, "0")}.md`;
}
export function projectDir() {
    // Walk up from CWD to find novel.json
    let dir = process.cwd();
    while (dir !== "/") {
        if (fs.existsSync(path.join(dir, "novel.json")))
            return dir;
        dir = path.dirname(dir);
    }
    throw new Error("未找到 novel.json，请在项目目录下执行，或用 novel init 创建项目");
}
export function readNovelConfig(root) {
    const raw = readFileSafe(path.join(root, "novel.json"));
    if (!raw)
        throw new Error("novel.json 不存在");
    return JSON.parse(raw);
}
export function writeNovelConfig(root, cfg) {
    writeFileSafe(path.join(root, "novel.json"), JSON.stringify(cfg, null, 2) + "\n");
}
export function readState(root) {
    const p = path.join(root, "state.json");
    const raw = readFileSafe(p);
    if (raw)
        return JSON.parse(raw);
    // Default state
    const cfg = readNovelConfig(root);
    return {
        currentChapter: 1,
        currentBeat: 0,
        totalChapters: cfg.chapters.length,
        writtenBeats: {},
    };
}
export function writeState(root, state) {
    writeFileSafe(path.join(root, "state.json"), JSON.stringify(state, null, 2) + "\n");
}
export function readGlobalConfig() {
    const home = process.env.HOME || process.env.USERPROFILE || "~";
    const p = path.join(home, ".config", "novel", "config.json");
    const raw = readFileSafe(p);
    if (raw)
        return JSON.parse(raw);
    return {
        defaultModel: "qwen-14b",
        defaultEndpoint: "http://localhost:1236/v1/chat/completions",
        defaultApiKey: "",
    };
}
export function log(msg) {
    process.stderr.write(`${msg}\n`);
}
export function warn(msg) {
    process.stderr.write(`⚠ ${msg}\n`);
}
export function error(msg) {
    process.stderr.write(`✗ ${msg}\n`);
    process.exit(1);
}
