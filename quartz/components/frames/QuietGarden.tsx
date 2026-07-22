import { PageFrame, PageFrameProps } from "./types"
import BrandOrbConstructor from "../BrandOrb"
import BackButtonConstructor from "../BackButton"
import HomeIndexConstructor from "../HomeIndex"

const BrandOrb = BrandOrbConstructor()
const BackButton = BackButtonConstructor()
const HomeIndex = HomeIndexConstructor()

/**
 * The Quiet Garden page frame.
 *
 * A single-column reading layout over the full-screen blackhole video: no left
 * file-explorer, a fixed top bar (brand orb + wordmark, ← Back, and the search
 * toolbar), a serif reading column, an optional sticky right rail ("On this
 * page" / TOC), and a bottom "Linked mentions" (backlinks) area. The home page
 * gets the hero (from index.md) followed by the curated folder cards + a
 * "Recently edited" panel.
 *
 * All the real Quartz features keep working — the toolbar `left` components
 * (search) and the `beforeBody` / `afterBody` / `right` slots are rendered
 * as-is, just repositioned. Visual styling lives in quartz/styles/custom.scss.
 */
export const QuietGardenFrame: PageFrame = {
  name: "quiet-garden",
  render({
    componentData,
    beforeBody,
    pageBody: Content,
    afterBody,
    left,
    right,
    footer: Footer,
  }: PageFrameProps) {
    const slug = (componentData.fileData.slug ?? "") as string
    const isHome = slug === "index"
    const isFolder = !isHome && slug.endsWith("/index")
    const isTag = slug.startsWith("tags/")
    const kind = isHome ? "home" : isFolder ? "folder" : isTag ? "tag" : "note"

    return (
      <>
        <header class="qg-topbar">
          <div class="qg-topbar-inner">
            {!isHome && <BackButton {...componentData} />}
            <BrandOrb {...componentData} />
            <div class="qg-flex-spacer" />
            <div class="qg-tools">
              {left.map((BarComponent) => (
                <BarComponent {...componentData} />
              ))}
            </div>
          </div>
        </header>

        <div class={`qg-shell qg-${kind}`}>
          <div class="qg-content-col">
            {!isHome && beforeBody.length > 0 && (
              <div class="popover-hint qg-beforebody">
                {beforeBody.map((BodyComponent) => (
                  <BodyComponent {...componentData} />
                ))}
              </div>
            )}

            <Content {...componentData} />

            {isHome && <HomeIndex {...componentData} />}

            {!isHome && afterBody.length > 0 && (
              <div class="qg-afterbody">
                {afterBody.map((BodyComponent) => (
                  <BodyComponent {...componentData} />
                ))}
              </div>
            )}
          </div>

          {!isHome && right.length > 0 && (
            <aside class="qg-right">
              {right.map((BodyComponent) => (
                <BodyComponent {...componentData} />
              ))}
            </aside>
          )}
        </div>

        <Footer {...componentData} />
      </>
    )
  },
}
