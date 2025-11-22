import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../api";

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

  const updater = useMutation({
    mutationFn: () => apiPost("/api/system/update", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["updateStatus"] });
      qc.invalidateQueries({ queryKey: ["systemInfo"] });
    },
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
        updater={updater}
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

const UpdateCard = ({ info, update, loading, updater }) => {
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

  useEffect(() => {
    if (updater.isPending) {
      setJustUpdated(false);
      return;
    }
    if (updater.isSuccess) {
      setJustUpdated(true);
      const t = setTimeout(() => {
        setJustUpdated(false);
        updater.reset();
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [updater]);

  return (
    <div className="bg-white/5 backdrop-blur-xl p-6 rounded-2xl border border-white/10">
      <h2 className="text-xl font-semibold mb-2">Version</h2>
      <div className="text-gray-300 text-sm space-y-1">
        <p>Aktuell: {currentVersion}</p>
        <p>Branch: {info?.branch}</p>
        <p>Channel: {channel}</p>
        <p>Commit: {commitShort || "-"} {info?.build_date ? `(${info.build_date})` : ""}</p>
        {published && <p>Release: {latestVersion} Â· {published}</p>}
      </div>
      <div className="mt-4 flex items-center gap-3">
        {available ? (
          <button
            onClick={() => updater.mutate()}
            disabled={updater.isPending}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50"
          >
            {updater.isPending ? "Update wird installiert..." : "Update installieren"}
          </button>
        ) : (
          <span className="text-emerald-400 text-sm">
            {loading ? "Pruefe Updates..." : "System ist aktuell"}
          </span>
        )}
        {updater.isPending && <span className="text-sm text-slate-300">Update wird installiert...</span>}
        {updater.isError && (
          <span className="text-sm text-rose-400">
            {updater.error?.response?.data || updater.error?.message}
          </span>
        )}
        {justUpdated && !available && !updater.isPending && !updater.isError && (
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

