interface ZoomControlsProps {
  readonly scaleLabel: string;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onReset: () => void;
}

export function ZoomControls({ scaleLabel, onZoomIn, onZoomOut, onReset }: ZoomControlsProps) {
  return (
    <div className="zoom-controls" role="group" aria-label="Map zoom controls">
      <button type="button" onClick={onZoomOut} aria-label="Zoom out" aria-keyshortcuts="-">
        -
      </button>
      <button type="button" onClick={onReset} aria-label="Fit map to current focus" aria-keyshortcuts="0 Home">
        {scaleLabel}
      </button>
      <button type="button" onClick={onZoomIn} aria-label="Zoom in" aria-keyshortcuts="+">
        +
      </button>
    </div>
  );
}
