import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost } from "../api";

export default function Pools() {
  const qc = useQueryClient();
  const [name, setName] = useState("pool1");
  const [selectedDisks, setSelectedDisks] = useState([]);
  const [layout, setLayout] = useState("stripe");
  const [formatTarget, setFormatTarget] = useState("");
  const [formatMessage, setFormatMessage] = useState("");
  const [formatError, setFormatError] = useState("");

  const { data: pools } = useQuery({
    queryKey: ["pools"],
    queryFn: () => apiGet("/api/storage/pools"),
    refetchInterval: 12000,
  });

  const { data: disks, isLoading: disksLoading } = useQuery({
    queryKey: ["disks"],
    queryFn: () => apiGet("/api/storage/disks"),
    refetchInterval: 15000,
  });
  const format = useMutation({
    mutationFn: (payload) => apiPost("/api/storage/disk/format", payload),
    onMutate: (payload) => {
      setFormatTarget(payload?.device || "");
      setFormatMessage("");
      setFormatError("");
    },
    onError: (err) => {
      setFormatError(err?.response?.data || err?.message || "Formatieren fehlgeschlagen");
    },
    onSuccess: () => {
      setFormatMessage("Disk formatiert.");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["disks"] });
      setFormatTarget("");
    },
  });

  const availableDisks = useMemo(
    () =>
      (disks || []).map((d) => ({
        ...d,
        sizeText: `${(d.size / (1024 ** 3)).toFixed(1)} GB`,
      })),
    [disks]
  );

  const poolDevices = useMemo(() => {
    const set = new Set();
    (pools || []).forEach((pool) => {
      const devs = [...(pool.data_disks || []), ...(pool.detected_disks || [])];
      devs.forEach((dev) => {
        const normalized = (dev || "").replace("/dev/", "");
        if (normalized) set.add(normalized);
      });
    });
    return set;
  }, [pools]);

  const selectableDataDisks = useMemo(
    () => availableDisks.filter((d) => !d.used && !poolDevices.has(d.name)),
    [availableDisks, poolDevices]
  );

  const handleFormat = (device) => {
    if (!device || format.isPending) return;
    format.mutate({ device, force: true });
  };

  const create = useMutation({
    mutationFn: (payload) => apiPost("/api/storage/pools", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pools"] }),
  });

  const del = useMutation({
    mutationFn: (name) => apiDelete(`/api/storage/pools?name=${encodeURIComponent(name)}`, {
      data: { name },
      headers: { "Content-Type": "application/json" },
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pools"], refetchType: "all" }),
  });

  return (
    <div className="text-white min-h-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Storage Pools</h1>
          <p className="text-gray-400">Unraid-ähnliche Pools (Parity + Data)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl shadow-[0_20px_45px_rgba(15,23,42,0.35)]">
          <h2 className="text-xl font-semibold mb-4">Pool anlegen</h2>
          <div className="space-y-3">
            <Field label="Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2"
              />
            </Field>
            <Field label="Layout (ZFS)">
              <select
                value={layout}
                onChange={(e) => setLayout(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2"
              >
                <option value="stripe">Stripe (RAID0, 1x oder mehr)</option>
                <option value="mirror">Mirror (mind. 2 Disks)</option>
                <option value="raidz1">RAIDZ1 (mind. 3 Disks)</option>
                <option value="raidz2">RAIDZ2 (mind. 4 Disks)</option>
                <option value="raidz3">RAIDZ3 (mind. 5 Disks)</option>
              </select>
            </Field>
            <Field label="Data Disks (Mehrfachauswahl)">
              <div className="flex items-center justify-between mb-2 text-xs text-gray-400">
                <span>Nur ungemountete Disks können ausgewählt werden.</span>
                <button
                  type="button"
                  className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20"
                  onClick={() => setSelectedDisks(selectableDataDisks.map((d) => `/dev/${d.name}`))}
                >
                  Alle freien wählen
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectableDataDisks.map((d) => {
                  const value = `/dev/${d.name}`;
                  const checked = selectedDisks.includes(value);
                  return (
                    <label
                      key={d.name}
                      className={`px-3 py-2 rounded-lg border ${
                        checked ? "border-purple-400 bg-purple-900/30" : "border-white/10 bg-black/40"
                      } text-sm cursor-pointer`}
                    >
                      <input
                        type="checkbox"
                        className="mr-2"
                        checked={checked}
                        onChange={() => {
                          setSelectedDisks((prev) =>
                            checked ? prev.filter((x) => x !== value) : [...prev, value]
                          );
                        }}
                      />
                      {d.name} ({d.sizeText})
                    </label>
                  );
                })}
              </div>
            </Field>
            <button
              onClick={() =>
                create.mutate({
                  name,
                  layout,
                  data_disks: selectedDisks,
                })
              }
              disabled={create.isPending}
              className="w-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-lg py-2 font-semibold shadow-lg shadow-purple-500/30"
            >
              {create.isPending ? "Erzeuge..." : "Pool speichern"}
            </button>
            {create.isError && (
              <p className="text-sm text-red-400">{create.error?.response?.data || create.error?.message}</p>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-xl shadow-[0_20px_45px_rgba(15,23,42,0.35)]">
            <h3 className="text-lg font-semibold mb-2">Disks</h3>
            {disksLoading && <p className="text-gray-400 text-sm">Lade Disks...</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-200">
                <thead>
                  <tr className="text-gray-400">
                    <th className="py-2">Name</th>
                    <th className="py-2">Größe</th>
                    <th className="py-2">Mount</th>
                    <th className="py-2">Modell</th>
                    <th className="py-2">Typ</th>
                    <th className="py-2 text-right">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {disks?.map((d) => (
                    <DiskRow
                      key={d.name}
                      disk={d}
                      level={0}
                      onFormat={(dev) => handleFormat(dev)}
                      formatPending={format.isPending}
                      formattingDevice={formatTarget}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {formatError && <p className="text-sm text-red-400 mt-2">{formatError}</p>}
            {formatMessage && <p className="text-sm text-emerald-400 mt-2">{formatMessage}</p>}
          </div>
          {pools?.map((p) => (
            <div
              key={p.name}
              className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-xl shadow-[0_20px_45px_rgba(15,23,42,0.35)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <h3 className="text-xl font-semibold">{p.name}</h3>
                  {p.orphan && (
                    <span className="inline-flex items-center gap-2 text-xs text-amber-300">
                      ⚠️ Verwaister Pool – nur noch in ZFS vorhanden
                    </span>
                  )}
                  <p className="text-gray-300 text-sm">Layout: {p.layout || "stripe"}</p>
                  <p className="text-gray-300 text-sm">
                    Disks:{" "}
                    {p.data_disks?.length
                      ? p.data_disks.join(", ")
                      : p.detected_disks?.length
                        ? p.detected_disks.join(", ")
                        : "-"}
                  </p>
                  <p className="text-gray-300 text-sm">Health: {p.health || "unknown"}</p>
                  <p className="text-gray-300 text-sm">
                    Total: {p.total_data ? (p.total_data / (1024 ** 3)).toFixed(1) : "0.0"} GB
                  </p>
                  <p className="text-gray-300 text-sm">
                    Free: {p.usable ? (p.usable / (1024 ** 3)).toFixed(1) : "0.0"} GB
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const message = p.orphan
                        ? `Verwaisten Pool "${p.name}" systemweit zerstören? Alle Disks werden gewiped.`
                        : `Pool "${p.name}" wirklich löschen? Daten und Disks werden gewiped.`;
                      if (confirm(message)) {
                        del.mutate(p.name);
                      }
                    }}
                    disabled={del.isPending}
                    className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-sm disabled:opacity-60"
                  >
                    {del.isPending ? "Lösche..." : "Delete"}
                  </button>
                  {del.isError && <span className="text-xs text-red-400">{del.error?.response?.data || del.error?.message}</span>}
                </div>
              </div>
              {p.shares?.length > 0 && (
                <div className="mt-3 text-sm text-gray-200">
                  <p className="text-gray-400">Shares:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {p.shares.map((s) => (
                      <li key={s.name}>
                        {s.name} — {s.path} ({s.smb ? "SMB" : ""}{s.smb && s.nfs ? ", " : ""}{s.nfs ? "NFS" : ""})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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

const hasRootMount = (d) => {
  if (!d) return false;
  if (d.mountpoint === "/") return true;
  return Array.isArray(d.children) && d.children.some((c) => hasRootMount(c));
};

const DiskRow = ({ disk, level, onFormat, formatPending, formattingDevice }) => {
  const indent = level * 16;
  const rootMounted = hasRootMount(disk);
  const canFormat = disk.type === "disk" && !disk.mountpoint && !rootMounted;
  return (
    <>
      <tr className={`border-t border-white/10 ${disk.mountpoint ? "text-yellow-300" : ""}`}>
        <td className="py-2 pl-2" style={{ paddingLeft: `${indent}px` }}>
          {disk.name}
        </td>
        <td className="py-2">{(disk.size / (1024 ** 3)).toFixed(1)} GB</td>
        <td className="py-2">{disk.mountpoint || "-"}</td>
        <td className="py-2">{disk.model || "-"}</td>
        <td className="py-2">{disk.type}</td>
        <td className="py-2 text-right">
          {canFormat && (
            <button
              onClick={() => onFormat && onFormat(`/dev/${disk.name}`)}
              disabled={formatPending}
              className="px-3 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-60"
            >
              {formatPending && formattingDevice === `/dev/${disk.name}` ? "Formatiere..." : "Formatieren"}
            </button>
          )}
        </td>
      </tr>
      {disk.children?.map((c) => (
        <DiskRow
          key={`${disk.name}-${c.name}`}
          disk={c}
          level={level + 1}
          onFormat={onFormat}
          formatPending={formatPending}
          formattingDevice={formattingDevice}
        />
      ))}
    </>
  );
};
