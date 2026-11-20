import type { HassEntity } from "home-assistant-js-websocket";
import { useEffect, useMemo, useState } from "react";
import type { Hass } from "../ha";
import { AirIcon, BulbIcon, DoorIcon, GearIcon, HouseIcon, ThermostatIcon } from "../icons";
import { buildRooms, summarize, tapAction, type Room } from "../model";
import type { Settings } from "../settings";
import { Sheet } from "./Sheet";
import { SceneChip, Tile } from "./Tile";

interface Props {
  hass: Hass;
  settings: Settings;
  onSettings: () => void;
  onHide: (entityId: string) => void;
}

const TAB_KEY = "homeview.tab";
const HOME = "__home";

function greeting(d: Date): string {
  const h = d.getHours();
  return h < 5 ? "Good Night" : h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening";
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

export function Dashboard({ hass, settings, onSettings, onHide }: Props) {
  const unit = hass.config?.unit_system.temperature ?? "°F";
  const hidden = useMemo(() => new Set(settings.hidden), [settings.hidden]);
  const rooms = useMemo(() => buildRooms(hass.entities, hass.registries, hidden), [hass.entities, hass.registries, hidden]);
  const summary = useMemo(() => summarize(rooms, unit), [rooms, unit]);
  const now = useClock();

  const [tab, setTab] = useState<string>(() => {
    try { return localStorage.getItem(TAB_KEY) ?? HOME; } catch { return HOME; }
  });
  useEffect(() => {
    try { localStorage.setItem(TAB_KEY, tab); } catch { /* fine */ }
  }, [tab]);
  const activeRoom = rooms.find((r) => r.id === tab);
  const shown: Room[] = activeRoom ? [activeRoom] : rooms;
  const scenes = shown.flatMap((r) => r.scenes.map((s) => ({ scene: s, room: r })));

  const [sheet, setSheet] = useState<{ id: string; room?: string } | null>(null);
  const sheetEntity = sheet ? hass.entities[sheet.id] : undefined;
  const thermostat = rooms.flatMap((r) => r.tiles).find((e) => e.entity_id.startsWith("climate."));

  const tap = (e: HassEntity, room: Room) => {
    const action = tapAction(e);
    if (action) hass.call(action[0], action[1], undefined, { entity_id: e.entity_id }).catch(() => {});
    else setSheet({ id: e.entity_id, room: room.name });
  };

  return (
    <div className="dash">
      <nav className="sidebar" aria-label="Rooms">
        <div className="sidebar-title">{settings.title}</div>
        <button type="button" className={`nav-item${!activeRoom ? " active" : ""}`} onClick={() => setTab(HOME)}>
          <HouseIcon size={20} /> <span>Home</span>
        </button>
        {rooms.map((r) => (
          <button key={r.id} type="button" className={`nav-item${activeRoom?.id === r.id ? " active" : ""}`} onClick={() => setTab(r.id)}>
            <DoorIcon size={20} /> <span>{r.name}</span>
          </button>
        ))}
        <div className="sidebar-spacer" />
        <button type="button" className="nav-item" onClick={onSettings}><GearIcon size={20} /> <span>Settings</span></button>
      </nav>

      <main className="content">
        <header className="top">
          <div>
            <div className="eyebrow">{greeting(now)} · {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
            <h1 className="title">{activeRoom ? activeRoom.name : settings.title}</h1>
          </div>
          <div className="top-right">
            <div className="clock">{now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</div>
            <button type="button" className="icon-btn only-narrow" aria-label="Settings" onClick={onSettings}><GearIcon size={22} /></button>
          </div>
        </header>

        {hass.status.kind === "reconnecting" && <div className="banner">Reconnecting to Home Assistant…</div>}
        {hass.status.kind === "error" && <div className="banner bad">{hass.status.message}</div>}

        {!activeRoom && (
          <div className="chips">
            {summary.climate && thermostat && (
              <button type="button" className="chip" onClick={() => setSheet({ id: thermostat.entity_id })}>
                <span className="chip-icon heat"><ThermostatIcon size={18} /></span>
                <span><b>Climate</b><small>{summary.climate.label} · {summary.climate.detail}</small></span>
              </button>
            )}
            {summary.lights && (
              <div className="chip">
                <span className={`chip-icon${summary.lights.on ? " light" : ""}`}><BulbIcon size={18} /></span>
                <span><b>Lights</b><small>{summary.lights.on ? `${summary.lights.on} On · ${summary.lights.detail}` : summary.lights.detail}</small></span>
              </div>
            )}
            {summary.air && (
              <div className="chip">
                <span className="chip-icon air"><AirIcon size={18} /></span>
                <span><b>Air Quality</b><small>{summary.air.label} · {summary.air.detail}</small></span>
              </div>
            )}
            {summary.open && (
              <div className="chip">
                <span className="chip-icon warn"><DoorIcon size={18} /></span>
                <span><b>Security</b><small>{summary.open.count} Open</small></span>
              </div>
            )}
          </div>
        )}

        {/* Narrow screens (portrait) get room pills instead of the sidebar. */}
        <div className="pills only-narrow">
          <button type="button" className={`pill${!activeRoom ? " active" : ""}`} onClick={() => setTab(HOME)}>Home</button>
          {rooms.map((r) => (
            <button key={r.id} type="button" className={`pill${activeRoom?.id === r.id ? " active" : ""}`} onClick={() => setTab(r.id)}>{r.name}</button>
          ))}
        </div>

        {scenes.length > 0 && (
          <section>
            <h2 className="section-title">Scenes</h2>
            <div className="scenes">
              {scenes.map(({ scene, room }) => (
                <SceneChip key={scene.entity_id} entity={scene} roomName={activeRoom ? room.name : undefined}
                  onTap={() => hass.call("scene", "turn_on", undefined, { entity_id: scene.entity_id }).catch(() => {})} />
              ))}
            </div>
          </section>
        )}

        {hass.status.kind === "connecting" && rooms.length === 0 && <div className="empty">Connecting…</div>}
        {hass.status.kind === "connected" && rooms.length === 0 && <div className="empty">No accessories to show yet.</div>}

        {shown.map((room) => room.tiles.length > 0 && (
          <section key={room.id}>
            {!activeRoom && (
              <h2 className="section-title">
                <button type="button" className="section-link" onClick={() => setTab(room.id)}>{room.name} ›</button>
              </h2>
            )}
            <div className="grid">
              {room.tiles.map((e) => (
                <Tile key={e.entity_id} entity={e} roomName={room.name} unit={unit}
                  onTap={() => tap(e, room)} onHold={() => setSheet({ id: e.entity_id, room: room.name })} />
              ))}
            </div>
          </section>
        ))}

        {!hass.registries.available && hass.status.kind === "connected" && (
          <div className="footnote">Rooms need a token from a Home Assistant admin user, so everything is in one room for now.</div>
        )}
      </main>

      {sheetEntity && (
        <Sheet entity={sheetEntity} roomName={sheet?.room} unit={unit} hass={hass}
          onClose={() => setSheet(null)}
          onHide={() => { onHide(sheetEntity.entity_id); setSheet(null); }} />
      )}
    </div>
  );
}
