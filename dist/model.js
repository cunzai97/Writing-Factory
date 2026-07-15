// ─── LLM API Client (OpenAI chat/completions) ────
// messages 数组：system + assistant(上下文) + user(任务)
// Jinja 模板自动适配不同模型格式
import { log, warn } from "./utils.js";
import * as fs from "fs";
function buildMessages(ctx) {
    const messages = [];
    // System
    messages.push({ role: "system", content: ctx.system });
    // Context blocks → assistant (已知信息，低注意力)
    for (const block of ctx.contextBlocks) {
        messages.push({ role: "assistant", content: block });
    }
    // Task → user (写作要求，高优先级)
    messages.push({ role: "user", content: ctx.task });
    return messages;
}
function buildRawMessages(prompt) {
    return [{ role: "user", content: prompt }];
}
function stripThink(text) {
    return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}
function isLikelyTruncated(text, completionTokens, maxTokens) {
    const trimmed = text.trim();
    if (trimmed.length < 20)
        return true;
    // 模型用满 token 配额，极可能截断
    if (completionTokens >= maxTokens)
        return true;
    if (/[。！？"」』\)》]$/.test(trimmed))
        return false;
    if (/[，、…]$/.test(trimmed))
        return true;
    return false;
}
export async function callModel(req) {
    const messages = req.context
        ? buildMessages(req.context)
        : buildRawMessages(req.rawPrompt);
    if (req.debugPrompt) {
        const debugPath = `/tmp/novel-debug-prompt-${Date.now()}.json`;
        fs.writeFileSync(debugPath, JSON.stringify(messages, null, 2), "utf-8");
        log(`  📝 DEBUG messages → ${debugPath}`);
        log(`  📏 ${messages.length} messages, roles: ${messages.map(m => m.role).join(" → ")}`);
    }
    const body = JSON.stringify({
        messages,
        temperature: req.temperature ?? 0.8,
        max_tokens: req.maxTokens ?? 8192,
        stream: false,
    });
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const res = await fetch(req.endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(req.apiKey ? { Authorization: `Bearer ${req.apiKey}` } : {}),
                },
                body,
            });
            if (!res.ok) {
                const errText = await res.text().catch(() => "");
                throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
            }
            const json = await res.json();
            const raw = json.choices?.[0]?.message?.content
                || json.content
                || json.choices?.[0]?.text
                || json.response
                || "";
            const text = stripThink(raw);
            const usage = json.usage || {};
            const completionTokens = usage.completion_tokens ?? 0;
            const maxTokens = req.maxTokens ?? 8192;
            const truncated = isLikelyTruncated(text, completionTokens, maxTokens);
            if (truncated && attempt < 3) {
                log(`  输出疑似截断 (attempt ${attempt}, tokens ${completionTokens}/${maxTokens})，重试...`);
                continue;
            }
            return { text, truncated };
        }
        catch (err) {
            lastError = err;
            if (attempt < 3) {
                warn(`  调用失败 (attempt ${attempt}): ${err.message}`);
                await sleep(1000 * attempt);
            }
        }
    }
    throw new Error(`模型调用失败（3次重试后）: ${lastError?.message}`);
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
export function resolveModelConfig(cfg, global) {
    return {
        endpoint: cfg.config.apiEndpoint || global.defaultEndpoint,
        model: cfg.config.model || global.defaultModel,
        apiKey: cfg.config.apiKey || global.defaultApiKey,
        fallbackModel: global.fallbackModel,
    };
}
