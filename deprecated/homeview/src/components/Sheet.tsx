import type { HassEntity } from "home-assistant-js-websocket";
import { useEffect, useState } from "react";
import type { Hass } from "../ha";
import { CloseIcon, EntityIcon } from "../icons";
import {
  brightnessPct,
  domainOf,
  friendlyName,
  isOn,
  stateLine,
  supportsBrightness,
  supportsColor,
  supportsColorTemp,
} from "../model";
import { VSlider } from "./VSlider";

interface Props {
  entity: HassEntity;
  roomName?: string;
  unit: string;
  hass: Hass;
  onClose: () => void;
  onHide: () => void;
}

/** Press-and-hold a tile to get here: big controls for one device. */
export function Sheet({ entity, roomName, unit, hass, onClose, onHide }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const domain = domainOf(entity.entity_id);
  const target = { entity_id: entity.entity_id };
  const call = (service: string, data?: object, d = domain) => hass.call(d, service, data, target).catch(() => {});

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={friendlyName(entity, roomName)} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <span className={`sheet-icon${isOn(entity) ? " on" : ""}`}><EntityIcon entity={entity} size={22} /></span>
          <div className="sheet-title">
            <div className="sheet-name">{friendlyName(entity, roomName)}</div>
            <div className="sheet-state">{roomName ? `${roomName} · ` : ""}{stateLine(entity, unit)}</div>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><CloseIcon size={20} /></button>
        </header>

        <div className="sheet-body">
          {domain === "light" && <LightControls entity={entity} call={call} />}
          {domain === "climate" && <ClimateControls entity={entity} unit={unit} call={call} />}
          {domain === "fan" && <FanControls entity={entity} call={call} />}
          {domain === "humidifier" && <HumidifierControls entity={entity} call={call} />}
          {domain === "cover" && <CoverControls entity={entity} call={call} />}
          {domain === "lock" && <LockControls entity={entity} call={call} />}
          {["switch", "media_player"].includes(domain) && (
            <div className="row-center">
              <button type="button" className={`power-btn${isOn(entity) ? " on" : ""}`}
                onClick={() => call(domain === "media_player" ? "media_play_pause" : "toggle")}>
                <EntityIcon entity={entity} size={34} />
              </button>
            </div>
          )}
          {domain === "sensor" && <div className="big-reading">{stateLine(entity, unit)}</div>}
        </div>

        <footer className="sheet-foot">
          <button type="button" className="link-btn" onClick={onHide}>Hide from Dashboard</button>
        </footer>
      </div>
    </div>
  );
}

type Call = (service: string, data?: object, domain?: string) => Promise<void>;

function LightControls({ entity, call }: { entity: HassEntity; call: Call }) {
  const pct = brightnessPct(entity) ?? 0;
  const ctMin = (entity.attributes.min_color_temp_kelvin as number) ?? 2200;
  const ctMax = (entity.attributes.max_color_temp_kelvin as number) ?? 6500;
  const ct = (entity.attributes.color_temp_kelvin as number | undefined) ?? Math.round((ctMin + ctMax) / 2);
  const ctPct = Math.round(((ct - ctMin) / (ctMax - ctMin || 1)) * 100);
  const swatches: Array<[number, number, number]> = [
    [255, 147, 41], [255, 214, 170], [255, 255, 255], [255, 80, 80], [120, 160, 255], [180, 110, 255],
  ];

  if (!supportsBrightness(entity)) {
    return (
      <div className="row-center">
        <button type="button" className={`power-btn${entity.state === "on" ? " on" : ""}`} onClick={() => call("toggle")}>
          <EntityIcon entity={entity} size={34} />
        </button>
      </div>
    );
  }
  return (
    <div className="controls">
      <VSlider
        label="Brightness"
        value={pct}
        fill="var(--slider-light)"
        showValue={(v) => (v === 0 ? "Off" : `${v}%`)}
        onCommit={(v) => (v === 0 ? call("turn_off") : call("turn_on", { brightness_pct: v }))}
      />
      {supportsColorTemp(entity) && (
        <VSlider
          label="Warmth"
          value={ctPct}
          fill="transparent"
          track="linear-gradient(to top, #ffb35c, #fff4e6 55%, #dbe8ff)"
          showValue={(v) => `${Math.round(ctMin + ((ctMax - ctMin) * v) / 100)}K`}
          onCommit={(v) => call("turn_on", { color_temp_kelvin: Math.round(ctMin + ((ctMax - ctMin) * v) / 100) })}
        />
      )}
      {supportsColor(entity) && (
        <div className="swatches">
          {swatches.map((c) => (
            <button key={c.join()} type="button" className="swatch" aria-label={`Color ${c.join(",")}`}
              style={{ background: `rgb(${c.join(",")})` }} onClick={() => call("turn_on", { rgb_color: c })} />
          ))}
        </div>
      )}
    </div>
  );
}

const HVAC_NAMES: Record<string, string> = {
  off: "Off", heat: "Heat", cool: "Cool", heat_cool: "Auto", auto: "Auto", dry: "Dry", fan_only: "Fan",
};

