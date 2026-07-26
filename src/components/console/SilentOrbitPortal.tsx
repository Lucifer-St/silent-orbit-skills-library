import { useState } from "react";
import type { CSSProperties } from "react";
import type { OrbitMapModel, OrbitSystemNode } from "../../types";
import { useLocale } from "../../i18n/LocaleContext";

export interface SilentOrbitPortalProps {
  className?: string;
  model: OrbitMapModel;
  onOpenSystem: (system: OrbitSystemNode, trigger: HTMLButtonElement) => void;
}

const PORTAL_SYSTEM_POSITIONS = [
  { x: 20, y: 6.5, sector: "northwest" },
  { x: 78, y: 6.5, sector: "north" },
  { x: 127, y: 6.5, sector: "northeast" },
  { x: 142, y: 32, sector: "east" },
  { x: 136, y: 52, sector: "southeast" },
  { x: 108, y: 60, sector: "southeast" },
  { x: 78, y: 61, sector: "south" },
  { x: 46, y: 60, sector: "southwest" },
  { x: 18, y: 52, sector: "southwest" },
  { x: 16, y: 32, sector: "west" },
] as const;

const PORTAL_SYSTEM_ASSETS = [
  "/assets/system-ecliptic-a.png",
  "/assets/system-ecliptic-b.png",
  "/assets/system-ecliptic-c.png",
] as const;

const PORTAL_SYSTEM_LABEL_OFFSET = 4;

export function SilentOrbitPortal({
  className = "",
  model,
  onOpenSystem,
}: SilentOrbitPortalProps) {
  const { category, text } = useLocale();
  const [activeSystemId, setActiveSystemId] = useState<string | null>(null);

  return (
    <section
      className={`silent-orbit-portal ${className}`.trim()}
      aria-label={text("Silent Orbit 技能宇宙入口", "Silent Orbit Skill galaxy entrance")}
    >
      <div className="portal-map">
        <svg
          className="silent-orbit-preview"
          viewBox="0 0 160 76"
          preserveAspectRatio="xMidYMax slice"
          aria-hidden="true"
          focusable="false"
          data-catalog-skill-count={model.skills.length}
          data-catalog-system-count={model.systems.length}
          data-galaxy-renderer="raster-asset"
        >
          <image
            className="portal-galaxy-asset"
            data-galaxy-asset="horizon-drift-v3"
            href="/assets/galaxy-horizon-drift-v3.png"
            x="0"
            y="0"
            width="160"
            height="76"
            preserveAspectRatio="xMidYMax slice"
          />
          <g className="portal-catalog-traces" aria-hidden="true">
            {model.skills.map((skill) => (
              <g
                key={skill.id}
                data-catalog-node-id={skill.id}
                data-skill-trace={skill.id}
              />
            ))}
          </g>
          {model.systems.map((system) => (
            <g
              key={system.id}
              data-catalog-node-id={`system:${system.id}`}
              data-galaxy-region="system"
            />
          ))}
        </svg>
        <div className="portal-system-actions" aria-label={text("直接进入功能分区", "Open a functional zone directly")}>
          {model.systems.map((system, index) => {
            const position = PORTAL_SYSTEM_POSITIONS[index % PORTAL_SYSTEM_POSITIONS.length];
            const systemNumber = String(index + 1).padStart(2, "0");
            const markerAsset = PORTAL_SYSTEM_ASSETS[index % PORTAL_SYSTEM_ASSETS.length];
            const style = {
              left: `${(position.x / 160) * 100}%`,
              top: `${((position.y + PORTAL_SYSTEM_LABEL_OFFSET) / 76) * 100}%`,
            } as CSSProperties;
            return (
              <button
                className="portal-system-hit"
                key={system.id}
                style={style}
                type="button"
                aria-label={text(`打开 ${system.category}：${system.skillCount} Skills，${system.libraryCount} Libraries`, `Open ${category(system.category)}: ${system.skillCount} Skills, ${system.libraryCount} Libraries`)}
                data-active={activeSystemId === system.id ? "true" : undefined}
                data-system-id={system.id}
                data-orbit-return-id={`system:${system.id}`}
                data-system-sector={position.sector}
                data-system-visual-x={position.x}
                data-system-visual-y={position.y + PORTAL_SYSTEM_LABEL_OFFSET}
                onBlur={() => setActiveSystemId(null)}
                onClick={(event) => onOpenSystem(system, event.currentTarget)}
                onFocus={() => setActiveSystemId(system.id)}
                onMouseEnter={() => setActiveSystemId(system.id)}
                onMouseLeave={(event) => {
                  if (document.activeElement !== event.currentTarget) setActiveSystemId(null);
                }}
              >
                <img
                  alt=""
                  aria-hidden="true"
                  className="portal-system-visual"
                  data-system-marker-asset="distant-ecliptic"
                  src={markerAsset}
                />
                <span aria-hidden="true" className="portal-system-copy">
                  <span className="portal-system-index">{systemNumber}</span>
                  <span className="portal-system-name">{category(system.category)}</span>
                  <span className="portal-system-count">{system.skillCount} SKILLS</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <span className="portal-status">{model.systems.length} SYSTEMS / {model.skills.length} SKILLS</span>
    </section>
  );
}
