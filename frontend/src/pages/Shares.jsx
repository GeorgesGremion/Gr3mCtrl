import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "../api";

const defaultForm = {
  name: "share1",
  pool: "",
  path: "",
  smb: true,
  nfs: false,
  comment: "",
  owner: "",
  group: "",
  mode: "0775",
  users_read: [],
  users_write: [],
  is_public: false,
};

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

  const { data: nasUsers } = useQuery({
    queryKey: ["nas-users"],
    queryFn: () => apiGet("/api/nas/users"),
  });

  const { data: smbStatus, refetch: refetchSmb } = useQuery({
    queryKey: ["smb-status"],
    queryFn: () => apiGet("/api/storage/smb"),
    refetchInterval: 10000,
  });

  const { data: nfsStatus, refetch: refetchNfs } = useQuery({
    queryKey: ["nfs-status"],
    queryFn: () => apiGet("/api/storage/nfs"),
    refetchInterval: 15000,
  });

  const smbAction = useMutation({
    mutationFn: (action) => apiPost("/api/storage/smb", { action }),
    onSuccess: () => refetchSmb(),
  });

  const nfsAction = useMutation({
    mutationFn: (action) => apiPost("/api/storage/nfs", { action }),
    onSuccess: () => refetchNfs(),
  });
  const [form, setForm] = useState(defaultForm);
  const [pathTouched, setPathTouched] = useState(false);

  useEffect(() => {
    if (nasUsers && nasUsers.length > 0) {
      setForm((prev) => ({
        ...prev,
        owner: prev.owner || nasUsers[0].username,
        group: prev.group || nasUsers[0].username,
      }));
    }
  }, [nasUsers]);

  const basePath =
    form.pool && form.name
      ? `/mnt/c0r3nex/pools/${form.pool}/shares/${form.name}`
      : `/var/lib/c0r3nex/data/shares/${form.name || "share"}`;

  useEffect(() => {
    if (!pathTouched) {
      setForm((prev) => ({ ...prev, path: basePath }));
    }
  }, [form.pool, form.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = useMutation({
    mutationFn: (payload) => apiPost("/api/storage/shares", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shares"] });
      setForm((prev) => ({
        ...defaultForm,
        owner: prev.owner,
        group: prev.group,
      }));
      setPathTouched(false);
    },
  });

  const del = useMutation({
    mutationFn: (name) => apiDelete(`/api/storage/share/${name}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shares"] }),
  });

  const move = useMutation({
    mutationFn: ({ name, pool, path }) => apiPut(`/api/storage/share/${name}/move`, { pool, path }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shares"] }),
  });

  const toggleRead = (username, checked) => {
    setForm((prev) => {
      const users_read = checked
        ? [...new Set([...prev.users_read, username])]
        : prev.users_read.filter((x) => x !== username);
      const users_write = checked
        ? prev.users_write
        : prev.users_write.filter((x) => x !== username);
      return { ...prev, users_read, users_write };
    });
  };

  const toggleWrite = (username, checked) => {
    setForm((prev) => {
      const users_write = checked
        ? [...new Set([...prev.users_write, username])]
        : prev.users_write.filter((x) => x !== username);
      const users_read = checked
        ? [...new Set([...prev.users_read, username])]
        : prev.users_read;
      return { ...prev, users_read, users_write };
    });
  };

  return (
    <div className="text-white min-h-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Shares</h1>
          <p className="text-gray-400">Einfache NAS-Freigaben (SMB/NFS Flags, Pfad).</p>
        </div>
        <div className="flex gap-3 text-sm">
          <ServiceBadge
            name="SMB"
            status={smbStatus}
            onStart={() => smbAction.mutate("start")}
            onStop={() => smbAction.mutate("stop")}
          />
          <ServiceBadge
            name="NFS"
            status={nfsStatus}
            onStart={() => nfsAction.mutate("start")}
            onStop={() => nfsAction.mutate("stop")}
          />
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
                onChange={(e) => {
                  setPathTouched(true);
                  setForm({ ...form, path: e.target.value });
                }}
                onFocus={() => setPathTouched(true)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2"
                placeholder={basePath}
              />
            </Field>
            <Field label="Owner / Group">
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={form.owner}
                  onChange={(e) => setForm({ ...form, owner: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2"
                >
                  <option value="">Owner wählen</option>
                  {nasUsers?.map((u) => (
                    <option key={u.id} value={u.username}>
                      {u.username}
                    </option>
                  ))}
                </select>
                <select
                  value={form.group}
                  onChange={(e) => setForm({ ...form, group: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2"
                >
                  <option value="">Gruppe wählen</option>
                  {nasUsers?.map((u) => (
                    <option key={u.id} value={u.username}>
                      {u.username}
                    </option>
                  ))}
                </select>
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
            {nasUsers && nasUsers.length > 0 && (
              <div className="space-y-2 text-sm text-gray-200">
                <p className="text-sm text-gray-300">Benutzerrechte (kein Gastzugriff)</p>
                <div className="space-y-2 max-h-56 overflow-auto pr-2">
                  {nasUsers.map((u) => {
                    const rChecked = form.users_read.includes(u.username);
                    const wChecked = form.users_write.includes(u.username);
                    return (
                      <div key={u.id} className="flex items-center justify-between bg-black/30 rounded px-3 py-2">
                        <div>
                          <p className="text-white">{u.username}</p>
                          <p className="text-xs text-gray-400">{u.display_name}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={rChecked}
                              onChange={(e) => toggleRead(u.username, e.target.checked)}
                            />
                            Read
                          </label>
                          <label className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={wChecked}
                              onChange={(e) => toggleWrite(u.username, e.target.checked)}
                            />
                            Read/Write
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
                <p className="text-gray-400 text-xs">
                  Owner/Group: {s.owner || "-"} / {s.group || "-"} · Mode: {s.mode}
                </p>
                <p className="text-gray-400 text-xs">SMB: {s.smb ? "ja" : "nein"} · NFS: {s.nfs ? "ja" : "nein"}</p>
                {(s.users_read?.length > 0 || s.users_write?.length > 0) && (
                  <div className="text-gray-300 text-xs mt-1 space-y-1">
                    {s.users_read?.length > 0 && (
                      <div>
                        <span className="text-gray-400">Read:</span>{" "}
                        {s.users_read.map((u) => (
                          <span key={u} className="inline-flex items-center px-2 py-0.5 bg-white/10 rounded-full mr-1">
                            {u}
                          </span>
                        ))}
                      </div>
                    )}
                    {s.users_write?.length > 0 && (
                      <div>
                        <span className="text-gray-400">Read/Write:</span>{" "}
                        {s.users_write.map((u) => (
                          <span key={u} className="inline-flex items-center px-2 py-0.5 bg-blue-500/20 rounded-full mr-1">
                            {u}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {s.comment && <p className="text-gray-400 text-xs mt-1">{s.comment}</p>}
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                <select
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "__noop__") return;
                    move.mutate({ name: s.name, pool: val === "__default__" ? "" : val });
                    e.target.value = "__noop__";
                  }}
                  defaultValue="__noop__"
                  className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
                >
                  <option value="__noop__">Pool wechseln…</option>
                  <option value="__default__">Default</option>
                  {pools?.map((p) => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => del.mutate(s.name)}
                  className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-sm"
                >
                  Delete
                </button>
              </div>
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

const ServiceBadge = ({ name, status, onStart, onStop }) => {
  const running = status?.running;
  const msg = status?.message || (running ? "running" : "stopped");
  return (
    <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
      <div className={`w-2 h-2 rounded-full ${running ? "bg-emerald-400" : "bg-rose-500"}`} />
      <div className="text-gray-200 text-sm">
        {name}: {msg}
      </div>
      <div className="flex gap-1">
        <button
          onClick={onStart}
          className="px-2 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700"
        >
          Start
        </button>
        <button
          onClick={onStop}
          className="px-2 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700"
        >
          Stop
        </button>
      </div>
    </div>
  );
};
