import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { FullSlug, resolveRelative } from "../util/path"

// ── The three folders Thomas curates on the home page ──────────────────────
// Edit these to change the cards (title / blurb). `prefix` is the folder's
// slug prefix; note counts are derived live from the vault at build time.
type Curated = { title: string; desc: string; prefix: string }
const CURATED: Curated[] = [
  {
    title: "Poetry",
    desc: "unfinished things, kept anyway",
    prefix: "✍️-writing/🌙-poetry/",
  },
  {
    title: "Personal Notes on Philosophy",
    desc: "hinge propositions & where reasons end",
    prefix: "✍️-writing/💡personal-notes-on-philosophy/",
  },
  {
    title: "Academics",
    desc: "philosophy, literature, science — the library, read & annotated",
    prefix: "academics/",
  },
]

const RECENTS_LIMIT = 5

function relTime(then: Date, now: Date): string {
  const s = Math.max(1, Math.floor((now.getTime() - then.getTime()) / 1000))
  const mins = Math.floor(s / 60)
  const hrs = Math.floor(s / 3600)
  const days = Math.floor(s / 86400)
  if (s < 60) return "just now"
  if (mins < 60) return `${mins} ${mins === 1 ? "minute" : "minutes"} ago`
  if (hrs < 24) return `${hrs} ${hrs === 1 ? "hour" : "hours"} ago`
  if (days === 1) return "yesterday"
  if (days < 7) return `${days} days ago`
  if (days < 30) {
    const w = Math.floor(days / 7)
    return `${w} ${w === 1 ? "week" : "weeks"} ago`
  }
  if (days < 365) {
    const m = Math.floor(days / 30)
    return `${m} ${m === 1 ? "month" : "months"} ago`
  }
  const y = Math.floor(days / 365)
  return `${y} ${y === 1 ? "year" : "years"} ago`
}

function prettifySegment(seg: string): string {
  // strip a leading emoji + spacing, tidy separators, title-case-ish
  const cleaned = seg
    .replace(/[-_]+/g, " ")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .trim()
  return cleaned || "Home"
}

const HomeIndex: QuartzComponent = ({ fileData, allFiles }: QuartzComponentProps) => {
  const here = fileData.slug!

  const isNote = (s: string) =>
    s !== "" && s !== "index" && !s.endsWith("/index") && !s.startsWith("tags/")
  const notes = allFiles.filter((f) => isNote((f as any).slug ?? ""))

  // live note counts per curated folder
  const cards = CURATED.map((c) => {
    const count = notes.filter((f) => ((f as any).slug ?? "").startsWith(c.prefix)).length
    return {
      title: c.title,
      desc: c.desc,
      href: resolveRelative(here, (c.prefix + "index") as FullSlug),
      countLabel: count === 1 ? "1 note" : `${count} notes`,
    }
  })

  // prefix → nice title, for the "recently edited" parent label. Seed with the
  // curated folders, then add any folder that ships its own index page.
  const folderTitle = new Map<string, string>()
  for (const c of CURATED) folderTitle.set(c.prefix, c.title)
  for (const f of allFiles) {
    const s = (f as any).slug ?? ""
    if (s.endsWith("/index")) {
      const t = (f as any).frontmatter?.title
      if (t) folderTitle.set(s.slice(0, -"index".length), t)
    }
  }
  const parentLabel = (slug: string): string => {
    const i = slug.lastIndexOf("/")
    if (i < 0) return "Home"
    const prefix = slug.slice(0, i + 1)
    return folderTitle.get(prefix) ?? prettifySegment(slug.slice(0, i).split("/").pop() ?? "")
  }

  const now = new Date()
  const recents = notes
    .map((f) => {
      const raw = (f as any).dates?.modified
      return { f, m: raw ? new Date(raw) : null }
    })
    .filter((x): x is { f: (typeof notes)[number]; m: Date } => x.m !== null && !isNaN(x.m.getTime()))
    .sort((a, b) => b.m.getTime() - a.m.getTime())
    .slice(0, RECENTS_LIMIT)
    .map(({ f, m }) => {
      const slug = (f as any).slug ?? ""
      return {
        title: (f as any).frontmatter?.title ?? slug.split("/").pop(),
        href: resolveRelative(here, slug as FullSlug),
        when: relTime(m, now),
        parent: parentLabel(slug),
      }
    })

  return (
    <div class="qg-home-panels">
      <div class="qg-home-main">
        <div class="qg-section-label">
          <span class="qg-rule" aria-hidden="true" />
          Explore
        </div>
        <div class="qg-cards">
          {cards.map((c) => (
            <a class="qg-card" href={c.href}>
              <span class="qg-card-icon" aria-hidden="true">
                <span class="qg-folder-tab" />
              </span>
              <span class="qg-card-title">{c.title}</span>
              <span class="qg-card-desc">{c.desc}</span>
              <span class="qg-card-count">{c.countLabel}&nbsp;→</span>
            </a>
          ))}
        </div>
      </div>

      {recents.length > 0 && (
        <aside class="qg-recents" aria-label="Recently edited">
          <div class="qg-recents-head">
            <span class="qg-recents-title">Recently edited</span>
            <span class="qg-recents-by">— thomas</span>
          </div>
          <div class="qg-recents-list">
            {recents.map((r) => (
              <a class="qg-recent" href={r.href}>
                <span class="qg-recent-t">{r.title}</span>
                <span class="qg-recent-m">
                  {r.when} · {r.parent}
                </span>
              </a>
            ))}
          </div>
        </aside>
      )}
    </div>
  )
}

export default (() => HomeIndex) satisfies QuartzComponentConstructor
