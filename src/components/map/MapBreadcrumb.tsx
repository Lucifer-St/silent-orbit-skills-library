interface MapBreadcrumbItem {
  readonly label: string;
  readonly onClick?: () => void;
}

interface MapBreadcrumbProps {
  readonly items: readonly MapBreadcrumbItem[];
}

export function MapBreadcrumb({ items }: MapBreadcrumbProps) {
  return (
    <nav className="map-breadcrumb" aria-label="Map breadcrumb">
      {items.map((item, index) => {
        const isCurrent = index === items.length - 1;

        return (
          <button
            key={`${item.label}-${index}`}
            type="button"
            disabled={!item.onClick}
            aria-current={isCurrent ? "page" : undefined}
            onClick={item.onClick}
          >
            {index > 0 && <span aria-hidden="true">/</span>}
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
