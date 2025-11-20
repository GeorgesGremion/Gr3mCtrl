import { useEffect, useMemo, useState } from "react";

const GROUPS = [
  {
    id: "mission",
    label: "Mission Control",
    items: [{ id: "dashboard", label: "Dashboard" }],
    alwaysOpen: true,
  },
  {
    id: "docker",
    label: "Docker",
    items: [
      { id: "containers", label: "Container" },
      { id: "images", label: "Images" },
      { id: "compose", label: "Compose" },
      { id: "networks", label: "Netzwerke" },
      { id: "volumes", label: "Volumes" },
    ],
  },
  {
    id: "vms",
    label: "VMs",
    items: [
      { id: "vms", label: "Virtuelle Maschinen" },
      { id: "vmnets", label: "VM Netzwerke" },
      { id: "isos", label: "ISO Library" },
    ],
  },
  {
    id: "storage",
    label: "Storage & System",
    items: [
      { id: "pools", label: "Pools" },
      { id: "shares", label: "Shares" },
      { id: "nas-users", label: "NAS Benutzer" },
      { id: "system", label: "System Info" },
      { id: "settings", label: "Settings" },
    ],
  },
];

const PAGE_TO_GROUP = {
  dashboard: "mission",
  containers: "docker",
  images: "docker",
  compose: "docker",
  networks: "docker",
  volumes: "docker",
  vms: "vms",
  vmnets: "vms",
  isos: "vms",
  pools: "storage",
  shares: "storage",
  "nas-users": "storage",
  system: "storage",
  settings: "storage",
};

export default function Sidebar({ current, onChange }) {
  const initialOpen = useMemo(() => {
    const currentGroup = PAGE_TO_GROUP[current];
    const base = GROUPS.filter((g) => g.alwaysOpen).map((g) => g.id);
    return currentGroup ? [...base, currentGroup] : base;
  }, [current]);

  const [openGroups, setOpenGroups] = useState(() => new Set(initialOpen));

  useEffect(() => {
    const currentGroup = PAGE_TO_GROUP[current];
    if (currentGroup && !openGroups.has(currentGroup)) {
      setOpenGroups((prev) => new Set([...prev, currentGroup]));
    }
  }, [current, openGroups]);

  const toggleGroup = (id, alwaysOpen) => {
    if (alwaysOpen) return;
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isOpen = (group) => group.alwaysOpen || openGroups.has(group.id);

  return (
    <div className="w-64 bg-gray-900/90 min-h-screen text-white p-6 border-r border-gray-800 flex flex-col backdrop-blur-xl">
      <h1 className="text-3xl font-bold mb-6 tracking-wide">Gr3mCtrl</h1>

      <nav className="flex-1 flex flex-col gap-4">
        {GROUPS.map((group) => (
          <div key={group.id} className="space-y-2">
            <button
              onClick={() => toggleGroup(group.id, group.alwaysOpen)}
              className="w-full flex items-center justify-between text-xs uppercase tracking-[0.18em] text-gray-300 hover:text-white transition"
            >
              <span>{group.label}</span>
              {!group.alwaysOpen && (
                <span
                  className={`text-lg transition-transform ${
                    isOpen(group) ? "rotate-90" : ""
                  }`}
                >
                  ›
                </span>
              )}
            </button>
            {isOpen(group) && (
              <div className="flex flex-col gap-2">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onChange(item.id)}
                    className={`text-left px-3 py-2 rounded transition border border-transparent ${
                      current === item.id
                        ? "bg-gradient-to-r from-blue-600 to-purple-600 border-blue-400"
                        : "hover:bg-gray-800"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
    </div>
  );
}