function ClimateControls({ entity, unit, call }: { entity: HassEntity; unit: string; call: Call }) {
  const a = entity.attributes;
  const step = (a.target_temp_step as number) ?? (unit === "°F" ? 1 : 0.5);
  const min = (a.min_temp as number) ?? 45;
  const max = (a.max_temp as number) ?? 95;
  const dual = a.temperature == null && a.target_temp_low != null;
  const [low, setLow] = useState<number>((a.target_temp_low as number) ?? 68);
  const [high, setHigh] = useState<number>((a.target_temp_high as number) ?? 76);
  const [single, setSingle] = useState<number>((a.temperature as number) ?? 70);

  useEffect(() => {
    setLow((a.target_temp_low as number) ?? 68);
    setHigh((a.target_temp_high as number) ?? 76);
    setSingle((a.temperature as number) ?? 70);
  }, [a.target_temp_low, a.target_temp_high, a.temperature]);

  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const modes = (a.hvac_modes as string[]) ?? [];

  return (
    <div className="climate">
      <div className="climate-now">
        <div className="climate-current">{typeof a.current_temperature === "number" ? Math.round(a.current_temperature) : "–"}°</div>
        <div className="climate-sub">Currently{typeof a.current_humidity === "number" ? ` · ${a.current_humidity}% humidity` : ""}</div>
      </div>
      {entity.state !== "off" && (dual ? (
        <div className="stepper-pair">
          <Stepper unit={unit} step={step} clamp={clamp} label="Heat to" value={low} set={setLow} onDone={(v) => call("set_temperature", { target_temp_low: v, target_temp_high: high })} />
          <Stepper unit={unit} step={step} clamp={clamp} label="Cool to" value={high} set={setHigh} onDone={(v) => call("set_temperature", { target_temp_low: low, target_temp_high: v })} />
        </div>
      ) : (
        <Stepper unit={unit} step={step} clamp={clamp} label="Set to" value={single} set={setSingle} onDone={(v) => call("set_temperature", { temperature: v })} />
      ))}
      <div className="segmented">
        {modes.map((m) => (
          <button key={m} type="button" className={entity.state === m ? "active" : ""} onClick={() => call("set_hvac_mode", { hvac_mode: m })}>
            {HVAC_NAMES[m] ?? m}
          </button>
        ))}
      </div>
    </div>
  );
}

function Stepper({ value, set, onDone, label, unit, step, clamp }: {
  value: number; set: (v: number) => void; onDone: (v: number) => void; label: string; unit: string;
  step: number; clamp: (v: number) => number;
}) {
  return (
    <div className="stepper">
      <div className="stepper-label">{label}</div>
      <div className="stepper-row">
        <button type="button" className="round-btn" aria-label={`Lower ${label}`}
          onClick={() => { const v = clamp(value - step); set(v); onDone(v); }}>−</button>
        <div className="stepper-value">{step < 1 ? value.toFixed(1) : Math.round(value)}{unit}</div>
        <button type="button" className="round-btn" aria-label={`Raise ${label}`}
          onClick={() => { const v = clamp(value + step); set(v); onDone(v); }}>+</button>
      </div>
    </div>
  );
}

function FanControls({ entity, call }: { entity: HassEntity; call: Call }) {
  const pct = entity.state === "on" ? ((entity.attributes.percentage as number) ?? 100) : 0;
  const presets = (entity.attributes.preset_modes as string[] | undefined) ?? [];
  const supportsPct = entity.attributes.percentage_step != null || entity.attributes.percentage != null;
  return (
    <div className="controls">
      {supportsPct ? (
        <VSlider label="Speed" value={pct} fill="var(--slider-air)" showValue={(v) => (v === 0 ? "Off" : `${v}%`)}
          onCommit={(v) => (v === 0 ? call("turn_off") : call("set_percentage", { percentage: v }))} />
      ) : (
        <button type="button" className={`power-btn${entity.state === "on" ? " on" : ""}`} onClick={() => call("toggle")}>
          <EntityIcon entity={entity} size={34} />
        </button>
      )}
      {presets.length > 0 && (
        <div className="segmented vertical">
          {presets.map((p) => (
            <button key={p} type="button" className={entity.attributes.preset_mode === p ? "active" : ""}
              onClick={() => call("set_preset_mode", { preset_mode: p })}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HumidifierControls({ entity, call }: { entity: HassEntity; call: Call }) {
  const a = entity.attributes;
  const min = (a.min_humidity as number) ?? 0;
  const max = (a.max_humidity as number) ?? 100;
  const target = (a.humidity as number | undefined) ?? 50;
  return (
    <div className="controls">
      <button type="button" className={`power-btn${entity.state === "on" ? " on" : ""}`} onClick={() => call("toggle")}>
        <EntityIcon entity={entity} size={34} />
      </button>
      <VSlider label="Target humidity" value={Math.round(((target - min) / (max - min || 1)) * 100)} fill="var(--slider-air)"
        showValue={(v) => `${Math.round(min + ((max - min) * v) / 100)}%`}
        onCommit={(v) => call("set_humidity", { humidity: Math.round(min + ((max - min) * v) / 100) })} />
    </div>
  );
}

function CoverControls({ entity, call }: { entity: HassEntity; call: Call }) {
  const pos = entity.attributes.current_position as number | undefined;
  if (pos === undefined) {
    return (
      <div className="segmented">
        <button type="button" onClick={() => call("open_cover")}>Open</button>
        <button type="button" onClick={() => call("stop_cover")}>Stop</button>
        <button type="button" onClick={() => call("close_cover")}>Close</button>
      </div>
    );
  }
  return (
    <div className="controls">
      <VSlider label="Position" value={pos} fill="var(--slider-light)" showValue={(v) => `${v}% open`}
        onCommit={(v) => call("set_cover_position", { position: v })} />
    </div>
  );
}

function LockControls({ entity, call }: { entity: HassEntity; call: Call }) {
  const locked = entity.state === "locked";
  return (
    <div className="row-center">
      <button type="button" className={`power-btn${!locked ? " on" : ""}`} onClick={() => call(locked ? "unlock" : "lock")}>
        <EntityIcon entity={entity} size={34} />
      </button>
      <div className="hint">{locked ? "Tap to unlock" : "Tap to lock"}</div>
    </div>
  );
}
