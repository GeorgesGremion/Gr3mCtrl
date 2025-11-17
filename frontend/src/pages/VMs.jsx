import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete } from "../api";
import Modal from "../components/Modal";
import VncViewer from "../components/VncViewer";

export default function VMs() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "labcore-vm",
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
    mutationFn: (name) => apiDelete(`/api/vm/${name}/delete`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vms"] }),
  });

  const [consoleVM, setConsoleVM] = useState("");
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("console");

  useEffect(() => {
    if (data && data.length > 0 && !selected) {
      setSelected(data[0]);
    }
  }, [data, selected]);

  return (
    <div className="text-white min-h-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Virtual Machines</h1>
          <p className="text-gray-400">
            Libvirt/KVM Domains – Start/Stop/Restart/Console.
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
                  className={`w-full text-left px-3 py-2 rounded-lg border ${
                    active ? "border-blue-400 bg-blue-900/40" : "border-white/10 bg-black/30 hover:bg-black/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{vm.name}</p>
                      <p className="text-xs text-gray-400">UUID: {vm.uuid}</p>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        vm.state === "running" ? "bg-emerald-600/70" : "bg-slate-700"
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

        <div className="lg:col-span-2 bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-xl shadow-[0_20px_45px_rgba(15,23,42,0.35)] min-h-[60vh]">
          {selected ? (
            <div className="flex flex-col h-full">
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
                      if (confirm("VM löschen? (undefine + Disk-Verzeichnis entfernen)")) {
                        remove.mutate(selected.name);
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
                {["console", "hardware", "network", "options"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-3 py-2 rounded-t-md ${
                      tab === t ? "bg-white/10 text-white" : "text-gray-400 hover:text-white"
                    }`}
                  >
                    {t === "console"
                      ? "Console"
                      : t === "hardware"
                      ? "Hardware"
                      : t === "network"
                      ? "Netzwerk"
                      : "Optionen"}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-auto">
                {tab === "console" && (
                  <div className="text-sm text-gray-300">
                    {selected.state !== "running" ? (
                      <p className="text-red-400 mb-2">VM muss laufen, um die Konsole zu öffnen.</p>
                    ) : (
                      <VncViewer vmName={selected.name} onClose={() => setConsoleVM("")} />
                    )}
                  </div>
                )}
                {tab === "hardware" && (
                  <div className="space-y-2 text-sm text-gray-200">
                    <p>Name: {selected.name}</p>
                    <p>UUID: {selected.uuid}</p>
                    <p>ID: {selected.id}</p>
                    <p>Status: {selected.state}</p>
                    <p>Kern/CPU: n/a (Detail-API fehlt)</p>
                    <p>RAM: n/a (Detail-API fehlt)</p>
                  </div>
                )}
                {tab === "network" && (
                  <div className="text-sm text-gray-200">
                    <p>Netzwerkdetails sind noch nicht verfügbar (XML-Auswertung fehlt).</p>
                  </div>
                )}
                {tab === "options" && (
                  <div className="text-sm text-gray-200">
                    <p>Weitere VM-Optionen werden hier ergänzt (Autostart, Labels, Notes).</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-gray-400">Bitte eine VM links auswählen.</p>
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
              <option value="">Bitte ISO wählen</option>
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
              <option value="">Default (/var/lib/labcore/data)</option>
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
