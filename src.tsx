import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import 'monaco-editor/esm/vs/basic-languages/lua/lua.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { Play, Square, Plus, ChevronDown, ChevronRight, FileCode2, Monitor, RefreshCw, Save, MoreHorizontal, PanelLeft, X, Check, LoaderCircle, Radio } from 'lucide-react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from './components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from './components/ui/dropdown-menu';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from './components/ui/context-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './components/ui/collapsible';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from './components/ui/resizable';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip';
import { presets } from './shared/web/presets';
import { requestHttp, type Color } from './shared/protocol/src/index';
import './styles.css';

// randomUUID is restricted to secure contexts; keep HTTP development usable.
crypto.randomUUID ??= () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

(self as unknown as { MonacoEnvironment: object }).MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });
monaco.editor.defineTheme('luxio', {
  base: 'vs-dark', inherit: true,
  rules: [{ token: 'keyword', foreground: 'CB9EF3' }, { token: 'string', foreground: 'A7D99C' }, { token: 'number', foreground: 'E9BF80' }, { token: 'comment', foreground: '737373' }],
  colors: { 'editor.background': '#141414', 'editor.foreground': '#e5e5e5', 'editorLineNumber.foreground': '#737373', 'editorLineNumber.activeForeground': '#d4d4d4', 'editor.lineHighlightBackground': '#1f1f1f', 'editor.selectionBackground': '#ffffff26', 'editorCursor.foreground': '#fafafa', 'editorIndentGuide.background1': '#303030', 'editorWidget.background': '#262626' },
});

type Document = { id: string; name: string; source: string | null; mode: number; address?: string; scriptId?: string; savedName: string; savedSource: string | null };
type Device = { address: string; name: string };
let nextId = 1;
let initial: Document[];
try {
  const stored = JSON.parse(localStorage.getItem('luxio-studio-workspace') ?? 'null');
  if (Array.isArray(stored) && stored.every(d => typeof d.id === 'string' && typeof d.name === 'string' && (typeof d.source === 'string' || d.source === null))) initial = stored;
  else {
    const draft = JSON.parse(localStorage.getItem('luxio-studio-draft') ?? 'null');
    initial = presets.map(p => ({ id: crypto.randomUUID(), name: p.name, source: p.source, mode: 2, savedName: p.name, savedSource: p.source }));
    if (typeof draft?.source === 'string') initial.unshift({ id: crypto.randomUUID(), name: draft.name || 'Untitled', source: draft.source, mode: 2, savedName: draft.name || 'Untitled', savedSource: draft.source });
  }
} catch { initial = presets.map(p => ({ id: crypto.randomUUID(), name: p.name, source: p.source, mode: 2, savedName: p.name, savedSource: p.source })); }

