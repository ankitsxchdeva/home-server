import { useState } from "react";
import { HouseIcon } from "../icons";
import { normalizeUrl, type Settings } from "../settings";

interface Props {
  settings: Settings;
  error?: string;
  onSave: (s: Settings) => void;
}

/** First run: where Home Assistant lives, and a long-lived token for this iPad. */
export function Setup({ settings, error, onSave }: Props) {
  const [url, setUrl] = useState(settings.hassUrl);
  const [token, setToken] = useState(settings.token);

  return (
    <div className="setup">
      <form
        className="setup-card"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...settings, hassUrl: normalizeUrl(url), token: token.trim() });
        }}
      >
        <div className="setup-badge"><HouseIcon size={30} /></div>
        <h1>Connect to Home Assistant</h1>
        <p className="setup-lead">
          In Home Assistant, open your profile, go to <b>Security</b>, and create a <b>long-lived access token</b> for this iPad.
          It stays on this device only.
        </p>
        <label>
          <span>Home Assistant address</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        </label>
        <label>
          <span>Access token</span>
          <input value={token} onChange={(e) => setToken(e.target.value)} type="password" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="Paste token" />
        </label>
        {error && <div className="setup-error">{error}</div>}
        <button type="submit" className="primary-btn" disabled={!url.trim() || !token.trim()}>Connect</button>
      </form>
    </div>
  );
}
