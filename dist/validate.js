// ─── Output Validator ──────────────────────────
export function validateBeat(text, expectedWords) {
    const issues = [];
    const warnings = [];
    const trimmed = text.trim();
    // 1. Length
    const actualLen = trimmed.length;
    const ratio = actualLen / expectedWords;
    if (actualLen < 100) {
        issues.push(`过短（${actualLen} 字，预期 ${expectedWords}）`);
    }
    else if (ratio < 0.5) {
        warnings.push(`偏短（${actualLen} 字，预期 ${expectedWords}，偏差 ${((1 - ratio) * 100).toFixed(0)}%）`);
    }
    else if (ratio > 1.5) {
        warnings.push(`偏长（${actualLen} 字，预期 ${expectedWords}，超出 ${((ratio - 1) * 100).toFixed(0)}%）`);
    }
    // 2. Meta comment at beginning
    if (/^(以下是|这是|这一章|我来写|好的，|让我|Here)/i.test(trimmed.slice(0, 80))) {
        issues.push("开头是元注释");
    }
    // 3. Code blocks
    if (/```/.test(trimmed)) {
        issues.push("包含代码块");
    }
    // 4. Placeholders
    const phPatterns = [
        /\[TODO[^\]]*\]/gi, /\[待补充[^\]]*\]/g, /\[此处[^\]]*\]/g,
        /\[FIXME[^\]]*\]/gi, /\[PLACEHOLDER[^\]]*\]/gi, /（待补充）/g,
        /…{3,}/g,
    ];
    const phFound = [];
    for (const p of phPatterns) {
        let m;
        while ((m = p.exec(trimmed)) !== null)
            phFound.push(m[0]);
    }
    if (phFound.length > 0) {
        issues.push(`占位符残留: ${phFound.join(", ")}`);
    }
    // 5. Chinese ratio
    const cnChars = (trimmed.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length;
    const total = trimmed.replace(/\s/g, "").length;
    const cnRatio = total > 0 ? cnChars / total : 0;
    if (cnRatio < 0.5) {
        issues.push(`中文比例过低（${(cnRatio * 100).toFixed(0)}%）`);
    }
    return {
        valid: issues.length === 0,
        charCount: trimmed.length,
        cnRatio: `${(cnRatio * 100).toFixed(0)}%`,
        issues,
        warnings,
    };
}
