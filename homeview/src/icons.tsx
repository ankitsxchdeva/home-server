import type { HassEntity } from "home-assistant-js-websocket";
import { domainOf } from "./model";

// Small hand-drawn stroke icons so the app has no icon-font dependency.
type P = { size?: number };

const svg = (size: number, children: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const BulbIcon = ({ size = 24 }: P) =>
  svg(size, <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z" /></>);
export const ThermostatIcon = ({ size = 24 }: P) =>
  svg(size, <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v4.5l2.5 2" /></>);
export const FanIcon = ({ size = 24 }: P) =>
  svg(size, <><circle cx="12" cy="12" r="1.6" /><path d="M12 10.4c-.4-3.4.6-6.4 3-6.4 2.2 0 2.6 2.8.6 4.4L12 10.4zM13.6 12c3.4-.4 6.4.6 6.4 3 0 2.2-2.8 2.6-4.4.6L13.6 12zM12 13.6c.4 3.4-.6 6.4-3 6.4-2.2 0-2.6-2.8-.6-4.4L12 13.6zM10.4 12c-3.4.4-6.4-.6-6.4-3 0-2.2 2.8-2.6 4.4-.6L10.4 12z" /></>);
export const DropIcon = ({ size = 24 }: P) =>
  svg(size, <path d="M12 3.5s6 6.2 6 10.5a6 6 0 0 1-12 0c0-4.3 6-10.5 6-10.5z" />);
export const PowerIcon = ({ size = 24 }: P) =>
  svg(size, <><path d="M12 3v8" /><path d="M7 6.3a7 7 0 1 0 10 0" /></>);
export const BlindsIcon = ({ size = 24 }: P) =>
  svg(size, <><path d="M4 4h16M5 4v12h14V4M5 8h14M5 12h14M12 16v4" /></>);
export const LockIcon = ({ size = 24 }: P) =>
  svg(size, <><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>);
export const SpeakerIcon = ({ size = 24 }: P) =>
  svg(size, <><rect x="6" y="3" width="12" height="18" rx="3" /><circle cx="12" cy="14" r="3" /><circle cx="12" cy="7.5" r=".8" /></>);
export const ThermometerIcon = ({ size = 24 }: P) =>
  svg(size, <><path d="M10 4.5a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0V4.5z" /><path d="M12 17.5v-6" /></>);
export const AirIcon = ({ size = 24 }: P) =>
  svg(size, <><path d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h6" /></>);
export const SparkleIcon = ({ size = 24 }: P) =>
  svg(size, <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M18.5 16.5l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6z" /></>);
export const GearIcon = ({ size = 24 }: P) =>
  svg(size, <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>);
export const HouseIcon = ({ size = 24 }: P) =>
  svg(size, <><path d="M3.5 11 12 4l8.5 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5h4v5" /></>);
export const DoorIcon = ({ size = 24 }: P) =>
  svg(size, <><path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21M4 21h16" /><circle cx="14.5" cy="12" r=".9" /></>);
export const CloseIcon = ({ size = 24 }: P) => svg(size, <path d="M6 6l12 12M18 6 6 18" />);

export function EntityIcon({ entity, size = 24 }: { entity: HassEntity; size?: number }) {
  switch (domainOf(entity.entity_id)) {
    case "light": return <BulbIcon size={size} />;
    case "climate": return <ThermostatIcon size={size} />;
    case "fan": return <FanIcon size={size} />;
    case "humidifier": return <DropIcon size={size} />;
    case "cover": return <BlindsIcon size={size} />;
    case "lock": return <LockIcon size={size} />;
    case "media_player": return <SpeakerIcon size={size} />;
    case "scene": return <SparkleIcon size={size} />;
    case "sensor": {
      const dc = entity.attributes.device_class;
      if (dc === "temperature") return <ThermometerIcon size={size} />;
      if (dc === "humidity") return <DropIcon size={size} />;
      return <AirIcon size={size} />;
    }
    default: return <PowerIcon size={size} />;
  }
}
