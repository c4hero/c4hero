// Technology icons (TEA-381). The curated set of Simple Icons c4hero ships,
// and the rules for which one a node shows.
//
// An element shows an icon when either
//   - its `c4hero.icon` property names one (picked in the inspector), or
//   - its technology string matches one of the aliases below (auto-detect).
// `c4hero.icon` set to `none` turns auto-detect off for that element.
//
// This module is synchronous and small. The SVG paths live in ./catalog,
// which is loaded lazily the first time a node needs an icon.

/** Element property that pins an icon slug, or `none` to hide the icon. */
export const TECH_ICON_PROPERTY = 'c4hero.icon'
export const TECH_ICON_NONE = 'none'

/**
 * Slug (as Simple Icons names it) → aliases, in normalized form (see
 * normalizeTech). The slug itself and its display title are not implied:
 * list every spelling that should match. Simple Icons has no Java, AWS or
 * Azure marks (removed at the trademark owners' request), so Java maps to
 * the OpenJDK mark and the clouds fall back to the type glyph.
 */
const ALIASES = {
  // Languages and runtimes
  kotlin: ['kotlin'],
  openjdk: ['java', 'openjdk', 'jdk', 'jvm'],
  python: ['python', 'python3'],
  go: ['go', 'golang'],
  rust: ['rust'],
  typescript: ['typescript', 'ts'],
  javascript: ['javascript', 'js', 'ecmascript'],
  nodedotjs: ['node', 'node.js', 'nodejs'],
  deno: ['deno'],
  bun: ['bun'],
  dotnet: ['.net', 'dotnet', '.net core', 'asp.net', 'asp.net core', 'c#', 'csharp', 'f#', 'fsharp'],
  php: ['php'],
  ruby: ['ruby'],
  rubyonrails: ['rails', 'ruby on rails', 'ror'],
  elixir: ['elixir', 'phoenix'],
  scala: ['scala'],
  swift: ['swift', 'swiftui'],
  dart: ['dart'],
  flutter: ['flutter'],
  cplusplus: ['c++', 'cpp'],
  c: ['c'],
  haskell: ['haskell'],
  clojure: ['clojure'],
  erlang: ['erlang'],
  r: ['r'],
  julia: ['julia'],
  perl: ['perl'],
  lua: ['lua'],
  // Front end
  react: ['react', 'react.js', 'reactjs', 'react native', 'react-native'],
  nextdotjs: ['next', 'next.js', 'nextjs'],
  vuedotjs: ['vue', 'vue.js', 'vuejs'],
  nuxt: ['nuxt', 'nuxt.js', 'nuxtjs'],
  angular: ['angular', 'angularjs'],
  svelte: ['svelte', 'sveltekit'],
  astro: ['astro'],
  remix: ['remix'],
  solid: ['solid', 'solidjs', 'solid.js'],
  preact: ['preact'],
  jquery: ['jquery'],
  tailwindcss: ['tailwind', 'tailwindcss', 'tailwind css'],
  redux: ['redux'],
  electron: ['electron'],
  ionic: ['ionic'],
  // Back-end frameworks
  springboot: ['spring boot', 'springboot'],
  spring: ['spring', 'spring framework', 'spring cloud', 'spring webflux'],
  quarkus: ['quarkus'],
  ktor: ['ktor'],
  django: ['django'],
  flask: ['flask'],
  fastapi: ['fastapi'],
  express: ['express', 'express.js', 'expressjs'],
  nestjs: ['nest', 'nestjs', 'nest.js'],
  fastify: ['fastify'],
  laravel: ['laravel'],
  symfony: ['symfony'],
  hono: ['hono'],
  koa: ['koa'],
  // Data stores
  postgresql: ['postgres', 'postgresql', 'psql', 'aurora postgresql'],
  mysql: ['mysql', 'aurora mysql'],
  mariadb: ['mariadb'],
  sqlite: ['sqlite'],
  mongodb: ['mongo', 'mongodb', 'documentdb'],
  redis: ['redis', 'elasticache', 'valkey'],
  apachecassandra: ['cassandra', 'apache cassandra', 'scylladb'],
  couchbase: ['couchbase'],
  neo4j: ['neo4j'],
  elasticsearch: ['elasticsearch', 'elastic search'],
  opensearch: ['opensearch'],
  clickhouse: ['clickhouse'],
  cockroachlabs: ['cockroachdb', 'cockroach'],
  snowflake: ['snowflake'],
  databricks: ['databricks'],
  supabase: ['supabase'],
  firebase: ['firebase', 'firestore'],
  influxdb: ['influxdb', 'influx'],
  timescale: ['timescale', 'timescaledb'],
  duckdb: ['duckdb'],
  prisma: ['prisma'],
  // Messaging and workflows
  apachekafka: ['kafka', 'apache kafka', 'kafka streams', 'msk', 'confluent'],
  rabbitmq: ['rabbitmq', 'rabbit mq', 'amqp'],
  apachepulsar: ['pulsar', 'apache pulsar'],
  natsdotio: ['nats', 'nats.io', 'jetstream'],
  mqtt: ['mqtt'],
  celery: ['celery'],
  temporal: ['temporal'],
  apacheairflow: ['airflow', 'apache airflow'],
  apachespark: ['spark', 'apache spark', 'pyspark'],
  apacheflink: ['flink', 'apache flink'],
  // Platform and infrastructure
  docker: ['docker', 'docker compose'],
  kubernetes: ['kubernetes', 'k8s', 'eks', 'aks', 'gke'],
  helm: ['helm'],
  terraform: ['terraform'],
  ansible: ['ansible'],
  pulumi: ['pulumi'],
  nginx: ['nginx'],
  apache: ['apache', 'apache httpd', 'httpd'],
  caddy: ['caddy'],
  traefikproxy: ['traefik'],
  envoyproxy: ['envoy'],
  istio: ['istio'],
  linkerd: ['linkerd'],
  consul: ['consul'],
  vault: ['vault', 'hashicorp vault'],
  argo: ['argo', 'argo cd', 'argocd', 'argo workflows'],
  jenkins: ['jenkins'],
  githubactions: ['github actions'],
  gitlab: ['gitlab', 'gitlab ci'],
  circleci: ['circleci'],
  googlecloud: ['gcp', 'google cloud', 'google cloud platform', 'cloud run', 'cloud functions'],
  cloudflare: ['cloudflare', 'cloudflare workers'],
  vercel: ['vercel'],
  netlify: ['netlify'],
  digitalocean: ['digitalocean'],
  flydotio: ['fly.io', 'fly'],
  // Observability
  prometheus: ['prometheus'],
  grafana: ['grafana', 'loki'],
  datadog: ['datadog'],
  newrelic: ['new relic', 'newrelic'],
  sentry: ['sentry'],
  opentelemetry: ['opentelemetry', 'otel'],
  elastic: ['elastic', 'elk', 'elastic stack'],
  kibana: ['kibana'],
  splunk: ['splunk'],
  // APIs and SaaS
  graphql: ['graphql'],
  apollographql: ['apollo', 'apollo graphql', 'apollo server', 'apollo federation'],
  swagger: ['swagger'],
  openapiinitiative: ['openapi'],
  postman: ['postman'],
  stripe: ['stripe'],
  auth0: ['auth0'],
  okta: ['okta'],
  keycloak: ['keycloak'],
  anthropic: ['anthropic', 'claude'],
  huggingface: ['hugging face', 'huggingface'],
  pytorch: ['pytorch'],
  tensorflow: ['tensorflow'],
  langchain: ['langchain'],
  // Source control, platforms, CMS
  github: ['github'],
  git: ['git'],
  bitbucket: ['bitbucket'],
  android: ['android'],
  ios: ['ios'],
  apple: ['macos', 'apple'],
  linux: ['linux'],
  wordpress: ['wordpress'],
  shopify: ['shopify'],
  contentful: ['contentful'],
  strapi: ['strapi'],
  sanity: ['sanity'],
  minio: ['minio'],
  ceph: ['ceph'],
} as const satisfies Record<string, readonly string[]>

