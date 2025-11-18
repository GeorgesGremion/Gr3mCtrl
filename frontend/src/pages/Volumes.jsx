import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost } from "../api";

export default function Volumes() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet("/api/settings"),
  });

  const { data: volumes, isLoading } = useQuery({
    queryKey: ["volumes"],
    queryFn: () => apiGet("/api/docker/volumes"),
    refetchInterval: 8000,
  });

  const basePath = settings?.data_path || "/var/lib/ggithub/data";

  const [name, setName] = useState("app-data");
  const [hostPath, setHostPath] = useState("");

  useEffect(() => {
    if (!settings) return;
    setHostPath(`${basePath}/volumes/${name}`);
  }, [name, basePath, settings]);

  const create = useMutation({
    mutationFn: (payload) => apiPost("/api/docker/volumes", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["volumes"] });
    },
  });

  const deleteVolume = async (volName) => {
    if (!confirm(`Volume "${volName}" löschen?`)) return;
    await apiDelete(`/api/docker/volume/${volName}`);
    qc.invalidateQueries({ queryKey: ["volumes"] });
  };

  const renderContainers = (conts) => {
    if (!conts || conts.length === 0) return <p className="text-xs text-gray-500">Keine Container</p>;
    return (
      <div className="flex flex-wrap gap-2 mt-2">
        {conts.map((c) => (
          <span key={c.id} className="text-xs px-2 py-1 rounded bg-slate-800 border border-white/10">
            {c.name} <span className="text-gray-500">({c.id})</span>
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="text-white min-h-full space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Volumes</h1>
          <p className="text-gray-400">
            Persistent Data unterhalb von {basePath}
          </p>
        </div>
        {settings && (
          <span className="text-xs text-gray-500">Config: {basePath}</span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl shadow-[0_20px_45px_rgba(15,23,42,0.35)]">
          <h2 className="text-xl font-semibold mb-4">Volume anlegen</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-300">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full mt-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 focus:border-blue-500 outline-none"
                placeholder="app-data"
              />
            </div>

            <div>
              <label className="text-sm text-gray-300">Host Path</label>
              <input
                value={hostPath}
                onChange={(e) => setHostPath(e.target.value)}
                className="w-full mt-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 focus:border-blue-500 outline-none"
                placeholder={`${basePath}/volumes/app-data`}
              />
              <p className="text-xs text-gray-500 mt-1">Standard wird automatisch gesetzt.</p>
            </div>

            <button
              onClick={() => create.mutate({ name, host_path: hostPath })}
              disabled={create.isPending}
              className="w-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-lg py-2 font-semibold shadow-lg shadow-purple-500/30 disabled:opacity-60"
            >
              {create.isPending ? "Erzeuge..." : "Volume erstellen"}
            </button>
            {create.isError && (
              <p className="text-sm text-red-400">
                {create.error?.response?.data || create.error?.message}
              </p>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {isLoading && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-gray-400">
              Lade Volumes...
            </div>
          )}

          {!isLoading && volumes?.length === 0 && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-gray-400">
              Noch keine Volumes vorhanden.
            </div>
          )}

          {volumes?.map((vol) => (
            <div
              key={vol.name}
              className="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-xl flex flex-wrap items-center justify-between gap-3"
            >
              <div className="min-w-[220px]">
                <h3 className="text-xl font-semibold">{vol.name}</h3>
                <p className="text-gray-400 text-sm">{vol.driver}</p>
                <p className="text-gray-300 text-xs break-all">
                  {vol.mountpoint}
                </p>
                {renderContainers(vol.containers)}
              </div>
              <button
                onClick={() => deleteVolume(vol.name)}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-sm"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
