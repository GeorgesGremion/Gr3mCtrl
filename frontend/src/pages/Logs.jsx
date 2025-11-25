import { useEffect, useState } from "react";
import { apiGet } from "../api";

const SERVICES = [
  { value: "gr3mctrl-backend.service", label: "Backend" },
  { value: "gr3mctrl-gateway.service", label: "Gateway" },
];

export default function Logs() {
  const [service, setService] = useState(SERVICES[0].value);
  const [logs, setLogs] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/system/logs?service=${encodeURIComponent(service)}`);
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `HTTP ${res.status}`);
      }
      const text = await res.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0).reverse().join("\n");
      setLogs(lines);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [service]);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [auto, service]);

  return (
    <div className="text-white min-h-full space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={service}
          onChange={(e) => setService(e.target.value)}
          className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm"
        >
          {SERVICES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 border border-white/10 text-sm"
        >
          {loading ? "Lade..." : "Reload"}
        </button>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Auto-Refresh 5s
        </label>
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <div className="bg-black/60 border border-white/10 rounded-xl p-3 text-xs font-mono text-slate-200 whitespace-pre-wrap min-h-[60vh]">
        {logs || (loading ? "Lade..." : "Keine Logs")}
      </div>
      <p className="text-xs text-slate-400">
        Zeigt journalctl-Ausgaben der Dienste (neuste oben). Aktionen, die das Backend loggt (z.B. VM Start/Stop), erscheinen hier.
      </p>
    </div>
  );
}
