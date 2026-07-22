import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { pathToRoot } from "../util/path"

// Glowing brand orb + "the quiet garden" wordmark. Links to the site root.
// Rendered by the QuietGarden frame in the fixed top bar. Styling lives in
// quartz/styles/custom.scss (.qg-brand / .qg-orb / .qg-wordmark).
const BrandOrb: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const root = pathToRoot(fileData.slug!)
  return (
    <a href={root} class="qg-brand" aria-label="the quiet garden — home">
      <span class="qg-orb" aria-hidden="true" />
      <span class="qg-wordmark">the quiet garden</span>
    </a>
  )
}

export default (() => BrandOrb) satisfies QuartzComponentConstructor
