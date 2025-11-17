import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiDelete, apiGet, apiPost } from "../api";

export default function Shares() {
  const qc = useQueryClient();
  const { data: shares } = useQuery({
    queryKey: ["shares"],
    queryFn: () => apiGet("/api/storage/shares"),
    refetchInterval: 8000,
  });

  const { data: pools } = useQuery({
    queryKey: ["pools"],
    queryFn: () => apiGet("/api/storage/pools"),
  });

  const [form, setForm] = useState({
    name: "share1",
    pool: "",
    path: "",
    smb: true,
    nfs: false,
    comment: "",
    owner: "nobody",
    group: "nogroup",
    mode: "0775",
  });

  const create = useMutation({
    mutationFn: (payload) => apiPost("/api/storage/shares", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shares"] }),
  });

  const del = useMutation({
    mutationFn: (name) => apiDelete(`/api/storage/share/${name}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shares"] }),
  });

  const basePath = form.pool
    ? `/mnt/labcore/pools/${form.pool}/shares/${form.name}`
    : `/var/lib/labcore/data/shares/${form.name}`;

  return (
    <div className="text-white min-h-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Shares</h1>
          <p className="text-gray-400">Einfache NAS-Freigaben (SMB/NFS Flags, Pfad).</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl shadow-[0_20px_45px_rgba(15,23,42,0.35)]">
          <h2 className="text-xl font-semibold mb-4">Share anlegen</h2>
          <div className="space-y-3">
            <Field label="Name">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2"
              />
            </Field>
            <Field label="Pool (optional)">
              <select
                value={form.pool}
                onChange={(e) => setForm({ ...form, pool: e.target.value })}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2"
              >
                <option value="">Keiner</option>
                {pools?.map((p) => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Pfad">
              <input
                value={form.path || basePath}
                onChange={(e) => setForm({ ...form, path: e.target.value })}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2"
              />
            </Field>
            <Field label="Owner / Group">
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={form.owner}
                  onChange={(e) => setForm({ ...form, owner: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2"
                />
                <input
                  value={form.group}
                  onChange={(e) => setForm({ ...form, group: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2"
                />
              </div>
            </Field>
            <Field label="Mode (z.B. 0775)">
              <input
                value={form.mode}
                onChange={(e) => setForm({ ...form, mode: e.target.value })}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2"
              />
            </Field>
            <div className="flex gap-3 text-sm text-gray-200">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.smb}
                  onChange={(e) => setForm({ ...form, smb: e.target.checked })}
                />
                SMB
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.nfs}
                  onChange={(e) => setForm({ ...form, nfs: e.target.checked })}
                />
                NFS
              </label>
            </div>
            <Field label="Kommentar">
              <input
                value={form.comment}
                onChange={(e) => setForm({ ...form, comment: e.target.value })}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2"
              />
            </Field>
            <button
              onClick={() => create.mutate(form)}
              disabled={create.isPending}
              className="w-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-lg py-2 font-semibold shadow-lg shadow-purple-500/30"
            >
              {create.isPending ? "Erzeuge..." : "Share speichern"}
            </button>
            {create.isError && (
              <p className="text-sm text-red-400">{create.error?.response?.data || create.error?.message}</p>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {shares?.map((s) => (
            <div
              key={s.name}
              className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-xl shadow-[0_20px_45px_rgba(15,23,42,0.35)] flex flex-wrap items-center justify-between gap-3"
            >
              <div>
                <h3 className="text-xl font-semibold">{s.name}</h3>
                <p className="text-gray-300 text-sm">Pfad: {s.path}</p>
                <p className="text-gray-300 text-sm">Pool: {s.pool || "-"}</p>
                <p className="text-gray-400 text-xs">SMB: {s.smb ? "ja" : "nein"} · NFS: {s.nfs ? "ja" : "nein"}</p>
                {s.comment && <p className="text-gray-400 text-xs">{s.comment}</p>}
              </div>
              <button
                onClick={() => del.mutate(s.name)}
                className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-sm"
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

const Field = ({ label, children }) => (
  <div className="space-y-1">
    <p className="text-sm text-gray-300">{label}</p>
    {children}
  </div>
);
