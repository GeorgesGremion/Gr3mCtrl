import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete } from "../api";
import Modal from "../components/Modal";
import VncViewer from "../components/VncViewer";

export default function VMs() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "gr3mctrl-vm",
    memory_mb: 2048,
    vcpus: 2,
    disk_gb: 20,
    iso: "",
    network: "default",
    pool: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["vms"],
    queryFn: () => apiGet("/api/vm/domains"),
    refetchInterval: 8000,
  });

  const { data: isos } = useQuery({
    queryKey: ["isos"],
    queryFn: () => apiGet("/api/storage/isos"),
    refetchInterval: 10000,
  });

  const { data: nets } = useQuery({
    queryKey: ["vm-networks"],
    queryFn: () => apiGet("/api/vm/networks"),
    refetchInterval: 12000,
  });

  const { data: pools } = useQuery({
    queryKey: ["pools"],
    queryFn: () => apiGet("/api/storage/pools"),
    refetchInterval: 15000,
  });

  const act = useMutation({
    mutationFn: ({ name, action }) => apiPost(`/api/vm/${name}/${action}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vms"] }),
  });

  const create = useMutation({
    mutationFn: (payload) => apiPost("/api/vm/create", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vms"] });
      setShowCreate(false);
    },
  });

  const remove = useMutation({
    mutationFn: ({ name, keepDisks }) => apiDelete(`/api/vm/${name}/delete?keep_disks=${keepDisks ? "true" : "false"}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vms"] }),
  });

  const [consoleVM, setConsoleVM] = useState("");
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("console");
  const [isoSelection, setIsoSelection] = useState("");
  const [memInput, setMemInput] = useState(0);
  const [vcpuInput, setVcpuInput] = useState(0);
  const [netSelection, setNetSelection] = useState("");
  const [netMac, setNetMac] = useState("");
  const [netModel, setNetModel] = useState("virtio");
  const [diskSize, setDiskSize] = useState(10);
  const [diskPool, setDiskPool] = useState("");
  const [snapshotName, setSnapshotName] = useState("");
  const [logAuto, setLogAuto] = useState(false);

  const { data: selectedDetail } = useQuery({
    queryKey: ["vm-detail", selected?.name],
    queryFn: () => apiGet(`/api/vm/domain/${selected.name}`),
    enabled: !!selected?.name,
    refetchInterval: 5000,
  });

  const changeMedia = useMutation({
    mutationFn: ({ name, iso }) => apiPost(`/api/vm/${name}/media`, { iso }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vm-detail"] });
      setIsoSelection("");
    },
    onError: (err) => alert("Fehler: " + (err.response?.data || err.message)),
  });

  const updateResources = useMutation({
    mutationFn: ({ memory_mb, vcpus }) =>
      apiPost(`/api/vm/${selected.name}/resources`, { memory_mb, vcpus }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vm-detail", selected?.name] }),
    onError: (err) => alert(err?.response?.data || err.message),
  });

  const toggleAutostart = useMutation({
    mutationFn: (enabled) => apiPost(`/api/vm/${selected.name}/autostart`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vm-detail", selected?.name] }),
    onError: (err) => alert(err?.response?.data || err.message),
  });

  const attachNet = useMutation({
    mutationFn: ({ network, mac, model }) =>
      apiPost(`/api/vm/${selected.name}/net/attach`, { network, mac, model }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vm-detail", selected?.name], refetchType: "active" }),
    onError: (err) => alert(err?.response?.data || err.message),
  });

  const detachNet = useMutation({
    mutationFn: (mac) => apiPost(`/api/vm/${selected.name}/net/detach`, { mac }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vm-detail", selected?.name], refetchType: "active" }),
    onError: (err) => alert(err?.response?.data || err.message),
  });

  const attachDisk = useMutation({
    mutationFn: ({ size_gb, pool }) => apiPost(`/api/vm/${selected.name}/disk/attach`, { size_gb, pool }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vm-detail", selected?.name], refetchType: "active" }),
    onError: (err) => alert(err?.response?.data || err.message),
  });

  const detachDisk = useMutation({
    mutationFn: ({ target, delete_file }) => apiPost(`/api/vm/${selected.name}/disk/detach`, { target, delete_file }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vm-detail", selected?.name], refetchType: "active" }),
    onError: (err) => alert(err?.response?.data || err.message),
  });

  const snapshots = useQuery({
    queryKey: ["vm-snapshots", selected?.name],
    queryFn: () => apiGet(`/api/vm/${selected.name}/snapshots`),
    enabled: !!selected?.name,
    refetchInterval: 8000,
  });

  const vmLogs = useQuery({
    queryKey: ["vm-logs", selected?.name],
    queryFn: () => apiGet(`/api/vm/${selected.name}/logs?lines=300`),
    enabled: !!selected?.name,
    refetchInterval: logAuto ? 5000 : false,
  });

  const createSnapshot = useMutation({
    mutationFn: (name) => apiPost(`/api/vm/${selected.name}/snapshot`, { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vm-snapshots", selected?.name], refetchType: "active" }),
    onError: (err) => alert(err?.response?.data || err.message),
  });

  const revertSnapshot = useMutation({
    mutationFn: (snap) => apiPost(`/api/vm/${selected.name}/snapshot/${encodeURIComponent(snap)}/revert`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vm-snapshots", selected?.name], refetchType: "active" }),
    onError: (err) => alert(err?.response?.data || err.message),
  });

  const deleteSnapshot = useMutation({
    mutationFn: (snap) => apiDelete(`/api/vm/${selected.name}/snapshot/${encodeURIComponent(snap)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vm-snapshots", selected?.name], refetchType: "active" }),
    onError: (err) => alert(err?.response?.data || err.message),
  });

  useEffect(() => {
    if (data && data.length > 0 && !selected) {
      setSelected(data[0]);
    }
  }, [data, selected]);

  useEffect(() => {
    if (selectedDetail) {
      setMemInput(selectedDetail.memory_mb || 0);
      setVcpuInput(selectedDetail.vcpus || 0);
    }
  }, [selectedDetail]);

  return (
    <div className="text-white min-h-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Virtual Machines</h1>
          <p className="text-gray-400">
            Libvirt/KVM Domains â€“ Start/Stop/Restart/Console.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 text-sm font-semibold shadow-lg shadow-purple-500/30"
          >
            VM anlegen
          </button>
          <span className="text-sm text-gray-500">Auto-Refresh 8s</span>
        </div>
      </div>

      {isLoading && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-gray-400">
          Lade VMs...
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-xl shadow-[0_20px_45px_rgba(15,23,42,0.35)]">
          <h3 className="text-lg font-semibold mb-3">VMs</h3>
          <div className="space-y-2">
            {data?.map((vm) => {
              const active = selected?.name === vm.name;
              return (
                <button
                  key={vm.uuid}
                  onClick={() => {
                    setSelected(vm);
                    setTab("console");
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg border ${active ? "border-blue-400 bg-blue-900/40" : "border-white/10 bg-black/30 hover:bg-black/40"
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{vm.name}</p>
                      <p className="text-xs text-gray-400">UUID: {vm.uuid}</p>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-xs ${vm.state === "running" ? "bg-emerald-600/70" : "bg-slate-700"
                        }`}
                    >
                      {vm.state}
                    </span>
                  </div>
                </button>
              );
            })}
            {!data?.length && <p className="text-sm text-gray-400">Keine VMs gefunden.</p>}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-xl shadow-[0_20px_45px_rgba(15,23,42,0.35)] min-h-[60vh] flex flex-col">
          {selected ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-xl font-semibold">{selected.name}</h3>
                  <p className="text-xs text-gray-400">UUID: {selected.uuid}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ActionButton label="Start" onClick={() => act.mutate({ name: selected.name, action: "start" })} />
                  <ActionButton label="Shutdown" color="amber" onClick={() => act.mutate({ name: selected.name, action: "shutdown" })} />
                  <ActionButton label="Restart" color="indigo" onClick={() => act.mutate({ name: selected.name, action: "reboot" })} />
                  <ActionButton label="Destroy" color="rose" onClick={() => act.mutate({ name: selected.name, action: "destroy" })} />
                  <ActionButton
                    label="Delete"
                    color="slate"
                    onClick={() => {
                      const keep = confirm("Disks behalten? OK = behalten, Cancel = Disks mit loeschen.");
                      if (confirm("VM loeschen?")) {
                        remove.mutate({ name: selected.name, keepDisks: keep });
                      }
                    }}
                  />
                  <ActionButton
                    label="Console"
                    color="blue"
                    disabled={selected.state !== "running"}
                    onClick={() => setConsoleVM(selected.name)}
                  />
                </div>
              </div>

              <div className="border-b border-white/10 mb-4 flex gap-3 text-sm">
                {["console", "hardware", "network", "snapshots", "logs", "options"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-3 py-2 rounded-t-md ${tab === t ? "bg-white/10 text-white" : "text-gray-400 hover:text-white"
                      }`}
                  >
                    {t === "console"
                      ? "Console"
                      : t === "hardware"
                        ? "Hardware"
                        : t === "network"
                          ? "Netzwerk"
                          : t === "snapshots"
                            ? "Snapshots"
                            : t === "logs"
                              ? "Logs"
                          : "Optionen"}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-auto">
                {tab === "console" && (
                  <div className="text-sm text-gray-300 h-full">
                    {selected.state !== "running" ? (
                      <p className="text-red-400 mb-2">VM muss laufen, um die Konsole zu oeffnen.</p>
                    ) : (
                      <VncViewer vmName={selected.name} onClose={() => setConsoleVM("")} inline />
                    )}
                  </div>
                )}
                {tab === "hardware" && (
                  <div className="space-y-6 text-sm text-gray-200">
                    <div className="space-y-2">
                      <p><span className="text-gray-400 w-32 inline-block">Name:</span> {selected.name}</p>
                      <p><span className="text-gray-400 w-32 inline-block">UUID:</span> {selected.uuid}</p>
                      <p><span className="text-gray-400 w-32 inline-block">ID:</span> {selected.id}</p>
                      <p><span className="text-gray-400 w-32 inline-block">Status:</span> {selected.state}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 w-32 inline-block">Autostart:</span>
                        <span className="text-emerald-300 text-xs">{selectedDetail?.autostart ? "aktiv" : "aus"}</span>
                        <button
                          onClick={() => toggleAutostart.mutate(!selectedDetail?.autostart)}
                          className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs"
                          disabled={toggleAutostart.isPending}
                        >
                          {toggleAutostart.isPending ? "..." : selectedDetail?.autostart ? "Deaktivieren" : "Aktivieren"}
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-white/10 pt-4">
                      <h4 className="text-base font-semibold mb-3">Ressourcen</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                        <label className="flex flex-col gap-1">
                          <span className="text-gray-400 text-xs">RAM (MiB)</span>
                          <input
                            type="number"
                            value={memInput}
                            onChange={(e) => setMemInput(Number(e.target.value))}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1"
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-gray-400 text-xs">vCPUs</span>
                          <input
                            type="number"
                            value={vcpuInput}
                            onChange={(e) => setVcpuInput(Number(e.target.value))}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1"
                          />
                        </label>
                        <button
                          onClick={() => updateResources.mutate({ memory_mb: memInput, vcpus: vcpuInput })}
                          disabled={updateResources.isPending}
                          className="bg-indigo-600 hover:bg-indigo-500 px-3 py-2 rounded text-sm disabled:opacity-50"
                        >
                          {updateResources.isPending ? "Speichere..." : "Anwenden"}
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-white/10 pt-4">
                      <h4 className="text-base font-semibold mb-3">CD-ROM / ISO</h4>
                      <div className="bg-black/20 p-4 rounded-lg space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">Aktuell eingelegt:</span>
                          <span className="font-mono text-emerald-400">{selectedDetail?.cdrom || "Leer"}</span>
                        </div>

                        <div className="flex gap-2">
                          <select
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 flex-1"
                            onChange={(e) => setIsoSelection(e.target.value)}
                            value={isoSelection}
                          >
                            <option value="">ISO auswählen...</option>
                            {isos?.map(iso => (
                              <option key={iso.path} value={iso.path}>{iso.name}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => changeMedia.mutate({ name: selected.name, iso: isoSelection })}
                            disabled={!isoSelection || changeMedia.isPending}
                            className="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded disabled:opacity-50"
                          >
                            Einlegen
                          </button>
                          <button
                            onClick={() => changeMedia.mutate({ name: selected.name, iso: "" })}
                            disabled={!selectedDetail?.cdrom || changeMedia.isPending}
                            className="bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded disabled:opacity-50"
                          >
                            Auswerfen
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-white/10 pt-4 space-y-3">
                      <h4 className="text-base font-semibold">Disks</h4>
                      <div className="space-y-2">
                        {selectedDetail?.disks?.filter((d) => d.device === "disk").length ? (
                          selectedDetail.disks
                            .filter((d) => d.device === "disk")
                            .map((disk) => (
                              <div
                                key={disk.target}
                                className="flex items-center justify-between bg-black/20 px-3 py-2 rounded border border-white/10"
                              >
                                <div className="space-y-1">
                                  <p>Target: {disk.target} ({disk.bus || "-"})</p>
                                  <p className="text-xs text-gray-400 break-all">Source: {disk.source}</p>
                                </div>
                                <button
                                  onClick={() => {
                                    const del = confirm("Backing-File mit loeschen?");
                                    detachDisk.mutate({ target: disk.target, delete_file: del });
                                  }}
                                  disabled={detachDisk.isPending}
                                  className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-xs disabled:opacity-50"
                                >
                                  {detachDisk.isPending ? "..." : "Detach"}
                                </button>
                              </div>
                            ))
                        ) : (
                          <p className="text-gray-400">Keine weiteren Disks.</p>
                        )}
                      </div>

                      <div className="border-t border-white/10 pt-3 space-y-2">
                        <h5 className="text-sm font-semibold">Disk anhaengen</h5>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <label className="flex flex-col gap-1">
                            <span className="text-gray-400 text-xs">Groesse (GB)</span>
                            <input
                              type="number"
                              value={diskSize}
                              onChange={(e) => setDiskSize(Number(e.target.value))}
                              className="bg-slate-800 border border-slate-700 rounded px-2 py-1"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-gray-400 text-xs">Pool (optional)</span>
                            <select
                              value={diskPool}
                              onChange={(e) => setDiskPool(e.target.value)}
                              className="bg-slate-800 border border-slate-700 rounded px-2 py-1"
                            >
                              <option value="">Default (DataPath)</option>
                              {pools?.map((p) => (
                                <option key={p.name} value={p.name}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            onClick={() => {
                              if (!diskSize || diskSize <= 0) return alert("Bitte Groesse > 0 angeben");
                              attachDisk.mutate({ size_gb: diskSize, pool: diskPool || undefined });
                            }}
                            disabled={attachDisk.isPending}
                            className="bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded text-sm disabled:opacity-50"
                          >
                            {attachDisk.isPending ? "Haenge an..." : "Disk anlegen + attach"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {tab === "network" && (
                  <div className="text-sm text-gray-200 space-y-4">
                    <div>
                      <h4 className="text-base font-semibold mb-2">Interfaces</h4>
                      <div className="space-y-2">
                        {selectedDetail?.networks?.length ? (
                          selectedDetail.networks.map((iface) => (
                            <div
                              key={iface.mac + iface.target}
                              className="flex items-center justify-between bg-black/20 px-3 py-2 rounded border border-white/10"
                            >
                              <div className="space-y-1">
                                <p>MAC: {iface.mac}</p>
                                <p>Typ: {iface.type} / Quelle: {iface.source || "-"}</p>
                                <p>Target: {iface.target || "-"} / Model: {iface.model || "-"}</p>
                              </div>
                              <button
                                onClick={() => detachNet.mutate(iface.mac)}
                                disabled={detachNet.isPending}
                                className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-xs disabled:opacity-50"
                              >
                                {detachNet.isPending ? "..." : "Detach"}
                              </button>
                            </div>
                          ))
                        ) : (
                          <p className="text-gray-400">Keine Interfaces erkannt.</p>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-white/10 pt-3 space-y-2">
                      <h4 className="text-base font-semibold">Interface anhaengen</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <select
                          value={netSelection}
                          onChange={(e) => setNetSelection(e.target.value)}
                          className="bg-slate-800 border border-slate-700 rounded px-2 py-1"
                        >
                          <option value="">Netzwerk waehlen</option>
                          {nets?.map((n) => (
                            <option key={n.name + n.kind} value={n.kind === "bridge" ? `br:${n.name}` : n.name}>
                              {n.name} {n.kind === "bridge" ? "(bridge)" : "(libvirt)"}
                            </option>
                          ))}
                        </select>
                        <input
                          value={netMac}
                          onChange={(e) => setNetMac(e.target.value)}
                          placeholder="MAC optional"
                          className="bg-slate-800 border border-slate-700 rounded px-2 py-1"
                        />
                        <select
                          value={netModel}
                          onChange={(e) => setNetModel(e.target.value)}
                          className="bg-slate-800 border border-slate-700 rounded px-2 py-1"
                        >
                          <option value="virtio">virtio</option>
                          <option value="e1000">e1000</option>
                          <option value="rtl8139">rtl8139</option>
                        </select>
                      </div>
                      <button
                        onClick={() => {
                          if (!netSelection) return alert("Bitte Netzwerk auswaehlen");
                          attachNet.mutate({ network: netSelection, mac: netMac || undefined, model: netModel || "virtio" });
                        }}
                        disabled={attachNet.isPending}
                        className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-sm disabled:opacity-50"
                      >
                        {attachNet.isPending ? "Haenge an..." : "Attach"}
                      </button>
                    </div>
                  </div>
                )}
                {tab === "options" && (
                  <div className="text-sm text-gray-200">
                    <p>Weitere VM-Optionen werden hier ergaenzt (Autostart, Labels, Notes).</p>
                  </div>
                )}
                {tab === "snapshots" && (
                  <div className="text-sm text-gray-200 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-end gap-2">
                      <div className="flex-1">
                        <label className="text-xs text-gray-400">Snapshot-Name (optional)</label>
                        <input
                          value={snapshotName}
                          onChange={(e) => setSnapshotName(e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1"
                          placeholder="snap-1"
                        />
                      </div>
                      <button
                        onClick={() => createSnapshot.mutate(snapshotName || undefined)}
                        disabled={createSnapshot.isPending}
                        className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-sm disabled:opacity-50"
                      >
                        {createSnapshot.isPending ? "Erzeuge..." : "Snapshot anlegen"}
                      </button>
                    </div>

                    <div className="space-y-2">
                      {snapshots.data?.length ? (
                        snapshots.data.map((s) => (
                          <div
                            key={s.name}
                            className={`flex items-center justify-between bg-black/20 px-3 py-2 rounded border ${s.current ? "border-emerald-400/60" : "border-white/10"}`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono">{s.name}</span>
                              {s.current && <span className="text-xs text-emerald-300">current</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => revertSnapshot.mutate(s.name)}
                                disabled={revertSnapshot.isPending}
                                className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-xs disabled:opacity-50"
                              >
                                {revertSnapshot.isPending ? "..." : "Revert"}
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm(`Snapshot ${s.name} loeschen?`)) deleteSnapshot.mutate(s.name);
                                }}
                                disabled={deleteSnapshot.isPending}
                                className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-xs disabled:opacity-50"
                              >
                                {deleteSnapshot.isPending ? "..." : "Delete"}
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-gray-400">Keine Snapshots.</p>
                      )}
                    </div>
                  </div>
                )}
                {tab === "logs" && (
                  <div className="text-sm text-gray-200 space-y-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => vmLogs.refetch()}
                        disabled={vmLogs.isFetching}
                        className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 border border-white/10 text-sm"
                      >
                        {vmLogs.isFetching ? "Lade..." : "Reload"}
                      </button>
                      <label className="flex items-center gap-2 text-xs text-gray-300">
                        <input type="checkbox" checked={logAuto} onChange={(e) => setLogAuto(e.target.checked)} />
                        Auto-Refresh 5s
                      </label>
                    </div>
                    {vmLogs.isError && <p className="text-rose-400 text-sm">{vmLogs.error?.response?.data || vmLogs.error?.message}</p>}
                    <div className="bg-black/40 border border-white/10 rounded-lg p-3 font-mono text-xs text-slate-200 whitespace-pre-wrap min-h-[50vh]">
                      {vmLogs.data || (vmLogs.isFetching ? "Lade Logs..." : "Keine Logs geladen.")}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="text-gray-400">Bitte eine VM links auswaehlen.</p>
          )}
        </div>
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Neue VM erstellen">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 focus:border-blue-500 outline-none"
              />
            </Field>
            <Field label="RAM (MiB)">
              <input
                type="number"
                value={form.memory_mb}
                onChange={(e) => setForm({ ...form, memory_mb: Number(e.target.value) })}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 focus:border-blue-500 outline-none"
              />
            </Field>
            <Field label="vCPUs">
              <input
                type="number"
                value={form.vcpus}
                onChange={(e) => setForm({ ...form, vcpus: Number(e.target.value) })}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 focus:border-blue-500 outline-none"
              />
            </Field>
            <Field label="Disk (GB)">
              <input
                type="number"
                value={form.disk_gb}
                onChange={(e) => setForm({ ...form, disk_gb: Number(e.target.value) })}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 focus:border-blue-500 outline-none"
              />
            </Field>
          </div>

          <Field label="ISO">
            <select
              value={form.iso}
              onChange={(e) => setForm({ ...form, iso: e.target.value })}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2"
            >
              <option value="">Bitte ISO waehlen</option>
              {isos?.map((iso) => (
                <option key={iso.name} value={iso.path}>
                  {iso.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Netzwerk">
            <select
              value={form.network}
              onChange={(e) => setForm({ ...form, network: e.target.value })}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2"
            >
              <option value="default">default (NAT)</option>
              {nets?.map((n) => (
                <option
                  key={n.name + n.kind}
                  value={n.kind === "bridge" ? `br:${n.name}` : n.name}
                >
                  {n.name} {n.kind === "bridge" ? "(host bridge)" : "(libvirt)"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Storage Pool (optional)">
            <select
              value={form.pool}
              onChange={(e) => setForm({ ...form, pool: e.target.value })}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2"
            >
              <option value="">Default (/var/lib/gr3mctrl/data)</option>
              {pools?.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} (usable {(p.usable / (1024 ** 3)).toFixed(1)} GB)
                </option>
              ))}
            </select>
          </Field>

          <button
            onClick={() => create.mutate(form)}
            disabled={create.isPending}
            className="w-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-lg py-2 font-semibold shadow-lg shadow-purple-500/30 disabled:opacity-60"
          >
            {create.isPending ? "Erzeuge..." : "VM erstellen"}
          </button>

          {create.isError && (
            <p className="text-sm text-red-400">
              {create.error?.response?.data || create.error?.message}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}

const ActionButton = ({ label, onClick, color = "emerald", disabled }) => {
  const colorMap = {
    emerald: "bg-emerald-600 hover:bg-emerald-500",
    amber: "bg-amber-600 hover:bg-amber-500",
    indigo: "bg-indigo-700 hover:bg-indigo-600",
    rose: "bg-rose-600 hover:bg-rose-500",
    blue: "bg-blue-700 hover:bg-blue-600",
    slate: "bg-slate-800 hover:bg-slate-700",
  };
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`px-3 py-2 rounded-lg text-xs ${colorMap[color] || colorMap.emerald} disabled:opacity-50`}
    >
      {label}
    </button>
  );
};

const Field = ({ label, children }) => (
  <div className="space-y-1">
    <p className="text-sm text-gray-300">{label}</p>
    {children}
  </div>
);

