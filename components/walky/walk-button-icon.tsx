import { Check } from 'lucide-react';

export default function WalkButtonIcon({ done }: { done: boolean }) {
  return (
    <svg className="button-icon" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <filter
          id="walk-icon-deboss"
          x="-10%"
          y="-10%"
          width="120%"
          height="120%"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodColor="white" result="white" />
          <feComposite
            in="white"
            in2="SourceAlpha"
            operator="in"
            result="face"
          />
          <feOffset in="SourceAlpha" dy="1.4" result="offset" />
          <feComposite
            in="SourceAlpha"
            in2="offset"
            operator="out"
            result="inner-edge"
          />
          <feGaussianBlur
            in="inner-edge"
            stdDeviation="0.55"
            result="soft-edge"
          />
          <feFlood floodColor="#713519" floodOpacity="0.65" result="shadow" />
          <feComposite
            in="shadow"
            in2="soft-edge"
            operator="in"
            result="inset"
          />
          <feDropShadow
            in="face"
            dx="0"
            dy="0.8"
            stdDeviation="0.3"
            floodColor="white"
            floodOpacity="0.65"
            result="lower-rim"
          />
          <feMerge>
            <feMergeNode in="lower-rim" />
            <feMergeNode in="inset" />
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#walk-icon-deboss)">
        {done ? (
          <Check x="12" y="12" width="76" height="76" strokeWidth={2.7} />
        ) : (
          <image href="/walk.svg" width="100" height="100" />
        )}
      </g>
    </svg>
  );
}
