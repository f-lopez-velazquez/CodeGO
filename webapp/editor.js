/* Color tokens match the desktop editor. Tokens change color only, never glyph metrics. */
(function(root){
function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function highlightPython(code) {
  if (!code) return '';

  // Regex patterns:
  // 1. Triple-quoted strings
  // 2. Single-quoted strings (supports raw and f-strings)
  // 3. Comments (#...)
  // 4. Decorators (@...)
  // 5. Function/class definitions
  // 6. Booleans & None
  // 7. self & cls
  // 8. Python keywords
  // 9. Standard built-ins
  // 10. Numbers (hex, float, int)
  // 11. Operators
  const tokenRegex = /(?:("""[\s\S]*?"""|'''[\s\S]*?''')|((?:[rfbRFB]{1,2})?"(?:\\[\s\S]|[^"\\])*"|(?:[rfbRFB]{1,2})?'(?:\\[\s\S]|[^'\\])*')|(#.*$)|(@[a-zA-Z_]\w*)|(\b(?:def|class)\s+([a-zA-Z_]\w*))|(\b(?:True|False|None)\b)|(\b(?:self|cls)\b)|(\b(?:and|as|assert|async|await|break|case|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|match|nonlocal|not|or|pass|raise|return|try|while|with|yield)\b)|(\b(?:abs|all|any|bin|bool|bytearray|bytes|callable|chr|classmethod|compile|complex|delattr|dict|dir|divmod|enumerate|eval|exec|filter|float|format|frozenset|getattr|globals|hasattr|hash|help|hex|id|input|int|isinstance|issubclass|iter|len|list|locals|map|max|memoryview|min|next|object|oct|open|ord|pow|print|property|range|repr|reversed|round|set|setattr|slice|sorted|staticmethod|str|sum|super|tuple|type|vars|zip)\b)|(\b0[xX][0-9a-fA-F]+\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|([+\-*/%&|^~<>!=]=?|==|!=|<=|>=|\/\/|\*\*))/gm;

  let result = '';
  let lastIndex = 0;
  let match;

  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      result += escapeHtml(code.substring(lastIndex, match.index));
    }

    const [
      fullMatch,
      multiString,
      singleString,
      comment,
      decorator,
      defClass,
      fnOrClassName,
      boolVal,
      selfIdent,
      keyword,
      builtin,
      numVal,
      operator
    ] = match;

    if (multiString || singleString) {
      result += `<span class="tok-str">${escapeHtml(fullMatch)}</span>`;
    } else if (comment) {
      result += `<span class="tok-comment">${escapeHtml(fullMatch)}</span>`;
    } else if (decorator) {
      result += `<span class="tok-decorator">${escapeHtml(fullMatch)}</span>`;
    } else if (defClass) {
      const parts = fullMatch.split(/\s+/);
      const kw = parts[0];
      const name = parts.slice(1).join(' ');
      result += `<span class="tok-kw">${escapeHtml(kw)}</span> <span class="tok-fn">${escapeHtml(name)}</span>`;
    } else if (boolVal) {
      result += `<span class="tok-bool">${escapeHtml(fullMatch)}</span>`;
    } else if (selfIdent) {
      result += `<span class="tok-self">${escapeHtml(fullMatch)}</span>`;
    } else if (keyword) {
      result += `<span class="tok-kw">${escapeHtml(fullMatch)}</span>`;
    } else if (builtin) {
      result += `<span class="tok-builtin">${escapeHtml(fullMatch)}</span>`;
    } else if (numVal) {
      result += `<span class="tok-num">${escapeHtml(fullMatch)}</span>`;
    } else if (operator) {
      result += `<span class="tok-op">${escapeHtml(fullMatch)}</span>`;
    } else {
      result += escapeHtml(fullMatch);
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < code.length) {
    result += escapeHtml(code.substring(lastIndex));
  }

  return result;
}


const api = { escapeHtml, highlightPython };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CodeGOEditor = api;
})(globalThis);
