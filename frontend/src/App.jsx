import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";
import ContainerStats from "./ContainerStats";
import Sidebar from "./Sidebar";
import Dashboard from "./pages/Dashboard";
import { useMemo, useState } from "react";
import Images from "./pages/Images";
import SystemInfo from "./pages/SystemInfo";
import Networks from "./pages/Networks";
import Compose from "./pages/Compose";
import Volumes from "./pages/Volumes";
import VMs from "./pages/VMs";
import ISO from "./pages/ISO";
import VmNetworks from "./pages/VmNetworks";
import Pools from "./pages/Pools";
import Shares from "./pages/Shares";
import NasUsers from "./pages/NasUsers";

export default function App() {
  const [page, setPage] = useState("dashboard"); // Start auf Dashboard
  const placeholderPages = useMemo(() => ["settings"], []);
  const pageMeta = useMemo(
    () => ({
      dashboard: {
        title: "Operations Dashboard",
        subtitle: "Systemzustand, Container und Ressourcen im Blick.",
      },
      containers: {
        title: "Container Fleet",
        subtitle: "Steuere deine Docker-Container in Echtzeit.",
      },
      images: {
        title: "Images & Registry",
        subtitle: "Verwalte lokale Images und plane Pull/Delete Flows.",
      },
      networks: {
        title: "Network Fabric",
        subtitle: "Virtuelle Netze für Container und VMs orchestrieren.",
      },
      system: {
        title: "Host Insights",
        subtitle: "Kernel, Uptime und Hardwaremetriken.",
      },
      compose: {
        title: "Compose Stacks",
        subtitle: "Stacks speichern, starten und updaten.",
      },
      volumes: {
        title: "Storage Modules",
        subtitle: "Lokale Docker Volumes verwalten und binden.",
      },
      pools: {
        title: "Storage Pools",
        subtitle: "Parity + Data Disks verwalten.",
      },
      shares: {
        title: "Shares",
        subtitle: "Einfache NAS-Freigaben.",
      },
      "nas-users": {
        title: "NAS Benutzer",
        subtitle: "SMB-User verwalten.",
      },
      vms: {
        title: "Virtual Machines",
        subtitle: "Libvirt/KVM Domains steuern.",
      },
      isos: {
        title: "ISO Library",
        subtitle: "Installationsmedien bereitstellen.",
      },
      vmnets: {
        title: "Virtuelle Netzwerke",
        subtitle: "Libvirt-NAT/Bridge Netze im Blick.",
      },
      settings: {
        title: "Control Center",
        subtitle: "Konfiguration und Automation werden vorbereitet.",
      },
    }),
    []
  );

  const activeMeta =
    pageMeta[page] ?? {
      title: "GGITHub Suite",
      subtitle: "Unified control for homelab workloads.",
    };

  // Nur Container laden, wenn Container-Seite aktiv ist
  const {
    data: containers,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["containers"],
    queryFn: () => apiGet("/api/docker/containers"),
    refetchInterval: page === "containers" ? 3000 : false,
    enabled: page === "containers",
  });

  // Aktionen für Container
  const start = async (id) => {
    await apiPost(`/api/docker/container/${id}/start`);
    refetch();
  };

  const stop = async (id) => {
    await apiPost(`/api/docker/container/${id}/stop`);
    refetch();
  };

  const restart = async (id) => {
    await apiPost(`/api/docker/container/${id}/restart`);
    refetch();
  };

  const remove = async (id) => {
    const ok = confirm("Container löschen? (wird gestoppt/entfernt, Volumes werden mit gelöscht)");
    if (!ok) return;
    await apiPost(`/api/docker/container/${id}/remove`);
    refetch();
  };

  return (
    <div className="relative flex min-h-screen bg-[#05070f] text-white">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-10 h-80 w-80 rounded-full bg-purple-600/40 blur-[140px]" />
        <div className="absolute top-1/3 right-0 h-72 w-72 rounded-full bg-blue-500/30 blur-[120px]" />
        <div className="absolute bottom-0 left-10 h-60 w-60 rounded-full bg-emerald-500/20 blur-[100px]" />
      </div>

      <Sidebar current={page} onChange={setPage} />

      <div className="flex-1 flex flex-col min-h-screen backdrop-blur-3xl/0">
        <header className="px-6 lg:px-12 py-6 border-b border-white/10 bg-black/30 backdrop-blur-xl flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400 mb-1">
              GGITHub Mission Control
            </p>
            <h1 className="text-3xl lg:text-4xl font-semibold text-white">
              {activeMeta.title}
            </h1>
            <p className="text-sm text-slate-400">{activeMeta.subtitle}</p>
          </div>

          <div className="flex gap-3">
            <button className="px-4 py-2 rounded-full border border-white/20 text-sm text-white/80 hover:border-white transition">
              Quick Action
            </button>
            <button className="px-4 py-2 rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-sm font-semibold shadow-lg shadow-purple-500/30">
              Neue Resource
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 md:px-10 lg:px-16 py-10">
          <div className="min-h-[calc(100vh-220px)] space-y-10">
            {/* ===========================
                  DASHBOARD
            ============================ */}
            {page === "dashboard" && <Dashboard />}
            {page === "system" && <SystemInfo />}
            {page === "networks" && <Networks />}
            {page === "compose" && <Compose />}
            {page === "volumes" && <Volumes />}
            {page === "pools" && <Pools />}
            {page === "shares" && <Shares />}
            {page === "nas-users" && <NasUsers />}
            {page === "vms" && <VMs />}
            {page === "isos" && <ISO />}
            {page === "vmnets" && <VmNetworks />}

            {/* ===========================
                  IMAGES
            ============================ */}

            {page === "images" && <Images />}

            {/* ===========================
                  CONTAINERS
            ============================ */}
            {page === "containers" && (
              <div className="space-y-8">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <h2 className="text-4xl font-semibold">Container Dashboard</h2>
                    <p className="text-gray-400">
                      Steuere Lifecycle, Logs und Ressourcen einzelner Container.
                    </p>
                  </div>
                  {isLoading && (
                    <span className="text-sm text-gray-400">lädt...</span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 auto-rows-fr">
                  {containers?.map((c) => {
                    const name = c.Names[0].replace("/", "");
                    const state = c.State;

                    return (
                      <div
                        key={c.Id}
                        className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-[0_20px_45px_rgba(15,23,42,0.35)] flex flex-col justify-between"
                      >
                        <div>
                          <div className="mb-4">
                            <p className="text-xs uppercase tracking-wider text-slate-400">
                              Image
                            </p>
                            <p className="text-gray-300 text-sm">{c.Image}</p>
                          </div>
                          <h3 className="text-2xl font-semibold">{name}</h3>
                          <span
                            className={`inline-flex items-center gap-2 mt-2 text-sm font-medium ${
                              state === "running"
                                ? "text-emerald-400"
                                : "text-rose-400"
                            }`}
                          >
                            <span className="h-2 w-2 rounded-full bg-current animate-pulse"></span>
                            {state.toUpperCase()}
                          </span>
                        </div>

                        <div className="mt-5 flex flex-wrap gap-2">
                          {state !== "running" && (
                            <button
                              onClick={() => start(c.Id)}
                              className="flex-1 min-w-[120px] bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-lg transition text-sm font-semibold"
                            >
                              Start
                            </button>
                          )}

                          {state === "running" && (
                            <button
                              onClick={() => stop(c.Id)}
                              className="flex-1 min-w-[120px] bg-rose-600/90 hover:bg-rose-500 px-4 py-2 rounded-lg transition text-sm font-semibold"
                            >
                              Stop
                            </button>
                          )}

                      <button
                        onClick={() => restart(c.Id)}
                        className="flex-1 min-w-[120px] bg-indigo-600/90 hover:bg-indigo-500 px-4 py-2 rounded-lg transition text-sm font-semibold"
                      >
                        Restart
                      </button>
                      <button
                        onClick={() => remove(c.Id)}
                        className="flex-1 min-w-[120px] bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg transition text-sm font-semibold"
                      >
                        Delete
                      </button>
                    </div>

                        <ContainerStats id={c.Id} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ===========================
                  ANDERE SEITEN (noch leer)
            ============================ */}
            {placeholderPages.includes(page) && (
              <div className="rounded-2xl border border-dashed border-white/20 p-10 text-center text-gray-400 bg-white/5 backdrop-blur-xl">
                <p className="text-2xl font-semibold mb-2 capitalize">{page}</p>
                <p>Diese Sektion ist in Arbeit – stay tuned 😄</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
