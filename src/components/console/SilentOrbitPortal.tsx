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
  { x: 20, y: 14 },
  { x: 78, y: 12 },
  { x: 127, y: 14 },
  { x: 142, y: 32 },
  { x: 136, y: 52 },
  { x: 108, y: 60 },
  { x: 78, y: 61 },
  { x: 46, y: 60 },
  { x: 18, y: 52 },
  { x: 16, y: 32 },
] as const;

const PORTAL_SYSTEM_ASSETS = [
  "/assets/system-ecliptic-a.png",
  "/assets/system-ecliptic-b.png",
  "/assets/system-ecliptic-c.png",
] as const;

const PORTAL_SYSTEM_MARKER_SIZE = 4.4;

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
          {model.systems.map((system, index) => {
            const position = PORTAL_SYSTEM_POSITIONS[index % PORTAL_SYSTEM_POSITIONS.length];
            const x = position.x;
            const y = position.y;
            const systemNumber = String(index + 1).padStart(2, "0");
            const markerAsset = PORTAL_SYSTEM_ASSETS[index % PORTAL_SYSTEM_ASSETS.length];
            return (
              <g
                className="portal-system-star"
                key={system.id}
                data-active={activeSystemId === system.id ? "true" : undefined}
                data-catalog-node-id={`system:${system.id}`}
                data-galaxy-region="system"
              >
                <title>{`${category(system.category)}: ${system.skillCount} Skills`}</title>
                <image
                  className="portal-system-visual"
                  data-system-marker-asset="distant-ecliptic"
                  href={markerAsset}
                  x={x - PORTAL_SYSTEM_MARKER_SIZE / 2}
                  y={y - PORTAL_SYSTEM_MARKER_SIZE / 2}
                  width={PORTAL_SYSTEM_MARKER_SIZE}
                  height={PORTAL_SYSTEM_MARKER_SIZE}
                  preserveAspectRatio="xMidYMid meet"
                />
                <text className="portal-system-index" x={x} y={y + 6} textAnchor="middle">{systemNumber}</text>
                <text className="portal-system-name" x={x} y={y + 9.7} textAnchor="middle">{category(system.category)}</text>
                <text className="portal-system-count" x={x} y={y + 13.5} textAnchor="middle">{system.skillCount} SKILLS</text>
              </g>
            );
          })}
        </svg>
        <div className="portal-system-actions" aria-label={text("直接进入功能分区", "Open a functional zone directly")}>
          {model.systems.map((system, index) => {
            const position = PORTAL_SYSTEM_POSITIONS[index % PORTAL_SYSTEM_POSITIONS.length];
            const style = {
              left: `${(position.x / 160) * 100}%`,
              top: `${(position.y / 76) * 100}%`,
            } as CSSProperties;
            return (
              <button
                className="portal-system-hit"
                key={system.id}
                style={style}
                type="button"
                aria-label={text(`打开 ${system.category}：${system.skillCount} Skills，${system.libraryCount} Libraries`, `Open ${category(system.category)}: ${system.skillCount} Skills, ${system.libraryCount} Libraries`)}
                data-system-id={system.id}
                data-orbit-return-id={`system:${system.id}`}
                onBlur={() => setActiveSystemId(null)}
                onClick={(event) => onOpenSystem(system, event.currentTarget)}
                onFocus={() => setActiveSystemId(system.id)}
                onMouseEnter={() => setActiveSystemId(system.id)}
                onMouseLeave={(event) => {
                  if (document.activeElement !== event.currentTarget) setActiveSystemId(null);
                }}
              />
            );
          })}
        </div>
      </div>
      <span className="portal-status">{model.systems.length} SYSTEMS / {model.skills.length} SKILLS</span>
    </section>
  );
}
