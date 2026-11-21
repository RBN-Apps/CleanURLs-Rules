"use strict";

const { decodeRedirectTarget, compileDeclaredRedirect } = (() => {
    const modules = new Map();
    function define(name, dependencies, factory) {
        const exports = {};
        const imports = dependencies.map(dependency => {
            if (dependency === "require") return undefined;
            if (dependency === "exports") return exports;
            if (!modules.has(dependency)) throw new Error("Unsupported redirect module dependency: " + dependency);
            return modules.get(dependency);
        });
        factory(...imports);
        modules.set(name, exports);
    }

/*
 * ClearURLs
 * Copyright (c) 2017-2026 Kevin Röbert.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
define("redirect/percentEscapes", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.readPercentEscape = readPercentEscape;
    exports.scanPercentEscapes = scanPercentEscapes;
    exports.readDelimiter = readDelimiter;
    exports.decodePercent = decodePercent;
    exports.unwrapPercentLayer = unwrapPercentLayer;
    exports.openEscapes = openEscapes;
    exports.peelNestedEscapes = peelNestedEscapes;
    const escapedHexDigit = '[a-f0-9]|%(?:25)*(?:3[0-9]|4[1-6]|6[1-6])';
    const percentByte = new RegExp('(?:25)*[a-f0-9]{2}', 'iy');
    const splitPercentByte = new RegExp('(' + escapedHexDigit + ')(' + escapedHexDigit + ')', 'iy');
    function characterForHexByte(hex) {
        return String.fromCharCode(parseInt(hex, 16));
    }
    function decodeHexDigit(digit) {
        return digit.length === 1 ? digit : characterForHexByte(digit.slice(-2));
    }
    /** Read at a percent sign and retain the full span of a nested escape. */
    function readPercentEscape(value, start) {
        var _a;
        percentByte.lastIndex = start + 1;
        const bytes = (_a = percentByte.exec(value)) === null || _a === void 0 ? void 0 : _a[0];
        if (!bytes)
            return null;
        let char = characterForHexByte(bytes.slice(-2));
        let depth = bytes.length / 2;
        let end = start + 1 + bytes.length;
        // A decoded percent sign can introduce a byte whose digits were themselves escaped.
        while (char === '%') {
            splitPercentByte.lastIndex = end;
            const match = splitPercentByte.exec(value);
            if (!match)
                break;
            const [text = '', high = '', low = ''] = match;
            // Both digits must be available by the time the percent sign is exposed.
            if (Math.max(high.length, low.length) > depth * 2 + 1)
                break;
            char = characterForHexByte(decodeHexDigit(high) + decodeHexDigit(low));
            depth++;
            end += text.length;
        }
        return { char, depth, start, end };
    }
    /** Scan percent escapes in source order, skipping the digits consumed by each escape. */
    function scanPercentEscapes(value) {
        var _a;
        const escapes = [];
        for (let start = value.indexOf('%'); start >= 0;) {
            const escape = readPercentEscape(value, start);
            if (escape)
                escapes.push(escape);
            start = value.indexOf('%', (_a = escape === null || escape === void 0 ? void 0 : escape.end) !== null && _a !== void 0 ? _a : start + 1);
        }
        return escapes;
    }
    function readDelimiter(value, start, char) {
        if (value[start] === char)
            return { char, depth: 0, start, end: start + 1 };
        if (value[start] !== '%')
            return null;
        const escape = readPercentEscape(value, start);
        return (escape === null || escape === void 0 ? void 0 : escape.char) === char ? escape : null;
    }
    function decodePercent(value) {
        try {
            return decodeURIComponent(value);
        }
        catch (_a) {
            return null;
        }
    }
    /** Peel a whole layer only when re-encoding reproduces the wrapper's spelling. */
    function unwrapPercentLayer(value) {
        const decoded = decodePercent(value);
        if (decoded === null || decoded === value)
            return null;
        // Wrappers differ on escaped safe ASCII. A literal plus keeps its legacy value.
        const normalized = value.replace(/%[a-f\d]{2}|\+/gi, triplet => {
            if (triplet === '+')
                return '%2B';
            const char = characterForHexByte(triplet.slice(1));
            return /^[a-z\d_.!~*'()-]$/i.test(char) ? char : triplet.toUpperCase();
        });
        return encodeURIComponent(decoded) === normalized ? decoded : null;
    }
    /** Open only the specified escapes. Spans are given in source order. */
    function openEscapes(value, positions) {
        let result = '';
        let cursor = 0;
        for (const position of positions) {
            result += value.slice(cursor, position.start) + position.char;
            cursor = position.end;
        }
        return result + value.slice(cursor);
    }
    function peelNestedEscapes(value, depth, preserveThroughDepth = 0) {
        return value.replace(/%(?:25)+(?=[a-f\d]{2})/gi, layers => {
            // Keep the innermost escape intact so an escaped control stays escaped.
            const outerLayers = (layers.length - 1) / 2;
            if (outerLayers + 1 <= preserveThroughDepth)
                return layers;
            return '%' + layers.slice(1 + 2 * Math.min(depth, outerLayers));
        });
    }
});
/*
 * ClearURLs
 * Copyright (c) 2017-2026 Kevin Röbert.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
define("redirect/url", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.urlComponentBoundary = void 0;
    exports.hasRawControls = hasRawControls;
    exports.isValidRedirectInput = isValidRedirectInput;
    exports.parseUrlWithHost = parseUrlWithHost;
    const rawControls = /[\u0000-\u001f\u007f-\u009f]/;
    const unpairedSurrogate = /[\ud800-\udbff](?![\udc00-\udfff])|(?:^|[^\ud800-\udbff])[\udc00-\udfff]/;
    exports.urlComponentBoundary = /[/\\?#]/;
    function hasRawControls(value) {
        return rawControls.test(value);
    }
    function isValidRedirectInput(value) {
        return value.length > 0 && !hasRawControls(value) && !unpairedSurrogate.test(value);
    }
    // Use the parsed URL for validation while retaining the captured text for redirects.
    function parseUrlWithHost(value) {
        try {
            const url = new URL(value);
            return url.hostname ? url : null;
        }
        catch (_a) {
            return null;
        }
    }
});
/*
 * ClearURLs
 * Copyright (c) 2017-2026 Kevin Röbert.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
define("redirect/declared", ["require", "exports", "redirect/percentEscapes", "redirect/url"], function (require, exports, percentEscapes_1, url_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getRedirectOperation = getRedirectOperation;
    exports.validateDeclaredTarget = validateDeclaredTarget;
    exports.decodeDeclaredRedirect = decodeDeclaredRedirect;
    const httpPrefix = /^https?:\/\//i;
    const schemePrefix = /^[a-z][a-z\d+.-]*:/i;
    const bareHostWithPort = /^(?:[^:]+\.[^:]*|localhost):\d+$/i;
    function decodeBase64(value, format) {
        if (value === '') {
            return '';
        }
        const urlSafe = format === 'base64url';
        const alphabet = urlSafe ? /^[a-z\d_-]+={0,2}$/i : /^[a-z\d+/]+={0,2}$/i;
        if (!alphabet.test(value))
            return null;
        const input = urlSafe ? value.replace(/-/g, '+').replace(/_/g, '/') : value;
        try {
            const binary = atob(input);
            const canonical = btoa(binary);
            // A round trip checks padding and unused bits. Base64url also permits omitted padding.
            if (input !== canonical && (!urlSafe || input !== canonical.replace(/=+$/, '')))
                return null;
            const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
            return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
        }
        catch (_a) {
            return null;
        }
    }
    function encodeBase64(value) {
        const bytes = new TextEncoder().encode(value);
        const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
        return btoa(binary);
    }
    const operations = {
        urlDecode: percentEscapes_1.decodePercent,
        formDecode: (value) => (0, percentEscapes_1.decodePercent)(value.replace(/\+/g, ' ')),
        base64Decode: (value) => decodeBase64(value, 'base64'),
        base64UrlDecode: (value) => decodeBase64(value, 'base64url'),
        urlEncode: encodeURIComponent,
        base64Encode: encodeBase64,
    };
    function isOperationName(name) {
        return Object.prototype.hasOwnProperty.call(operations, name);
    }
    function getRedirectOperation(name) {
        return typeof name === 'string' && isOperationName(name)
            ? operations[name]
            : undefined;
    }
    function applyDecodeStep(value, step) {
        switch (step) {
            case 'percent': return operations.urlDecode(value);
            case 'form': return operations.formDecode(value);
            case 'base64': return operations.base64Decode(value);
            case 'base64url': return operations.base64UrlDecode(value);
            default: return null;
        }
    }
    function completeMissingScheme(value, scheme) {
        var _a;
        const networkPath = value.startsWith('//');
        const rest = networkPath ? value.slice(2) : value;
        const authority = (_a = rest.split(url_1.urlComponentBoundary, 1)[0]) !== null && _a !== void 0 ? _a : '';
        if (!authority)
            return null;
        if (!networkPath) {
            // In a bare authority, a dotted host or localhost can use a numeric port.
            if (authority.includes('@') || (schemePrefix.test(value) && !bareHostWithPort.test(authority)))
                return null;
        }
        const target = networkPath ? scheme + ':' + value : scheme + '://' + value;
        const parsed = (0, url_1.parseUrlWithHost)(target);
        return parsed && !/^\.+$/.test(parsed.hostname) ? target : null;
    }
    function validateDeclaredTarget(value, defaultScheme) {
        if (!(0, url_1.isValidRedirectInput)(value)) {
            return null;
        }
        if (httpPrefix.test(value)) {
            return (0, url_1.parseUrlWithHost)(value) ? value : null;
        }
        return defaultScheme === undefined ? null : completeMissingScheme(value, defaultScheme);
    }
    function decodeDeclaredRedirect(value, options) {
        const { decode: steps, defaultScheme } = options;
        const supportedScheme = defaultScheme === undefined || defaultScheme === 'http' || defaultScheme === 'https';
        if (!Array.isArray(steps) || !supportedScheme)
            return null;
        for (const step of steps) {
            const decoded = applyDecodeStep(value, step);
            // Each declared layer can expose raw controls before the target is parsed.
            if (decoded === null || !(0, url_1.isValidRedirectInput)(decoded))
                return null;
            value = decoded;
        }
        return validateDeclaredTarget(value, defaultScheme);
    }
});
define("redirect/declaredRule", ["require", "exports", "redirect/declared", "redirect/url"], function (require, exports, declared_1, url_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.compileRedirectRule = compileRedirectRule;
    const ruleFields = ['id', 'match', 'preprocessors', 'replacePattern', 'defaultScheme'];
    const matcherFields = ['regex', 'caseSensitive'];
    const preprocessorFields = ['type', 'inputs'];
    const maxPreprocessors = 16;
    function isRecord(value) {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }
    function readOwn(record, key) {
        return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
    }
    function hasOnlyFields(record, fields) {
        return Object.keys(record).every(key => fields.indexOf(key) >= 0);
    }
    function compileMatcher(value) {
        if (!isRecord(value) || !hasOnlyFields(value, matcherFields)) {
            return null;
        }
        const pattern = readOwn(value, 'regex');
        const caseSensitive = readOwn(value, 'caseSensitive');
        const isValidCasing = caseSensitive === undefined || typeof caseSensitive === 'boolean';
        if (typeof pattern !== 'string' || !pattern || !isValidCasing) {
            return null;
        }
        try {
            return { pattern, expression: new RegExp(pattern, caseSensitive === false ? 'i' : '') };
        }
        catch (_a) {
            return null;
        }
    }
    function compileInputs(inputs) {
        if (inputs === 'all') {
            return 'all';
        }
        if (!Array.isArray(inputs)) {
            return null;
        }
        const indexes = new Set();
        for (const index of inputs) {
            if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 1 || indexes.has(index - 1)) {
                return null;
            }
            // Catalog capture numbers start at one. Match arrays passed to the resolver start at zero.
            indexes.add(index - 1);
        }
        return Array.from(indexes);
    }
    function compilePreprocessors(value) {
        if (value === undefined) {
            return [];
        }
        if (!Array.isArray(value) || value.length > maxPreprocessors) {
            return null;
        }
        const steps = [];
        for (const step of value) {
            if (!isRecord(step) || !hasOnlyFields(step, preprocessorFields)) {
                return null;
            }
            const transform = (0, declared_1.getRedirectOperation)(readOwn(step, 'type'));
            const inputs = compileInputs(readOwn(step, 'inputs'));
            if (transform === undefined || inputs === null) {
                return null;
            }
            steps.push({ transform, inputs });
        }
        return steps;
    }
    function compileTemplate(value) {
        const template = value === undefined ? '§1§' : value;
        if (typeof template !== 'string' || !(0, url_2.isValidRedirectInput)(template)) {
            return null;
        }
        const parts = [];
        const placeholders = /§(\d+)§/g;
        let cursor = 0;
        for (let match = placeholders.exec(template); match !== null; match = placeholders.exec(template)) {
            const captureNumber = Number(match[1]);
            if (!Number.isSafeInteger(captureNumber) || captureNumber < 1) {
                return null;
            }
            parts.push(template.slice(cursor, match.index), { captureIndex: captureNumber - 1 });
            cursor = placeholders.lastIndex;
        }
        parts.push(template.slice(cursor));
        return parts;
    }
    function compileRecipe(rule) {
        const defaultScheme = readOwn(rule, 'defaultScheme');
        if (defaultScheme !== undefined && defaultScheme !== 'http' && defaultScheme !== 'https') {
            return null;
        }
        const preprocessors = compilePreprocessors(readOwn(rule, 'preprocessors'));
        const template = compileTemplate(readOwn(rule, 'replacePattern'));
        return preprocessors === null || template === null ? null : { defaultScheme, preprocessors, template };
    }
    function isSafeCapture(value) {
        // An empty participating group is meaningful when the template supplies the URL structure.
        return typeof value === 'string' && (value === '' || (0, url_2.isValidRedirectInput)(value));
    }
    function applyPreprocessor(captures, step) {
        const indexes = step.inputs === 'all' ? captures.keys() : step.inputs;
        for (const index of indexes) {
            if (index >= captures.length) {
                return false;
            }
            const capture = captures[index];
            if (capture === undefined) {
                continue;
            }
            const transformed = step.transform(capture);
            if (transformed === null || !isSafeCapture(transformed)) {
                return false;
            }
            captures[index] = transformed;
        }
        return true;
    }
    function renderTemplate(parts, captures) {
        let target = '';
        for (const part of parts) {
            if (typeof part === 'string') {
                target += part;
                continue;
            }
            const capture = captures[part.captureIndex];
            if (capture === undefined) {
                return null;
            }
            target += capture;
        }
        return target;
    }
    function resolveTarget(recipe, captures) {
        if (captures.some(capture => capture !== undefined && !isSafeCapture(capture))) {
            return null;
        }
        const processed = [...captures];
        for (const step of recipe.preprocessors) {
            if (!applyPreprocessor(processed, step)) {
                return null;
            }
        }
        const target = renderTemplate(recipe.template, processed);
        return target === null ? null : (0, declared_1.validateDeclaredTarget)(target, recipe.defaultScheme);
    }
    /** Compile a catalog redirect without retaining mutable input configuration. */
    function compileRedirectRule(input) {
        if (!isRecord(input) || !hasOnlyFields(input, ruleFields)) {
            return null;
        }
        const id = readOwn(input, 'id');
        if (typeof id !== 'string' || !/^[a-z0-9_-]+$/.test(id)) {
            return null;
        }
        const matcher = compileMatcher(readOwn(input, 'match'));
        const recipe = compileRecipe(input);
        if (matcher === null || recipe === null) {
            return null;
        }
        return Object.assign(Object.assign({ id }, matcher), { resolve: captures => resolveTarget(recipe, captures) });
    }
});
/*
 * ClearURLs
 * Copyright (c) 2017-2026 Kevin Röbert.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
define("redirect/legacyAuthority", ["require", "exports", "redirect/percentEscapes", "redirect/url"], function (require, exports, percentEscapes_2, url_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.resolveLegacyAuthority = resolveLegacyAuthority;
    function parseAuthority(prefix, text) {
        const url = (0, url_3.parseUrlWithHost)(prefix + text + '/');
        return url && { text, host: url.host };
    }
    function splitUserinfo(authority) {
        const literalAt = authority.lastIndexOf('@');
        if (literalAt >= 0) {
            return { userinfo: authority.slice(0, literalAt + 1), host: authority.slice(literalAt + 1) };
        }
        const escapes = (0, percentEscapes_2.scanPercentEscapes)(authority);
        const encodedAt = escapes.filter(escape => escape.char === '@').pop();
        if (!encodedAt)
            return { userinfo: '', host: authority };
        let userinfo = authority.slice(0, encodedAt.start);
        const password = escapes.find(escape => escape.char === ':' && escape.start < encodedAt.start);
        if (password && !userinfo.includes(':'))
            userinfo = (0, percentEscapes_2.openEscapes)(userinfo, [password]);
        return { userinfo: userinfo + '@', host: authority.slice(encodedAt.end) };
    }
    function repairAuthority(prefix, authority) {
        const original = parseAuthority(prefix, authority);
        if (original)
            return original;
        const { userinfo, host } = splitUserinfo(authority);
        let encodedHost = host;
        while (encodedHost) {
            const repaired = parseAuthority(prefix, userinfo + encodedHost);
            if (repaired)
                return repaired;
            // Host and port repairs may remove percent layers. They must never
            // create a new userinfo separator or move the end of the authority.
            const decoded = (0, percentEscapes_2.decodePercent)(encodedHost);
            if (decoded === null || decoded === encodedHost || (0, url_3.hasRawControls)(decoded) || /[\\/?#@]/.test(decoded)) {
                return null;
            }
            encodedHost = decoded;
        }
        return null;
    }
    function hasInvalidPort(prefix, authority) {
        const portEscapes = (0, percentEscapes_2.scanPercentEscapes)(authority).filter(escape => /^[:\d]$/.test(escape.char));
        const text = (0, percentEscapes_2.openEscapes)(authority, portEscapes);
        const port = /:\d+$/.exec(text);
        return port !== null && repairAuthority(prefix, text.slice(0, port.index)) !== null;
    }
    /** Yield the later boundaries with a userinfo marker between them and the previous boundary. */
    function* boundariesAfterUserinfo(first, later, markers) {
        let previousEnd = first.end;
        let markerIndex = 0;
        for (const boundary of [...later, undefined]) {
            let marker = markers[markerIndex];
            while (marker !== undefined && marker < previousEnd) {
                markerIndex++;
                marker = markers[markerIndex];
            }
            // An omitted boundary means the authority extends to the next literal delimiter.
            if (marker !== undefined && (!boundary || marker < boundary.start))
                yield boundary;
            if (boundary)
                previousEnd = boundary.end;
        }
    }
    /** Select the authority inside the span before the first literal URL delimiter. */
    function resolveLegacyAuthority(prefix, head) {
        var _a;
        const escapes = (0, percentEscapes_2.scanPercentEscapes)(head);
        const [first, ...later] = escapes.filter(escape => url_3.urlComponentBoundary.test(escape.char));
        if (!first) {
            const authority = repairAuthority(prefix, head);
            return authority && { text: authority.text };
        }
        const firstAuthority = head.slice(0, first.start);
        let selected = repairAuthority(prefix, firstAuthority);
        // Once a host is recognizable, its invalid port cannot turn it into userinfo.
        if (!selected && hasInvalidPort(prefix, firstAuthority))
            return null;
        let followingBoundary = first;
        const recognizableHost = selected !== null && (/[.:]/.test(selected.host) || selected.text.includes('@'));
        const literalAt = head.lastIndexOf('@');
        // The last literal @ takes precedence when a candidate contains it. Consider
        // only escaped markers that could end an earlier candidate before that @.
        const markers = escapes.filter(escape => escape.char === '@' && (literalAt < 0 || escape.end <= literalAt))
            .map(escape => escape.start);
        if (literalAt >= 0)
            markers.push(literalAt);
        for (const alternative of boundariesAfterUserinfo(first, later, markers)) {
            // An escaped @ by itself remains path data after a recognizable host.
            // A later escaped boundary or literal @ can establish a competing authority.
            if (!alternative && recognizableHost && literalAt < first.end)
                break;
            const candidate = repairAuthority(prefix, head.slice(0, (_a = alternative === null || alternative === void 0 ? void 0 : alternative.start) !== null && _a !== void 0 ? _a : head.length));
            if (!candidate)
                continue;
            if (selected && selected.host !== candidate.host)
                return null;
            if (!selected) {
                selected = candidate;
                followingBoundary = alternative;
            }
        }
        return selected && { text: selected.text, followingBoundary };
    }
});
/*
 * ClearURLs
 * Copyright (c) 2017-2026 Kevin Röbert.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
define("redirect/legacySuffix", ["require", "exports", "redirect/percentEscapes"], function (require, exports, percentEscapes_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.repairLegacySuffix = repairLegacySuffix;
    const simpleFieldName = /^[a-z\d_.~-]+$/i;
    const queryOrFragment = /[?#]/;
    function findAssignmentBeforeLiteralEquals(query, end, depth) {
        const start = query.indexOf('%');
        if (start < 0 || start >= end || !simpleFieldName.test(query.slice(0, start)))
            return null;
        const assignment = (0, percentEscapes_3.readPercentEscape)(query, start);
        return (assignment === null || assignment === void 0 ? void 0 : assignment.char) === '=' && assignment.depth === depth ? assignment : null;
    }
    function isOpaqueLegacyField(field) {
        return /%[a-f\d]{2}/i.test(field) && !/%(?![a-f\d]{2})/i.test(field) && (0, percentEscapes_3.decodePercent)(field) === null;
    }
    function restoreEncodedAssignment(query, assignment) {
        const opened = (0, percentEscapes_3.openEscapes)(query, [assignment]);
        // A reversible wrapper can explain an extra layer around the payload.
        const { depth } = assignment;
        const peeled = (0, percentEscapes_3.peelNestedEscapes)(opened, depth, depth);
        return peeled !== opened && (0, percentEscapes_3.unwrapPercentLayer)(query) !== null ? peeled : opened;
    }
    /** Return the suffix with recognizable query structure, or null when it is ambiguous. */
    function repairQuery(value, depth) {
        const fragment = value.indexOf('#');
        const query = fragment < 0 ? value : value.slice(0, fragment);
        const literal = query.search(/[&=]/);
        if (literal >= 0) {
            // A literal equals can be payload after the escaped assignment in q%3Da=b.
            const assignment = query[literal] === '=' ? findAssignmentBeforeLiteralEquals(query, literal, depth) : null;
            return assignment ? (0, percentEscapes_3.openEscapes)(value, [assignment]) : value;
        }
        const [first, second] = (0, percentEscapes_3.scanPercentEscapes)(query).filter(part => part.depth === depth && '&=#?'.includes(part.char));
        if ((first === null || first === void 0 ? void 0 : first.char) === '=' && first.start > 0) {
            // A second apparent assignment or delimiter can still belong to the value.
            if (second)
                return (0, percentEscapes_3.openEscapes)(value, [first]);
            return restoreEncodedAssignment(query, first) + value.slice(query.length);
        }
        if ((first === null || first === void 0 ? void 0 : first.char) === '&' && (second === null || second === void 0 ? void 0 : second.char) === '=' && simpleFieldName.test(query.slice(first.end, second.start))) {
            // Legacy bare fields can contain non-UTF-8 bytes (q%FF%26x%3D1). Preserve
            // the bytes and open just the separator and assignment of the next named field.
            if (isOpaqueLegacyField(query.slice(0, first.start)))
                return (0, percentEscapes_3.openEscapes)(value, [first, second]);
        }
        return null;
    }
    /** Restore the identified boundary and any supported structure after it. */
    function repairLegacySuffix(boundary, value, mixedPrefix) {
        var _a;
        const { char, depth } = boundary;
        if (char === '#')
            return '#' + value;
        if (char === '?')
            return '?' + ((_a = repairQuery(value, depth)) !== null && _a !== void 0 ? _a : value);
        const literal = value.search(queryOrFragment);
        if (literal >= 0 && value[literal] === '?')
            return char + value;
        const path = literal < 0 ? value : value.slice(0, literal);
        const escapes = (0, percentEscapes_3.scanPercentEscapes)(path);
        const escapedBoundary = escapes.find(part => queryOrFragment.test(part.char));
        if ((escapedBoundary === null || escapedBoundary === void 0 ? void 0 : escapedBoundary.char) === '?') {
            const query = repairQuery(value.slice(escapedBoundary.end), escapedBoundary.depth);
            // The query may justify opening its own boundary while the path stays opaque.
            if (query !== null)
                return char + value.slice(0, escapedBoundary.start) + '?' + query;
        }
        if (literal < 0 && (depth > 1 || mixedPrefix) && escapes.every(part => part.depth > depth)) {
            return char + (0, percentEscapes_3.peelNestedEscapes)(value, depth);
        }
        return char + value;
    }
});
/*
 * ClearURLs
 * Copyright (c) 2017-2026 Kevin Röbert.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
define("redirect/legacy", ["require", "exports", "redirect/legacyAuthority", "redirect/legacySuffix", "redirect/percentEscapes", "redirect/url"], function (require, exports, legacyAuthority_1, legacySuffix_1, percentEscapes_4, url_4) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.decodeLegacyRedirect = decodeLegacyRedirect;
    const nonHttpSchemes = /^(?:about|blob|data|file|ftp|geo|javascript|mailto|sms|tel|urn|ws|wss)$/i;
    function readSchemeName(value) {
        var _a, _b, _c;
        let text = '';
        let end = 0;
        while (end < value.length) {
            const escape = value[end] === '%' ? (0, percentEscapes_4.readPercentEscape)(value, end) : null;
            const char = (_b = (_a = escape === null || escape === void 0 ? void 0 : escape.char) !== null && _a !== void 0 ? _a : value[end]) !== null && _b !== void 0 ? _b : '';
            if (!(end === 0 ? /^[a-z]$/i : /^[a-z\d+.-]$/i).test(char))
                break;
            text += char;
            end = (_c = escape === null || escape === void 0 ? void 0 : escape.end) !== null && _c !== void 0 ? _c : end + 1;
        }
        return { text, end };
    }
    function readLegacyPrefix(value) {
        var _a, _b, _c, _d;
        const scheme = readSchemeName(value);
        const colon = scheme.text ? (0, percentEscapes_4.readDelimiter)(value, scheme.end, ':') : null;
        const firstSlash = (0, percentEscapes_4.readDelimiter)(value, (_a = colon === null || colon === void 0 ? void 0 : colon.end) !== null && _a !== void 0 ? _a : 0, '/');
        const secondSlash = firstSlash && (0, percentEscapes_4.readDelimiter)(value, firstSlash.end, '/');
        const hasScheme = colon !== null && secondSlash !== null;
        const isHttp = /^https?$/i.test(scheme.text);
        if (hasScheme && !isHttp)
            return null;
        if (colon && !hasScheme && (isHttp || nonHttpSchemes.test(scheme.text)))
            return null;
        // A colon in a scheme-less capture can still introduce a port or credentials.
        const delimiters = secondSlash && firstSlash
            ? (colon ? [colon, firstSlash, secondSlash] : [firstSlash, secondSlash])
            : [];
        const depth = (_c = (_b = delimiters[0]) === null || _b === void 0 ? void 0 : _b.depth) !== null && _c !== void 0 ? _c : 0;
        return {
            schemeAndSlashes: (hasScheme ? scheme.text : 'http') + '://',
            authorityStart: (_d = secondSlash === null || secondSlash === void 0 ? void 0 : secondSlash.end) !== null && _d !== void 0 ? _d : 0,
            hasNetworkPrefix: secondSlash !== null,
            encodedAtOneDepth: depth > 0 && delimiters.every(delimiter => delimiter.depth === depth),
            mixedDelimiters: delimiters.some(delimiter => delimiter.depth === 0)
                && delimiters.some(delimiter => delimiter.depth > 0),
        };
    }
    function hasSchemelessWrapper(value) {
        if (url_4.urlComponentBoundary.test(value))
            return false;
        const escapes = (0, percentEscapes_4.scanPercentEscapes)(value);
        const boundary = escapes.find(escape => url_4.urlComponentBoundary.test(escape.char));
        if (!boundary)
            return false;
        if (boundary.depth > 1 && escapes.every(escape => escape.depth >= boundary.depth))
            return true;
        const suffix = escapes.filter(escape => escape.start >= boundary.end);
        if (!suffix.some(escape => escape.depth > boundary.depth))
            return false;
        const structure = suffix.filter(escape => escape.depth === boundary.depth && '/\\?#&='.includes(escape.char))
            .map(escape => escape.char).join('');
        // Nested escapes can indicate a wrapper. They do not establish extra path
        // segments, query fields, or a fragment when the capture lacks a scheme.
        if (boundary.char === '?')
            return structure === '=';
        return boundary.char === '/' && (structure === '' || structure === '?=');
    }
    function repairLegacyTarget(value, prefix) {
        var _a;
        let authorityStart = prefix.authorityStart;
        let urlPrefix = prefix.schemeAndSlashes;
        const capturedAuthorityAndSuffix = value.slice(authorityStart);
        if (!prefix.hasNetworkPrefix && /^[/\\]/.test(capturedAuthorityAndSuffix))
            return null;
        const original = urlPrefix + capturedAuthorityAndSuffix;
        if ((0, url_4.parseUrlWithHost)(original))
            return original;
        if (prefix.hasNetworkPrefix) {
            // WHATWG allows extra slashes before the host. Restore these before
            // a later at-sign can be interpreted as a userinfo delimiter.
            while (true) {
                const leadingSlash = (_a = (0, percentEscapes_4.readDelimiter)(value, authorityStart, '/')) !== null && _a !== void 0 ? _a : (0, percentEscapes_4.readDelimiter)(value, authorityStart, '\\');
                if (!leadingSlash)
                    break;
                urlPrefix += leadingSlash.char;
                authorityStart = leadingSlash.end;
            }
        }
        const rest = value.slice(authorityStart);
        const delimiter = rest.search(url_4.urlComponentBoundary);
        const authorityEnd = delimiter < 0 ? rest.length : delimiter;
        if (authorityEnd === 0)
            return null;
        const authority = (0, legacyAuthority_1.resolveLegacyAuthority)(urlPrefix, rest.slice(0, authorityEnd));
        if (!authority)
            return null;
        const boundary = authority.followingBoundary;
        const suffix = boundary
            ? (0, legacySuffix_1.repairLegacySuffix)(boundary, rest.slice(boundary.end), prefix.mixedDelimiters)
            : rest.slice(authorityEnd);
        return urlPrefix + authority.text + suffix;
    }
    /** Peel verified wrapper layers first, then restore the URL structure supported by the remaining capture. */
    function decodeLegacyRedirect(capture) {
        let value = capture;
        while ((0, url_4.isValidRedirectInput)(value)) {
            // Bare HTTP-like tokens can be a truncated scheme rather than a host.
            if (/^https?(?:-[^/?#\\]*)?$/i.test(value))
                return null;
            const prefix = readLegacyPrefix(value);
            if (!prefix)
                return null;
            if (prefix.encodedAtOneDepth || (!prefix.hasNetworkPrefix && hasSchemelessWrapper(value))) {
                const unwrapped = (0, percentEscapes_4.unwrapPercentLayer)(value);
                if (unwrapped !== null) {
                    value = unwrapped;
                    continue;
                }
            }
            const repaired = repairLegacyTarget(value, prefix);
            return repaired !== null && (0, url_4.parseUrlWithHost)(repaired) ? repaired : null;
        }
        return null;
    }
});
/*
 * ClearURLs
 * Copyright (c) 2017-2026 Kevin Röbert.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
define("decodeRedirectTarget", ["require", "exports", "redirect/declared", "redirect/declaredRule", "redirect/legacy", "redirect/url"], function (require, exports, declared_2, declaredRule_1, legacy_1, url_5) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.compileDeclaredRedirect = compileDeclaredRedirect;
    exports.decodeRedirectTarget = decodeRedirectTarget;
    /** Compile an explicit catalog redirect into a matcher and a target resolver. */
    function compileDeclaredRedirect(rule) {
        return (0, declaredRule_1.compileRedirectRule)(rule);
    }
    /**
     * Decode a redirect capture, preserving the spelling of the destination URL.
     * With no options, apply the legacy capture rules. Otherwise execute only the
     * declared steps and optional scheme completion. An unusable target returns
     * null so the caller can try the next redirect rule.
     */
    function decodeRedirectTarget(capture, options) {
        if (typeof capture !== 'string' || !(0, url_5.isValidRedirectInput)(capture))
            return null;
        if (options === undefined)
            return (0, legacy_1.decodeLegacyRedirect)(capture);
        return options ? (0, declared_2.decodeDeclaredRedirect)(capture, options) : null;
    }
});

    return modules.get("decodeRedirectTarget");
})();
