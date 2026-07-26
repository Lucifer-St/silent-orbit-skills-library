export const skillDetailScenes = [
  "distant-tidal-archive",
  "gravitational-wake",
  "severed-orbital-elevator",
  "spent-comet-archive",
  "buried-archive-vault",
  "dead-corona-terminal",
] as const;

export type SkillDetailScene = (typeof skillDetailScenes)[number];

export type SkillDetailLayout =
  | "orbital-specimen"
  | "tidal-window"
  | "signal-constellation";

interface SkillDetailSceneDefinition {
  readonly environment: string;
  readonly layout: SkillDetailLayout;
  readonly seal: string;
}

const cosmosRoot = "/assets/cosmos";

export const skillDetailSceneDefinitions = {
  "distant-tidal-archive": {
    environment: `${cosmosRoot}/environments/03-orphan-moon-tide-v01.png`,
    layout: "orbital-specimen",
    seal: `${cosmosRoot}/celestial/05-half-lit-moon.png`,
  },
  "gravitational-wake": {
    environment: `${cosmosRoot}/environments/11-gravity-lens-ghost-v01.png`,
    layout: "tidal-window",
    seal: `${cosmosRoot}/celestial/13-dark-corona-star.png`,
  },
  "severed-orbital-elevator": {
    environment: `${cosmosRoot}/environments/06-severed-orbital-elevator-v01.png`,
    layout: "signal-constellation",
    seal: `${cosmosRoot}/celestial/11-incomplete-orbital-ring.png`,
  },
  "spent-comet-archive": {
    environment: `${cosmosRoot}/environments/04-spent-comet-archive-v01.png`,
    layout: "orbital-specimen",
    seal: `${cosmosRoot}/celestial/09-comet.png`,
  },
  "buried-archive-vault": {
    environment: `${cosmosRoot}/environments/07-buried-archive-vault-v01.png`,
    layout: "tidal-window",
    seal: `${cosmosRoot}/relics/11-data-vault-capsule.png`,
  },
  "dead-corona-terminal": {
    environment: `${cosmosRoot}/environments/01-dead-corona-terminal-v01.png`,
    layout: "signal-constellation",
    seal: `${cosmosRoot}/celestial/13-dark-corona-star.png`,
  },
} as const satisfies Record<SkillDetailScene, SkillDetailSceneDefinition>;

export const defaultSkillDetailScene: SkillDetailScene = "distant-tidal-archive";

export function getSkillDetailSceneDefinition(
  scene: SkillDetailScene,
): SkillDetailSceneDefinition {
  return skillDetailSceneDefinitions[scene];
}

export function shuffleSkillDetailScenes(
  previousScene: SkillDetailScene | null,
  random: () => number = Math.random,
): SkillDetailScene[] {
  const bag = [...skillDetailScenes];

  for (let index = bag.length - 1; index > 0; index -= 1) {
    const sample = Math.min(Math.max(random(), 0), 0.999999999);
    const swapIndex = Math.floor(sample * (index + 1));
    [bag[index], bag[swapIndex]] = [bag[swapIndex], bag[index]];
  }

  if (previousScene && bag[0] === previousScene) {
    [bag[0], bag[1]] = [bag[1], bag[0]];
  }

  return bag;
}
