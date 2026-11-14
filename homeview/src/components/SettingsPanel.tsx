import { useState } from "react";
import { CloseIcon } from "../icons";
import type { Settings } from "../settings";
import { WALLPAPERS } from "../wallpapers";

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
  onSignOut: () => void;
}

export function SettingsPanel({ settings, onChange, onClose, onSignOut }: Props) {
  const [title, setTitle] = useState(settings.title);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet settings" role="dialog" aria-label="Dashboard settings" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <div className="sheet-title"><div className="sheet-name">Home Settings</div><div className="sheet-state">{settings.hassUrl}</div></div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><CloseIcon size={20} /></button>
        </header>
        <div className="settings-body">
          <label className="field">
            <span>Name</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => onChange({ ...settings, title: title.trim() || "My Home" })} />
          </label>
          <div className="field">
            <span>Wallpaper</span>
            <div className="wallpapers">
              {Object.entries(WALLPAPERS).map(([id, css]) => (
                <button key={id} type="button" aria-label={`Wallpaper ${id}`}
                  className={`wallpaper-pick${settings.wallpaper === id ? " active" : ""}`}
                  style={{ background: css }} onClick={() => onChange({ ...settings, wallpaper: id })} />
              ))}
            </div>
          </div>
          <div className="field">
            <span>Hidden accessories</span>
            {settings.hidden.length === 0 ? (
              <div className="muted">None. Press and hold a tile to hide it.</div>
            ) : (
              <button type="button" className="secondary-btn" onClick={() => onChange({ ...settings, hidden: [] })}>
                Show {settings.hidden.length} hidden
              </button>
            )}
          </div>
        </div>
        <footer className="sheet-foot">
          <button type="button" className="link-btn danger" onClick={onSignOut}>Forget token on this iPad</button>
        </footer>
      </div>
    </div>
  );
}
