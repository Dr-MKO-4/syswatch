// Simulation fidèle du comportement de src/main.rs (agent) et src/master.rs (console maître).
// Aucune vraie métrique n'est lue et aucune connexion réseau n'est ouverte : les machines,
// leurs métriques (marche aléatoire bornée) et les sessions TCP sont simulées en mémoire.

export type Tone = 'out' | 'cmd' | 'dim' | 'ok' | 'err' | 'warn' | 'accent' | 'prompt' | 'box';
export interface Line { text: string; tone: Tone }

export interface ProcessInfo { pid: number; name: string; cpu: number; memMb: number }
export interface Snapshot {
  timestamp: string;
  cpu: { usage: number; cores: number };
  mem: { totalMb: number; usedMb: number; freeMb: number };
  top: ProcessInfo[];
}

/** Jeton de la démo. Le dépôt d'origine utilise une constante AUTH_TOKEN codée en dur ; elle n'est pas reprise ici. */
export const AUTH_TOKEN = 'DEMO2026';
export const PORT = 7878;
export const ADMIN_IP = '192.168.1.20';
export const REFRESH_MS = 5000;

const p2 = (n: number) => String(n).padStart(2, '0');
export const stamp = (d = new Date()) =>
  `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
const f1 = (v: number) => v.toFixed(1);
const padL = (s: string | number, w: number) => String(s).padStart(w, ' ');
const padR = (s: string, w: number) => s.padEnd(w, ' ');
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

interface Proc { pid: number; name: string; base: number; cpu: number; memMb: number }

export class Machine {
  online = true;
  booting = false;
  cpu: number;
  usedMb: number;
  procs: Proc[];
  log: Line[] = [];
  pendingPower: null | { kind: 'shutdown' | 'reboot'; timer: number } = null;
  snap!: Snapshot;

  constructor(public name: string, public ip: string, public cores: number, public totalMb: number, startOnline: boolean, procs: [string, number, number][]) {
    this.cpu = rnd(15, 40);
    this.usedMb = Math.round(totalMb * rnd(0.45, 0.65));
    let pid = 1000 + Math.floor(rnd(0, 800));
    this.procs = procs.map(([name, base, mem]) => ({ pid: (pid += Math.floor(rnd(40, 900))) * 4, name, base, cpu: base, memMb: mem }));
    this.collect();
    if (startOnline) this.boot(false);
    else this.online = false;
  }

  /** collect_snapshot() : CPU global, mémoire, top 5 des processus triés par CPU décroissant. */
  collect() {
    this.cpu = clamp(this.cpu + rnd(-7, 7), 3, 96);
    this.usedMb = Math.round(clamp(this.usedMb + rnd(-220, 220), this.totalMb * 0.3, this.totalMb * 0.92));
    for (const p of this.procs) {
      p.cpu = clamp(p.base * (this.cpu / 30) * rnd(0.6, 1.4), 0, 100 / 1);
      p.memMb = Math.max(4, Math.round(p.memMb + rnd(-12, 12)));
    }
    const top = [...this.procs].sort((a, b) => b.cpu - a.cpu).slice(0, 5).map(({ pid, name, cpu, memMb }) => ({ pid, name, cpu, memMb }));
    this.snap = {
      timestamp: stamp(),
      cpu: { usage: this.cpu, cores: this.cores },
      mem: { totalMb: this.totalMb, usedMb: this.usedMb, freeMb: this.totalMb - this.usedMb },
      top,
    };
  }

  print(text: string, tone: Tone = 'out') {
    for (const t of text.split('\n')) this.log.push({ text: t, tone });
    if (this.log.length > 600) this.log.splice(0, this.log.length - 600);
  }

  /** log_event() : ligne horodatée (console + syswatch.log). */
  event(msg: string, tone: Tone = 'out') {
    this.print(`[${stamp()}] ${msg}`, tone);
  }

  /** main() de l'exo 4 : collecte initiale puis serveur TCP sur 0.0.0.0:7878. */
  boot(clear = true) {
    if (clear) this.log = [];
    this.online = true;
    this.booting = false;
    this.collect();
    this.print('PS C:\\syswatch> cargo run --release', 'cmd');
    this.print('    Finished `release` profile [optimized] target(s) in 0.21s', 'ok');
    this.print('     Running `target\\release\\syswatch.exe`', 'ok');
    this.print('SysWatch démarrage...');
    this.print('Métriques initiales OK:');
    this.print(formatSnapshot(this.snap));
    this.print(`Serveur en écoute sur port ${PORT}...`);
    this.print(`Connecte-toi avec: telnet localhost ${PORT}`);
    this.print(`  ou: nc localhost ${PORT} (WSL/Git Bash)`);
    this.print(`  ou: Test-NetConnection localhost -Port ${PORT} (PowerShell - test seulement)`);
    this.print('Ctrl+C pour arrêter.');
    this.print('');
  }

  /** snapshot_refresher() : toutes les 5 s. */
  refresh() {
    if (!this.online) return;
    this.collect();
    this.print('[refresh] Métriques mises à jour', 'warn');
  }
}

// ── Affichage (impl Display) ──────────────────────────────────────────────────
export const fmtCpu = (s: Snapshot) => `CPU: ${f1(s.cpu.usage)}% (${s.cpu.cores} cœurs)`;
export const fmtMem = (s: Snapshot) => `MEM: ${s.mem.usedMb}MB utilisés / ${s.mem.totalMb}MB total (${s.mem.freeMb} MB libres)`;
export const fmtProc = (p: ProcessInfo) => `  [${padL(p.pid, 6)}] ${padR(p.name, 25)} CPU:${padL(f1(p.cpu), 5)}%  MEM:${padL(p.memMb, 5)}MB`;

export function formatSnapshot(s: Snapshot) {
  return [`=== SysWatch – ${s.timestamp} ===`, fmtCpu(s), fmtMem(s), '--- Top Processus ---', ...s.top.map(fmtProc), '====================='].join('\n');
}

/** Effets de bord simulés d'une commande (msg, install, shutdown, reboot, abort). */
export interface SideEffects { onMsg?: (text: string) => void; onPower?: (kind: 'shutdown' | 'reboot' | 'abort') => void }

/** format_response(snapshot, command) : réponse texte exacte de l'agent. */
export function formatResponse(s: Snapshot, command: string, fx: SideEffects = {}): string {
  const cmd = command.trim().toLowerCase();
  if (cmd === 'cpu') {
    const threshold = Math.trunc(s.cpu.usage / 10);
    const bar = Array.from({ length: 10 }, (_, i) => (i < threshold ? '█' : '░')).join('');
    return `[CPU]\n${fmtCpu(s)}\n\nHistorique:\n${bar} ${f1(s.cpu.usage)}%\n`;
  }
  if (cmd === 'mem') {
    const pct = (s.mem.usedMb / s.mem.totalMb) * 100;
    const bar = Array.from({ length: 20 }, (_, i) => (i < Math.trunc(pct / 5) ? '█' : '░')).join('');
    return `[MÉMOIRE]\n${fmtMem(s)}\n[${bar}] ${f1(pct)}%\n`;
  }
  if (cmd === 'ps' || cmd === 'procs') {
    const lines = s.top.map((p, i) => `${i + 1}. ${fmtProc(p)}`).join('\n');
    return `[PROCESSUS – Top ${s.top.length}]\n${lines}\n`;
  }
  if (cmd === 'shutdown') { fx.onPower?.('shutdown'); return 'SHUTDOWN programmé dans 5 secondes.\n'; }
  if (cmd === 'reboot') { fx.onPower?.('reboot'); return 'REBOOT programmé dans 5 secondes.\n'; }
  if (cmd === 'abort') { fx.onPower?.('abort'); return 'Extinction annulée.\n'; }
  if (cmd.startsWith('msg ')) { fx.onMsg?.(cmd.slice(4)); return 'Message affiché sur la machine cible.\n'; }
  if (cmd.startsWith('install ')) return `Installation de '${cmd.slice(8)}' lancée en arrière-plan.\n`;
  if (cmd === 'all' || cmd === '') return `${formatSnapshot(s)}\n`;
  if (cmd === 'help')
    return 'Commandes disponibles:\n  cpu   – Usage CPU + barre\n  mem   – Mémoire RAM\n  ps    – Top processus\n  all   – Vue complète\n  help  – Cette aide\n  quit  – Fermer la connexion\n';
  if (cmd === 'quit' || cmd === 'exit') return 'BYE\n';
  return `Commande inconnue: '${command.trim()}'. Tape 'help'.\n`;
}

// ── Parc simulé ───────────────────────────────────────────────────────────────
const PROCS: [string, number, number][] = [
  ['chrome.exe', 6, 612], ['Code.exe', 3.2, 488], ['MsMpEng.exe', 1.4, 231], ['explorer.exe', 0.8, 142],
  ['syswatch.exe', 0.5, 9], ['Teams.exe', 1.1, 356], ['OneDrive.exe', 0.4, 88], ['svchost.exe', 0.6, 54], ['dwm.exe', 0.9, 97],
];

export class Fleet {
  machines: Machine[];
  version = 0;
  private listeners = new Set<() => void>();
  private timer = 0;
  private nextPort = 52000 + Math.floor(Math.random() * 9000);

  constructor() {
    // Noms et adresses fictifs (le dépôt contient une liste statique d'IP de salle de TP).
    this.machines = [
      new Machine('PC-01', '192.168.1.101', 8, 16074, true, PROCS),
      new Machine('PC-02', '192.168.1.102', 8, 16074, true, PROCS),
      new Machine('PC-03', '192.168.1.103', 4, 8073, false, PROCS),
      new Machine('PC-04', '192.168.1.104', 12, 32535, true, PROCS),
    ];
  }

  start() {
    if (this.timer) return;
    this.timer = window.setInterval(() => {
      this.machines.forEach((m) => m.refresh());
      this.emit();
    }, REFRESH_MS);
  }
  stop() { clearInterval(this.timer); this.timer = 0; }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getVersion = () => this.version;
  emit() { this.version++; this.listeners.forEach((l) => l()); }

  byIp(ip: string) { return this.machines.find((m) => m.ip === ip || (ip === 'localhost' && m.name === 'PC-02')); }
  byName(name: string) { return this.machines.find((m) => m.name === name); }
  peer() { return `${ADMIN_IP}:${this.nextPort++}`; }

  /** Effets de shutdown /s /t 5, shutdown /r /t 5 et shutdown /a, simulés. */
  power(m: Machine, kind: 'shutdown' | 'reboot' | 'abort') {
    if (kind === 'abort') {
      if (m.pendingPower) { clearTimeout(m.pendingPower.timer); m.pendingPower = null; m.print('[simulation] Arrêt du système annulé.', 'dim'); }
      return;
    }
    if (m.pendingPower) clearTimeout(m.pendingPower.timer);
    m.print(`[simulation] Windows ${kind === 'shutdown' ? "va s'arrêter" : 'va redémarrer'} dans 5 secondes.`, 'dim');
    const timer = window.setTimeout(() => {
      m.pendingPower = null;
      m.online = false;
      m.print(`[simulation] ${m.name} ${kind === 'shutdown' ? 'éteint' : 'redémarre'}…`, 'dim');
      this.emit();
      if (kind === 'reboot') {
        m.booting = true;
        window.setTimeout(() => { m.boot(); this.emit(); }, 7000);
      }
    }, 5000);
    m.pendingPower = { kind, timer };
  }

  msgBox(m: Machine, text: string) {
    m.print('');
    m.print('╔══════════════════════════════════════╗', 'box');
    m.print('║  MESSAGE DU PROFESSEUR               ║', 'box');
    m.print(`║  ${text}${' '.repeat(Math.max(0, 38 - [...text].length))}║`, 'box');
    m.print('╚══════════════════════════════════════╝', 'box');
    m.print('');
  }

  reset() {
    this.machines.forEach((m) => { if (m.pendingPower) clearTimeout(m.pendingPower.timer); });
    const fresh = new Fleet();
    this.machines = fresh.machines;
    this.emit();
  }
}

/** Session côté agent (handle_client) : TOKEN, puis boucle de commandes terminées par END. */
export class AgentSession {
  authed = false;
  closed = false;
  constructor(public fleet: Fleet, public m: Machine, public peer: string) {
    m.event(`[+] Connexion de ${peer}`, 'ok');
  }

  /** Réponse à la ligne de jeton. Retourne true si authentifié. */
  auth(token: string): boolean {
    if (token.trim() !== AUTH_TOKEN) {
      this.m.event(`[!] Accès refusé depuis ${this.peer}`, 'err');
      this.closed = true;
      return false;
    }
    this.authed = true;
    this.m.event(`[✓] Authentifié: ${this.peer}`, 'ok');
    return true;
  }

  /** Une commande ; renvoie le texte écrit sur le flux (réponse + "\nEND\n", ou "BYE\n"). */
  command(raw: string): string {
    const cmd = raw.trim();
    this.m.event(`[${this.peer}] commande: '${cmd}'`);
    if (cmd.toLowerCase() === 'quit') {
      this.close();
      return 'BYE\n';
    }
    const res = formatResponse(this.m.snap, cmd, {
      onMsg: (t) => this.fleet.msgBox(this.m, t),
      onPower: (k) => this.fleet.power(this.m, k),
    });
    return `${res}\nEND\n`;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.m.event(`[-] Déconnexion de ${this.peer}`, 'err');
  }
}
