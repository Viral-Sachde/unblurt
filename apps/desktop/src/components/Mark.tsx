// The unblurt symbol: teal speech shape, persimmon thought escaping, two strokes of energy.
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <mask id="ub-bite">
          <rect width="64" height="64" fill="#fff" />
          <circle cx="44" cy="41" r="13.5" fill="#000" />
        </mask>
      </defs>
      <g mask="url(#ub-bite)" fill="var(--teal)">
        <rect x="4" y="11" width="42" height="40" rx="13" />
        <path d="M9 40 Q8 52 5.5 58.5 Q15 55 23 47 Z" />
      </g>
      <circle cx="44" cy="41" r="10" fill="var(--persimmon)" />
      <path
        d="M46 23.5 L50.5 16 M53.5 27 L59 20.5"
        stroke="var(--ink)"
        strokeWidth="3.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
