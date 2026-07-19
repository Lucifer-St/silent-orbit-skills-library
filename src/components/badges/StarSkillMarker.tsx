interface StarSkillMarkerProps {
  readonly label?: string;
  readonly compact?: boolean;
}

export function StarSkillMarker({ label = "High-value skill", compact = false }: StarSkillMarkerProps) {
  return (
    <span className={`star-skill-marker ${compact ? "compact" : ""}`} title={label} aria-label={label}>
      <span aria-hidden="true">✦</span>
      {!compact && <span>{label}</span>}
    </span>
  );
}
