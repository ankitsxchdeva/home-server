import {
  callService,
  createConnection,
  createLongLivedTokenAuth,
  ERR_CANNOT_CONNECT,
  ERR_INVALID_AUTH,
  subscribeConfig,
  subscribeEntities,
  type Connection,
  type HassConfig,
  type HassEntities,
  type HassServiceTarget,
} from "home-assistant-js-websocket";
import { useEffect, useRef, useState } from "react";

export interface AreaEntry {
  area_id: string;
  name: string;
  icon: string | null;
  floor_id?: string | null;
}

export interface EntityEntry {
  entity_id: string;
  area_id: string | null;
  device_id: string | null;
  name: string | null;
  original_name?: string | null;
  icon: string | null;
  entity_category: string | null;
  hidden_by: string | null;
  disabled_by: string | null;
}

export interface DeviceEntry {
  id: string;
  area_id: string | null;
  name: string | null;
  name_by_user: string | null;
}

export interface Registries {
  areas: AreaEntry[];
  entities: EntityEntry[];
  devices: DeviceEntry[];
  /** False when the token's user can't read the registries (not an admin). */
  available: boolean;
}

export type Status =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "connected" }
  | { kind: "reconnecting" }
  | { kind: "error"; message: string };

export interface Hass {
  status: Status;
  entities: HassEntities;
  config: HassConfig | null;
  registries: Registries;
  call: (domain: string, service: string, data?: object, target?: HassServiceTarget) => Promise<void>;
}

const noRegistries: Registries = { areas: [], entities: [], devices: [], available: false };

async function loadRegistries(conn: Connection): Promise<Registries> {
  try {
    const [areas, entities, devices] = await Promise.all([
      conn.sendMessagePromise<AreaEntry[]>({ type: "config/area_registry/list" }),
      conn.sendMessagePromise<EntityEntry[]>({ type: "config/entity_registry/list" }),
      conn.sendMessagePromise<DeviceEntry[]>({ type: "config/device_registry/list" }),
    ]);
    return { areas, entities, devices, available: true };
  } catch {
    return noRegistries;
  }
}

function errorMessage(err: unknown): string {
  if (err === ERR_INVALID_AUTH) return "Home Assistant didn't accept that token.";
  if (err === ERR_CANNOT_CONNECT) return "Can't reach Home Assistant. Retrying…";
  if (err instanceof Error) return err.message;
  return "Couldn't connect to Home Assistant.";
}

export function useHass(hassUrl: string, token: string): Hass {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [entities, setEntities] = useState<HassEntities>({});
  const [config, setConfig] = useState<HassConfig | null>(null);
  const [registries, setRegistries] = useState<Registries>(noRegistries);
  const connRef = useRef<Connection | null>(null);
  // Bumped to retry the first connection when Home Assistant is unreachable
  // (e.g. the Pi is rebooting), so a wall-mounted iPad recovers on its own.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!hassUrl || !token) {
      setStatus({ kind: "idle" });
      return;
    }
    let cancelled = false;
    let retry: number | undefined;
    const unsubs: Array<() => void> = [];
    setStatus({ kind: "connecting" });

    (async () => {
      try {
        const auth = createLongLivedTokenAuth(hassUrl, token);
        const conn = await createConnection({ auth });
        if (cancelled) {
          conn.close();
          return;
        }
        connRef.current = conn;
        const refreshRegistries = () => loadRegistries(conn).then((r) => !cancelled && setRegistries(r));

        conn.addEventListener("ready", () => {
          setStatus({ kind: "connected" });
          refreshRegistries();
        });
        conn.addEventListener("disconnected", () => setStatus({ kind: "reconnecting" }));
        conn.addEventListener("reconnect-error", (_c, err) =>
          setStatus({ kind: "error", message: errorMessage(err) }),
        );

        unsubs.push(subscribeEntities(conn, (e) => setEntities(e)));
        unsubs.push(subscribeConfig(conn, (c) => setConfig(c)));
        // Pick up rooms or devices added while the dashboard is open.
        for (const type of ["area_registry_updated", "entity_registry_updated", "device_registry_updated"]) {
          conn.subscribeEvents(() => refreshRegistries(), type).then((u) => unsubs.push(u)).catch(() => {});
        }
        await refreshRegistries();
        setStatus({ kind: "connected" });
      } catch (err) {
        if (cancelled) return;
        setStatus({ kind: "error", message: errorMessage(err) });
        if (err !== ERR_INVALID_AUTH) retry = window.setTimeout(() => setAttempt((n) => n + 1), 10_000);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(retry);
      unsubs.forEach((u) => u());
      connRef.current?.close();
      connRef.current = null;
    };
  }, [hassUrl, token, attempt]);

  const call: Hass["call"] = async (domain, service, data, target) => {
    const conn = connRef.current;
    if (!conn) return;
    await callService(conn, domain, service, data, target);
  };

  return { status, entities, config, registries, call };
}
