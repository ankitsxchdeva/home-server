import type { HassEntities, HassEntity } from "home-assistant-js-websocket";
import type { Registries } from "./ha";

/** Domains that get a tile. Order is the order tiles appear inside a room. */
export const TILE_DOMAINS = [
  "climate",
  "light",
  "fan",
  "humidifier",
  "switch",
  "cover",
  "lock",
  "media_player",
  "sensor",
] as const;

export type TileDomain = (typeof TILE_DOMAINS)[number];

/** Sensors are noisy; only these kinds get a tile. */
const SENSOR_CLASSES = new Set(["temperature", "humidity", "aqi", "pm25", "carbon_dioxide"]);

export interface Room {
  id: string;
  name: string;
  tiles: HassEntity[];
  scenes: HassEntity[];
}

export const NO_ROOM = "__default";

export function domainOf(entityId: string): string {
  return entityId.slice(0, entityId.indexOf("."));
}

export function friendlyName(e: HassEntity, roomName?: string): string {
  let name = (e.attributes.friendly_name as string | undefined) ?? e.entity_id.split(".")[1].replace(/_/g, " ");
  // Apple Home drops the room name from tiles inside that room ("Bedroom Lamp" → "Lamp").
  if (roomName && name.toLowerCase().startsWith(roomName.toLowerCase() + " ")) {
    const rest = name.slice(roomName.length + 1);
    if (rest.length > 1) name = rest.charAt(0).toUpperCase() + rest.slice(1);
  }
  return name;
}

function wantsTile(e: HassEntity): boolean {
  const domain = domainOf(e.entity_id);
  if (!(TILE_DOMAINS as readonly string[]).includes(domain)) return false;
  if (e.state === "unavailable" && domain === "sensor") return false;
  if (domain === "sensor") return SENSOR_CLASSES.has(String(e.attributes.device_class ?? ""));
  // Group helpers (light groups) carry entity_id lists; keep them, they're useful.
  return true;
}

export function buildRooms(entities: HassEntities, reg: Registries, hidden: Set<string>): Room[] {
  const entityReg = new Map(reg.entities.map((r) => [r.entity_id, r]));
  const deviceArea = new Map(reg.devices.map((d) => [d.id, d.area_id]));
  const rooms = new Map<string, Room>();
  for (const a of reg.areas) rooms.set(a.area_id, { id: a.area_id, name: a.name, tiles: [], scenes: [] });
  const fallback: Room = { id: NO_ROOM, name: "Default Room", tiles: [], scenes: [] };

  for (const e of Object.values(entities)) {
    if (hidden.has(e.entity_id)) continue;
    const r = entityReg.get(e.entity_id);
    if (r && (r.hidden_by || r.disabled_by || r.entity_category)) continue;
    const isScene = domainOf(e.entity_id) === "scene";
    if (!isScene && !wantsTile(e)) continue;

    const areaId = r?.area_id ?? (r?.device_id ? deviceArea.get(r.device_id) : null) ?? null;
    const room = (areaId && rooms.get(areaId)) || fallback;
    (isScene ? room.scenes : room.tiles).push(e);
  }

  const order = (e: HassEntity) => (TILE_DOMAINS as readonly string[]).indexOf(domainOf(e.entity_id));
  const all = [...rooms.values(), fallback].filter((r) => r.tiles.length || r.scenes.length);
  for (const room of all) {
    room.tiles.sort((a, b) => order(a) - order(b) || friendlyName(a).localeCompare(friendlyName(b)));
    room.scenes.sort((a, b) => friendlyName(a).localeCompare(friendlyName(b)));
  }
  // Rooms in the order HA lists areas; the catch-all room goes last.
  return all;
}

export function isOn(e: HassEntity): boolean {
  switch (domainOf(e.entity_id)) {
    case "climate":
      return e.state !== "off" && e.state !== "unavailable";
    case "cover":
      return e.state === "open" || e.state === "opening";
    case "lock":
      return e.state === "unlocked" || e.state === "open";
    case "media_player":
      return e.state === "playing" || e.state === "on";
    case "sensor":
      return false;
    default:
      return e.state === "on";
  }
}

/** Tap a tile: toggle it, or null when a tap should open the detail sheet instead. */
export function tapAction(e: HassEntity): [string, string] | null {
  const domain = domainOf(e.entity_id);
  if (e.state === "unavailable") return null;
  switch (domain) {
    case "light":
    case "switch":
    case "fan":
    case "humidifier":
      return [domain, "toggle"];
    case "cover":
      return ["cover", "toggle"];
    case "media_player":
      return ["media_player", "media_play_pause"];
    default:
      // Climate opens its controls; locks always confirm in the sheet.
      return null;
  }
}

export function brightnessPct(e: HassEntity): number | null {
  const b = e.attributes.brightness as number | null | undefined;
  return e.state === "on" && typeof b === "number" ? Math.max(1, Math.round((b / 255) * 100)) : null;
}

export function supportsBrightness(e: HassEntity): boolean {
  const modes = (e.attributes.supported_color_modes as string[] | undefined) ?? [];
  return modes.some((m) => m !== "onoff");
}

