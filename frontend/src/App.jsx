import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";
import ContainerStats from "./ContainerStats";
import Sidebar from "./Sidebar";
import Dashboard from "./pages/Dashboard";
import { useEffect, useMemo, useState } from "react";
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
import TerminalModal from "./components/TerminalModal";
import FileManager from "./pages/FileManager";
import Logs from "./pages/Logs";

export default function App() {
  const [page, setPage] = useState("dashboard"); // Start auf Dashboard
  const [showShell, setShowShell] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showQuick, setShowQuick] = useState(false);
  const [quickMessage, setQuickMessage] = useState("");
  const [quickError, setQuickError] = useState("");
  const [isoPool, setIsoPool] = useState("");
  useEffect(() => {
    document.title = "Gr3mCtrl";
  }, []);
  const placeholderPages = useMemo(() => ["settings"], []);
  const updateInfo = useQuery({
    queryKey: ["updateStatus"],
    queryFn: () => apiGet("/api/system/update"),
    refetchInterval: 60000,
  });
  const poolsQuery = useQuery({
    queryKey: ["pools"],
    queryFn: () => apiGet("/api/storage/pools"),
  });

  const callAction = async (fn) => {
    try {
      setQuickError("");
      await fn();
    } catch (e) {
      setQuickError(e?.response?.data || e.message);
    }
  };
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
      filemanager: {
        title: "Dateimanager",
        subtitle: "Shares durchsuchen, Dateien up- und downloaden.",
      },
      settings: {
        title: "Control Center",
        subtitle: "Konfiguration und Automation werden vorbereitet.",
      },
    }),
    []
  );

  useEffect(() => {
    const syncFromHash = () => {
      const raw = window.location.hash.replace("#/", "").replace("#", "");
      if (raw && pageMeta[raw]) {
        setPage(raw);
      }
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
    // pageMeta stable via useMemo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageMeta]);

  const activeMeta =
    pageMeta[page] ?? {
      title: "gr3mctrl Suite",
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
              gr3mctrl Mission Control
            </p>
            <h1 className="text-3xl lg:text-4xl font-semibold text-white">
              {activeMeta.title}
            </h1>
            <p className="text-sm text-slate-400">{activeMeta.subtitle}</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowShell(true)}
              className="px-4 py-2 rounded-full border border-white/30 text-sm text-white/90 hover:border-white transition"
            >
              Shell
            </button>
            <button
              onClick={() => setShowQuick(true)}
              className="px-4 py-2 rounded-full border border-white/20 text-sm text-white/80 hover:border-white transition"
            >
              Quick Action
            </button>
            <button
              onClick={() => setShowCreateMenu(true)}
              className="px-4 py-2 rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-sm font-semibold shadow-lg shadow-purple-500/30"
            >
              Neue Resource
            </button>
            {updateInfo.data?.update_available && (
              <button
                onClick={() => {
                  setPage("system");
                  window.location.hash = "#/system";
                  window.dispatchEvent(new HashChangeEvent("hashchange"));
                }}
                className="px-4 py-2 rounded-full border border-amber-400 text-amber-200 bg-amber-500/20 text-sm font-semibold"
              >
                Update verfuegbar: {updateInfo.data?.latest_version || "-"}
              </button>
            )}
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
            {page === "filemanager" && <FileManager />}
            {page === "logs" && <Logs />}
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
        <TerminalModal open={showShell} onClose={() => setShowShell(false)} />

        {showCreateMenu && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900/95 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Neue Ressource</p>
                <button
                  onClick={() => setShowCreateMenu(false)}
                  className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
                >
                  Schliessen
                </button>
              </div>
              <div className="p-4 space-y-2">
                {[
                  { label: "Neue VM", page: "vms" },
                  { label: "Neuer Compose Stack", page: "compose" },
                  { label: "Neues Share", page: "shares" },
                  { label: "Neuer NAS Benutzer", page: "nas-users" },
                  { label: "Neues Volume", page: "volumes" },
                ].map((item) => (
                  <button
                    key={item.page}
                    onClick={() => {
                      setPage(item.page);
                      window.location.hash = `#/${item.page}`;
                      window.dispatchEvent(new HashChangeEvent("hashchange"));
                      setShowCreateMenu(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {showQuick && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900/95 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Quick Actions</p>
                <button
                  onClick={() => {
                    setShowQuick(false);
                    setQuickMessage("");
                    setQuickError("");
                  }}
                  className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
                >
                  Schliessen
                </button>
              </div>
              <div className="p-4 space-y-3 text-sm text-white">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <button
                    onClick={() =>
                      callAction(async () => {
                        setQuickMessage("Backend wird neu gestartet...");
                        const res = await fetch("/api/system/service/restart", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ service: "gr3mctrl-backend.service" }),
                        });
                        if (!res.ok) {
                          const msg = await res.text();
                          throw new Error(msg || `HTTP ${res.status}`);
                        }
                        setQuickMessage("Backend restart ausgelöst (läuft ggf. gleich neu an).");
                      })
                    }
                    className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-left"
                  >
                    Backend neu starten
                  </button>
                  <button
                    onClick={() =>
                      callAction(async () => {
                        setQuickMessage("Gateway wird neu gestartet...");
                        const res = await fetch("/api/system/service/restart", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ service: "gr3mctrl-gateway.service" }),
                        });
                        if (!res.ok) {
                          const msg = await res.text();
                          throw new Error(msg || `HTTP ${res.status}`);
                        }
                        setQuickMessage("Gateway restart ausgelöst (Proxy kann kurz weg sein).");
                      })
                    }
                    className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-left"
                  >
                    Gateway neu starten
                  </button>
                  <button
                    onClick={() =>
                      callAction(async () => {
                        setQuickMessage("Shares werden neu geladen...");
                        await apiPost("/api/storage/shares/reload", {});
                        setQuickMessage("Shares neu eingelesen.");
                      })
                    }
                    className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-left"
                  >
                    Shares neu einlesen
                  </button>
                  <button
                    onClick={async () => {
                      setQuickError("");
                      setQuickMessage("Pruefe Updates...");
                      try {
                        const info = await apiGet("/api/system/update");
                        setQuickMessage(info?.update_available ? `Update verfuegbar: ${info.latest_version || "-"}` : "System ist aktuell");
                      } catch (e) {
                        setQuickError(e?.response?.data || e.message);
                      }
                    }}
                    className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-left"
                  >
                    Update prüfen
                  </button>
                </div>

                <div className="border-t border-white/10 pt-3 space-y-2">
                  <p className="text-xs text-slate-300">ISO hochladen (Default-Pool oder auswählen):</p>
                  <div className="flex flex-wrap gap-2 items-center">
                    <select
                      value={isoPool}
                      onChange={(e) => setIsoPool(e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm"
                    >
                      <option value="">Default</option>
                      {poolsQuery.data?.map((p) => (
                        <option key={p.name} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                    <input
                      type="file"
                      accept=".iso"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setQuickMessage("ISO Upload läuft...");
                        setQuickError("");
                        try {
                          const form = new FormData();
                          form.append("iso", file);
                          if (isoPool) form.append("pool", isoPool);
                          const res = await fetch("/api/storage/isos", { method: "POST", body: form });
                          if (!res.ok) {
                            const msg = await res.text();
                            throw new Error(msg);
                          }
                          setQuickMessage("ISO Upload abgeschlossen.");
                        } catch (e) {
                          setQuickError(e.message);
                        }
                      }}
                      className="text-sm"
                    />
                  </div>
                </div>

                {quickMessage && <p className="text-sm text-emerald-300">{quickMessage}</p>}
                {quickError && <p className="text-sm text-rose-400">{quickError}</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
