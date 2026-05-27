import { sanitizeInlineSvg } from "../src/server/tools/svg-sanitize";

function check(name: string, input: string, predicate: (out: string | null) => boolean) {
  const out = sanitizeInlineSvg(input);
  const ok = predicate(out);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) console.log("  GOT:", JSON.stringify(out));
}

console.log("=== Allowlist ===");
check(
  "basic svg passes",
  `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" stroke="#d97c75" fill="none"/></svg>`,
  (o) => o !== null && o.includes("<circle")
);

check(
  "preserves viewBox + xmlns",
  `<svg viewBox="0 0 100 100"><rect x="0" y="0" width="100" height="100" fill="#d97c75"/></svg>`,
  (o) => o !== null && o.includes('viewBox="0 0 100 100"') && o.includes("xmlns=")
);

check(
  "text element preserved with attrs",
  `<svg viewBox="0 0 200 80"><text x="10" y="40" font-family="ui-sans-serif" font-size="20" fill="#f4ede5">hello</text></svg>`,
  (o) => o !== null && o.includes("hello") && o.includes("font-size")
);

console.log("\n=== Denylist ===");
check(
  "script entire input rejected (fail-closed)",
  `<svg><script>alert(1)</script><circle cx="0" cy="0" r="5"/></svg>`,
  (o) => o === null
);

check(
  "onclick stripped",
  `<svg><rect x="0" y="0" width="10" height="10" onclick="alert(1)"/></svg>`,
  (o) => o !== null && !o.toLowerCase().includes("onclick")
);

check(
  "javascript: href rejected",
  `<svg><use href="javascript:alert(1)"/></svg>`,
  (o) => o !== null && !o.includes("javascript")
);

check(
  "external image stripped",
  `<svg><image href="https://evil.com/track.png" x="0" y="0" width="10" height="10"/></svg>`,
  (o) => o !== null && !o.includes("image") && !o.includes("evil.com")
);

check(
  "foreignObject stripped + content gone",
  `<svg><foreignObject><iframe src="//evil"></iframe></foreignObject><circle r="5"/></svg>`,
  (o) => o !== null && !o.toLowerCase().includes("foreign") && !o.includes("iframe") && o.includes("<circle")
);

check(
  "style tag stripped (CSS @import surface)",
  `<svg><style>@import url(//evil)</style><rect width="10" height="10"/></svg>`,
  (o) => o !== null && !o.includes("style") && !o.includes("evil")
);

check(
  "anchor tag stripped",
  `<svg><a href="javascript:alert(1)"><circle r="5"/></a></svg>`,
  (o) => o !== null && !o.includes("javascript") && o.includes("<circle")
);

check(
  "style attribute stripped",
  `<svg><rect width="10" height="10" style="background: url(//evil)"/></svg>`,
  (o) => o !== null && !o.includes("style=") && !o.includes("evil")
);

check(
  "expression() in attribute rejected",
  `<svg><rect width="expression(alert(1))" height="10"/></svg>`,
  (o) => o !== null && !o.includes("expression")
);

console.log("\n=== Edge cases ===");
check(
  "garbage input rejected",
  `not svg at all`,
  (o) => o === null
);

check(
  "comments stripped",
  `<svg><!-- comment --><circle r="5"/></svg>`,
  (o) => o !== null && !o.includes("comment")
);

check(
  "unclosed tag tolerant",
  `<svg><circle r="5"`,
  (o) => o !== null && o.includes("circle")
);

check(
  "nested allowed tags preserved",
  `<svg><g transform="translate(50 50)"><circle r="40" stroke="#d97c75" fill="none"/></g></svg>`,
  (o) => o !== null && o.includes("<g") && o.includes("</g>") && o.includes("circle")
);

check(
  "gradient and stops preserved",
  `<svg><defs><linearGradient id="g"><stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="#000"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/></svg>`,
  (o) => o !== null && o.includes("linearGradient") && o.includes("url(#g)")
);

check(
  "url(http://...) in fill rejected",
  `<svg><rect width="10" height="10" fill="url(http://evil)"/></svg>`,
  (o) => o !== null && !o.includes("evil")
);
