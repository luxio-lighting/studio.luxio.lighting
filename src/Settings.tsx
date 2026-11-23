import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUpRight, RotateCcw, QrCode, ChevronDown, LockKeyhole, Check, Copy, LoaderCircle, RefreshCw, Wifi, Bluetooth, Usb, Plus, Minus, Eye, EyeOff } from 'lucide-react';
import { SheetButton, Modal, Power } from './Controls';
import { discoverDevices, remove, send, type Light } from './model';
import { configSchema, type WifiNetwork } from '../shared/protocol/src/index';

const stripChannels: Record<string, string[]> = {
  WS2811: ['red', 'green', 'blue'], WS2812: ['red', 'green', 'blue'], WS2812B: ['red', 'green', 'blue'],
  WS2813: ['red', 'green', 'blue'], WS2815: ['red', 'green', 'blue'],
  WS2814: ['red', 'green', 'blue', 'white'], SK6812: ['red', 'green', 'blue', 'white'],
  WS2805: ['red', 'green', 'blue', 'cool', 'warm'],
};

export function Settings({ light, close, removed, notice, setup = false }: { setup?: boolean; light: Light; close: () => void; removed: () => void; notice: (message: string) => void }) {
  // Build 37 can restore the old false capability flag from its OTA snapshot.
  const factoryResetSupported = light.state.factoryResetSupported || light.state.build === 37;
  const [config, setConfig] = useState(structuredClone(light.state.config));
  const [savedConfig, setSavedConfig] = useState(structuredClone(light.state.config));
  const [setupStep, setSetupStep] = useState<'wifi' | 'strip' | 'done'>(setup ? 'wifi' : 'done');
  const previewGeneration = useRef(0);
  const previewQueue = useRef<Promise<unknown>>(Promise.resolve());
  const previewTouched = useRef(false);
  const originalConfig = useRef(structuredClone(light.state.config));
  const [stripOpen, setStripOpen] = useState(false);
  const [stripMenu, setStripMenu] = useState({ maxHeight: 280, above: false });
  const stripPicker = useRef<HTMLDivElement>(null);
  const stripTrigger = useRef<HTMLButtonElement>(null);
  const stripList = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    if (!stripOpen) return;
    const trigger = stripTrigger.current!.getBoundingClientRect();
    const body = stripPicker.current!.closest('.settings-body')!.getBoundingClientRect();
    const below = body.bottom - trigger.bottom - 10;
    const above = trigger.top - body.top - 10;
    setStripMenu({ maxHeight: Math.min(280, Math.max(below, above)), above: above > below });
  }, [stripOpen]);
  useEffect(() => {
    if (!stripOpen) return;
    (stripList.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? stripList.current?.querySelector<HTMLElement>('[role="option"]'))?.focus();
    const dismiss = (event: PointerEvent) => { if (!stripPicker.current?.contains(event.target as Node)) setStripOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [stripOpen]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmWifi, setConfirmWifi] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [wifi, setWifi] = useState(setup);
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<WifiNetwork | null>(null);
  const [customNetwork, setCustomNetwork] = useState<'' | 'secured' | 'open'>('');
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const [networkOpen, setNetworkOpen] = useState(false);
  const scanGeneration = useRef(0);
  const networkPicker = useRef<HTMLDivElement>(null);
  const networkTrigger = useRef<HTMLButtonElement>(null);
  const networkList = useRef<HTMLUListElement>(null);
  const customSsid = useRef<HTMLInputElement>(null);
  const secured = customNetwork ? customNetwork === 'secured' : selectedNetwork?.passwordRequired ?? false;
  const selectedValue = customNetwork || (selectedNetwork ? JSON.stringify([selectedNetwork.ssid, selectedNetwork.passwordRequired]) : '');
  useEffect(() => {
    setPasswordVisible(false);
    let saved = '';
    if (wifi && secured && ssid) {
      try { saved = localStorage.getItem(`luxio-wifi-password-v1:${ssid}`) ?? ''; }
      catch { /* Connecting still works when browser storage is unavailable. */ }
    }
    setPassword(saved);
  }, [ssid, secured, selectedValue, wifi]);
  const networkOptions = [...networks];
  if (selectedNetwork && !networkOptions.some(item => item.ssid === selectedNetwork.ssid && item.passwordRequired === selectedNetwork.passwordRequired)) networkOptions.push(selectedNetwork);
  const options = [
    ...networkOptions.map(item => ({ value: JSON.stringify([item.ssid, item.passwordRequired]), label: item.ssid, network: item })),
    { value: 'secured', label: 'Other secured network…', network: null },
    { value: 'open', label: 'Other open network…', network: null },
  ];
  useLayoutEffect(() => {
    if (!networkOpen) return;
    const list = networkList.current!;
    // The top layer lets the menu extend beyond the scrolling dialog body.
    list.showPopover();
    const position = () => {
      const trigger = networkTrigger.current!.getBoundingClientRect();
      const below = window.innerHeight - trigger.bottom - 13;
      const above = trigger.top - 13;
      const opensAbove = below < Math.min(260, list.scrollHeight) && above > below;
      Object.assign(list.style, {
        left: `${trigger.left}px`, width: `${trigger.width}px`,
        maxHeight: `${Math.max(0, Math.min(260, opensAbove ? above : below))}px`,
        top: opensAbove ? 'auto' : `${trigger.bottom + 5}px`,
        bottom: opensAbove ? `${window.innerHeight - trigger.top + 5}px` : 'auto',
      });
    };
    position();
    window.addEventListener('resize', position);
    document.addEventListener('scroll', position, true);
    return () => {
      list.hidePopover();
      window.removeEventListener('resize', position);
      document.removeEventListener('scroll', position, true);
    };
  }, [networkOpen, networks.length]);
  useEffect(() => {
    if (!networkOpen) return;
    (networkList.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? networkList.current?.querySelector<HTMLElement>('[role="option"]'))?.focus({ preventScroll: true });
    const dismiss = (event: PointerEvent) => { if (!networkPicker.current?.contains(event.target as Node)) setNetworkOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [networkOpen]);
  useEffect(() => { if (customNetwork) customSsid.current?.focus(); }, [customNetwork]);
  const [pairing, setPairing] = useState('');
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [available, setAvailable] = useState(0);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [update, setUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; scanGeneration.current++; }; }, []);
  const parsedConfig = configSchema.safeParse(config);
  const changed = JSON.stringify(parsedConfig.success ? parsedConfig.data : config) !== JSON.stringify(configSchema.safeParse(savedConfig).data ?? savedConfig);
  const valid = parsedConfig.success && new TextEncoder().encode(config.name.trim()).length <= 63 && (!config.relay?.enabled || config.relay.gpio !== config.gpio);

  useEffect(() => {
    if (setup) void scanWifi(2000);
    return () => {
      previewGeneration.current++;
      if (previewTouched.current) {
        previewTouched.current = false;
        void previewQueue.current.then(() => send(light, { operation: 3, config: originalConfig.current })).catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    const generation = ++previewGeneration.current;
    if (setupStep !== 'strip' || busy || !valid) return;
    const submitted = configSchema.parse(config);
    // Send during key-repeat instead of waiting for a pause in input. Requests
    // stay serialized, and queued obsolete counts are skipped on slow links.
    previewQueue.current = previewQueue.current.then(async () => {
      if (!mounted.current || generation !== previewGeneration.current) return;
      previewTouched.current = true;
      try {
        await send(light, { operation: 3, config: submitted, configPreview: true });
        if (!light.state.on) await send(light, { operation: 15, on: true });
        if (mounted.current && generation === previewGeneration.current) setError('');
      } catch (error) {
        if (mounted.current && generation === previewGeneration.current) setError(`Couldn’t preview the LED strip. ${String(error)}`);
      }
    });
    return () => { previewGeneration.current++; };
  }, [config, setupStep, valid]);

  async function finishSetup(commit: boolean) {
    if (busy || (commit && !valid)) return;
    previewGeneration.current++;
    setBusy(true); setError('');
    const submitted = commit ? configSchema.parse(config) : originalConfig.current;
    const minimumSaving = commit ? new Promise<void>(resolve => setTimeout(resolve, 1000)) : Promise.resolve();
    try {
      await previewQueue.current;
      await send(light, { operation: 3, config: submitted });
      previewTouched.current = false;
      await minimumSaving;
      if (mounted.current) close();
    } catch (error) {
      await minimumSaving;
      if (mounted.current) setError(`Couldn’t save settings. ${String(error)}`);
    } finally { if (mounted.current) setBusy(false); }
  }

  async function save() {
    if (busy || !valid || !changed) return;
    const submitted = configSchema.parse(config);
    setBusy(true); setError('');
    try { await send(light, { operation: 3, config: submitted }); setSavedConfig(submitted); }
    catch (error) { setError(`Couldn’t save settings. ${String(error)}`); }
    finally { setBusy(false); }
  }

  return <Modal className="settings-sheet" title={setupStep === 'strip' ? 'LED Strip' : setupStep === 'wifi' ? 'Connect to Wi-Fi' : confirmReset ? 'Factory Reset' : wifi ? 'Wi-Fi' : update ? 'Firmware Update' : 'Settings'} close={() => { if (!busy) { if (setupStep === 'strip') { void finishSetup(false); return; } if (setupStep === 'wifi') { close(); return; } if (confirmReset) { setConfirmReset(false); setError(''); } else if (wifi) { scanGeneration.current++; setScanning(false); setNetworkOpen(false); setWifi(false); setPassword(''); setError(''); } else if (update) setUpdate(false); else close(); } }}><div className="sheet-body settings-body">
    {confirmReset ? <div className="factory-reset-confirm">
      <span className="empty-icon danger"><RotateCcw size={30} className={busy ? 'spinning' : ''} /></span>
      <h3>Reset {light.state.config.name}?</h3>
      <p>This permanently deletes all settings, saved colors, gradients, animations, Wi-Fi credentials, Bluetooth bonds and Matter pairings. Luxio will restart and need to be set up again.</p>
      <p>The installed firmware stays on your device.</p>
      <SheetButton type="button" variant="danger" disabled={busy} onClick={async () => {
        if (busy) return;
        setBusy(true); setError('');
        try {
          await send(light, { operation: 33, factoryResetConfirmed: true });
          removed(); notice('Factory reset requested. Luxio will restart. Reconnect using USB or Bluetooth to set it up again.');
        } catch (error) { setError(`Could not confirm the factory reset. Check the light before retrying. ${error instanceof Error ? error.message : String(error)}`); }
        finally { setBusy(false); }
      }}>{busy ? <><LoaderCircle size={16} className="spinning" />Resetting…</> : 'Delete All Data & Reset'}</SheetButton>
      <SheetButton type="button" autoFocus variant="secondary" disabled={busy} onClick={() => { setConfirmReset(false); setError(''); }}>Cancel</SheetButton>
    </div> : wifi ? <form className="wifi-form" onSubmit={async event => {
      event.preventDefault();
      if (busy || scanning || !selectedValue || !ssid) return;
      setBusy(true); setError('');
      try {
        if (new TextEncoder().encode(ssid).length > 32) throw new Error('Network names must be 32 bytes or fewer.');
        const passwordBytes = new TextEncoder().encode(password).length;
        if (secured && !((passwordBytes >= 8 && passwordBytes <= 63) || /^[a-f\d]{64}$/i.test(password))) throw new Error('Use an 8–63 byte password or a 64-digit hexadecimal password.');
        const before = (await send(light, { operation: 0 })).networkStatus;
        if (!mounted.current) return;
        const attempt = (await send(light, { operation: 4, wifi: { ssid, password: secured ? password : '' } })).networkStatus ?? before;
        const deadline = Date.now() + 20000;
        let rejoined = !before?.connected || before.ssid !== ssid;
        while (mounted.current && Date.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (!mounted.current) return;
          try {
            const result = await send(light, { operation: 0 });
            if (!mounted.current) return;
            const network = result.networkStatus;
            // When reconnecting to the same SSID, ignore the old connection
            // until the device has actually disconnected or restarted.
            if (network && (!network.connected || (network.disconnectCount ?? 0) > (before?.disconnectCount ?? 0) || (network.uptimeMs ?? Infinity) < (before?.uptimeMs ?? 0))) rejoined = true;
            if (rejoined && network?.connected && network.ssid === ssid && result.state?.lanIp && result.state.lanIp !== '0.0.0.0') {
              if (secured) {
                try { localStorage.setItem(`luxio-wifi-password-v1:${ssid}`, password); }
                catch { /* Do not turn a successful connection into a storage error. */ }
              }
              setPassword(''); setWifi(false); if (setupStep === 'wifi') setSetupStep('strip'); notice(`Connected to ${ssid}.`); return;
            }
            // Only act on a new failure from this attempt, not the previous
            // password's retained disconnect reason. A reboot resets the counter.
            const newDisconnect = network && ((network.disconnectCount ?? 0) > (attempt?.disconnectCount ?? 0) || ((network.uptimeMs ?? Infinity) < (attempt?.uptimeMs ?? 0) && (network.disconnectCount ?? 0) > 0));
            if (!network?.connected && newDisconnect) {
              // ESP-IDF: 4WAY_HANDSHAKE_TIMEOUT, AUTH_FAIL, HANDSHAKE_TIMEOUT.
              if ([15, 202, 204].includes(network.lastDisconnectReason ?? 0)) {
                setError('Wi-Fi authentication failed. Check the password and try again.'); return;
              }
              if ([201, 210, 211, 212].includes(network.lastDisconnectReason ?? 0)) {
                setError('Couldn’t find a compatible Wi-Fi network. Check that it is available and within range, then try again.'); return;
              }
            }
          } catch {
            // USB/BLE can stay connected while Wi-Fi changes. An HTTP device
            // may obtain a new address; resolve it by the same device identity.
            if (!light.transport && mounted.current && Date.now() < deadline) {
              try {
                const response = await fetch('https://api.luxio.lighting/devices', { signal: AbortSignal.timeout(3000) });
                if (response.ok) {
                  const found: unknown = await response.json();
                  if (mounted.current && Array.isArray(found)) discoverDevices(found.filter(device => device?.deviceId === light.state.deviceId));
                }
              } catch { /* Keep waiting for a confirmed connection until the deadline. */ }
            }
          }
        }
        if (mounted.current) setError(`Couldn’t confirm connection to ${ssid}. Check the password and network, then try again.${light.transport ? '' : ' If Luxio changed networks, reconnect using USB or Bluetooth.'}`);
      } catch (error) { if (mounted.current) setError(String(error)); } finally { if (mounted.current) setBusy(false); }
    }}>
      <label id="wifi-network-label">SSID</label>
      <div className="wifi-picker" ref={networkPicker} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setNetworkOpen(false); }} onKeyDown={event => {
        if (event.key === 'Escape' && networkOpen) { event.preventDefault(); event.stopPropagation(); setNetworkOpen(false); networkTrigger.current?.focus(); }
      }}>
        <button ref={networkTrigger} id="wifi-network-trigger" type="button" className="wifi-select" disabled={busy} aria-haspopup="listbox" aria-expanded={networkOpen} aria-controls="wifi-network-options" aria-labelledby="wifi-network-label wifi-network-value" aria-describedby="wifi-scan-status" onClick={() => setNetworkOpen(!networkOpen)} onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setNetworkOpen(true); }
        }}>
          <span id="wifi-network-value" className={`wifi-selected ${selectedValue ? '' : 'muted'}`}>
            {selectedNetwork && !customNetwork && !scanning && <span className="wifi-network-icon" role="img" aria-label={`${selectedNetwork.rssi} dBm, ${secured ? 'password required' : 'open network'}`}>
              <svg className={`wifi-signal strength-${selectedNetwork.rssi >= -55 ? 3 : selectedNetwork.rssi >= -70 ? 2 : selectedNetwork.rssi >= -80 ? 1 : 0}`} viewBox="0 0 24 24" aria-hidden="true"><path className="outer" d="M2 8a16 16 0 0 1 20 0"/><path className="middle" d="M5 12a11 11 0 0 1 14 0"/><path className="inner" d="M8.5 16a5.5 5.5 0 0 1 7 0"/><circle cx="12" cy="20" r="1" fill="currentColor" stroke="none"/></svg>
              {secured && <LockKeyhole className="wifi-lock" />}
            </span>}
            <span className="wifi-network-name" role="status" aria-live="polite">{scanning ? 'Scanning…' : options.find(option => option.value === selectedValue)?.label || 'Select a network'}</span>
          </span><ChevronDown size={14} />
        </button>
        <button type="button" className="wifi-refresh" aria-label="Refresh Wi-Fi networks" title="Refresh Wi-Fi networks" aria-busy={scanning} disabled={busy || scanning} onClick={() => void scanWifi(8000)}><RefreshCw size={16} className={scanning ? 'spinning' : ''} /></button>
        <ul ref={networkList} popover="manual" id="wifi-network-options" className="wifi-options" role="listbox" aria-labelledby="wifi-network-label" hidden={!networkOpen} onKeyDown={event => {
          const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]'));
          const index = items.indexOf(document.activeElement as HTMLElement);
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); items[index]?.click(); }
          else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
          } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            [...items.slice(index + 1), ...items.slice(0, index + 1)].find(item => item.textContent?.trim().toLowerCase().startsWith(event.key.toLowerCase()))?.focus();
          }
        }}>
          {options.map(option => <li key={option.value} role="option" tabIndex={-1} aria-selected={selectedValue === option.value} onClick={() => {
            if (selectedValue !== option.value) {
              setSelectedNetwork(option.network); setCustomNetwork(option.network ? '' : option.value as 'secured' | 'open');
              setSsid(option.network?.ssid ?? ''); setPassword(''); setError('');
            }
            setNetworkOpen(false); networkTrigger.current?.focus();
            if (!option.network) customSsid.current?.focus();
          }}>
            {option.network && <span className="wifi-network-icon" role="img" aria-label={`${option.network.rssi >= -55 ? 'Strong' : option.network.rssi >= -70 ? 'Good' : option.network.rssi >= -80 ? 'Fair' : 'Weak'} signal, ${option.network.rssi} dBm, ${option.network.passwordRequired ? 'password required' : 'open network'}`}>
              <svg className={`wifi-signal strength-${option.network.rssi >= -55 ? 3 : option.network.rssi >= -70 ? 2 : option.network.rssi >= -80 ? 1 : 0}`} viewBox="0 0 24 24" aria-hidden="true"><path className="outer" d="M2 8a16 16 0 0 1 20 0"/><path className="middle" d="M5 12a11 11 0 0 1 14 0"/><path className="inner" d="M8.5 16a5.5 5.5 0 0 1 7 0"/><circle cx="12" cy="20" r="1" fill="currentColor" stroke="none"/></svg>
              {option.network.passwordRequired && <LockKeyhole className="wifi-lock" />}
            </span>}
            <span className="wifi-network-name">{option.label}</span>
          </li>)}
        </ul>
      </div>
      {customNetwork && <input ref={customSsid} aria-label="Custom SSID" placeholder="Enter SSID" required maxLength={32} autoComplete="off" disabled={busy} value={ssid} onChange={event => setSsid(event.target.value)} />}
      {secured && <div className="wifi-password"><label htmlFor="wifi-password-input">Password</label><div className="wifi-password-field"><input id="wifi-password-input" required type={passwordVisible ? 'text' : 'password'} maxLength={64} autoComplete="current-password" disabled={busy} value={password} onChange={event => setPassword(event.target.value)} /><button type="button" className="wifi-password-toggle" aria-label={passwordVisible ? 'Hide password' : 'Show password'} aria-pressed={passwordVisible} disabled={busy} onClick={() => setPasswordVisible(visible => !visible)}>{passwordVisible ? <Eye size={18} /> : <EyeOff size={18} />}</button></div></div>}
      <span id="wifi-scan-status" className="wifi-scan-status" role="status" aria-live="polite">{scanStatus}</span>
      <SheetButton aria-busy={busy} disabled={busy || scanning || !selectedValue || !ssid || (secured && !password)}>{busy ? <><LoaderCircle size={16} className="spinning" /> Connecting…</> : 'Connect'}</SheetButton>
      {setupStep === 'wifi' && <button type="button" className="text-button setup-skip" disabled={busy} onClick={() => { scanGeneration.current++; setScanning(false); setNetworkOpen(false); setWifi(false); setPassword(''); setError(''); setSetupStep('strip'); }}>Skip</button>}
    </form> : update ? <div className="update-panel"><span className="empty-icon"><RefreshCw size={30} className={busy ? 'spinning' : ''} /></span><h3>{updateStatus === 'complete' ? 'Update Installed' : busy ? 'Installing Update' : 'Update Available'}</h3><p>{updateStatus === 'complete' ? `Luxio is now running build ${available}.` : `Build ${available} is ready to install. Keep Luxio powered on while it updates.`}</p>{progress !== null && <progress max={1} value={progress} aria-label="Download progress" />}{updateStatus && updateStatus !== 'complete' && <p role="status">{updateStatus}</p>}{!busy && updateStatus !== 'complete' && !updateStatus && <SheetButton onClick={() => void install()}>Install</SheetButton>}{!busy && light.address && updateStatus && updateStatus !== 'complete' && <a className="secondary-button" href={light.address} target="_blank" rel="noreferrer">Open Recovery <ArrowUpRight size={16} /></a>}{updateStatus === 'complete' && <SheetButton onClick={() => { setUpdate(false); setAvailable(0); }}>Done</SheetButton>}</div> : <>
      {setupStep === 'done' && !light.simulator && <><p className="field-label">CONNECTION</p><div className="group"><div className="setting-row"><span>Type</span><span className="muted">{light.transport === 'usb' ? <Usb size={15} /> : light.transport === 'bluetooth' ? <Bluetooth size={15} /> : <Wifi size={15} />} {light.transport === 'usb' ? 'USB' : light.transport === 'bluetooth' ? 'Bluetooth' : 'Wi-Fi'}</span></div></div></>}
      <form id="settings-form" onSubmit={event => { event.preventDefault(); if (setupStep === 'strip') { void finishSetup(true); return; } if (busy || !valid || !changed) return; if (!light.simulator && light.state.config.wifi?.enabled !== false && config.wifi?.enabled === false) setConfirmWifi(true); else void save(); }}>
        <p className="field-label">LED STRIP</p><div className="group strip-settings"><fieldset disabled={busy} className="strip-fields">{setupStep === 'done' && <label className="setting-row"><span>Name</span><input aria-label="Device name" required maxLength={63} value={config.name} onChange={event => setConfig({ ...config, name: event.target.value })} /></label>}<div className="setting-row"><span id="strip-type-label">Type</span>
          <div className="strip-picker" ref={stripPicker} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setStripOpen(false); }} onKeyDown={event => {
            if (event.key === 'Escape' && stripOpen) { event.preventDefault(); event.stopPropagation(); setStripOpen(false); stripTrigger.current?.focus(); }
          }}>
            <button ref={stripTrigger} type="button" className="strip-select" aria-label={`Strip type: ${config.stripType}`} aria-haspopup="listbox" aria-expanded={stripOpen} aria-controls="strip-type-options" onClick={() => setStripOpen(!stripOpen)} onKeyDown={event => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setStripOpen(true); }
            }}>
              <span className="strip-led" role="img" aria-label={stripChannels[config.stripType]?.map(channel => channel === 'warm' || channel === 'cool' ? `${channel} white` : channel).join(', ')}>
                {stripChannels[config.stripType]?.map(channel => <span key={channel} className={`led-${channel}`} />)}
              </span>
              <span>{config.stripType}</span><ChevronDown size={14} />
            </button>
            <ul ref={stripList} id="strip-type-options" className="strip-options" style={{ maxHeight: stripMenu.maxHeight, ...(stripMenu.above ? { top: 'auto', bottom: 'calc(100% + 5px)' } : {}) }} role="listbox" aria-labelledby="strip-type-label" hidden={!stripOpen} onKeyDown={event => {
              const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]'));
              const index = items.indexOf(document.activeElement as HTMLElement);
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); items[index]?.click(); }
              else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
              } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                event.preventDefault();
                [...items.slice(index + 1), ...items.slice(0, index + 1)].find(item => item.textContent?.trim().toLowerCase().startsWith(event.key.toLowerCase()))?.focus();
              }
            }}>
              {(light.state.supportedStripTypes?.length ? light.state.supportedStripTypes : [...new Set(['WS2805', 'WS2814', 'WS2812', 'SK6812', light.state.config.stripType])]).map(type => <li key={type} role="option" tabIndex={-1} aria-selected={config.stripType === type} onClick={() => {
                setConfig({ ...config, stripType: type }); setStripOpen(false); stripTrigger.current?.focus();
              }}>
                <span className="strip-led" role="img" aria-label={stripChannels[type]?.map(channel => channel === 'warm' || channel === 'cool' ? `${channel} white` : channel).join(', ')}>
                  {stripChannels[type]?.map(channel => <span key={channel} className={`led-${channel}`} />)}
                </span>
                <span>{type}</span>{config.stripType === type && <Check size={14} />}
              </li>)}
            </ul>
          </div>
        </div><div className="setting-row"><label htmlFor="led-count">LED Count</label><div className="led-count-stepper"><button type="button" className="icon-button" aria-label="Fewer LEDs" disabled={busy || config.ledCount <= 1} onClick={() => setConfig(current => ({ ...current, ledCount: Math.max(1, current.ledCount - 1) }))}><Minus size={18} /></button><input id="led-count" aria-label="LED Count" type="number" min={1} max={1024} step={1} required value={config.ledCount || ''} onKeyDown={event => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          const delta = event.key === 'ArrowUp' ? 1 : -1;
          setConfig(current => ({ ...current, ledCount: Math.max(1, Math.min(1024, current.ledCount + delta)) }));
        }} onChange={event => setConfig({ ...config, ledCount: Number(event.target.value) })} /><button type="button" className="icon-button" aria-label="More LEDs" disabled={busy || config.ledCount >= 1024} onClick={() => setConfig(current => ({ ...current, ledCount: Math.min(1024, current.ledCount + 1) }))}><Plus size={18} /></button></div></div>{!light.simulator && <label className="setting-row"><span>Data Pin</span><input aria-label="Data Pin" type="number" min={0} max={61} required value={config.gpio} onChange={event => setConfig({ ...config, gpio: Number(event.target.value) })} /></label>}</fieldset></div>{setupStep === 'strip' && <p className="field-note">Changes appear on your LED strip immediately. Use + and − or the arrow keys to adjust the number of LEDs.</p>}
        {!light.simulator && <>
          <p className="field-label">RELAY</p><div className="group"><div className="setting-row"><span>Enable Relay</span><Power label="Enable Relay" on={config.relay?.enabled ?? false} disabled={busy || light.state.build < 27} change={enabled => setConfig({ ...config, relay: { gpio: 0, inverted: false, ...config.relay, enabled } })} /></div>{config.relay?.enabled && <><label className="setting-row"><span>Relay GPIO</span><input aria-label="Relay GPIO" disabled={busy} type="number" required min={0} max={61} value={config.relay.gpio} onChange={event => setConfig({ ...config, relay: { ...config.relay!, gpio: Number(event.target.value) } })} /></label><div className="setting-row"><span>Invert Relay</span><Power label="Invert Relay" disabled={busy} on={config.relay.inverted} change={inverted => setConfig({ ...config, relay: { ...config.relay!, inverted } })} /></div></>}</div><p className="field-note">A relay switches power to the LED strip. Its GPIO must differ from Data Pin.{light.state.build < 27 ? ' Requires firmware build 27 or newer.' : ''}</p>
        </>}
        {setupStep === 'done' && !light.simulator && <>
          <p className="field-label">WI-FI</p><div className="group"><div className="setting-row"><span>Enable Wi-Fi</span><Power label="Enable Wi-Fi" disabled={light.state.build < 34} on={config.wifi?.enabled !== false} change={enabled => setConfig({ ...config, wifi: { enabled } })} /></div>{config.wifi?.enabled !== false && <><div className="setting-row"><span>SSID</span><span className="muted">{light.network?.ssid || '—'}</span></div><div className="setting-row"><span>IP Address</span><span className="muted">{light.state.lanIp || (light.address ? new URL(light.address).hostname : '—')}</span></div><div className="setting-row"><span>Gateway</span><span className="muted">{light.network?.gateway || '—'}</span></div><div className="setting-row"><span>DNS</span><span className="muted">{light.network?.dns?.join(', ') || '—'}</span></div><button type="button" className="link-row" disabled={busy || light.state.build < 24} onClick={() => { setWifi(true); void scanWifi(2000); }}><span className="settings-action"><Wifi size={16} />Configure Wi-Fi</span></button></>}</div><p className="field-note">Changing Enable Wi-Fi restarts Luxio. Reconnect using Bluetooth or USB to re-enable Wi-Fi.</p>
          {!light.state.matterDisabled && <><p className="field-label">MATTER</p><div className="group"><div className="setting-row"><span>Enable Matter</span><Power label="Enable Matter" disabled={light.state.build < 34} on={config.matter?.enabled !== false} change={enabled => setConfig({ ...config, matter: { enabled } })} /></div>{config.matter?.enabled !== false && config.wifi?.enabled !== false && <button type="button" className="link-row" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { const result = await send(light, { operation: 12 }); const { default: QRCode } = await import('qrcode'); setPairing(result.pairingCode); setQr(result.pairingQr ? await QRCode.toDataURL(result.pairingQr, { margin: 2, width: 220 }) : ''); } catch (error) { setError(String(error)); } finally { setBusy(false); } }}><span className="settings-action"><QrCode size={16} />Show Pairing Code</span></button>}{pairing && <div className="pairing">{qr && <img src={qr} alt="Matter pairing QR code" width={220} height={220} />}<div><code>{pairing}</code><button type="button" className="icon-button" aria-label="Copy pairing code" onClick={() => { void navigator.clipboard.writeText(pairing).then(() => setCopied(true)).catch(error => setError(String(error))); }}>{copied ? <Check size={18} /> : <Copy size={18} />}</button></div></div>}</div><p className="field-note">Connect Luxio to a compatible smart home. Changing Enable Matter restarts Luxio; existing pairings are retained.</p></>}
          <p className="field-label">FIRMWARE</p><div className="group"><div className="setting-row"><span>Build</span><span className="muted">{light.state.build}</span></div><button type="button" className="link-row" disabled={busy} aria-busy={checkingUpdate} onClick={() => void checkUpdate()}><span className="settings-action"><RefreshCw size={16} className={checkingUpdate ? 'spinning' : ''} />{checkingUpdate ? 'Checking...' : 'Check for Updates'}</span></button>{available > 0 && <button type="button" className="link-row" onClick={() => { setUpdate(true); setUpdateStatus(''); }}>Build {available} available <ArrowUpRight size={16} /></button>}</div>
        </>}
        {setupStep === 'done' && !light.simulator && <><p className="field-label">RESET</p><div className="group"><button type="button" className="link-row danger" disabled={busy || !light.online || !factoryResetSupported} onClick={() => { setError(''); setConfirmReset(true); }}><span className="settings-action"><RotateCcw size={16} />Factory Reset</span></button></div>{!factoryResetSupported && <p className="field-note">Update Luxio’s firmware to enable Factory Reset.</p>}</>}
        {setupStep === 'done' && light.simulator && <><p className="field-label">SIMULATOR</p><div className="group"><p className="field-note padded">A virtual Luxio running in this browser. Settings and saved items are kept on this device.</p><button type="button" className="link-row danger" onClick={() => setConfirmRemove(true)}>Remove Simulator</button></div></>}
        {!valid && <p className="error">Enter a name, 1–1024 LEDs, and valid, different GPIO pins (0–61).</p>}
      </form>
    </>}
    {error && <p className="error" role="alert">{error}</p>}
    {confirmWifi && <div className="inline-confirm" role="alert"><h3>Disable Wi-Fi?</h3><p>Saving will restart Luxio and disconnect this browser and Matter. Reconnect using Bluetooth or USB to enable Wi-Fi again.</p><button className="danger-button" disabled={busy} onClick={() => { setConfirmWifi(false); void save(); }}>Disable Wi-Fi</button><button className="text-button" onClick={() => setConfirmWifi(false)}>Cancel</button></div>}
    {light.simulator && confirmRemove && <div className="inline-confirm" role="alert"><h3>Remove Simulator?</h3><p>Its settings and saved library will be removed from this browser.</p><button className="danger-button" onClick={() => { remove(light); removed(); }}>Remove</button><button className="text-button" onClick={() => setConfirmRemove(false)}>Cancel</button></div>}
  </div>{!wifi && !update && !confirmReset && <footer className="settings-save"><SheetButton type="submit" form="settings-form" aria-busy={busy} disabled={!valid || (setupStep !== 'strip' && !changed) || busy}>{busy ? <><LoaderCircle size={16} className="spinning" /> Saving…</> : 'Save'}</SheetButton>{setupStep === 'strip' && <button type="button" className="text-button setup-skip" disabled={busy} onClick={() => void finishSetup(false)}>Skip</button>}</footer>}</Modal>;

  async function scanWifi(timeoutMs: number) {
    if (scanning) return;
    const generation = ++scanGeneration.current;
    setScanning(true); setScanStatus('');
    const minimumAnimation = new Promise<void>(resolve => setTimeout(resolve, 500));
    try {
      const deadline = Date.now() + timeoutMs;
      let result = await send(light, { operation: 16, wifiScanTimeoutMs: timeoutMs });
      while (result.wifiScanning && mounted.current && generation === scanGeneration.current) {
        if (Date.now() >= deadline) throw new Error('Scan timed out.');
        await new Promise(resolve => setTimeout(resolve, Math.min(100, Math.max(0, deadline - Date.now()))));
        if (!mounted.current || generation !== scanGeneration.current) return;
        result = await send(light, { operation: 0 });
      }
      if (!mounted.current || generation !== scanGeneration.current) return;
      if (result.wifiScanError) throw new Error(result.wifiScanError);
      const found = (result.wifiNetworks ?? []).filter(item => item.ssid).sort((a, b) => b.rssi - a.rssi);
      setNetworks(found.filter((item, index) => found.findIndex(other => other.ssid === item.ssid && other.passwordRequired === item.passwordRequired) === index));
      setSelectedNetwork(previous => found.find(item => item.ssid === previous?.ssid && item.passwordRequired === previous.passwordRequired) ?? previous);
      setScanStatus(found.length ? '' : 'No networks found. Enter another network or refresh.');
    } catch (error) {
      if (mounted.current && generation === scanGeneration.current) setScanStatus(`Could not scan networks. Enter another network or refresh. ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await minimumAnimation;
      if (mounted.current && generation === scanGeneration.current) setScanning(false);
    }
  }
  async function checkUpdate() {
    if (busy) return;
    setBusy(true); setCheckingUpdate(true); setError('');
    const minimumAnimation = new Promise<void>(resolve => setTimeout(resolve, 500));
    try {
      let result = await send(light, { operation: 13 });
      for (let i = 0; result.updateChecking && i < 45 && mounted.current; i++) { await new Promise(resolve => setTimeout(resolve, 1000)); result = await send(light, { operation: 0 }); }
      if (!mounted.current) return;
      if (result.updateError) throw new Error(result.updateError);
      if (result.updateChecking) throw new Error('Update check timed out. Try again.');
      await minimumAnimation;
      if (!mounted.current) return;
      setAvailable(result.availableBuild);
      if (result.availableBuild > light.state.build) { setUpdate(true); setUpdateStatus(''); } else notice('Your Luxio is up to date.');
    } catch (error) { if (mounted.current) setError(String(error)); }
    finally { await minimumAnimation; if (mounted.current) { setCheckingUpdate(false); setBusy(false); } }
  }
  async function install() {
    setBusy(true); setError(''); setProgress(null); setUpdateStatus('Starting update…');
    try {
      await send(light, { operation: 14 });
      setUpdateStatus('Waiting for Luxio to restart…');
      const deadline = Date.now() + 300000;
      while (Date.now() < deadline && mounted.current) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        try {
          if (!light.address) throw new Error('No recovery address');
          const response = await fetch(`${light.address}/status`, { signal: AbortSignal.timeout(3000) });
          if (response.ok) {
            const status = await response.json();
            if (status.build === available) {
              if (status.error) { setError(status.error); setUpdateStatus('Update interrupted. Open recovery to continue.'); return; }
              if (status.size > 0 && Number.isFinite(status.received)) { setProgress(Math.min(1, status.received / status.size)); setUpdateStatus(status.received >= status.size ? 'Verifying firmware and restarting…' : 'Downloading firmware…'); }
            }
          }
        } catch { /* Recovery endpoint is unavailable during reboot. */ }
        try { const result = await send(light, { operation: 0 }); if (result.state?.build === available) { setUpdateStatus('complete'); return; } } catch { /* Verify the expected build after reconnecting. */ }
      }
      setUpdateStatus('Luxio has not reconnected yet. The update may still be running.');
    } catch (error) { setError(String(error)); setUpdateStatus('Could not confirm the update. Check the light before retrying.'); }
    finally { setBusy(false); }
  }
}
