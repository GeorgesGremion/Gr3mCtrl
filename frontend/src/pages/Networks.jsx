import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost } from "../api";

const defaultForm = {
  name: "",
  driver: "bridge",
  subnet: "",
  gateway: "",
};

export default function Networks() {
  const [form, setForm] = useState(defaultForm);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState("");

  const {
    data: networks,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["docker-networks"],
    queryFn: () => apiGet("/api/docker/networks"),
    refetchInterval: 8000,
  });

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setCreating(true);
    setError("");
    try {
      await apiPost("/api/docker/networks", form);
      setForm(defaultForm);
      refetch();
    } catch (err) {
      setError(
        err.response?.data || err.message || "Failed to create network"
      );
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id) => {
    setRemoving(id);
    setError("");
    try {
      await apiDelete(`/api/docker/network/${id}`);
      refetch();
    } catch (err) {
      setError(
        err.response?.data || err.message || "Failed to delete network"
      );
    } finally {
      setRemoving("");
    }
  };

  return (
    <div className="text-white space-y-6 min-h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold mb-6">Docker Networks</h1>
        {isFetching && (
          <span className="text-sm text-gray-400">Refreshing…</span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 lg:col-span-1 backdrop-blur-xl shadow-[0_20px_45px_rgba(15,23,42,0.35)]">
          <h2 className="text-xl font-semibold mb-4">Create Network</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:border-blue-500"
                placeholder="labcore_network"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Driver
              </label>
              <select
                value={form.driver}
                onChange={(e) => handleChange("driver", e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              >
                <option value="bridge">bridge</option>
                <option value="overlay">overlay</option>
                <option value="macvlan">macvlan</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Subnet
                </label>
                <input
                  type="text"
                  value={form.subnet}
                  onChange={(e) => handleChange("subnet", e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
                  placeholder="192.168.10.0/24"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Gateway
                </label>
                <input
                  type="text"
                  value={form.gateway}
                  onChange={(e) => handleChange("gateway", e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
                  placeholder="192.168.10.1"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-900/30 border border-red-600 rounded px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={creating}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900 rounded py-2 font-semibold"
            >
              {creating ? "Creating..." : "Create Network"}
            </button>
          </form>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {isLoading && <p>Loading networks...</p>}

          {!isLoading && networks?.length === 0 && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-gray-400 backdrop-blur-xl">
              No networks found. Create one on the left or via Docker CLI.
            </div>
          )}

          {networks?.map((net) => (
            <div
              key={net.id}
              className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl shadow-[0_20px_45px_rgba(15,23,42,0.35)]"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-semibold">{net.name}</h3>
                  <p className="text-gray-400 text-sm">
                    {net.id.slice(0, 12)} · {net.driver} · {net.scope}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(net.id)}
                  className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm font-semibold disabled:bg-red-900"
                  disabled={removing === net.id}
                >
                  {removing === net.id ? "Removing..." : "Delete"}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-sm text-gray-300">
                <InfoRow label="Subnet" value={net.subnet || "—"} />
                <InfoRow label="Gateway" value={net.gateway || "—"} />
                <InfoRow label="Attachable" value={net.attachable ? "Yes" : "No"} />
                <InfoRow label="Internal" value={net.internal ? "Yes" : "No"} />
                <InfoRow label="Containers" value={net.container_count || 0} />
              </div>

              {net.containers?.length > 0 && (
                <div className="mt-4 border border-gray-700 rounded-lg divide-y divide-gray-700">
                  {net.containers.map((c) => (
                    <div
                      key={c.id}
                      className="p-3 text-sm grid grid-cols-1 md:grid-cols-3 gap-2"
                    >
                      <span className="font-semibold">{c.name}</span>
                      <span className="text-gray-400">{c.ipv4}</span>
                      <span className="text-gray-500">{c.mac}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const InfoRow = ({ label, value }) => (
  <div>
    <p className="text-gray-400 text-xs uppercase tracking-wider">{label}</p>
    <p>{value || "—"}</p>
  </div>
);