export type TechIconSlug = keyof typeof ALIASES

/** Every slug c4hero can draw, in the order the picker lists them. */
export const TECH_ICON_SLUGS = Object.keys(ALIASES) as TechIconSlug[]

export function isTechIconSlug(value: string | undefined): value is TechIconSlug {
  return value !== undefined && Object.hasOwn(ALIASES, value)
}

const ALIAS_TO_SLUG: ReadonlyMap<string, TechIconSlug> = new Map(
  TECH_ICON_SLUGS.flatMap((slug) => ALIASES[slug].map((alias) => [alias, slug] as const)),
)

/** Searchable text for a slug (its aliases), for the inspector's filter. */
export function techIconSearchText(slug: TechIconSlug): string {
  return `${slug} ${ALIASES[slug].join(' ')}`
}

/**
 * Lowercase, collapse whitespace, and drop a trailing version
 * ("Java 21", "PostgreSQL 16.2", "Node.js v20", "Python 3.x").
 */
export function normalizeTech(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+v?\d+(\.[\dx]+)*(\+|\s*lts)?$/, '')
    .trim()
}

/** Split a technology string into its parts. Commas are the canonical
 *  separator in c4hero; slashes, semicolons, pipes, "+" between words and
 *  parenthesized qualifiers ("Spring Boot (Kotlin)") are common by hand. */
