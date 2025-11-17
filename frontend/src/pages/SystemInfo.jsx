import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api";

export default function SystemInfo() {
  const { data, isLoading } = useQuery({
    queryKey: ["systemInfo"],
    queryFn: () => apiGet("/api/system/info"),
    refetchInterval: 5000,
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
          Host-Details und Usage-Balken für CPU, Speicher und Storage.
        </p>
      </div>

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
