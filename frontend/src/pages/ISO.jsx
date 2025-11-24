import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { apiGet } from "../api";

export default function ISO() {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [pool, setPool] = useState("");

  const { data: pools } = useQuery({
    queryKey: ["pools"],
    queryFn: () => apiGet("/api/storage/pools"),
    refetchInterval: 15000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["isos", pool],
    queryFn: () => apiGet(`/api/storage/isos${pool ? `?pool=${pool}` : ""}`),
    refetchInterval: 10000,
  });

  const upload = useMutation({
    mutationFn: async (file) => {
      const form = new FormData();
      form.append("iso", file);
      if (pool) form.append("pool", pool);
      setError("");
      setUploading(true);
      const res = await fetch("/api/storage/isos", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        if (res.status === 413) {
          throw new Error(
            "Upload abgewiesen (413 Request Entity Too Large). Bitte im vorgeschalteten Proxy/Gateway (z.B. nginx/openresty) client_max_body_size auf z.B. 10G erhöhen oder den gr3mctrl-Gateway direkt (Port 4173) aufrufen."
          );
        }
        const msg = await res.text();
        throw new Error(msg);
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["isos", pool] }),
    onSettled: () => setUploading(false),
    onError: (e) => setError(e.message),
  });

  const poolLabel = useMemo(() => {
    if (!pool) return "Default";
    return pool;
  }, [pool]);

  return (
    <div className="text-white min-h-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">ISO Library</h1>
          <p className="text-gray-400">Pool: {poolLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={pool}
            onChange={(e) => setPool(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-sm"
          >
            <option value="">Default</option>
            {pools?.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            type="file"
            accept=".iso"
            onChange={(e) => {
              if (e.target.files?.[0]) upload.mutate(e.target.files[0]);
            }}
            className="text-sm text-gray-300"
          />
          <span className="text-sm text-gray-500">Auto-Refresh 10s</span>
        </div>
      </div>

      {uploading && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-gray-300">
          Upload laeuft... bitte warten
        </div>
      )}
      {error && (
        <div className="bg-rose-900/30 border border-rose-600 rounded-2xl p-4 text-sm text-rose-100">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-gray-400">
          Lade ISOs...
        </div>
      )}

      <div className="space-y-3">
        {data?.map((iso) => (
          <div
            key={iso.name}
            className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-xl shadow-[0_20px_45px_rgba(15,23,42,0.35)] flex items-center justify-between"
          >
            <div>
              <h3 className="text-lg font-semibold">{iso.name}</h3>
              <p className="text-gray-300 text-sm break-all">{iso.path}</p>
              {iso.pool && <p className="text-gray-500 text-xs">Pool: {iso.pool}</p>}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400">
                {(iso.size / (1024 * 1024)).toFixed(1)} MB
              </span>
              <button
                onClick={async () => {
                  if (!confirm("ISO loeschen?")) return;
                  try {
                    await fetch(`/api/storage/iso/${iso.name}${pool ? `?pool=${pool}` : ""}`, { method: "DELETE" });
                    qc.invalidateQueries({ queryKey: ["isos", pool] });
                  } catch (e) {
                    console.error(e);
                  }
                }}
                className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

