import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api";

export default function VmNetworks() {
  const { data, isLoading } = useQuery({
    queryKey: ["vm-networks"],
    queryFn: () => apiGet("/api/vm/networks"),
    refetchInterval: 12000,
  });

  return (
    <div className="text-white min-h-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Virtuelle Netzwerke</h1>
          <p className="text-gray-400">Libvirt Netzwerke (Bridge/NAT).</p>
        </div>
        <span className="text-sm text-gray-500">Auto-Refresh 12s</span>
      </div>

      {isLoading && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-gray-400">
          Lade Netzwerke...
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {data?.map((net) => (
          <div
            key={net.name}
            className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-xl shadow-[0_20px_45px_rgba(15,23,42,0.35)] flex items-center justify-between"
          >
            <div>
              <h3 className="text-xl font-semibold">{net.name}</h3>
              <p className="text-gray-400 text-sm">Autostart: {net.autostart ? "yes" : "no"}</p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs ${
                net.active ? "bg-emerald-600/70" : "bg-slate-700"
              }`}
            >
              {net.active ? "active" : "inactive"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
