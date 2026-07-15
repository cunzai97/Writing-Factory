// ─── Novel Writer Types ────────────────────────

export interface NovelConfig {
  config: {
    title: string;
    genre: string;
    targetWordCount: number;
    model?: string;
    apiEndpoint?: string;
    apiKey?: string;
  };
  style: {
    tone: string;
    narrative: string;
    forbidden: string[];
  };
  context?: {
    fullChapters?: number; // Recent N chapters injected as full text (default 2)
  };
  characters: Character[];
  chapters: ChapterConfig[];
  chapterSets?: ChapterSet[]; // for novel plan grouping
}

export interface Character {
  name: string;
  age?: number;
  role: string;
  desc: string;
}

export interface ChapterConfig {
  chapter: number;
  goal: string;
  mustInclude?: string[];
  forbidden?: string[];
  beats: BeatConfig[];
}

export interface BeatConfig {
  label: string;
  wordBudget: number;
  task: string;
}

export interface ChapterSet {
  label: string;
  chapters: number[]; // [1, 5]
  summary?: string;
}

export interface ProjectState {
  currentChapter: number;
  currentBeat: number;
  totalChapters: number;
  writtenBeats: Record<string, BeatState>; // "ch03-beat02" -> { status, wordCount }
}

export interface BeatState {
  status: "written" | "pending";
  wordCount: number;
  writtenAt: string;
}

export interface GlobalConfig {
  defaultModel: string;
  defaultEndpoint: string;
  defaultApiKey: string;
  fallbackModel?: string;
}
