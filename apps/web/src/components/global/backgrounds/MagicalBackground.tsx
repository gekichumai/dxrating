import artworkUrl from '@/assets/magical-background.svg?url'
import kanaderaUrl from '@/assets/magical-kanadera.webp'
import './magical-background.css'

function Artwork({ name, viewBox = '0 0 2000 2400' }: { name: string; viewBox?: string }) {
  return (
    <svg
      className={`magical-background__layer magical-background__${name}`}
      viewBox={viewBox}
      aria-hidden="true"
      focusable="false"
    >
      <use href={`${artworkUrl}#${name.startsWith('edge-') ? 'edge-magic' : name}`} />
    </svg>
  )
}

/** CSS owns viewport adaptation so the initial SSR and hydrated scene are identical. */
export function MagicalBackground() {
  return (
    <div className="magical-background" aria-hidden="true">
      <Artwork name="paper" />
      <Artwork name="atmosphere" />
      <Artwork name="pattern" />
      <Artwork name="ribbons" />
      <Artwork name="clock" viewBox="-530 -530 1060 1060" />
      <Artwork name="edge-left" viewBox="-100 260 510 1920" />
      <Artwork name="edge-right" viewBox="1610 260 490 1920" />
      {/* This viewBox is centered on the artwork's measured optical centroid (1000, 1200). */}
      <Artwork name="emblems" viewBox="400 870 1200 660" />
      <Artwork name="lagoon" viewBox="0 1750 2000 650" />
      <Artwork name="lower-clock" viewBox="-520 -520 1040 1040" />
      <Artwork name="palace" viewBox="-140 -620 990 770" />
      <Artwork name="wand" viewBox="-75 -150 150 410" />
      <svg
        className="magical-background__layer magical-background__character"
        viewBox="0 0 460 810"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <clipPath id="magical-character-crop">
            <path d="M0 0H460V780H345V810H0Z" />
          </clipPath>
        </defs>
        <image
          href={kanaderaUrl}
          width="460"
          height="810"
          preserveAspectRatio="xMidYMid meet"
          clipPath="url(#magical-character-crop)"
        />
      </svg>
      <Artwork name="corners" />
    </div>
  )
}