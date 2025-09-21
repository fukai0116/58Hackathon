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

const EMOTION_KEY = 'emotion_log';
const TRANSCRIPT_KEY = 'transcript_log';
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
}

export function getEmotionLogs(): EmotionLogEntry[] {
  return readJson<EmotionLogEntry>(EMOTION_KEY);
}

export function getTranscriptLogs(): TranscriptLogEntry[] {
  return readJson<TranscriptLogEntry>(TRANSCRIPT_KEY);
}

