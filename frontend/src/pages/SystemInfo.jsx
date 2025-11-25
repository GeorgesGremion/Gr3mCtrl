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
    retry: 1,
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
        updateError={updateInfo.isError ? (updateInfo.error?.response?.data || updateInfo.error?.message) : ""}
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

const UpdateCard = ({ info, update, loading, onUpdated, updateError }) => {
  const isHtml = (txt) => typeof txt === "string" && txt.toLowerCase().includes("<html");
  const badPayload = typeof update === "string" || isHtml(JSON.stringify(update || ""));
  const available = !badPayload && update?.update_available === true;
  const currentVersion = info?.version || "unknown";
  const channel = info?.channel || "branch";
  const commitShort = (info?.commit || "").slice(0, 8);
  const latestVersion = badPayload ? "-" : update?.latest_version || "-";
  const rawNotes = badPayload ? "" : update?.release_notes;
  const releaseNotes = typeof rawNotes === "string" && !isHtml(rawNotes) ? rawNotes : "";
  const releaseNotesError = isHtml(rawNotes) ? "Update-Server liefert HTML (Proxy/502?)" : "";
  const sanitizedUpdateError =
    badPayload || (updateError && isHtml(updateError))
      ? "Update-Status nicht verfügbar (Proxy/502?)"
      : updateError;
  const displayUpdateError = sanitizedUpdateError || (badPayload ? "Update-Status nicht verfügbar (Proxy/502?)" : "");
  const published = update?.latest_published
    ? new Date(update.latest_published).toLocaleString()
    : null;
  const [justUpdated, setJustUpdated] = useState(false);
  const [runError, setRunError] = useState("");
  const [running, setRunning] = useState(false);
  const [waitingForRestart, setWaitingForRestart] = useState(false);

  const runUpdate = async () => {
    setRunError("");
    setRunning(true);
    setWaitingForRestart(false);
    try {
      const res = await fetch("/api/system/update", { method: "POST" });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Update fehlgeschlagen (HTTP ${res.status})`);
      }
      setWaitingForRestart(true);
      setJustUpdated(false);
      setRunning(false);
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
        {displayUpdateError && <p className="text-rose-400">Update-Status: {displayUpdateError}</p>}
        {releaseNotesError && <p className="text-rose-400">{releaseNotesError}</p>}
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
        {runError && !waitingForRestart && (
          <span className="text-sm text-rose-400">
            {runError}
          </span>
        )}
        {waitingForRestart && (
          <span className="text-sm text-amber-300">
            Update läuft, Backend wird neu gestartet... bitte Seite nach 1-2 Minuten neu laden.
          </span>
        )}
        {justUpdated && !available && !running && !runError && !waitingForRestart && (
          <span className="text-sm text-emerald-400">Update abgeschlossen</span>
        )}
      </div>
      {releaseNotes && (
        <div className="mt-4 text-sm text-gray-300 bg-black/20 rounded-lg p-3 whitespace-pre-wrap max-h-40 overflow-y-auto border border-white/5">
          {releaseNotes}
        </div>
      )}
    </div>
  );
};
