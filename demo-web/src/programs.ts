// Programmes côté poste d'administration : client `nc` brut et console maître (master.rs).
import { useCallback, useEffect, useRef, useState } from 'react';
import { AUTH_TOKEN, AgentSession, Fleet, PORT, type Line, type Machine, type Tone } from './sim';

const L = (text: string, tone: Tone = 'out'): Line => ({ text, tone });
const split = (text: string, tone: Tone = 'out') => text.replace(/\n$/, '').split('\n').map((t) => L(t, tone));

// ── nc <ip> 7878 ──────────────────────────────────────────────────────────────
type NcMode = 'shell' | 'token' | 'session';

export function useNc(fleet: Fleet) {
  const [lines, setLines] = useState<Line[]>([L('Client TCP brut (nc) sur le poste PC-ADMIN. Tapez « help ».', 'dim')]);
  const [mode, setMode] = useState<NcMode>('shell');
  const session = useRef<AgentSession | null>(null);
  const push = (...ls: Line[]) => setLines((l) => [...l, ...ls].slice(-800));

  // Coupure de la connexion si la machine distante s'éteint.
  useEffect(() => fleet.subscribe(() => {
    const s = session.current;
    if (s && !s.m.online) {
      session.current = null;
      setMode('shell');
      setLines((l) => [...l, L(`nc: connexion fermée par ${s.m.ip}`, 'dim')]);
    }
  }), [fleet]);

  const submit = useCallback((raw: string) => {
    if (mode === 'shell') {
      push(L(`user@PC-ADMIN:~$ ${raw}`, 'cmd'));
      const [cmd, host, port] = raw.trim().split(/\s+/);
      if (!cmd) return;
      if (cmd === 'clear') return setLines([]);
      if (cmd === 'help') return push(...split(`Commandes du poste simulé :\n  nc <ip> ${PORT}      ouvrir une connexion TCP vers un agent\n  telnet <ip> ${PORT}  idem\n  clear             effacer l'écran\nAgents du parc : ${fleet.machines.map((m) => m.ip).join(', ')}`, 'dim'));
      if (cmd !== 'nc' && cmd !== 'telnet') return push(L(`${cmd}: command not found`, 'err'));
      if (!host || !port) return push(L(`usage: ${cmd} <hôte> <port>`, 'err'));
      const m: Machine | undefined = fleet.byIp(host);
      if (!m || !m.online || Number(port) !== PORT)
        return push(L(`${cmd}: connect to ${host} port ${port} (tcp) failed: Connection timed out`, 'err'));
      session.current = new AgentSession(fleet, m, fleet.peer());
      fleet.emit();
      setMode('token');
      return;
    }
    const s = session.current;
    if (!s) return setMode('shell');
    if (mode === 'token') {
      push(L(`TOKEN: ${'*'.repeat(raw.length)}`));
      if (!s.auth(raw)) {
        push(L('UNAUTHORIZED', 'err'));
        session.current = null;
        setMode('shell');
      } else {
        push(L('OK', 'ok'));
        setMode('session');
      }
      fleet.emit();
      return;
    }
    push(L(raw, 'cmd'));
    const out = s.command(raw);
    const ls = out.replace(/\n$/, '').split('\n').map((t) => L(t, t === 'END' ? 'dim' : t === 'BYE' ? 'warn' : 'out'));
    push(...ls);
    if (s.closed) {
      session.current = null;
      setMode('shell');
    }
    fleet.emit();
  }, [mode, fleet]);

  const prompt = mode === 'shell' ? { text: 'user@PC-ADMIN:~$ ', tone: 'accent' as const } : mode === 'token' ? { text: 'TOKEN: ', tone: 'prompt' as const } : { text: '', tone: 'prompt' as const };
  const target = session.current?.m.name;
  const suggestions =
    mode === 'shell' ? ['nc 192.168.1.102 7878', 'nc 192.168.1.103 7878', 'help']
      : mode === 'token' ? [AUTH_TOKEN, 'MAUVAIS']
        : ['cpu', 'mem', 'ps', 'all', 'help', 'msg Bonjour la salle', 'install git.git', 'quit'];
  return { lines, prompt, mask: mode === 'token', submit, suggestions, mode, target };
}

// ── syswatch-master ───────────────────────────────────────────────────────────
const MENU = `
╔══════════════════════════════════════════════╗
║        SYSWATCH MASTER – ENSPD 2026          ║
╠══════════════════════════════════════════════╣
║  scan          – lister les machines         ║
║  select <nom>  – cibler une machine          ║
║  all <cmd>     – envoyer cmd à toutes        ║
╠══════════════════════════════════════════════╣
║  Commandes disponibles sur les agents :      ║
║  cpu / mem / ps / all                        ║
║  msg <texte>   – afficher message            ║
║  install <pkg> – installer un logiciel       ║
║  shutdown      – éteindre la machine         ║
║  reboot        – redémarrer                  ║
║  abort         – annuler extinction          ║
╠══════════════════════════════════════════════╣
║  help          – afficher ce menu            ║
║  quit          – quitter le master           ║
╚══════════════════════════════════════════════╝`;

