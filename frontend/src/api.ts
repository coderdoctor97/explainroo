// Typed access to the studio API. Everything is relative, so the page works
// the same on localhost and behind a proxy.

export type Style = {
  id: string;
  name: string;
  blurb: string;
  theme: string;
  transition: string;
  music: string;
  fits: string;
  swatch: { bg: string; ink: string; muted: string; accent: string };
  fonts: Record<string, string>;
};

export type Look = {
  style: string;
  layout: 'sync' | 'cards' | 'poster';
  size: string;
  pace: number;
  captions: boolean | 'auto';
  music: boolean;
  watermark: boolean;
  transition: string;
  lead: number;
  hold: number;
  end: number;
};

export type PlanOptions = {
  strategy: 'sentences' | 'paragraphs' | 'fixed';
  wordsPerScene: number;
  maxSceneSeconds: number;
  minSceneSeconds: number;
  cuts: number[];
  merges: number[];
  // A null value removes the scene's override and brings the automatic one back.
  headings: Record<string, string | null>;
  keywords: Record<string, string[] | null>;
  assets: Record<string, string | null>;
};

export type Studio = { name: string; title: string; look: Look; plan: PlanOptions; updatedAt?: number };

export type Chip = { word: string; icon: string | null };
export type Word = {
  display: string;
  spoken?: string;
  index: number;
  para?: number;
  start: number;
  end: number;
  matched: boolean;
};

export type Scene = {
  id: string;
  index: number;
  from: number;
  to: number;
  heading: string;
  headingEdited: boolean;
  text: string;
  words: Word[];
  start: number;
  end: number;
  seconds: number;
  asset: string | null;
  chips: Chip[];
  number: { value: number; prefix: string; suffix: string; raw: string } | null;
  unmatched: number;
};

export type PlanStats = {
  words: number;
  duration: number;
  level: 'word' | 'segment';
  shape: string;
  ms: boolean;
  transcriptWords: number;
  scenes: number;
  matchRate: number;
  unmatched: number;
  audioDuration: number | null;
  audioSampleRate: number | null;
  endsAt: number;
};

export type PlanAnswer = { scenes: Scene[]; stats: PlanStats; words: Word[]; warnings: string[] };

export type Slot = { ok: boolean; bytes: number; mtime: number | null; name: string };
export type Sources = { transcript: Slot; timestamps: Slot; audio: Slot; assets: { name: string; bytes: number }[] };

export type SceneSummary = { id: string; heading: string; seconds: number; words: number; chips: string[]; hasVoice: boolean };

export type Report = {
  builtAt: number;
  title: string;
  style: string;
  layout: string;
  size: string;
  theme: string;
  config: { pace: number; captions: boolean; music: string | false; transition: string; watermark: string | false };
  duration: number;
  voiceSeconds: number;
  stats: PlanStats;
  scenes: SceneSummary[];
  missing: string[];
  warnings: string[];
  files: { video: string; script: string; scenes: string; voice: string };
};

export type ProjectStatus = {
  sources: Sources;
  report: Report | null;
  built: boolean;
  voice: { wavs: number; cached: number } | null;
  out: { video?: { bytes: number; mtime: number }; draft?: { bytes: number; mtime: number } } | null;
  stills?: string[];
  missing: string[];
};

export type ProjectSummary = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  built: boolean;
  rendered: boolean;
  renderedAt: number | null;
  hasSources: number;
};

export type DoctorRow = { name: string; ok: boolean; detail: string; need?: string; optional?: boolean };
export type Doctor = { rows: DoctorRow[]; ready: boolean; platform: string };

export type JobProgress = {
  phase: string;
  done: number | null;
  total: number | null;
  percent: number | null;
  detail: string | null;
};

export type Job = {
  id: string;
  projectId: string;
  kind: string;
  label: string;
  status: 'running' | 'done' | 'error';
  error: string | null;
  result: unknown;
  startedAt: number;
  endedAt: number | null;
  updatedAt: number | null;
  progress: JobProgress | null;
  lines: string[];
};

export type ProjectState = {
  id: string;
  studio: Studio;
  status: ProjectStatus;
  project: ProjectSummary | null;
  styles: Style[];
  layouts: Record<string, string>;
  sizes: string[];
  transitions: string[];
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body instanceof Blob ? init?.headers : { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text.slice(0, 300) };
  }
  if (!res.ok) throw new Error((data as { error?: string })?.error || `${res.status} ${res.statusText}`);
  return data as T;
}

const put = (path: string, body: BodyInit, type?: string) =>
  call<Record<string, unknown>>(path, { method: 'PUT', body, headers: type ? { 'Content-Type': type } : undefined });

export const api = {
  projects: () => call<{ projects: ProjectSummary[]; last: string | null }>('/projects'),
  create: (name: string) => call<{ id: string }>('/projects', { method: 'POST', body: JSON.stringify({ name }) }),
  remove: (id: string) => call<{ ok: true }>(`/projects/${id}`, { method: 'DELETE' }),
  state: (id: string) => call<ProjectState>(`/projects/${id}`),
  patch: (id: string, patch: Partial<Studio>) => call<{ studio: Studio }>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  plan: (id: string) => call<PlanAnswer>(`/projects/${id}/plan`),
  upload: (id: string, kind: 'transcript' | 'timestamps' | 'audio', file: File) =>
    put(`/projects/${id}/source?kind=${kind}`, file, file.type || 'application/octet-stream'),
  removeSource: (id: string, kind: string) => call<{ ok: true }>(`/projects/${id}/source?kind=${kind}`, { method: 'DELETE' }),
  uploadAsset: (id: string, name: string, file: File) =>
    put(`/projects/${id}/asset?name=${encodeURIComponent(name)}`, file, file.type || 'application/octet-stream'),
  analyze: (id: string) => call<Job>(`/projects/${id}/analyze`, { method: 'POST' }),
  makeTimestamps: (id: string) => call<Job>(`/projects/${id}/timestamps`, { method: 'POST' }),
  build: (id: string) => call<Job>(`/projects/${id}/build`, { method: 'POST' }),
  render: (id: string, body: { draft?: boolean } = {}) => call<Job>(`/projects/${id}/render`, { method: 'POST', body: JSON.stringify(body) }),
  check: (id: string) => call<Job>(`/projects/${id}/check`, { method: 'POST' }),
  still: (id: string, specs: string[] = []) => call<Job>(`/projects/${id}/still`, { method: 'POST', body: JSON.stringify({ specs }) }),
  job: (id: string) => call<Job>(`/jobs/${id}`),
  latestJob: (id: string) => call<Job | null>(`/projects/${id}/job`),
  doctor: () => call<Doctor>('/doctor'),
  fileUrl: (id: string, path: string) => `/api/projects/${id}/file?path=${encodeURIComponent(path)}`,
  audioUrl: (id: string) => `/api/projects/${id}/audio`,
  icon: (name: string) => call<{ name: string; paths: string[] }>(`/icons/${encodeURIComponent(name)}`),
  iconSearch: (q: string) => call<{ matches: string[] }>(`/icons?q=${encodeURIComponent(q)}`),
};

export const fmtTime = (s: number): string => {
  const total = Math.max(0, s);
  const m = Math.floor(total / 60);
  const rest = total - m * 60;
  return `${m}:${rest.toFixed(1).padStart(4, '0')}`;
};

export const fmtBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};
