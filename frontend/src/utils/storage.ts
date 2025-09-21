export interface EmotionLogEntry {
  timestamp: string; // ISO8601
  dominant_emotion: string | null;
  age: number | null;
  dominant_gender: string | null;
  dominant_race: string | null;
}

export interface TranscriptLogEntry {
  // Common
  timestamp: string; // ISO8601 (保存時刻)
  text: string;
  // For server (faster-whisper)
  start?: number;
  end?: number;
  language?: string;
  language_probability?: number;
  // For browser (Web Speech)
  mode?: 'server' | 'browser';
}

// マルチモーダル（感情+ジェスチャー+テキスト）エントリ
export interface MultimodalEntry {
  timestamp: string;
  // text
  text: string;
  mode: 'server' | 'browser';
  start?: number;
  end?: number;
  // emotion snapshot
  emotion?: {
    dominant_emotion: string | null;
    emotion_scores?: { [k: string]: number } | null;
  };
  // gesture snapshot
  gesture?: {
    label?: string | null; // English label
    label_ja?: string | null; // Display label
    score?: number | null;
  } | null;
}

export interface GeminiAnalysisResult {
  timestamp: string; // when analyzed
  items: MultimodalEntry[]; // batch inputs
  summary: string; // 分析結果の要約
  emotion: string; // 推定主要感情
  intent?: string; // 意図
  inner_voice?: string; // 心の声
  confidence?: number; // 0-1
  raw?: any; // backendからの追加情報
}

const EMOTION_KEY = 'emotion_log';
const TRANSCRIPT_KEY = 'transcript_log';
const MULTIMODAL_PENDING_KEY = 'multimodal_pending';
const ANALYSIS_LOG_KEY = 'gemini_analysis_log';
const MAX_LOG_LENGTH = 500; // ログ肥大化の抑制用

function readJson<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function writeJson<T>(key: string, arr: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(arr));
  } catch {
    // ignore quota/serialization errors
  }
}

function appendWithCap<T>(key: string, entry: T) {
  const arr = readJson<T>(key);
  arr.push(entry);
  if (arr.length > MAX_LOG_LENGTH) {
    arr.splice(0, arr.length - MAX_LOG_LENGTH);
  }
  writeJson(key, arr);
}

export function appendEmotionLog(entry: Omit<EmotionLogEntry, 'timestamp'>) {
  appendWithCap<EmotionLogEntry>(EMOTION_KEY, {
    timestamp: new Date().toISOString(),
    ...entry,
  });
}

export function appendTranscriptServer(entry: {
  text: string;
  start?: number;
  end?: number;
  language?: string;
  language_probability?: number;
}) {
  appendWithCap<TranscriptLogEntry>(TRANSCRIPT_KEY, {
    timestamp: new Date().toISOString(),
    text: entry.text,
    start: entry.start,
    end: entry.end,
    language: entry.language,
    language_probability: entry.language_probability,
    mode: 'server',
  });
}

export function appendTranscriptBrowser(text: string) {
  appendWithCap<TranscriptLogEntry>(TRANSCRIPT_KEY, {
    timestamp: new Date().toISOString(),
    text,
    mode: 'browser',
  });
}

export function clearLogs() {
  localStorage.removeItem(EMOTION_KEY);
  localStorage.removeItem(TRANSCRIPT_KEY);
  localStorage.removeItem(MULTIMODAL_PENDING_KEY);
  localStorage.removeItem(ANALYSIS_LOG_KEY);
}

export function getEmotionLogs(): EmotionLogEntry[] {
  return readJson<EmotionLogEntry>(EMOTION_KEY);
}

export function getTranscriptLogs(): TranscriptLogEntry[] {
  return readJson<TranscriptLogEntry>(TRANSCRIPT_KEY);
}

// マルチモーダル: pendingバッファ
export function appendMultimodalPending(entry: MultimodalEntry) {
  appendWithCap<MultimodalEntry>(MULTIMODAL_PENDING_KEY, entry);
}

export function getMultimodalPending(): MultimodalEntry[] {
  return readJson<MultimodalEntry>(MULTIMODAL_PENDING_KEY);
}

export function clearMultimodalPending() {
  try { localStorage.removeItem(MULTIMODAL_PENDING_KEY); } catch {}
}

// 分析結果ログ
export function appendGeminiAnalysisLog(result: GeminiAnalysisResult) {
  appendWithCap<GeminiAnalysisResult>(ANALYSIS_LOG_KEY, result);
}

export function getGeminiAnalysisLogs(): GeminiAnalysisResult[] {
  return readJson<GeminiAnalysisResult>(ANALYSIS_LOG_KEY);
}
