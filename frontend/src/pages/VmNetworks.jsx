import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiDelete } from "../api";
import Modal from "../components/Modal";

export default function VmNetworks() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    mode: "nat",
    bridge: "",
    cidr: "192.168.100.1/24",
    dhcp: true,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["vm-networks"],
    queryFn: () => apiGet("/api/vm/networks"),
    refetchInterval: 12000,
  });

  const createMutation = useMutation({
    mutationFn: (data) => apiPost("/api/vm/networks", data),
    onSuccess: () => {
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["vm-networks"] });
      setForm({ name: "", mode: "nat", bridge: "", cidr: "192.168.100.1/24", dhcp: true });
    },
    onError: (err) => alert("Fehler: " + (err.response?.data || err.message)),
  });

  const deleteMutation = useMutation({
    mutationFn: (name) => apiDelete(`/api/vm/network/${name}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vm-networks"] }),
    onError: (err) => alert("Fehler: " + (err.response?.data || err.message)),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate(form);
  };

  return (
    <div className="text-white min-h-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Virtuelle Netzwerke</h1>
          <p className="text-gray-400">Libvirt Netzwerke (Bridge/NAT).</p>
        </div>
        <div className="flex gap-4 items-center">
            <span className="text-sm text-gray-500">Auto-Refresh 12s</span>
            <button onClick={() => setCreateOpen(true)} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg flex items-center gap-2">
                + Netzwerk erstellen
            </button>
        </div>
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
              <h3 className="text-xl font-semibold flex items-center gap-2">
                  {net.name}
              </h3>
              <p className="text-gray-400 text-sm">Type: {net.kind} | Autostart: {net.autostart ? "yes" : "no"}</p>
            </div>
            <div className="flex items-center gap-3">
                <span
                className={`px-3 py-1 rounded-full text-xs ${
                    net.active ? "bg-emerald-600/70" : "bg-slate-700"
                }`}
                >
                {net.active ? "active" : "inactive"}
                </span>
                {net.kind === "libvirt" && (
                    <button 
                        onClick={() => {
                            if(confirm(`Netzwerk ${net.name} wirklich löschen?`)) deleteMutation.mutate(net.name);
                        }}
                        className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-white/5 text-sm"
                    >
                        Delete
                    </button>
                )}
            </div>
          </div>
        ))}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Neues Netzwerk erstellen">
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input 
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                    value={form.name}
                    onChange={e => setForm({...form, name: e.target.value})}
                    required
                />
            </div>
            <div>
                <label className="block text-sm font-medium mb-1">Modus</label>
                <select 
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                    value={form.mode}
                    onChange={e => setForm({...form, mode: e.target.value})}
                >
                    <option value="nat">NAT (Virtual Network)</option>
                    <option value="bridge">Bridge (Host Bridge)</option>
                </select>
            </div>
            
            {form.mode === "nat" && (
                <>
                    <div>
                        <label className="block text-sm font-medium mb-1">CIDR (Gateway IP/Mask)</label>
                        <input 
                            className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                            value={form.cidr}
                            onChange={e => setForm({...form, cidr: e.target.value})}
                            placeholder="192.168.100.1/24"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <input 
                            type="checkbox"
                            checked={form.dhcp}
                            onChange={e => setForm({...form, dhcp: e.target.checked})}
                            className="rounded bg-slate-800 border-slate-700"
                        />
                        <label className="text-sm">DHCP Server aktivieren</label>
                    </div>
                </>
            )}

            {form.mode === "bridge" && (
                <div>
                    <label className="block text-sm font-medium mb-1">Host Bridge Name</label>
                    <input 
                        className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                        value={form.bridge}
                        onChange={e => setForm({...form, bridge: e.target.value})}
                        placeholder="br0"
                    />
                </div>
            )}

            <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600">Abbrechen</button>
                <button type="submit" disabled={createMutation.isPending} className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500">
                    {createMutation.isPending ? "Erstelle..." : "Erstellen"}
                </button>
            </div>
        </form>
      </Modal>
    </div>
  );
}