export function supportsColorTemp(e: HassEntity): boolean {
  const modes = (e.attributes.supported_color_modes as string[] | undefined) ?? [];
  return modes.includes("color_temp");
}

export function supportsColor(e: HassEntity): boolean {
  const modes = (e.attributes.supported_color_modes as string[] | undefined) ?? [];
  return modes.some((m) => ["hs", "rgb", "rgbw", "rgbww", "xy"].includes(m));
}

function fmtTemp(v: unknown, unit: string): string {
  return typeof v === "number" ? `${Math.round(v)}${unit}` : "–";
}

const HVAC_LABEL: Record<string, string> = {
  heat: "Heating",
  cool: "Cooling",
  heat_cool: "Auto",
  auto: "Auto",
  dry: "Dry",
  fan_only: "Fan",
  off: "Off",
};

/** The small grey line under a tile's name ("75%", "Heating to 70°", "Off"). */
export function stateLine(e: HassEntity, unit: string): string {
  const domain = domainOf(e.entity_id);
  if (e.state === "unavailable") return "No Response";
  switch (domain) {
    case "light": {
      const pct = brightnessPct(e);
      return e.state === "on" ? (pct !== null && supportsBrightness(e) ? `${pct}%` : "On") : "Off";
    }
    case "climate": {
      const a = e.attributes;
      if (e.state === "off") return `Off · ${fmtTemp(a.current_temperature, unit)}`;
      const action = a.hvac_action as string | undefined;
      const target =
        a.temperature != null
          ? fmtTemp(a.temperature, unit)
          : `${fmtTemp(a.target_temp_low, unit)}–${fmtTemp(a.target_temp_high, unit)}`;
      const verb = action === "heating" ? "Heating to" : action === "cooling" ? "Cooling to" : `${HVAC_LABEL[e.state] ?? e.state} ·`;
      return `${verb} ${target}`;
    }
    case "fan": {
      const pct = e.attributes.percentage as number | undefined;
      if (e.state !== "on") return "Off";
      const preset = e.attributes.preset_mode as string | undefined;
      return preset ? preset.charAt(0).toUpperCase() + preset.slice(1) : pct ? `${pct}%` : "On";
    }
    case "cover":
      return e.state.charAt(0).toUpperCase() + e.state.slice(1);
    case "lock":
      return e.state === "locked" ? "Locked" : e.state === "unlocked" ? "Unlocked" : e.state;
    case "media_player":
      return e.state === "playing" ? ((e.attributes.media_title as string) ?? "Playing") : e.state === "off" ? "Off" : "Paused";
    case "sensor": {
      const u = (e.attributes.unit_of_measurement as string | undefined) ?? "";
      const n = Number(e.state);
      return Number.isFinite(n) ? `${Math.round(n * 10) / 10}${u.startsWith("°") ? u : ` ${u}`}`.trim() : e.state;
    }
    default:
      return e.state === "on" ? "On" : "Off";
  }
}

export function airQualityLabel(aqi: number): string {
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Sensitive";
  return "Poor";
}

export interface Summary {
  climate?: { label: string; detail: string };
  lights?: { on: number; detail: string };
  air?: { label: string; detail: string };
  open?: { count: number };
}

/** The status chips across the top of the Home tab. */
export function summarize(rooms: Room[], unit: string): Summary {
  const tiles = rooms.flatMap((r) => r.tiles);
  const s: Summary = {};
  const thermostat = tiles.find((e) => domainOf(e.entity_id) === "climate");
  if (thermostat) {
    s.climate = { label: fmtTemp(thermostat.attributes.current_temperature, unit), detail: stateLine(thermostat, unit) };
  }
  const lights = tiles.filter((e) => domainOf(e.entity_id) === "light" && e.state !== "unavailable");
  if (lights.length) {
    const on = lights.filter((l) => l.state === "on");
    const rooms_on = rooms.filter((r) => r.tiles.some((t) => on.includes(t))).map((r) => r.name);
    s.lights = { on: on.length, detail: on.length ? rooms_on.slice(0, 2).join(", ") : "All Off" };
  }
  const aqi = tiles.find((e) => domainOf(e.entity_id) === "sensor" && e.attributes.device_class === "aqi");
  const pm = tiles.find((e) => domainOf(e.entity_id) === "sensor" && e.attributes.device_class === "pm25");
  if (aqi && Number.isFinite(Number(aqi.state))) {
    s.air = { label: airQualityLabel(Number(aqi.state)), detail: `AQI ${Math.round(Number(aqi.state))}` };
  } else if (pm && Number.isFinite(Number(pm.state))) {
    s.air = { label: Number(pm.state) <= 12 ? "Good" : Number(pm.state) <= 35 ? "Moderate" : "Poor", detail: `PM2.5 ${pm.state}` };
  }
  const open = tiles.filter((e) => ["cover", "lock"].includes(domainOf(e.entity_id)) && isOn(e)).length;
  if (open) s.open = { count: open };
  return s;
}
