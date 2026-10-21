import type { CompletionUsage, PageContent } from '@umwelt/gen-service';

export interface AttemptRecord {
  valid: boolean;
  refused: boolean;
  error?: string;
  stopReason: string;
  ttftMs: number | null;
  totalMs: number;
  usage: CompletionUsage;
  costUsd: number;
  /** Kept only for failed attempts, for debugging. */
  rawText?: string;
}

export interface GenerationRecord {
  key: string;
  model: string;
  urlId: string;
  url: string;
  pageType: string;
  profileId: string;
  promptVersion: string;
  status: 'ok' | 'refused' | 'invalid' | 'error';
  error?: string;
  attempts: AttemptRecord[];
  content?: PageContent;
  ts: string;
}

export interface Judgment {
  axes: Record<string, { relevant: boolean; fit: number; softened: boolean }>;
  plausibility: number;
  boundary_violation: boolean;
  note: string;
}

export interface JudgmentRecord {
  key: string;
  judgeModel: string;
  promptVersion: string;
  status: 'ok' | 'invalid' | 'error';
  error?: string;
  judgment?: Judgment;
  costUsd: number;
  ts: string;
}

export interface RunMeta {
  runId: string;
  createdAt: string;
  worldDate: string;
  contentPrompt: string;
}

export const recordKey = (model: string, urlId: string, profileId: string): string => `${model}|${urlId}|${profileId}`;
