// Open the dashboard with ?demo to preview it with sample devices (modelled on
// this home's setup) without a token or a live Home Assistant. Nothing is sent anywhere.
import type { HassConfig, HassEntities, HassEntity } from "home-assistant-js-websocket";
import { useState } from "react";
import type { Hass, Registries } from "./ha";

const ent = (entity_id: string, state: string, attributes: Record<string, unknown>): HassEntity => ({
  entity_id, state, attributes, last_changed: "", last_updated: "",
  context: { id: "", user_id: null, parent_id: null },
});

const ct = { supported_color_modes: ["color_temp"], min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6500 };

export const demoEntities: HassEntities = Object.fromEntries(
  [
    ent("climate.t6_pro", "heat", {
      friendly_name: "Thermostat", hvac_modes: ["off", "heat", "cool", "heat_cool"], hvac_action: "heating",
      current_temperature: 68, temperature: 70, min_temp: 50, max_temp: 90, target_temp_step: 1, current_humidity: 41,
    }),
    ent("light.living_room_spetsboj", "on", { friendly_name: "Living Room Spetsboj", brightness: 128, color_temp_kelvin: 2700, color_mode: "color_temp", ...ct }),
    ent("light.ikea_of_sweden_tradfri_bulb_e26_ww_globe_800lm", "off", { friendly_name: "Shelf", supported_color_modes: ["brightness"] }),
    ent("light.ikea_of_sweden_tradfri_bulb_e26_ww_globe_800lm_2", "on", { friendly_name: "Lamp", brightness: 204, color_mode: "brightness", supported_color_modes: ["brightness"] }),
    ent("light.h6006", "off", { friendly_name: "Counter Lights", ...ct }),
    ent("light.living_room_counter", "off", { friendly_name: "Living Room Counter", ...ct }),
    ent("light.h600b", "off", { friendly_name: "Bedroom Lamp Left", supported_color_modes: ["color_temp", "hs"], min_color_temp_kelvin: 2700, max_color_temp_kelvin: 6500 }),
    ent("light.h600b_2", "off", { friendly_name: "Bedroom Lamp Right", supported_color_modes: ["color_temp", "hs"], min_color_temp_kelvin: 2700, max_color_temp_kelvin: 6500 }),
    ent("fan.winix_purifier", "on", { friendly_name: "Air Purifier", percentage: 50, percentage_step: 25, preset_modes: ["auto", "manual", "sleep"], preset_mode: "auto" }),
    ent("sensor.winix_aqi", "18", { friendly_name: "Air Purifier AQI", device_class: "aqi" }),
    ent("sensor.winix_pm2_5", "3", { friendly_name: "Air Purifier PM2.5", device_class: "pm25", unit_of_measurement: "µg/m³" }),
    ent("scene.counter_lamp", "2026-11-13T22:00:00", { friendly_name: "Counter + Lamp" }),
    ent("scene.movie_night", "unknown", { friendly_name: "Movie Night" }),
  ].map((e) => [e.entity_id, e]),
);

const area = (area_id: string, name: string) => ({ area_id, name, icon: null });
const reg = (entity_id: string, area_id: string | null) => ({
  entity_id, area_id, device_id: null, name: null, icon: null, entity_category: null, hidden_by: null, disabled_by: null,
});

export const demoRegistries: Registries = {
  available: true,
  areas: [area("living_room", "Living Room"), area("kitchen", "Kitchen"), area("bedroom", "Bedroom")],
  devices: [],
  entities: [
    reg("climate.t6_pro", "living_room"),
    reg("light.living_room_spetsboj", "living_room"),
    reg("light.ikea_of_sweden_tradfri_bulb_e26_ww_globe_800lm", "living_room"),
    reg("light.ikea_of_sweden_tradfri_bulb_e26_ww_globe_800lm_2", "living_room"),
    reg("light.h6006", "kitchen"),
    reg("light.living_room_counter", "kitchen"),
    reg("light.h600b", "bedroom"),
    reg("light.h600b_2", "bedroom"),
    reg("fan.winix_purifier", "bedroom"),
    reg("sensor.winix_aqi", "bedroom"),
    reg("sensor.winix_pm2_5", "bedroom"),
    reg("scene.counter_lamp", "living_room"),
    reg("scene.movie_night", "living_room"),
  ],
};

export const demoConfig = { unit_system: { temperature: "°F" } } as unknown as HassConfig;

/** Same shape as useHass, backed by local state. */
export function useDemoHass(): Hass {
  const [entities, setEntities] = useState<HassEntities>(demoEntities);
  const call: Hass["call"] = async (domain, service, data = {}, target) => {
    const ids = ([] as string[]).concat((target?.entity_id as string | string[]) ?? []);
    setEntities((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        const e = prev[id];
        if (!e) continue;
        const a: Record<string, unknown> = { ...e.attributes, ...(data as Record<string, unknown>) };
        let state = e.state;
        if (service === "toggle") state = e.state === "on" ? "off" : "on";
        if (service === "turn_on") state = "on";
        if (service === "turn_off") state = "off";
        if (service === "set_hvac_mode") state = String(a.hvac_mode);
        if ("brightness_pct" in a) { a.brightness = Math.round((Number(a.brightness_pct) / 100) * 255); delete a.brightness_pct; }
        if (domain === "light" && state === "on" && a.brightness == null) a.brightness = 255;
        if ("color_temp_kelvin" in (data as object)) a.color_mode = "color_temp";
        if ("rgb_color" in (data as object)) a.color_mode = "hs";
        next[id] = { ...e, state, attributes: a };
      }
      return next;
    });
  };
  return { status: { kind: "connected" }, entities, config: demoConfig, registries: demoRegistries, call };
}
