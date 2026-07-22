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

BackButton.afterDOMLoaded = `
;(function () {
  function update() {
    var btn = document.querySelector('[data-qg-back]')
    if (!btn) return
    if (!btn.__qgWired) {
      btn.__qgWired = true
      btn.addEventListener('click', function () {
        if (window.history.length > 1) window.history.back()
      })
    }
    btn.style.visibility = window.history.length > 1 ? 'visible' : 'hidden'
  }
  document.addEventListener('nav', update)
  if (document.readyState !== 'loading') update()
  else document.addEventListener('DOMContentLoaded', update)
})()
`

export default (() => BackButton) satisfies QuartzComponentConstructor
