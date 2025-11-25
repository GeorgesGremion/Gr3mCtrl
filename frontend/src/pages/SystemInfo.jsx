import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "../api";

export default function SystemInfo() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["systemInfo"],
    queryFn: () => apiGet("/api/system/info"),
    refetchInterval: 5000,
  });
  const updateInfo = useQuery({
    queryKey: ["updateStatus"],
    queryFn: () => apiGet("/api/system/update"),
    refetchInterval: 60000,
  });

  if (isLoading)
    return (
      <div className="rounded-2xl border border-white/10 p-6 bg-white/5 backdrop-blur-xl text-white/70">
        Hostdaten werden geladen...
      </div>
    );

  const percent = (used, total) => ((used / total) * 100).toFixed(1);

  return (
    <div className="min-h-full space-y-6 text-white">
      <div>
        <h1 className="text-4xl font-bold">System Overview</h1>
        <p className="text-gray-400">
          Host-Details und Usage-Balken fuer CPU, Speicher und Storage.
        </p>
      </div>

      <UpdateCard
        info={data}
        update={updateInfo.data}
        loading={updateInfo.isLoading}
        onUpdated={() => {
          qc.invalidateQueries({ queryKey: ["updateStatus"] });
          qc.invalidateQueries({ queryKey: ["systemInfo"] });
        }}
      />

      <InfoCard
        title="CPU"
        details={[
          `Cores: ${data.cpu_count}`,
          `Load: ${data.cpu_load.toFixed(1)}%`,
        ]}
        percent={data.cpu_load}
        accent="from-blue-500 to-indigo-500"
      />

      <InfoCard
        title="RAM"
        details={[
          `${Math.round(data.ram_used / 1024 / 1024 / 1024)} GB / ${Math.round(
            data.ram_total / 1024 / 1024 / 1024
          )} GB`,
        ]}
        percent={percent(data.ram_used, data.ram_total)}
        accent="from-emerald-500 to-green-500"
      />

      <InfoCard
        title="Disk"
        details={[
          `${Math.round(data.disk_used / 1024 / 1024 / 1024)} GB / ${Math.round(
            data.disk_total / 1024 / 1024 / 1024
          )} GB`,
        ]}
        percent={percent(data.disk_used, data.disk_total)}
        accent="from-amber-500 to-orange-500"
      />

      <div className="bg-white/5 backdrop-blur-xl p-6 rounded-2xl border border-white/10">
        <h2 className="text-xl font-semibold mb-2">Docker</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Total" value={data.containers_total} />
          <Stat label="Running" value={data.containers_running} accent="text-emerald-400" />
          <Stat label="Stopped" value={data.containers_stopped} accent="text-rose-400" />
          <Stat label="Images" value={data.images_total} />
        </div>
      </div>
    </div>
  );
}

const InfoCard = ({ title, details, percent, accent }) => (
  <div className="bg-white/5 backdrop-blur-xl p-6 rounded-2xl border border-white/10">
    <h2 className="text-xl font-semibold mb-2">{title}</h2>
    <div className="text-gray-300 text-sm space-y-1">
      {details.map((detail) => (
        <p key={detail}>{detail}</p>
      ))}
    </div>
    <div className="w-full bg-white/10 rounded-full h-3 mt-4 overflow-hidden">
      <div
        className={`h-3 rounded-full bg-gradient-to-r ${accent}`}
        style={{ width: `${percent}%` }}
      ></div>
    </div>
  </div>
);

const Stat = ({ label, value, accent = "text-white" }) => (
  <div className="text-center">
    <p className="text-sm text-gray-400">{label}</p>
    <p className={`text-2xl font-semibold ${accent}`}>{value}</p>
  </div>
);

const UpdateCard = ({ info, update, loading, onUpdated }) => {
  const available = update?.update_available;
  const currentVersion = info?.version || "unknown";
  const channel = info?.channel || "branch";
  const commitShort = (info?.commit || "").slice(0, 8);
  const latestVersion = update?.latest_version || "-";
  const releaseNotes = update?.release_notes;
  const published = update?.latest_published
    ? new Date(update.latest_published).toLocaleString()
    : null;
  const [justUpdated, setJustUpdated] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [logs, setLogs] = useState("");
  const [runError, setRunError] = useState("");
  const [running, setRunning] = useState(false);
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, running]);

  const runUpdate = async () => {
    setLogs("");
    setRunError("");
    setRunning(true);
    setShowModal(true);
    try {
      const res = await fetch("/api/system/update?stream=1", { method: "POST" });
      if (!res.ok || !res.body) {
        const msg = await res.text();
        throw new Error(msg || "Update fehlgeschlagen");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let firstChunk = true;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          const chunk = decoder.decode(value);
          if (firstChunk && chunk.trim().toLowerCase().startsWith("<html")) {
            throw new Error("Update-Stream liefert HTML (Proxy/Backend nicht erreichbar)");
          }
          firstChunk = false;
          setLogs((prev) => prev + chunk);
        }
      }
      setRunning(false);
      setJustUpdated(true);
      onUpdated?.();
    } catch (e) {
      setRunError(e.message);
      setRunning(false);
    }
  };

  return (
    <div className="bg-white/5 backdrop-blur-xl p-6 rounded-2xl border border-white/10">
      <h2 className="text-xl font-semibold mb-2">Version</h2>
      <div className="text-gray-300 text-sm space-y-1">
        <p>Aktuell: {currentVersion}</p>
        <p>Branch: {info?.branch}</p>
        <p>Channel: {channel}</p>
        <p>Commit: {commitShort || "-"} {info?.build_date ? `(${info.build_date})` : ""}</p>
        {published && <p>Release: {latestVersion} - {published}</p>}
      </div>
      <div className="mt-4 flex items-center gap-3">
        {available ? (
          <button
            onClick={runUpdate}
            disabled={running}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50"
          >
            {running ? "Update läuft..." : "Update installieren"}
          </button>
        ) : (
          <span className="text-emerald-400 text-sm">
            {loading ? "Pruefe Updates..." : "System ist aktuell"}
          </span>
        )}
        {running && <span className="text-sm text-slate-300">Update wird installiert...</span>}
        {runError && (
          <span className="text-sm text-rose-400">
            {runError}
          </span>
        )}
        {justUpdated && !available && !running && !runError && (
          <span className="text-sm text-emerald-400">Update abgeschlossen</span>
        )}
      </div>
      {releaseNotes && (
        <div className="mt-4 text-sm text-gray-300 bg-black/20 rounded-lg p-3 whitespace-pre-wrap max-h-40 overflow-y-auto border border-white/5">
          {releaseNotes}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900/95 border border-white/10 rounded-2xl w-full max-w-4xl h-[70vh] shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Update Log</p>
                <p className="text-xs text-slate-500">{running ? "läuft..." : "fertig"}</p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
              >
                Schliessen
              </button>
            </div>
            <div className="flex-1 bg-black p-3 overflow-auto font-mono text-xs text-slate-200 space-y-3" ref={logRef}>
              {running && (
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="h-3 w-3 rounded-full border-2 border-slate-500 border-t-transparent animate-spin"></span>
                  <span>Update läuft... Bitte warten, Backend kann kurz nicht erreichbar sein.</span>
                </div>
              )}
              {runError && <div className="text-rose-400">Fehler: {runError}</div>}
              <pre className="whitespace-pre-wrap">{logs || (!running && !runError ? "Keine Logs" : "")}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
