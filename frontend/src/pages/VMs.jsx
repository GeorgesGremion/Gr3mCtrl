import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiGet, apiPost, apiDelete } from "../api";
import Modal from "../components/Modal";
import SpiceViewer from "../components/SpiceViewer";

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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {data?.map((vm) => (
          <div
            key={vm.uuid}
            className="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-xl shadow-[0_20px_45px_rgba(15,23,42,0.35)] flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold">{vm.name}</h3>
                <p className="text-gray-400 text-sm">UUID: {vm.uuid}</p>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs ${
                  vm.state === "running" ? "bg-emerald-600/70" : "bg-slate-700"
                }`}
              >
                {vm.state}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={act.isPending}
                onClick={() => act.mutate({ name: vm.name, action: "start" })}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 rounded-lg py-2 text-sm"
              >
                Start
              </button>
              <button
                disabled={act.isPending}
                onClick={() => act.mutate({ name: vm.name, action: "shutdown" })}
                className="flex-1 bg-amber-600 hover:bg-amber-500 rounded-lg py-2 text-sm"
              >
                Shutdown
              </button>
              <button
                disabled={act.isPending}
                onClick={() => act.mutate({ name: vm.name, action: "destroy" })}
                className="flex-1 bg-rose-600 hover:bg-rose-500 rounded-lg py-2 text-sm"
              >
                Destroy
              </button>
              <button
                disabled={act.isPending}
                onClick={() => act.mutate({ name: vm.name, action: "reboot" })}
                className="flex-1 bg-indigo-700 hover:bg-indigo-600 rounded-lg py-2 text-sm"
              >
                Restart
              </button>
              <button
                disabled={remove.isPending}
                onClick={() => {
                  if (confirm("VM löschen? (undefine + Disk-Verzeichnis entfernen)")) {
                    remove.mutate(vm.name);
                  }
                }}
                className="flex-1 bg-slate-800 hover:bg-slate-700 rounded-lg py-2 text-sm"
              >
                Delete
              </button>
              <button
                disabled={vm.state !== "running"}
                onClick={() => setConsoleVM(vm.name)}
                className="flex-1 bg-blue-800 hover:bg-blue-700 rounded-lg py-2 text-sm disabled:opacity-50"
              >
                Console (SPICE)
              </button>
            </div>
          </div>
        ))}
      </div>

      {consoleVM && <SpiceViewer vmName={consoleVM} onClose={() => setConsoleVM("")} />}

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

const Field = ({ label, children }) => (
  <div className="space-y-1">
    <p className="text-sm text-gray-300">{label}</p>
    {children}
  </div>
);
