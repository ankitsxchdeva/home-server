// Everything the dashboard remembers lives in this iPad's browser storage.
// Nothing here is ever sent anywhere except the Home Assistant URL it names.

const KEY = "homeview.settings.v1";

export interface Settings {
  hassUrl: string;
  token: string;
  /** Entity ids hidden from the dashboard (long-press a tile → Hide). */
  hidden: string[];
  /** Optional title shown at the top of the Home tab. */
  title: string;
  /** Wallpaper preset id from wallpapers.ts. */
  wallpaper: string;
}

export const DEFAULT_URL = "https://ha.ankit.casa";

const empty: Settings = { hassUrl: DEFAULT_URL, token: "", hidden: [], title: "My Home", wallpaper: "dusk" };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...empty };
    return { ...empty, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...empty };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private mode or storage blocked: the dashboard still works for this visit.
  }
}

export function normalizeUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, "");
  if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
}
