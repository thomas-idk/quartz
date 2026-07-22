import { QuartzComponent, QuartzComponentConstructor } from "./types"

// Ambient-sound mute toggle for the top bar. Muted by default. The generative
// pad, click wiring, and persistence live in the global enhancement script
// (quartz/static/qg-enhance.js). Styling: .qg-ambient in custom.scss.
const AmbientToggle: QuartzComponent = () => {
  return (
    <button
      type="button"
      class="qg-ambient"
      data-qg-ambient
      aria-label="Ambient sound (off)"
      aria-pressed="false"
      title="Ambient sound"
    >
      <svg class="qg-ambient-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path class="qg-spk" d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
        <path class="qg-wave qg-wave1" d="M16.5 8.8a4.6 4.6 0 0 1 0 6.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        <path class="qg-wave qg-wave2" d="M19.2 6.2a8.2 8.2 0 0 1 0 11.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        <line class="qg-mute" x1="3.2" y1="3.2" x2="20.8" y2="20.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
      </svg>
    </button>
  )
}

export default (() => AmbientToggle) satisfies QuartzComponentConstructor
