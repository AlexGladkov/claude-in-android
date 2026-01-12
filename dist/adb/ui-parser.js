/**
 * Parse UI hierarchy XML from uiautomator dump
 */
export function parseUiHierarchy(xml) {
    const elements = [];
    const nodeRegex = /<node[^>]+>/g;
    let match;
    let index = 0;
    while ((match = nodeRegex.exec(xml)) !== null) {
        const nodeStr = match[0];
        // Parse bounds
        const boundsMatch = nodeStr.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
        if (!boundsMatch)
            continue;
        const bounds = {
            x1: parseInt(boundsMatch[1]),
            y1: parseInt(boundsMatch[2]),
            x2: parseInt(boundsMatch[3]),
            y2: parseInt(boundsMatch[4])
        };
        const element = {
            index: index++,
            resourceId: extractAttr(nodeStr, "resource-id"),
            className: extractAttr(nodeStr, "class"),
            packageName: extractAttr(nodeStr, "package"),
            text: extractAttr(nodeStr, "text"),
            contentDesc: extractAttr(nodeStr, "content-desc"),
            checkable: extractAttr(nodeStr, "checkable") === "true",
            checked: extractAttr(nodeStr, "checked") === "true",
            clickable: extractAttr(nodeStr, "clickable") === "true",
            enabled: extractAttr(nodeStr, "enabled") === "true",
            focusable: extractAttr(nodeStr, "focusable") === "true",
            focused: extractAttr(nodeStr, "focused") === "true",
            scrollable: extractAttr(nodeStr, "scrollable") === "true",
            longClickable: extractAttr(nodeStr, "long-clickable") === "true",
            password: extractAttr(nodeStr, "password") === "true",
            selected: extractAttr(nodeStr, "selected") === "true",
            bounds,
            centerX: Math.floor((bounds.x1 + bounds.x2) / 2),
            centerY: Math.floor((bounds.y1 + bounds.y2) / 2),
            width: bounds.x2 - bounds.x1,
            height: bounds.y2 - bounds.y1
        };
        elements.push(element);
    }
    return elements;
}
/**
 * Extract attribute value from node string
 */
function extractAttr(nodeStr, attrName) {
    const regex = new RegExp(`${attrName}="([^"]*)"`);
    const match = nodeStr.match(regex);
    return match?.[1] ?? "";
}
/**
 * Find elements by text (partial match, case-insensitive)
 */
export function findByText(elements, text) {
    const lowerText = text.toLowerCase();
    return elements.filter(el => el.text.toLowerCase().includes(lowerText) ||
        el.contentDesc.toLowerCase().includes(lowerText));
}
/**
 * Find elements by resource ID (partial match)
 */
export function findByResourceId(elements, id) {
    return elements.filter(el => el.resourceId.includes(id));
}
/**
 * Find elements by class name
 */
export function findByClassName(elements, className) {
    return elements.filter(el => el.className.includes(className));
}
/**
 * Find clickable elements
 */
export function findClickable(elements) {
    return elements.filter(el => el.clickable);
}
/**
 * Find elements by multiple criteria
 */
export function findElements(elements, criteria) {
    return elements.filter(el => {
        if (criteria.text && !el.text.toLowerCase().includes(criteria.text.toLowerCase()) &&
            !el.contentDesc.toLowerCase().includes(criteria.text.toLowerCase())) {
            return false;
        }
        if (criteria.resourceId && !el.resourceId.includes(criteria.resourceId)) {
            return false;
        }
        if (criteria.className && !el.className.includes(criteria.className)) {
            return false;
        }
        if (criteria.clickable !== undefined && el.clickable !== criteria.clickable) {
            return false;
        }
        if (criteria.enabled !== undefined && el.enabled !== criteria.enabled) {
            return false;
        }
        if (criteria.visible !== undefined) {
            const isVisible = el.width > 0 && el.height > 0;
            if (isVisible !== criteria.visible)
                return false;
        }
        return true;
    });
}
/**
 * Format element for display
 */