/** Ordre d'itération du HashMap (non déterministe en Rust) figé pour la démo. */
const ORDER = ['PC-03', 'PC-01', 'PC-04', 'PC-02'];

export function useMaster(fleet: Fleet) {
  const start = (): Line[] => [L('PS C:\\syswatch> cargo run --release --bin syswatch-master', 'cmd'), ...split(MENU, 'box')];
  const [lines, setLines] = useState<Line[]>(start);
  const [running, setRunning] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const push = (...ls: Line[]) => setLines((l) => [...l, ...ls].slice(-800));
  const machines = () => ORDER.map((n) => fleet.byName(n)!).filter(Boolean);

  /** connect_to() + run_command() : une session complète par commande (connexion, jeton, commande, fermeture). */
  const exec = (m: Machine, cmd: string): { ok: boolean; head: Line; body?: string } => {
    if (!m.online) return { ok: false, head: L(`  [✗] ${m.name} (${m.ip}) – Connexion refusée: connection timed out (os error 10060)`, 'err') };
    const s = new AgentSession(fleet, m, fleet.peer());
    s.auth(AUTH_TOKEN);
    const raw = s.command(cmd);
    s.close();
    const body = raw.split('\nEND\n')[0];
    return { ok: true, head: L(`  [✓] Connecté à ${m.name} (${m.ip})`, 'ok'), body };
  };

  const submit = useCallback((raw: string) => {
    const input = raw.trim();
    if (!running) {
      push(L(`PS C:\\syswatch> ${raw}`, 'cmd'));
      if (/^cargo run( --release)? --bin (syswatch-)?master$/.test(input)) {
        setRunning(true);
        setSelected(null);
        push(...split(MENU, 'box'));
      } else if (input === 'cls' || input === 'clear') setLines([]);
      else if (input) push(L("Relancez la console avec : cargo run --release --bin syswatch-master", 'dim'));
      return;
    }
    push(L(`${selected ? `[master@${selected}]> ` : '[master]> '}${raw}`, 'cmd'));
    if (!input) return;
    if (input === 'quit' || input === 'exit') { push(L('Au revoir.')); setRunning(false); return; }
    if (input === 'help') return push(...split(MENU, 'box'));
    if (input === 'scan') {
      push(L('Scan du réseau...'));
      for (const m of machines()) push(L(`  ${m.name} (${m.ip}) – ${m.online ? '✓ EN LIGNE' : '✗ HORS LIGNE'}`, m.online ? 'ok' : 'err'));
      fleet.emit();
      return;
    }
    if (input.startsWith('select ')) {
      const name = input.slice(7).trim();
      if (fleet.byName(name)) { setSelected(name); push(L(`Machine sélectionnée : ${name}`)); }
      else push(L(`Machine inconnue : '${name}'. Lance 'scan' pour voir les machines.`, 'err'));
      return;
    }
    if (input.startsWith('all ')) {
      const cmd = input.slice(4).trim();
      push(L(`Envoi de '${cmd}' à toutes les machines...`));
      for (const m of machines()) {
        const r = exec(m, cmd);
        push(L(`  ${m.name} – ${r.head.text.trimStart()}`, r.head.tone));
        push(L(r.ok ? r.body!.split('\n')[0] || '(vide)' : 'hors ligne', r.ok ? 'out' : 'dim'));
      }
      fleet.emit();
      return;
    }
    if (!selected) return push(L("Aucune machine sélectionnée. Utilise 'select <nom>' ou 'all <cmd>'.", 'warn'));
    const m = fleet.byName(selected)!;
    const r = exec(m, input);
    push(r.head);
    if (!r.ok) push(L('Machine hors ligne.', 'dim'));
    else push(...split(r.body!), L(''));
    fleet.emit();
  }, [running, selected, fleet]);

  const prompt = running ? { text: selected ? `[master@${selected}]> ` : '[master]> ', tone: 'accent' as const } : { text: 'PS C:\\syswatch> ', tone: 'accent' as const };
  const suggestions = running
    ? selected ? ['mem', 'cpu', 'ps', 'msg Pause de 10 minutes', 'reboot', 'abort', 'scan', 'quit'] : ['scan', 'select PC-02', 'all cpu', 'all mem', 'help']
    : ['cargo run --release --bin syswatch-master'];
  return { lines, prompt, submit, suggestions };
}
