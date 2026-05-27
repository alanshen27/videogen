/**
 * Try to resolve a search query to a brand/logo SVG on the SimpleIcons CDN.
 *
 * SimpleIcons (https://simpleicons.org) ships a CDN endpoint that returns
 * the canonical SVG for ~3000 brands by slug. When the LLM asks for things
 * like "Postgres logo" / "React icon" / "AWS mark", this gives us a clean
 * vector mark instead of a generic stock photo.
 *
 * Endpoint: `https://cdn.simpleicons.org/<slug>` \u2192 returns SVG (image/svg+xml).
 * We slugify the query, take the most-specific candidate, and probe it.
 * If 200 + SVG, we use it; otherwise we let the regular image search take
 * over.
 *
 * The slug list is hand-curated for the brands we actually expect in
 * technical / developer explainers. We don't ship the full SimpleIcons
 * data \u2014 that's 1.5 MB. Add entries as the gaps become obvious.
 */

const BRAND_ALIASES: Record<string, string> = {
  /* Languages */
  python: "python",
  javascript: "javascript",
  typescript: "typescript",
  rust: "rust",
  go: "go",
  golang: "go",
  java: "openjdk",
  kotlin: "kotlin",
  swift: "swift",
  ruby: "ruby",
  php: "php",
  c: "c",
  "c++": "cplusplus",
  cpp: "cplusplus",
  "c#": "csharp",
  csharp: "csharp",

  /* Frameworks / UI */
  react: "react",
  vue: "vuedotjs",
  "vue.js": "vuedotjs",
  vuejs: "vuedotjs",
  svelte: "svelte",
  angular: "angular",
  nextjs: "nextdotjs",
  "next.js": "nextdotjs",
  next: "nextdotjs",
  nuxt: "nuxtdotjs",
  remix: "remix",
  astro: "astro",
  tailwind: "tailwindcss",
  tailwindcss: "tailwindcss",
  bootstrap: "bootstrap",

  /* Runtimes / servers */
  nodejs: "nodedotjs",
  "node.js": "nodedotjs",
  node: "nodedotjs",
  deno: "deno",
  bun: "bun",
  nginx: "nginx",
  apache: "apache",
  express: "express",
  fastify: "fastify",
  fastapi: "fastapi",
  django: "django",
  flask: "flask",
  rails: "rubyonrails",
  laravel: "laravel",
  spring: "spring",

  /* Databases */
  postgres: "postgresql",
  postgresql: "postgresql",
  postgre: "postgresql",
  mysql: "mysql",
  mariadb: "mariadb",
  sqlite: "sqlite",
  mongodb: "mongodb",
  mongo: "mongodb",
  redis: "redis",
  cassandra: "apachecassandra",
  elasticsearch: "elasticsearch",
  clickhouse: "clickhouse",
  duckdb: "duckdb",
  cockroachdb: "cockroachlabs",
  dynamodb: "amazondynamodb",

  /* Cloud / infra */
  aws: "amazonaws",
  "amazon web services": "amazonaws",
  s3: "amazons3",
  ec2: "amazonec2",
  lambda: "awslambda",
  cloudwatch: "amazoncloudwatch",
  cloudfront: "amazoncloudfront",
  gcp: "googlecloud",
  "google cloud": "googlecloud",
  azure: "microsoftazure",
  cloudflare: "cloudflare",
  vercel: "vercel",
  netlify: "netlify",
  heroku: "heroku",
  digitalocean: "digitalocean",
  fly: "flydotio",
  "fly.io": "flydotio",
  railway: "railway",
  render: "render",

  /* Containers / orchestration */
  docker: "docker",
  kubernetes: "kubernetes",
  k8s: "kubernetes",
  helm: "helm",
  podman: "podman",
  terraform: "terraform",
  ansible: "ansible",

  /* Messaging / streaming */
  kafka: "apachekafka",
  rabbitmq: "rabbitmq",
  nats: "nats",
  pulsar: "apachepulsar",

  /* CI / VCS / repos */
  git: "git",
  github: "github",
  gitlab: "gitlab",
  bitbucket: "bitbucket",
  jenkins: "jenkins",
  circleci: "circleci",
  travis: "travisci",

  /* Observability */
  grafana: "grafana",
  prometheus: "prometheus",
  datadog: "datadog",
  sentry: "sentry",
  newrelic: "newrelic",
  opentelemetry: "opentelemetry",
  jaeger: "jaeger",

  /* Editors / shells */
  vscode: "vscodium",
  vim: "vim",
  neovim: "neovim",
  emacs: "gnuemacs",
  zsh: "zsh",
  bash: "gnubash",

  /* Misc */
  linux: "linux",
  ubuntu: "ubuntu",
  debian: "debian",
  arch: "archlinux",
  macos: "apple",
  windows: "windows11",
  nvidia: "nvidia",
  intel: "intel",
  amd: "amd",
  arm: "arm",
  graphql: "graphql",
  webpack: "webpack",
  vite: "vite",
  esbuild: "esbuild",
  prisma: "prisma",
  supabase: "supabase",
  firebase: "firebase",
  stripe: "stripe",
  paypal: "paypal",
  openai: "openai",
  anthropic: "anthropic",
  huggingface: "huggingface",
};

/**
 * Try to pull a brand name out of a free-form query.
 *
 * Examples:
 *   "Postgres logo on a dark background" \u2192 "postgres" \u2192 slug "postgresql"
 *   "AWS lambda icon"                   \u2192 "aws"      \u2192 slug "amazonaws"
 *   "diagram of microservices"          \u2192 null
 */
export function extractBrandSlug(rawQuery: string): string | null {
  if (!rawQuery) return null;
  /* Quick gate: queries that don't mention logo/icon/mark/brand usually
   * aren't asking for a vector mark. */
  const wantsBrand = /\b(logo|logos|icon|icons|mark|brand)\b/i.test(rawQuery);
  if (!wantsBrand) return null;
  const lower = rawQuery.toLowerCase();
  /* Longer aliases first so "amazon web services" beats "aws". */
  const aliases = Object.keys(BRAND_ALIASES).sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    /* Match as a word so "react" doesn't hit "reactor". */
    const re = new RegExp(`\\b${alias.replace(/[.+]/g, (m) => `\\${m}`)}\\b`, "i");
    if (re.test(lower)) return BRAND_ALIASES[alias]!;
  }
  return null;
}

/** Fetch the SVG bytes from SimpleIcons CDN. Returns null on any failure. */
export async function fetchSimpleIconSvg(
  slug: string
): Promise<string | null> {
  try {
    const url = `https://cdn.simpleicons.org/${slug}`;
    const response = await fetch(url, {
      headers: { Accept: "image/svg+xml,image/*" },
    });
    if (!response.ok) return null;
    const ct = response.headers.get("content-type") ?? "";
    if (!ct.includes("svg")) return null;
    const text = await response.text();
    if (!text.includes("<svg")) return null;
    return text;
  } catch {
    return null;
  }
}