export function formatElement(el) {
    const parts = [];
    const shortClass = el.className.split(".").pop() ?? el.className;
    parts.push(`[${el.index}]`);
    parts.push(`<${shortClass}>`);
    if (el.resourceId) {
        const shortId = el.resourceId.split(":id/").pop() ?? el.resourceId;
        parts.push(`id="${shortId}"`);
    }
    if (el.text) {
        parts.push(`text="${el.text.slice(0, 50)}${el.text.length > 50 ? "..." : ""}"`);
    }
    if (el.contentDesc) {
        parts.push(`desc="${el.contentDesc.slice(0, 30)}${el.contentDesc.length > 30 ? "..." : ""}"`);
    }
    const flags = [];
    if (el.clickable)
        flags.push("clickable");
    if (el.scrollable)
        flags.push("scrollable");
    if (el.focused)
        flags.push("focused");
    if (el.checked)
        flags.push("checked");
    if (!el.enabled)
        flags.push("disabled");
    if (flags.length > 0) {
        parts.push(`(${flags.join(", ")})`);
    }
    parts.push(`@ (${el.centerX}, ${el.centerY})`);
    return parts.join(" ");
}
/**
 * Format UI tree for display (simplified view)
 */
export function formatUiTree(elements, options) {
    const { showAll = false, maxElements = 100 } = options ?? {};
    // Filter to only meaningful elements
    let filtered = showAll
        ? elements
        : elements.filter(el => el.text ||
            el.contentDesc ||
            el.clickable ||
            el.scrollable ||
            el.focusable ||
            el.resourceId.includes(":id/"));
    if (filtered.length > maxElements) {
        filtered = filtered.slice(0, maxElements);
    }
    if (filtered.length === 0) {
        return "No UI elements found";
    }
    return filtered.map(formatElement).join("\n");
}
/**
 * Analyze screen and return structured information
 * More useful than raw UI tree for Claude to understand
 */
export function analyzeScreen(elements, activity) {
    const buttons = [];
    const inputs = [];
    const texts = [];
    const scrollable = [];
    for (const el of elements) {
        // Skip invisible elements
        if (el.width <= 0 || el.height <= 0)
            continue;
        // Buttons and clickable elements
        if (el.clickable && el.enabled) {
            const label = el.text || el.contentDesc || getShortId(el.resourceId) || "";
            if (label) {
                buttons.push({
                    index: el.index,
                    label,
                    coordinates: { x: el.centerX, y: el.centerY }
                });
            }
        }
        // Input fields (EditText)
        if (el.className.includes("EditText") || el.className.includes("TextInputEditText")) {
            inputs.push({
                index: el.index,
                hint: el.contentDesc || getShortId(el.resourceId) || "",
                value: el.text,
                coordinates: { x: el.centerX, y: el.centerY }
            });
        }
        // Static text (non-clickable text)
        if (el.text && !el.clickable && el.className.includes("TextView")) {
            texts.push({
                content: el.text,
                coordinates: { x: el.centerX, y: el.centerY }
            });
        }
        // Scrollable containers
        if (el.scrollable) {
            const isVertical = el.height > el.width;
            scrollable.push({
                index: el.index,
                direction: isVertical ? "vertical" : "horizontal",
                coordinates: { x: el.centerX, y: el.centerY }
            });
        }
    }
    // Create summary
    const summaryParts = [];
    if (activity) {
        summaryParts.push(`Screen: ${activity.split(".").pop()}`);
    }
    if (buttons.length > 0) {
        summaryParts.push(`${buttons.length} buttons: ${buttons.slice(0, 5).map(b => `"${b.label}"`).join(", ")}${buttons.length > 5 ? "..." : ""}`);
    }
    if (inputs.length > 0) {
        summaryParts.push(`${inputs.length} input field(s)`);
    }
    if (scrollable.length > 0) {
        summaryParts.push(`Scrollable: ${scrollable[0].direction}`);
    }
    return {
        activity,
        buttons,
        inputs,
        texts: texts.slice(0, 20), // Limit text count
        scrollable,
        summary: summaryParts.join(" | ") || "Empty screen"
    };
}
/**
 * Get short ID from resource ID
 */
