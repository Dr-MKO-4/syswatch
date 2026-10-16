import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AUTH_TOKEN, Fleet, PORT, REFRESH_MS } from './sim';
import { useMaster, useNc } from './programs';
import { Terminal } from './Terminal';

type ClientTab = 'nc' | 'master';

function Bar({ value, tone }: { value: number; tone: string }) {
  return (
    <span className="mbar" aria-hidden="true">
      <span className={`mbar-fill ${tone}`} style={{ width: `${Math.min(100, value)}%` }} />
    </span>
  );
}

export default function App() {
  const fleet = useMemo(() => new Fleet(), []);
  useEffect(() => { fleet.start(); return () => fleet.stop(); }, [fleet]);
  useSyncExternalStore(fleet.subscribe, fleet.getVersion);

  const [agentName, setAgentName] = useState('PC-02');
  const [tab, setTab] = useState<ClientTab>('nc');
  const nc = useNc(fleet);
  const master = useMaster(fleet);
  const prog = tab === 'nc' ? nc : master;
  const inputRef = useRef<HTMLInputElement>(null);
  const agent = fleet.byName(agentName)!;

  const runSuggestion = (s: string) => {
    prog.submit(s);
    inputRef.current?.focus();
  };

  const tabTitle = (t: ClientTab) => (t === 'nc' ? `PC-ADMIN · nc${nc.target ? ` ${fleet.byName(nc.target)?.ip}` : ''}` : 'PC-ADMIN · syswatch master');

  return (
    <div className="page">
      <header className="top">
        <div className="title">
          <span className="logo" aria-hidden="true">&gt;_</span>
          <div>
            <h1>SysWatch</h1>
            <p>Supervision de parc en Rust : agent TCP de métriques système et console maître.</p>
          </div>
        </div>
        <span className="demo-banner" role="note">Démo · données simulées</span>
      </header>

      <section className="fleet" aria-label="Parc simulé">
        {fleet.machines.map((m) => {
          const s = m.snap;
          const memPct = (s.mem.usedMb / s.mem.totalMb) * 100;
          return (
            <button key={m.name} className={`mcard ${agentName === m.name ? 'sel' : ''} ${m.online ? '' : 'off'}`} onClick={() => setAgentName(m.name)}
              aria-pressed={agentName === m.name} aria-label={`Afficher la console agent de ${m.name}`}>
              <span className="mhead">
                <strong>{m.name}</strong>
                <span className={`state ${m.online ? 'on' : m.booting ? 'boot' : 'off'}`}>{m.online ? (m.pendingPower ? 'arrêt programmé' : 'en ligne') : m.booting ? 'redémarrage' : 'hors ligne'}</span>
              </span>
              <span className="mip">{m.ip}:{PORT} · {m.cores} cœurs</span>
              {m.online ? (
                <>
                  <span className="mrow">CPU <Bar value={s.cpu.usage} tone="cpu" /> {s.cpu.usage.toFixed(1)}%</span>
                  <span className="mrow">MEM <Bar value={memPct} tone="mem" /> {memPct.toFixed(1)}%</span>
                </>
              ) : (
                <span className="mrow dim">agent injoignable</span>
              )}
            </button>
          );
        })}
      </section>

      <div className="window">
        <section className="pane agent" aria-label="Console de l'agent">
          <div className="tabs">
            <span className="tab active">
              <span className="ti" aria-hidden="true">&gt;_</span>
              <label htmlFor="agent-sel" className="sr-only">Machine affichée</label>
              <select id="agent-sel" value={agentName} onChange={(e) => setAgentName(e.target.value)}>
                {fleet.machines.map((m) => <option key={m.name} value={m.name}>{m.name} · syswatch (agent)</option>)}
              </select>
            </span>
          </div>
          <Terminal lines={agent.log} label={`Console agent ${agent.name}`} />
          {!agent.online && !agent.booting && (
            <div className="pane-foot">
              <span>{agent.name} est hors ligne.</span>
              <button className="btn" onClick={() => { agent.boot(); fleet.emit(); }}>Démarrer l'agent sur {agent.name}</button>
            </div>
          )}
        </section>

        <section className="pane client" aria-label="Poste d'administration">
          <div className="tabs" role="tablist">
            {(['nc', 'master'] as ClientTab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                <span className="ti" aria-hidden="true">&gt;_</span> {tabTitle(t)}
              </button>
            ))}
            <span className="chrome" aria-hidden="true">–  ☐  ✕</span>
          </div>
          <Terminal key={tab} lines={prog.lines} prompt={prog.prompt} mask={tab === 'nc' && nc.mask} onSubmit={prog.submit} label={tabTitle(tab)} inputRef={inputRef} />
          <div className="pane-foot sugg" aria-label="Commandes rapides">
            {prog.suggestions.map((s) => (
              <button key={s} className="chip" onClick={() => runSuggestion(s)}>{s}</button>
            ))}
          </div>
        </section>
      </div>

      <footer className="notes">
        <p>
          <strong>Ce qui est simulé.</strong> Les machines, leurs métriques (marche aléatoire bornée, rafraîchie toutes les {REFRESH_MS / 1000} s
          comme <code>snapshot_refresher</code>) et les connexions TCP n'existent que dans le navigateur. Les réponses suivent
          <code>format_response</code>, l'authentification par jeton, le marqueur <code>END</code> et la console maître
          (<code>scan</code>, <code>select</code>, <code>all</code>) du code Rust. <code>shutdown</code>, <code>reboot</code> et
          <code>install</code> ne lancent rien : leur effet est seulement mis en scène.
        </p>
        <p>Jeton de démonstration : <code>{AUTH_TOKEN}</code>. Noms de machines et adresses IP fictifs.</p>
      </footer>
    </div>
  );
}
