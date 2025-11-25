import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiDelete } from "../api";

export default function FileManager() {
  const qc = useQueryClient();
  const [share, setShare] = useState("");
  const [path, setPath] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const { data: shares } = useQuery({
    queryKey: ["shares"],
    queryFn: () => apiGet("/api/storage/shares"),
  });

  const { data: items, isLoading } = useQuery({
    queryKey: ["fs", share, path],
    queryFn: () => apiGet(`/api/fs/list?share=${encodeURIComponent(share)}&path=${encodeURIComponent(path)}`),
    enabled: !!share,
    refetchInterval: 8000,
  });

  useEffect(() => {
    if (!share && shares?.length) {
      setShare(shares[0].name);
    }
  }, [shares, share]);

  const mkdir = useMutation({
    mutationFn: (dir) => apiPost("/api/fs/mkdir", { share, path: join(path, dir) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fs", share, path] }),
    onError: (err) => alert(err?.response?.data || err.message),
  });

  const del = useMutation({
    mutationFn: (target) => apiPost("/api/fs/delete", { share, path: join(path, target) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fs", share, path] }),
    onError: (err) => alert(err?.response?.data || err.message),
  });

  const upload = async (file) => {
    if (!file || !share) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("share", share);
      form.append("path", path);
      const res = await fetch("/api/fs/upload", { method: "POST", body: form });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg);
      }
      qc.invalidateQueries({ queryKey: ["fs", share, path] });
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const canGoUp = path !== "";
  const breadcrumb = useMemo(() => {
    const parts = path ? path.split("/").filter(Boolean) : [];
    const crumbs = [{ label: share || "Share", path: "" }];
    let accum = "";
    parts.forEach((p) => {
      accum = accum ? `${accum}/${p}` : p;
      crumbs.push({ label: p, path: accum });
    });
    return crumbs;
  }, [path, share]);

  return (
    <div className="text-white min-h-full space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={share}
          onChange={(e) => {
            setShare(e.target.value);
            setPath("");
          }}
          className="bg-black/40 border border-white/10 rounded-lg px-3 py-2"
        >
          {shares?.map((s) => (
            <option key={s.name} value={s.name}>{s.name}</option>
          ))}
        </select>

        <div className="flex items-center gap-2 flex-wrap">
          {breadcrumb.map((c, i) => (
            <button
              key={c.path}
              onClick={() => setPath(c.path)}
              className={`text-sm ${i === breadcrumb.length - 1 ? "text-emerald-300" : "text-gray-300 hover:text-white"}`}
            >
              {c.label}{i < breadcrumb.length - 1 && " /"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="file"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            className="text-sm"
          />
          <button
            onClick={() => {
              const dir = prompt("Ordnername?");
              if (dir) mkdir.mutate(dir);
            }}
            className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 text-sm"
            disabled={!share}
          >
            Ordner anlegen
          </button>
        </div>
      </div>

      {uploading && <p className="text-sm text-amber-300">Upload läuft...</p>}
      {error && <p className="text-sm text-rose-400">{error}</p>}

      {isLoading && <p className="text-sm text-gray-400">Lade Inhalte...</p>}

      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        {items?.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400">
                <th className="text-left py-2">Name</th>
                <th className="text-left py-2">Typ</th>
                <th className="text-left py-2">Größe</th>
                <th className="text-left py-2">Geändert</th>
                <th className="text-right py-2">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {canGoUp && (
                <tr className="border-t border-white/5">
                  <td className="py-2">
                    <button className="text-blue-300" onClick={() => setPath(parent(path))}>..</button>
                  </td>
                  <td colSpan={4}></td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.name} className="border-t border-white/5">
                  <td className="py-2">
                    {item.is_dir ? (
                      <button className="text-blue-300" onClick={() => setPath(join(path, item.name))}>{item.name}</button>
                    ) : (
                      <span>{item.name}</span>
                    )}
                  </td>
                  <td>{item.is_dir ? "Ordner" : "Datei"}</td>
                  <td>{item.is_dir ? "-" : prettySize(item.size)}</td>
                  <td>{new Date(item.mod_time).toLocaleString()}</td>
                  <td className="text-right space-x-2">
                    {!item.is_dir && (
                      <a
                        className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600"
                        href={`/api/fs/download?share=${encodeURIComponent(share)}&path=${encodeURIComponent(join(path, item.name))}`}
                      >
                        Download
                      </a>
                    )}
                    <button
                      onClick={() => setConfirmDelete(item.name)}
                      className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-gray-400">Keine Einträge.</p>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-rose-950 border border-rose-500/60 rounded-2xl w-full max-w-lg shadow-2xl text-white">
            <div className="px-5 py-4 border-b border-rose-800 flex justify-between items-center">
              <div>
                <p className="text-sm uppercase tracking-[0.25em] text-rose-200">Achtung</p>
                <p className="text-base font-semibold">Datei wird gelöscht</p>
              </div>
              <button
                className="text-rose-200 hover:text-white"
                onClick={() => setConfirmDelete(null)}
              >
                ×
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-rose-100">
                Du bist im Begriff, folgende Datei/Ordner zu löschen:
              </p>
              <div className="bg-black/30 rounded-lg px-3 py-2 border border-rose-800 text-sm font-mono">
                {confirmDelete}
              </div>
              <p className="text-xs text-rose-200">
                Dieser Vorgang kann nicht rückgängig gemacht werden.
              </p>
            </div>
            <div className="px-5 py-3 border-t border-rose-800 flex justify-end gap-2">
              <button
                className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-sm"
                onClick={() => setConfirmDelete(null)}
              >
                Abbrechen
              </button>
              <button
                className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-sm"
                onClick={() => {
                  del.mutate(confirmDelete);
                  setConfirmDelete(null);
                }}
              >
                Ja, löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const join = (base, child) => {
  if (!base) return child || "";
  if (!child) return base;
  return `${base.replace(/\/+$/, "")}/${child.replace(/^\/+/, "")}`;
};
const parent = (p) => {
  if (!p) return "";
  const parts = p.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
};
const prettySize = (n) => {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let val = n;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(1)} ${units[i]}`;
};