function getShortId(resourceId) {
    if (!resourceId)
        return "";
    return resourceId.split(":id/").pop() ?? resourceId;
}
/**
 * Find best element by description (smart fuzzy search)
 * Returns the best match or null
 */
export function findBestMatch(elements, description) {
    const desc = description.toLowerCase().trim();
    // Score each element
    const scored = elements
        .filter(el => el.enabled && (el.width > 0 && el.height > 0))
        .map(el => {
        let score = 0;
        let reason = "";
        const text = el.text.toLowerCase();
        const contentDesc = el.contentDesc.toLowerCase();
        const id = getShortId(el.resourceId).toLowerCase().replace(/_/g, " ");
        // Exact text match
        if (text === desc) {
            score = 100;
            reason = `exact text match: "${el.text}"`;
        }
        // Exact content description match
        else if (contentDesc === desc) {
            score = 95;
            reason = `exact description: "${el.contentDesc}"`;
        }
        // Text contains description
        else if (text.includes(desc)) {
            score = 80;
            reason = `text contains: "${el.text}"`;
        }
        // Content description contains
        else if (contentDesc.includes(desc)) {
            score = 75;
            reason = `description contains: "${el.contentDesc}"`;
        }
        // ID match (common patterns like btn_submit, button_ok)
        else if (id.includes(desc) || id.includes(desc.replace(/ /g, "_"))) {
            score = 60;
            reason = `ID match: "${el.resourceId}"`;
        }
        // Partial word match in text
        else if (desc.split(" ").some(word => text.includes(word) && word.length > 2)) {
            score = 40;
            reason = `partial text match: "${el.text}"`;
        }
        // Partial word match in description
        else if (desc.split(" ").some(word => contentDesc.includes(word) && word.length > 2)) {
            score = 35;
            reason = `partial description match: "${el.contentDesc}"`;
        }
        // Boost clickable elements
        if (score > 0 && el.clickable) {
            score += 10;
        }
        return { element: el, score, reason };
    })
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score);
    if (scored.length === 0) {
        return null;
    }
    const best = scored[0];
    return {
        element: best.element,
        confidence: Math.min(best.score, 100),
        reason: best.reason
    };
}
/**
 * Format screen analysis as text
 */
export function formatScreenAnalysis(analysis) {
    const lines = [];
    lines.push(`=== Screen Analysis ===`);
    lines.push(analysis.summary);
    lines.push("");
    if (analysis.buttons.length > 0) {
        lines.push(`Buttons (${analysis.buttons.length}):`);
        for (const btn of analysis.buttons.slice(0, 15)) {
            lines.push(`  [${btn.index}] "${btn.label}" @ (${btn.coordinates.x}, ${btn.coordinates.y})`);
        }
        if (analysis.buttons.length > 15) {
            lines.push(`  ... and ${analysis.buttons.length - 15} more`);
        }
        lines.push("");
    }
    if (analysis.inputs.length > 0) {
        lines.push(`Input fields (${analysis.inputs.length}):`);
        for (const inp of analysis.inputs) {
            const value = inp.value ? ` = "${inp.value}"` : " (empty)";
            lines.push(`  [${inp.index}] ${inp.hint || "text field"}${value} @ (${inp.coordinates.x}, ${inp.coordinates.y})`);
        }
        lines.push("");
    }
    if (analysis.texts.length > 0) {
        lines.push(`Text on screen:`);
        for (const txt of analysis.texts.slice(0, 10)) {
            lines.push(`  "${txt.content.slice(0, 60)}${txt.content.length > 60 ? "..." : ""}"`);
        }
        if (analysis.texts.length > 10) {
            lines.push(`  ... and ${analysis.texts.length - 10} more`);
        }
    }
    return lines.join("\n");
}
//# sourceMappingURL=ui-parser.js.map