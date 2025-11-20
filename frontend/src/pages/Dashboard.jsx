import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  RadialBar,
  RadialBarChart,
  PolarAngleAxis,
} from "recharts";
import { apiGet } from "../api";

export default function Dashboard() {
  const [cpuHistory, setCpuHistory] = useState([]);
  const refreshInterval = 2000;

  const { data, isLoading } = useQuery({
    queryKey: ["system-info"],
    queryFn: () => apiGet("/api/system/info"),
    refetchInterval: refreshInterval,
  });
  const { data: pools } = useQuery({
    queryKey: ["pools"],
    queryFn: () => apiGet("/api/storage/pools"),
    refetchInterval: 10000,
  });
  const { data: shares } = useQuery({
    queryKey: ["shares"],
    queryFn: () => apiGet("/api/storage/shares"),
    refetchInterval: 12000,
  });
  const { data: vms } = useQuery({
    queryKey: ["vms"],
    queryFn: () => apiGet("/api/vm/domains"),
    refetchInterval: 12000,
  });

  useEffect(() => {
    if (!data) return;

    setCpuHistory((prev) => {
      const formatted = {
        time: new Date().toLocaleTimeString("de-DE", {
          minute: "2-digit",
          second: "2-digit",
        }),
        load: Number(data.cpu_load?.toFixed(2) ?? 0),
      };

      return [...prev.slice(-29), formatted];
    });
  }, [data]);

  if (isLoading || !data)
    return (
      <div className="rounded-2xl border border-white/10 p-8 text-white/70 bg-white/5 backdrop-blur-xl">
        Systemmetriken werden geladen...
      </div>
    );

  const gb = (val = 0) => (val / 1024 / 1024 / 1024).toFixed(1);
  const ramUsage = data.ram_total ? (data.ram_used / data.ram_total) * 100 : 0;
  const diskUsage = data.disk_total ? (data.disk_used / data.disk_total) * 100 : 0;
  const gaugeData = (value) => [{ name: "usage", value }];
  const poolsSafe = Array.isArray(pools) ? pools : [];
  const sharesSafe = Array.isArray(shares) ? shares : [];
  const vmsSafe = Array.isArray(vms) ? vms : [];
  const poolsUsable = poolsSafe.reduce((acc, p) => acc + (p.usable || 0), 0);
  const poolsCount = poolsSafe.length;
  const sharesCount = sharesSafe.length;
  const vmsRunning = vmsSafe.filter((v) => v.state === "running").length;
  const poolsUsableText = poolsUsable ? `${(poolsUsable / 1024 / 1024 / 1024).toFixed(1)} GB` : "0.0 GB";

  const heroStats = [
    {
      label: "Running Containers",
      value: data.containers_running,
      accent: "from-emerald-400/60 to-emerald-600/80",
    },
    {
      label: "Images",
      value: data.images_total,
      accent: "from-blue-400/60 to-indigo-600/70",
    },
    {
      label: "CPU Load",
      value: `${data.cpu_load.toFixed(1)}%`,
      accent: "from-purple-400/60 to-pink-500/70",
    },
    {
      label: "Pools usable",
      value: poolsUsableText,
      accent: "from-amber-400/60 to-orange-600/70",
    },
  ];

  return (
    <div className="text-white space-y-3 min-h-full">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 auto-rows-[72px]">
        {heroStats.map((stat) => (
          <div
            key={stat.label}
            className={`rounded-2xl border border-white/10 px-3 py-2 shadow-[0_10px_18px_rgba(2,6,23,0.35)] bg-gradient-to-br ${stat.accent} flex flex-col justify-between h-full`}
          >
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/70">
              {stat.label}
            </p>
            <p className="text-base font-semibold leading-tight">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 auto-rows-[320px]">
        {/* CPU */}
        <div className="bg-white/5 backdrop-blur-xl p-4 rounded-2xl border border-white/10 xl:col-span-2 shadow-[0_10px_20px_rgba(15,23,42,0.35)] h-full">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold">CPU Load</h2>
              <p className="text-gray-400 text-sm">
                {data.cpu_count} Cores · Refresh {refreshInterval / 1000}s
              </p>
            </div>
            <div className="text-2xl font-bold text-green-400">
              {data.cpu_load.toFixed(1)}%
            </div>
          </div>

          <div className="h-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cpuHistory}>
                <XAxis
                  dataKey="time"
                  stroke="#9ca3af"
                  fontSize={12}
                  tickLine={false}
                />
                <YAxis
                  stroke="#9ca3af"
                  fontSize={12}
                  unit="%"
                  domain={[0, 100]}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#111827",
                    border: "1px solid #374151",
                    borderRadius: "0.5rem",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="load"
                  stroke="#10b981"
                  strokeWidth={3}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3 h-full">
          {/* RAM */}
          <GaugeCard
            title="Memory Usage"
            percent={ramUsage}
            used={`${gb(data.ram_used)} GB`}
            total={`${gb(data.ram_total)} GB`}
            gaugeData={gaugeData(ramUsage)}
            accent="from-indigo-500 to-sky-500"
            height="h-[320px]"
          />

          {/* Disk */}
          <GaugeCard
            title="Disk Usage"
            percent={diskUsage}
            used={`${gb(data.disk_used)} GB`}
            total={`${gb(data.disk_total)} GB`}
            gaugeData={gaugeData(diskUsage)}
            accent="from-amber-500 to-orange-500"
            height="h-[320px]"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* General Info */}
        <div className="bg-white/5 backdrop-blur-xl p-6 rounded-2xl border border-white/10">
          <h2 className="text-xl font-semibold mb-4">System</h2>
          <ul className="space-y-2 text-gray-300">
            <li>
              <span className="text-gray-400">Hostname</span>: {data.hostname}
            </li>
            <li>
              <span className="text-gray-400">Kernel</span>: {data.kernel}
            </li>
            <li>
              <span className="text-gray-400">Uptime</span>: {data.uptime}
            </li>
            <li>
              <span className="text-gray-400">OS</span>: {data.os}
            </li>
          </ul>
        </div>

        <div className="bg-white/5 backdrop-blur-xl p-6 rounded-2xl border border-white/10">
          <h2 className="text-xl font-semibold mb-4">Ressourcen</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center">
            <SummaryBadge label="VMs running" value={vmsRunning} accent="text-emerald-400" />
            <SummaryBadge label="Pools" value={poolsCount} />
            <SummaryBadge label="Shares" value={sharesCount} />
            <SummaryBadge
              label="Docker running"
              value={data.containers_running}
              accent="text-emerald-400"
            />
            <SummaryBadge label="Docker stopped" value={data.containers_stopped} accent="text-red-400" />
            <SummaryBadge label="Images" value={data.images_total} />
          </div>
          <p className="text-sm text-gray-400 mt-6">
            Pools usable: {poolsUsableText}
          </p>
        </div>
      </div>
    </div>
  );
}

const GaugeCard = ({ title, percent, used, total, gaugeData, accent, height }) => (
  <div className={`bg-white/5 backdrop-blur-xl p-6 rounded-2xl border border-white/10 relative overflow-hidden ${height || ""}`}>
    <div className="flex items-center justify-between">
      <h2 className="text-xl font-semibold mb-4">{title}</h2>
      <span
        className={`text-2xl font-bold bg-gradient-to-r ${accent} bg-clip-text text-transparent`}
      >
        {percent.toFixed(1)}%
      </span>
    </div>

    <div className="h-48 mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={gaugeData}
          innerRadius="70%"
          outerRadius="100%"
          startAngle={180}
          endAngle={0}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar
            background
            clockWise
            dataKey="value"
            fill="#10b981"
            cornerRadius={20}
            isAnimationActive={false}
          />
        </RadialBarChart>
      </ResponsiveContainer>
    </div>

    <div className="mt-4 text-gray-300">
      <p className="text-sm">
        Used: <span className="text-white font-semibold">{used}</span>
      </p>
      <p className="text-sm text-gray-400">Total: {total}</p>
    </div>
  </div>
);

const SummaryBadge = ({ label, value, accent = "text-white" }) => (
  <div className="bg-black/20 rounded-xl p-3 backdrop-blur">
    <p className="text-sm text-gray-400">{label}</p>
    <p className={`text-2xl font-semibold ${accent}`}>{value}</p>
  </div>
);
