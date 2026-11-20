import { useEffect, useState } from "react";
import { Dashboard } from "./components/Dashboard";
import { SettingsPanel } from "./components/SettingsPanel";
import { Setup } from "./components/Setup";
import { useDemoHass } from "./demo";
import { useHass, type Hass } from "./ha";
import { loadSettings, saveSettings, type Settings } from "./settings";
import { WALLPAPERS } from "./wallpapers";

const DEMO = new URLSearchParams(window.location.search).has("demo");

export function App() {
  return DEMO ? <Shell demo /> : <Shell />;
}

function LiveHass({ children, settings }: { settings: Settings; children: (h: Hass) => React.ReactNode }) {
  return <>{children(useHass(settings.hassUrl, settings.token))}</>;
}

function DemoHass({ children }: { children: (h: Hass) => React.ReactNode }) {
  return <>{children(useDemoHass())}</>;
}

function Shell({ demo = false }: { demo?: boolean }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const screens = (hass: Hass) => <Screens hass={hass} demo={demo} settings={settings} setSettings={setSettings} />;
  return demo ? <DemoHass>{screens}</DemoHass> : <LiveHass settings={settings}>{screens}</LiveHass>;
}

function Screens({ hass, demo, settings, setSettings }: {
  hass: Hass; demo: boolean; settings: Settings; setSettings: (s: Settings) => void;
}) {
  const [showSettings, setShowSettings] = useState(false);

  const update = (s: Settings) => {
    setSettings(s);
    if (!demo) saveSettings(s);
  };

  useEffect(() => {
    document.body.style.background = WALLPAPERS[settings.wallpaper] ?? WALLPAPERS.dusk;
  }, [settings.wallpaper]);

  // A bad token sends you back to setup with the reason.
  const authFailed = hass.status.kind === "error" && /token/i.test(hass.status.message);

  if (!demo && (!settings.token || authFailed)) {
    return (
      <Setup
        settings={settings}
        error={hass.status.kind === "error" ? hass.status.message : undefined}
        onSave={update}
      />
    );
  }

  return (
    <>
      <Dashboard
        hass={hass}
        settings={settings}
        onSettings={() => setShowSettings(true)}
        onHide={(id) => update({ ...settings, hidden: [...new Set([...settings.hidden, id])] })}
      />
      {showSettings && (
        <SettingsPanel
          settings={settings}
          onChange={update}
          onClose={() => setShowSettings(false)}
          onSignOut={() => {
            update({ ...settings, token: "" });
            setShowSettings(false);
          }}
        />
      )}
    </>
  );
}