function Studio() {
  const [documents, setDocuments] = useState(initial);
  const [selected, setSelected] = useState(initial.find(d => !d.address)?.id ?? '');
  const [target, setTarget] = useState('simulator');
  const [devices, setDevices] = useState<Device[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [ipOpen, setIpOpen] = useState(false);
  const [devicePrompt, setDevicePrompt] = useState<string | null>(null);
  const [devicePromptSeen, setDevicePromptSeen] = useState(false);
  const [ip, setIp] = useState('');
  const [ipError, setIpError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [rename, setRename] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [sidebar, setSidebar] = useState(() => window.innerWidth >= 720);
  const [simulatorOpen, setSimulatorOpen] = useState(true);
  const [count, setCount] = useState(60);
  const [stripType, setStripType] = useState('WS2805');
  const [position, setPosition] = useState({ lineNumber: 1, column: 1 });
  const canvas = useRef<HTMLCanvasElement>(null);
  const worker = useRef<Worker | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pixels = useRef<Color[]>([]);
  const preview = useRef<{ address: string; id: string } | null>(null);
  const cleanup = useRef<Promise<void> | null>(null);
  const actions = useRef({ save: () => {}, test: () => {} });
  const current = documents.find(d => d.id === selected);
  const visible = documents.filter(d => !d.address || d.address === target);
  const dirty = current && (current.name !== current.savedName || current.source !== current.savedSource);

  useEffect(() => {
    try { localStorage.setItem('luxio-studio-workspace', JSON.stringify(documents)); }
    catch { setMessage('Browser storage is full. Download your scripts to keep a copy.'); }
  }, [documents]);

  async function discover() {
    setDiscovering(true);
    try {
      const response = await fetch('https://api.luxio.lighting/devices', { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`Discovery returned HTTP ${response.status}`);
      const found = await response.json();
      setDevices(previous => {
        const combined = new Map(previous.map(d => [d.address, d]));
        for (const d of found) if (typeof d.lan_ip === 'string' && typeof d.name === 'string') {
          const address = new URL(`http://${d.lan_ip.includes(':') && !d.lan_ip.startsWith('[') ? `[${d.lan_ip}]` : d.lan_ip}`).origin;
          combined.set(address, { address, name: d.name });
        }
        return [...combined.values()];
      });
    } catch { setNotice('Discovery unavailable. Use Enter IP… to connect.'); }
    finally { setDiscovering(false); }
  }
  useEffect(() => {
    void discover();
    try {
      const previous = JSON.parse(sessionStorage.getItem('luxio-studio-preview') ?? 'null');
      if (previous?.address && previous?.id) {
        preview.current = previous;
        void stop().catch(error => setMessage(`Could not remove the previous test script: ${String(error)}`));
      }
    } catch { /* No recoverable preview in this tab. */ }
    return () => { worker.current?.terminate(); clearTimeout(watchdog.current); };
  }, []);

  useEffect(() => {
    if (target === 'simulator') return;
    let cancelled = false;
    setLoading(true);
    Promise.all([requestHttp(target, { id: nextId++, operation: 0 }), requestHttp(target, { id: nextId++, operation: 5 })]).then(([status, list]) => {
      if (cancelled) return;
      if (status.state) { setCount(status.state.config.ledCount); setStripType(status.state.config.stripType); }
      setDocuments(previous => {
        const merged = [...previous];
        for (const script of list.scripts) {
          const found = merged.find(d => d.address === target && d.scriptId === script.id);
          if (!found) merged.push({ id: crypto.randomUUID(), address: target, scriptId: script.id, name: script.name, source: null, mode: script.mode === 1 ? 1 : 2, savedName: script.name, savedSource: null });
        }
        return merged;
      });
      setNotice('');
    }).catch(error => { if (!cancelled) setMessage(`${String(error)}. Check the address and browser local-network permission.`); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; setLoading(false); };
  }, [target]);

  useEffect(() => {
    if (!current?.address || !current.scriptId || current.source !== null) return;
    let cancelled = false;
    requestHttp(current.address, { id: nextId++, operation: 6, scriptId: current.scriptId }).then(result => {
      if (!result.script) throw new Error('Device did not return the script');
      if (!cancelled) setDocuments(previous => previous.map(d => d.id === current.id ? { ...d, source: result.script!.source, savedSource: result.script!.source } : d));
    }).catch(error => { if (!cancelled) setMessage(String(error)); });
    return () => { cancelled = true; };
  }, [current?.id, current?.source]);

  useEffect(() => {
    if (!canvas.current || !simulatorOpen) return;
    const element = canvas.current;
    let frame: number;
    const draw = () => {
      const bounds = element.getBoundingClientRect();
      const scale = devicePixelRatio;
      if (element.width !== Math.round(bounds.width * scale) || element.height !== Math.round(bounds.height * scale)) { element.width = bounds.width * scale; element.height = bounds.height * scale; }
      const ctx = element.getContext('2d')!;
      ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.clearRect(0, 0, bounds.width, bounds.height);
      const cell = (bounds.width - 40) / count;
      const y = bounds.height / 2;
      ctx.fillStyle = '#303030'; ctx.fillRect(18, y - 6, bounds.width - 36, 12);
      for (let i = 0; i < count; i++) {
        const pixel = pixels.current[i];
        const level = 1;
        const r = pixel ? Math.min(255, pixel.red + pixel.white + pixel.warmWhite + pixel.coolWhite * .8) * level : 54;
        const g = pixel ? Math.min(255, pixel.green + pixel.white + pixel.warmWhite * .73 + pixel.coolWhite * .9) * level : 54;
        const b = pixel ? Math.min(255, pixel.blue + pixel.white + pixel.warmWhite * .4 + pixel.coolWhite) * level : 54;
        ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = pixel ? 16 : 0;
        ctx.fillRect(20 + i * cell, y - 3, Math.max(.5, cell - 2), 6);
      }
      ctx.shadowBlur = 0; frame = requestAnimationFrame(draw);
    };
    draw(); return () => cancelAnimationFrame(frame);
  }, [count, simulatorOpen]);

  async function stop() {
    worker.current?.terminate(); worker.current = null; clearTimeout(watchdog.current); setRunning(false);
    if (cleanup.current) { await cleanup.current; return; }
    if (preview.current) {
      const active = preview.current;
      const pending = (async () => {
        // Only remove our temporary script. Another client may already have removed it.
        try { await requestHttp(active.address, { id: nextId++, operation: 9, scriptId: active.id }); }
        catch (error) {
          if (!(error instanceof Error) || error.message !== 'Script not found') throw error;
        }
        if (preview.current === active) {
          preview.current = null;
          sessionStorage.removeItem('luxio-studio-preview');
        }
      })();
      cleanup.current = pending;
      try { await pending; }
      finally { if (cleanup.current === pending) cleanup.current = null; }
    }
  }

  async function test() {
    if (busy) return;
    setMessage(''); setNotice(''); setBusy(true);
    try {
      const wasRunning = running;
      await stop();
      if (wasRunning) return;
      if (!current?.source) throw new Error('Select a script to test.');
      const source = monaco.editor.getModel(monaco.Uri.parse(`${current.id}.lua`))?.getValue() ?? current.source;
      if (target !== 'simulator') {
        const result = await requestHttp(target, { id: nextId++, operation: 7, script: { id: crypto.randomUUID(), name: 'Studio preview', source, mode: current.mode } });
        if (!result.script?.id) throw new Error('Device did not return a script ID');
        preview.current = { address: target, id: result.script.id };
        sessionStorage.setItem('luxio-studio-preview', JSON.stringify(preview.current));
        await requestHttp(target, { id: nextId++, operation: 10, scriptId: result.script.id });
      }
      worker.current = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      const fail = (error: string) => { void stop().catch(e => setMessage(`${error}. ${String(e)}`)); setMessage(error); };
      watchdog.current = setTimeout(() => fail('Animation stopped responding.'), 5000);
      worker.current.onmessage = event => {
        clearTimeout(watchdog.current);
        if (event.data.error) { fail(event.data.error); return; }
        watchdog.current = setTimeout(() => fail('Animation stopped responding.'), 5000);
        if (event.data.pixels) pixels.current = event.data.pixels;
      };
      worker.current.onerror = event => fail(event.message);
      worker.current.postMessage({ source, count, stripType, mode: current.mode });
      setRunning(true);
    } catch (error) { setMessage(String(error)); await stop().catch(() => {}); }
    finally { setBusy(false); }
  }

  async function save(doc = current) {
    if (busy || !doc) return;
    setBusy(true); setMessage(''); setNotice('');
    try {
      const name = doc.name.trim();
      let source = doc.source === null ? null : monaco.editor.getModel(monaco.Uri.parse(`${doc.id}.lua`))?.getValue() ?? doc.source;
      if (!name || new TextEncoder().encode(name).length > 63) throw new Error('Use a name of 1–63 bytes.');
      if (source === null && doc.address && doc.scriptId) {
        const result = await requestHttp(doc.address, { id: nextId++, operation: 6, scriptId: doc.scriptId });
        if (!result.script) throw new Error('Device did not return the script');
        source = result.script.source;
      }
      if (!source || new TextEncoder().encode(source).length > 16384) throw new Error('Scripts must contain 1–16,384 bytes.');
      let scriptId = doc.scriptId;
      if (target !== 'simulator') {
        const existing = doc.address === target ? doc.scriptId : undefined;
        const result = await requestHttp(target, { id: nextId++, operation: existing ? 8 : 7, script: { id: existing ?? crypto.randomUUID(), name, source, mode: doc.mode } });
        if (!result.script?.id) throw new Error('Device did not return a script ID');
        scriptId = result.script.id;
      } else localStorage.setItem('luxio-studio-workspace', JSON.stringify(documents.map(d => d.id === doc.id ? { ...d, name, source, savedName: name, savedSource: source } : d)));
      setDocuments(previous => previous.map(d => d.id === doc.id ? { ...d, name, source, savedName: name, savedSource: source, ...(target !== 'simulator' ? { address: target, scriptId } : {}) } : d));
      setNotice(target === 'simulator' ? 'Saved in this browser' : 'Saved to device');
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }
  actions.current = { save: () => void save(), test: () => void test() };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === 's' || event.key === 'Enter')) {
        event.preventDefault(); event.stopPropagation();
        if (event.key === 'Enter') actions.current.test(); else actions.current.save();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return <TooltipProvider delayDuration={400}><div className="studio">
    <header className="toolbar">
      <div className="brand"><img className="brand-mark" src="/luxio-jellyfish.png" alt="" width={32} height={32} /><strong>Luxio <span>Studio</span></strong></div>
      <div className="toolbar-controls">
        <Select value={target} disabled={busy} onValueChange={value => {
          const isChrome = /\b(?:Chrome|Chromium|HeadlessChrome)\//.test(navigator.userAgent) && !/\b(?:Edg|EdgA|OPR|SamsungBrowser)\//.test(navigator.userAgent) && !/\bwv\b/.test(navigator.userAgent);
          if (value !== 'simulator' && !isChrome && !devicePromptSeen) { setDevicePrompt(value); return; }
          if (value === 'enter-ip') { setIpOpen(true); setIpError(''); return; }
          setBusy(true); void stop().then(() => { setTarget(value); setMessage(''); if (current?.address && current.address !== value) setSelected(documents.find(d => !d.address || d.address === value)?.id ?? ''); }).catch(error => setMessage(String(error))).finally(() => setBusy(false));
        }}>
          <SelectTrigger aria-label="Device" className="device-select"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="simulator"><Monitor />Simulator</SelectItem>
            {devices.map(d => <SelectItem key={d.address} value={d.address} textValue={d.name}><Radio />{d.name}<span className="device-ip text-xs text-muted-foreground">{new URL(d.address).hostname}</span></SelectItem>)}
            <SelectSeparator />
            <SelectItem value="enter-ip">Enter IP...</SelectItem>
          </SelectContent>
        </Select>
        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Refresh devices" disabled={discovering} onClick={() => void discover()}><RefreshCw className={discovering ? 'animate-spin' : ''} /></Button></TooltipTrigger><TooltipContent>Refresh devices</TooltipContent></Tooltip>
        <span className="toolbar-divider" />
        <Button variant="ghost" size="sm" disabled={busy || loading || (!running && !current?.source)} onClick={() => void test()} aria-label={running ? 'Stop test' : 'Test'} className={running ? 'test-active' : ''}>{running ? <Square className="fill-current" /> : <Play className="fill-current" />}<span>{running ? 'Stop' : 'Test'}</span></Button>
        <Button size="sm" disabled={busy || !current?.source} onClick={() => void save()}><Save />Save</Button>
      </div>
    </header>
    <main className="workspace"><ResizablePanelGroup orientation="horizontal">
      {sidebar && <><ResizablePanel defaultSize="230px" minSize="170px" maxSize="360px"><aside className="sidebar">
        <div className="pane-heading"><span>Animations</span><Button variant="ghost" size="icon-xs" aria-label="New animation" disabled={busy} onClick={() => {
          const id = crypto.randomUUID(); const name = 'Untitled';
          setDocuments(previous => [...previous, { id, name, source: 'function setup()\nend\n\nfunction loop()\n  for i = 0, luxio_get_pixel_count() - 1 do\n    luxio_set_pixel_color(i, 0, 210, 255)\n  end\nend\n', mode: 2, savedName: '', savedSource: '' }]); setSelected(id); setRename(id);
        }}><Plus /></Button></div>
        <div className="file-list" aria-label="Animations">
          {visible.map(doc => <ContextMenu key={doc.id} onOpenChange={open => { if (open) setSelected(doc.id); }}><ContextMenuTrigger asChild disabled={busy}><div className={`file-row ${selected === doc.id ? 'selected' : ''}`}>
            <button className="file-select" aria-label={`Open ${doc.name}.lua`} disabled={busy} onClick={() => { setSelected(doc.id); setMessage(''); setNotice(''); }} onDoubleClick={() => setRename(doc.id)}><FileCode2 /><span className="file-title">{rename === doc.id ? <input autoFocus disabled={busy} aria-label="Animation name" defaultValue={doc.name} onClick={e => e.stopPropagation()} onFocus={e => e.target.select()} onBlur={e => {
              const name = e.currentTarget.value.trim(); setRename(null);
              if (name === doc.name) return;
              setDocuments(previous => previous.map(d => d.id === doc.id ? { ...d, name } : d));
              void save({ ...doc, name });
            }} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); if (e.key === 'Escape') e.currentTarget.value = doc.name; e.currentTarget.blur(); } e.stopPropagation(); }} /> : <span>{doc.name}</span>}<small>.lua</small></span>{(doc.name !== doc.savedName || doc.source !== doc.savedSource) && <span className="dirty-dot" aria-label="Unsaved changes" />}</button>
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-xs" className="file-menu" aria-label={`Actions for ${doc.name}`} disabled={busy}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => { setSelected(doc.id); setRename(doc.id); }}>Rename</DropdownMenuItem>
              <DropdownMenuItem disabled={doc.source === null} onSelect={() => { const id = crypto.randomUUID(); setDocuments(previous => [...previous, { ...doc, id, name: `${doc.name} copy`, address: undefined, scriptId: undefined, savedName: '', savedSource: '' }]); setSelected(id); }}>Duplicate</DropdownMenuItem>
              <DropdownMenuItem disabled={doc.source === null} onSelect={() => { const url = URL.createObjectURL(new Blob([doc.source!], { type: 'text/plain' })); const link = document.createElement('a'); link.href = url; link.download = `${doc.name.replace(/[/\\]/g, '-') || 'animation'}.lua`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Download .lua</DropdownMenuItem>
              <DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => setDeleteId(doc.id)}>Delete</DropdownMenuItem>
            </DropdownMenuContent></DropdownMenu>
          </div></ContextMenuTrigger><ContextMenuContent>
            <ContextMenuItem disabled={busy} onSelect={() => { setSelected(doc.id); setRename(doc.id); }}>Rename</ContextMenuItem>
            <ContextMenuItem disabled={busy || doc.source === null} onSelect={() => { const id = crypto.randomUUID(); setDocuments(previous => [...previous, { ...doc, id, name: `${doc.name} copy`, address: undefined, scriptId: undefined, savedName: '', savedSource: '' }]); setSelected(id); }}>Duplicate</ContextMenuItem>
            <ContextMenuItem disabled={busy || doc.source === null} onSelect={() => { const url = URL.createObjectURL(new Blob([doc.source!], { type: 'text/plain' })); const link = document.createElement('a'); link.href = url; link.download = `${doc.name.replace(/[/\\]/g, '-') || 'animation'}.lua`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Download .lua</ContextMenuItem>
            <ContextMenuSeparator /><ContextMenuItem variant="destructive" disabled={busy} onSelect={() => setDeleteId(doc.id)}>Delete</ContextMenuItem>
          </ContextMenuContent></ContextMenu>)}
          {loading && <div className="sidebar-status"><LoaderCircle className="animate-spin" />Loading scripts…</div>}
        </div>
        <div className="sidebar-footer"><span className="connection-dot" />{target === 'simulator' ? 'Local workspace' : devices.find(d => d.address === target)?.name ?? 'Device'}</div>
      </aside></ResizablePanel><ResizableHandle /></>}
      <ResizablePanel minSize="250px"><section className="editor-pane">
        <div className="editor-tabs"><Button variant="ghost" size="icon-xs" aria-label="Toggle sidebar" onClick={() => setSidebar(!sidebar)}><PanelLeft /></Button>{current && <div className="editor-tab"><FileCode2 /><span>{current.name}<span className="extension">.lua</span></span>{dirty && <span className="dirty-dot" />}</div>}<span className="editor-language">Lua</span></div>
        <div className="editor-container">{current ? <Editor path={`${current.id}.lua`} value={current.source ?? ''} language="lua" theme="luxio" loading={<span className="editor-empty">Loading editor…</span>} onMount={editor => {
          editor.onDidChangeCursorPosition(event => setPosition(event.position));
          editor.onDidChangeModelContent(() => {
            const model = editor.getModel(); if (!model) return;
            const id = model.uri.path.replace(/^\//, '').replace(/\.lua$/, ''); const source = model.getValue();
            setDocuments(previous => previous.map(d => d.id === id && d.source !== null && d.source !== source ? { ...d, source } : d));
          });
        }} options={{ readOnly: busy || current.source === null, fontSize: 13, fontFamily: '"SF Mono", Menlo, Monaco, monospace', lineHeight: 23, minimap: { enabled: false }, padding: { top: 18 }, scrollBeyondLastLine: false, smoothScrolling: true, tabSize: 2, automaticLayout: true, renderLineHighlight: 'all', overviewRulerLanes: 0, hideCursorInOverviewRuler: true, scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 }, fixedOverflowWidgets: true }} /> : <div className="editor-empty"><FileCode2 /><p>Select an animation or create a new one.</p></div>}</div>
        {message && <div className="error-message" role="alert"><span>{message}</span><Button variant="ghost" size="icon-xs" aria-label="Dismiss error" onClick={() => setMessage('')}><X /></Button></div>}
        <Collapsible open={simulatorOpen} onOpenChange={setSimulatorOpen} className="simulator">
          <div className="simulator-heading"><CollapsibleTrigger asChild><Button variant="ghost" size="sm" aria-label={simulatorOpen ? 'Collapse simulator' : 'Expand simulator'}>{simulatorOpen ? <ChevronDown /> : <ChevronRight />}<Monitor />Simulator</Button></CollapsibleTrigger><span className={`simulation-state ${running ? 'running' : ''}`}><span />{running ? 'Running' : 'Stopped'}</span></div>
          <CollapsibleContent><div className="simulation-settings">
            <Select value={stripType} disabled={running || target !== 'simulator'} onValueChange={setStripType}><SelectTrigger aria-label="Strip type"><SelectValue /></SelectTrigger><SelectContent>{['WS2805', 'WS2814', 'WS2812'].map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select>
            <label className="count-control"><Input aria-label="LED count" type="number" min={1} max={1024} value={count} disabled={running || target !== 'simulator'} onChange={e => setCount(Math.min(1024, Math.max(1, Number(e.target.value) || 1)))} /><span>LEDs</span></label>
          </div><canvas ref={canvas} className="strip-canvas" aria-label="Simulated LED strip" /></CollapsibleContent>
        </Collapsible>
        <footer className="statusbar"><span role="status">{busy ? <><LoaderCircle className="animate-spin" />Working…</> : notice ? <><Check />{notice}</> : <><span className="connection-dot" />{target === 'simulator' ? 'Simulator' : new URL(target).host}</>}</span><span>Ln {position.lineNumber}, Col {position.column}<span className="status-separator">UTF-8</span><span>Lua</span></span></footer>
      </section></ResizablePanel>
    </ResizablePanelGroup></main>
    <Dialog open={devicePrompt !== null} onOpenChange={open => { if (!open) setDevicePrompt(null); }}><DialogContent className="device-browser-dialog">
      <DialogHeader><DialogTitle>Connect with Google Chrome</DialogTitle><DialogDescription>For device control, open Studio in the latest Google Chrome on a computer or Android device.</DialogDescription></DialogHeader>
      <div className="device-browser-permission"><Check aria-hidden="true" /><div><strong>Allow local network access</strong><p>When Chrome asks, choose Allow. This lets Studio connect from this secure page to your lights on the same local network.</p></div></div>
      <p className="device-browser-note">Safari and other browsers may block these connections. You can still use the simulator without connecting a device.</p>
      <a className="device-browser-link" href="https://www.google.com/chrome/" target="_blank" rel="noopener noreferrer">Get Google Chrome <span aria-hidden="true">↗</span></a>
      <DialogFooter><Button className="w-full" onClick={() => {
        const value = devicePrompt; if (!value) return;
        setDevicePromptSeen(true); setDevicePrompt(null);
        if (value === 'enter-ip') { setIpOpen(true); setIpError(''); return; }
        setBusy(true); void stop().then(() => { setTarget(value); setMessage(''); setSelected(''); }).catch(error => setMessage(String(error))).finally(() => setBusy(false));
      }}>Understood</Button></DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={ipOpen} onOpenChange={open => { if (!connecting) setIpOpen(open); }}><DialogContent className="ip-dialog"><DialogHeader><DialogTitle>Connect to device</DialogTitle><DialogDescription>Enter the device’s local IP address.</DialogDescription></DialogHeader>
      <form onSubmit={async event => {
        event.preventDefault(); setConnecting(true); setIpError('');
        try {
          let value = ip.trim(); if (!value.includes('://') && value.split(':').length > 2 && !value.startsWith('[')) value = `[${value}]`;
          const url = new URL(value.includes('://') ? value : `http://${value}`);
          if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Enter an IP address or hostname, optionally with a port.');
          const address = url.origin;
          const result = await requestHttp(address, { id: nextId++, operation: 0 });
          if (!result.state) throw new Error('No Luxio device found at this address.');
          await stop();
          setDevices(previous => [...previous.filter(d => d.address !== address), { address, name: result.state!.config.name }]);
          if (current?.address && current.address !== address) setSelected(documents.find(d => !d.address || d.address === address)?.id ?? '');
          setTarget(address); setMessage(''); setIpOpen(false);
        } catch (error) { setIpError(error instanceof TypeError || (error instanceof DOMException && error.name === 'TimeoutError') ? `${String(error)} Check the IP and local-network permission.` : String(error)); }
        finally { setConnecting(false); }
      }}><Input aria-label="IP address" placeholder="192.168.1.231" autoComplete="off" value={ip} onChange={e => setIp(e.target.value)} disabled={connecting} />{ipError && <p className="dialog-error" role="alert">{ipError}</p>}<DialogFooter><Button type="button" variant="ghost" onClick={() => setIpOpen(false)} disabled={connecting}>Cancel</Button><Button type="submit" disabled={connecting || !ip.trim()}>{connecting && <LoaderCircle className="animate-spin" />}Connect</Button></DialogFooter></form>
    </DialogContent></Dialog>
    <Dialog open={!!deleteId} onOpenChange={open => { if (!open && !busy) setDeleteId(null); }}><DialogContent><DialogHeader><DialogTitle>Delete {documents.find(d => d.id === deleteId)?.name}.lua?</DialogTitle><DialogDescription>{documents.find(d => d.id === deleteId)?.address ? 'This removes the saved script from the device.' : 'This removes the script from this browser.'}</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" disabled={busy} onClick={() => setDeleteId(null)}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={async () => {
      const doc = documents.find(d => d.id === deleteId); if (!doc) return; setBusy(true);
      try { if (doc.address && doc.scriptId) await requestHttp(doc.address, { id: nextId++, operation: 9, scriptId: doc.scriptId }); setDocuments(previous => previous.filter(d => d.id !== doc.id)); if (selected === doc.id) setSelected(visible.find(d => d.id !== doc.id)?.id ?? ''); setDeleteId(null); }
      catch (error) { setMessage(String(error)); setDeleteId(null); } finally { setBusy(false); }
    }}>Delete</Button></DialogFooter></DialogContent></Dialog>
  </div></TooltipProvider>;
}
createRoot(document.getElementById('root')!).render(<Studio />);