function techParts(technology: string): string[] {
  return technology
    .split(/[,;|/()]|\s\+\s|\sand\s|\s&\s/i)
    .map(normalizeTech)
    .filter(Boolean)
}

/** Aliases at least this long may match as a word inside a longer part
 *  ("Kotlin service" → kotlin). Shorter ones (`go`, `c`, `r`, `js`) only
 *  match a whole part, so "Go to market" never becomes Go. */
const MIN_WORD_ALIAS = 4

/** Aliases that are ordinary words, or prefixes of other products
 *  ("Elastic Beanstalk", "Apache Camel"), so they only match a whole part. */
const WHOLE_PART_ONLY: ReadonlySet<string> = new Set([
  'apache', 'elastic', 'vault', 'temporal', 'solid', 'remix', 'sanity', 'express', 'apple', 'nest', 'next', 'fly', 'argo', 'swift',
])

/**
 * The icon a technology string implies, or undefined. Parts are tried in
 * order and a whole-part match beats a word match anywhere, so
 * "Kotlin, Micronaut" is Kotlin and "Micronaut on Java" is Java.
 */
export function matchTechIcon(technology: string | undefined): TechIconSlug | undefined {
  if (!technology) return undefined
  const parts = techParts(technology)
  for (const part of parts) {
    const exact = ALIAS_TO_SLUG.get(part)
    if (exact) return exact
  }
  for (const part of parts) {
    const words = part.split(' ')
    // Longest phrase first, so "spring boot" wins over "spring".
    for (let len = Math.min(words.length, 3); len >= 1; len--) {
      for (let i = 0; i + len <= words.length; i++) {
        const phrase = words.slice(i, i + len).join(' ')
        if (phrase.length < MIN_WORD_ALIAS || WHOLE_PART_ONLY.has(phrase)) continue
        const slug = ALIAS_TO_SLUG.get(phrase)
        if (slug) return slug
      }
    }
  }
  return undefined
}

/**
 * The icon an element shows: its pinned `c4hero.icon` when that names a
 * known slug, nothing when it is `none`, otherwise auto-detected from
 * `technology`. An unknown pinned slug (hand-written, or from a newer
 * c4hero) falls back to auto-detect rather than hiding the icon.
 */
export function resolveTechIcon(properties: Record<string, string> | undefined, technology: string | undefined): TechIconSlug | undefined {
  const pinned = properties?.[TECH_ICON_PROPERTY]?.trim().toLowerCase()
  if (pinned === TECH_ICON_NONE) return undefined
  if (isTechIconSlug(pinned)) return pinned
  return matchTechIcon(technology)
}

// ─── Colour ─────────────────────────────────────────────────────────

function luminance(hex: string): number | undefined {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return undefined
  const n = parseInt(m[1], 16)
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** Below this, a brand colour is too close to the node fill to read
 *  (Kafka's near-black on a dark canvas, Unity's white on a light one). */
export const MIN_ICON_CONTRAST = 2

/**
 * Colour to draw a brand mark in. Uses the brand hex unless it lacks
 * contrast against `background` (a hex fill; when the fill is a CSS
 * variable, pass the canvas's representative fill instead), in which case
 * `fallback` (the node's type colour) is used.
 */
export function techIconColor(hex: string, background: string, fallback: string): string {
  const fg = luminance(hex)
  const bg = luminance(background)
  if (fg === undefined || bg === undefined) return fallback
  return contrast(fg, bg) >= MIN_ICON_CONTRAST ? `#${hex.replace(/^#/, '')}` : fallback
}
