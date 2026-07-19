export type StarTier = "none" | "popular" | "star" | string;
export type Locale = "zh-CN" | "en-US";
export type SkillOrigin = "third-party" | "creator" | "system" | "unknown";
export type SkillVisibility = "public" | "creator-showcase" | "local-only";
export type LocalizedText = Partial<Record<Locale, string>>;

export interface SkillRecord {
  readonly name: string;
  readonly description: string;
  readonly trigger: string;
  readonly category: string;
  readonly library_key: string;
  readonly library_title: string;
  readonly library_page?: string;
  readonly status?: string;
  readonly frequency?: number;
  readonly importance?: number;
  readonly star_tier?: StarTier;
  readonly repo?: string | null;
  readonly repo_url?: string | null;
  readonly origin: SkillOrigin;
  readonly visibility: SkillVisibility;
  readonly description_i18n?: LocalizedText;
  readonly skill_page?: string;
  readonly [key: string]: unknown;
}

export interface SkillSearchQuery {
  readonly text: string;
  readonly category: string;
  readonly sourceKind: string;
  readonly starredOnly: boolean;
}

export interface RankedSkillResult {
  readonly skill: SkillRecord;
  readonly score: number;
}

export interface LibraryRecord {
  readonly key: string;
  readonly title: string;
  readonly kind: string;
  readonly kind_label?: string;
  readonly source_label?: string;
  readonly source_url?: string;
  readonly description?: string;
  readonly page?: string;
  readonly skills: readonly string[];
  readonly repos?: readonly string[];
  readonly plugins?: readonly string[];
  readonly categories?: readonly string[];
  readonly primary_category?: string;
  readonly status_counts?: Record<string, number>;
  readonly high_value_count?: number;
  readonly starred_count?: number;
  readonly [key: string]: unknown;
}

export interface CategoryUnit {
  readonly type: "library" | "skill" | string;
  readonly title: string;
  readonly kind?: string;
  readonly skill_count: number;
  readonly skills: readonly string[];
  readonly page?: string;
  readonly [key: string]: unknown;
}

export interface CategoryGroup {
  readonly category: string;
  readonly skill_count: number;
  readonly units: readonly CategoryUnit[];
}

export interface ChangeRecord {
  readonly id: string;
  readonly date?: string;
  readonly type?: string;
  readonly title: string;
  readonly summary?: string;
  readonly title_i18n?: LocalizedText;
  readonly summary_i18n?: LocalizedText;
  readonly [key: string]: unknown;
}

export interface StarredSkillRecord {
  readonly skill: string;
  readonly tier?: StarTier;
  readonly reason?: string;
  readonly addedAt?: string;
  readonly [key: string]: unknown;
}

export type MaintenanceChannelState = "current" | "update-available" | "unchecked" | "external" | "system-managed" | "error";

export interface MaintenanceChannelRecord {
  readonly id: "source-managed-global" | "plugins" | "system" | string;
  readonly state: MaintenanceChannelState;
  readonly checkedSources?: number;
  readonly execution: "local-codex" | "codex-runtime" | string;
}

export interface MaintenanceStatusRecord {
  readonly schemaVersion: 1;
  readonly snapshotDate: string;
  readonly privacy: "sanitized";
  readonly catalogSkills: number;
  readonly publicGlobalSkills: number;
  readonly publicationHandoff: {
    readonly productionAuthority: "public-github-main";
    readonly publicRepository: string;
    readonly requiredCheck: "release-gate";
    readonly deployProvider: "netlify";
    readonly directPrivateProductionDeploy: false;
  };
  readonly channels: readonly MaintenanceChannelRecord[];
  readonly handoffPrompt: LocalizedText;
}

export interface SkillSourceExample {
  readonly title: string;
  readonly summary?: string;
  readonly url: string;
}

export interface SkillDetailRecord {
  readonly skill: string;
  readonly author: string;
  readonly sourceSummary: string;
  readonly sourceUrl: string;
  readonly examples: readonly SkillSourceExample[];
}

export interface SkillOutcome {
  readonly id: string;
  readonly skillId: string;
  readonly title: string;
  readonly completedAt: string;
  readonly note?: string;
  readonly artifactRef?: string;
  readonly catalogRevision: string;
  readonly pinned?: boolean;
}

export interface SkillOutcomeTombstone {
  readonly skillId: string;
  readonly deletedAt: string;
  readonly unlockAt: string;
  readonly deletedCatalogRevision: string;
}

export interface PersonalDataV1 {
  readonly schemaVersion: 1;
  readonly outcomes: readonly SkillOutcome[];
  readonly tombstones: readonly SkillOutcomeTombstone[];
}

export type RelationEntityType = "skill" | "library" | "category";

export interface RelationEndpoint {
  readonly type: RelationEntityType;
  readonly id: string;
}

export interface RelationRecord {
  readonly id: string;
  readonly relation: string;
  readonly source: RelationEndpoint;
  readonly target: RelationEndpoint;
  readonly label?: string;
  readonly [key: string]: unknown;
}

export interface AppData {
  readonly generatedAt: string;
  readonly sourceDir: string;
  readonly skills: readonly SkillRecord[];
  readonly libraries: readonly LibraryRecord[];
  readonly categoryUnits: readonly CategoryGroup[];
  readonly personalSkills: readonly SkillRecord[];
  readonly changes: readonly ChangeRecord[];
  readonly starredSkills: readonly StarredSkillRecord[];
  readonly relations: readonly RelationRecord[];
  readonly skillDetails: readonly SkillDetailRecord[];
  readonly maintenanceStatus: MaintenanceStatusRecord;
}

export type PageKey = "librarian" | "catalog" | "category" | "private" | "sources" | "changes" | "maintenance" | "history";

export type MapLayer = "overview" | "zone" | "library" | "skill";
export type MapViewMode = "overview" | "category" | "library" | "search";

export interface MapPoint {
  readonly x: number;
  readonly y: number;
}

export interface FunctionZoneMapNode {
  readonly id: string;
  readonly category: string;
  readonly skillCount: number;
  readonly libraryCount: number;
  readonly position: MapPoint;
  readonly color: string;
}

export interface LibraryStationMapNode {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly skillCount: number;
  readonly highValueCount: number;
  readonly position: MapPoint;
  readonly libraryKey?: string;
  readonly sourceKind?: string;
  readonly page?: string;
  readonly isPrivateHomeBase: boolean;
}

export interface SkillDotMapNode {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly libraryKey: string;
  readonly stationId: string;
  readonly position: MapPoint;
  readonly isHighValue: boolean;
}

export interface SkillMapModel {
  readonly zones: readonly FunctionZoneMapNode[];
  readonly stations: readonly LibraryStationMapNode[];
  readonly skillDots: readonly SkillDotMapNode[];
}

export type AppSurface = "console" | "orbit";
export interface OrbitSystemNode extends FunctionZoneMapNode { readonly orbitIndex: number; }
export interface OrbitLibraryNode extends LibraryStationMapNode { readonly systemId: string; readonly orbitRadius: number; }
export interface OrbitSkillNode extends SkillDotMapNode { readonly stationId: string; readonly orbitRadius: number; }
export interface OrbitMapModel {
  readonly systems: readonly OrbitSystemNode[];
  readonly libraries: readonly OrbitLibraryNode[];
  readonly skills: readonly OrbitSkillNode[];
}
