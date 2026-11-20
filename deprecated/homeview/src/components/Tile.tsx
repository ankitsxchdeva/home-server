import type { HassEntity } from "home-assistant-js-websocket";
import { EntityIcon } from "../icons";
import { domainOf, friendlyName, isOn, stateLine } from "../model";
import { usePress } from "./usePress";

interface Props {
  entity: HassEntity;
  roomName?: string;
  unit: string;
  onTap: () => void;
  onHold: () => void;
}

/** Accent for the icon disc when a tile is on, by kind of device. */
export function accentFor(e: HassEntity): string {
  const domain = domainOf(e.entity_id);
  if (domain === "climate") {
    const action = e.attributes.hvac_action;
    if (action === "cooling" || e.state === "cool") return "var(--accent-cool)";
    return "var(--accent-heat)";
  }
  if (domain === "light") {
    const rgb = e.attributes.rgb_color as [number, number, number] | undefined;
    if (rgb && e.attributes.color_mode !== "color_temp") return `rgb(${rgb.join(",")})`;
    return "var(--accent-light)";
  }
  if (domain === "fan" || domain === "humidifier") return "var(--accent-air)";
  if (domain === "lock") return "var(--accent-lock)";
  return "var(--accent-generic)";
}

export function Tile({ entity, roomName, unit, onTap, onHold }: Props) {
  const on = isOn(entity);
  const domain = domainOf(entity.entity_id);
  const unavailable = entity.state === "unavailable";
  const press = usePress(onTap, onHold);
  const big = domain === "climate";

  return (
    <button
      type="button"
      className={`tile${on ? " on" : ""}${unavailable ? " unavailable" : ""}${big ? " wide" : ""}`}
      style={{ "--accent": accentFor(entity) } as React.CSSProperties}
      aria-pressed={on}
      aria-label={`${friendlyName(entity, roomName)}, ${stateLine(entity, unit)}`}
      {...press}
    >
      <span className="tile-icon">
        {domain === "climate" && typeof entity.attributes.current_temperature === "number" ? (
          <span className="tile-temp">{Math.round(entity.attributes.current_temperature)}°</span>
        ) : (
          <EntityIcon entity={entity} size={22} />
        )}
      </span>
      <span className="tile-text">
        <span className="tile-name">{friendlyName(entity, roomName)}</span>
        <span className="tile-state">{stateLine(entity, unit)}</span>
      </span>
    </button>
  );
}

export function SceneChip({ entity, roomName, onTap }: { entity: HassEntity; roomName?: string; onTap: () => void }) {
  return (
    <button type="button" className="scene" onClick={onTap}>
      <span className="scene-icon"><EntityIcon entity={entity} size={18} /></span>
      <span className="scene-name">{friendlyName(entity, roomName)}</span>
    </button>
  );
}
