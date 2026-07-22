import { QuartzComponent, QuartzComponentConstructor } from "./types"

// SPA-aware "← Back" button for the top bar. The frame only renders it on
// non-home pages; this script additionally hides it when there is no in-site
// history to return to (e.g. a fresh deep-link load). Styling lives in
// quartz/styles/custom.scss (.qg-back).
const BackButton: QuartzComponent = () => {
  return (
    <button type="button" class="qg-back" data-qg-back aria-label="Go back">
      <span class="qg-back-arrow" aria-hidden="true">←</span>
      <span>Back</span>
    </button>
  )
}

// Click wiring + visibility live in a global, delegation-based script in
// quartz/plugins/emitters/componentResources.ts, because bespoke frame
// components don't have their afterDOMLoaded scripts collected by the build.

export default (() => BackButton) satisfies QuartzComponentConstructor
