export default function Sidebar({ current, onChange }) {
  const groups = [
    {
      label: "Mission Control",
      items: [{ id: "dashboard", label: "Dashboard" }],
    },
    {
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
      label: "VMs",
      items: [
        { id: "vms", label: "Virtuelle Maschinen" },
        { id: "vmnets", label: "VM Netzwerke" },
        { id: "isos", label: "ISO Library" },
      ],
    },
    {
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

  return (
    <div className="w-64 bg-gray-800 min-h-screen text-white p-6 border-r border-gray-700 flex flex-col">
      <h1 className="text-2xl font-bold mb-6">LabCore</h1>

      <nav className="flex-1 flex flex-col gap-6">
        {groups.map((group) => (
          <div key={group.label} className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-400">
              {group.label}
            </p>
            <div className="flex flex-col gap-2">
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onChange(item.id)}
                  className={`text-left px-3 py-2 rounded transition border border-transparent
                              ${
                                current === item.id
                                  ? "bg-blue-600 border-blue-400"
                                  : "hover:bg-gray-700"
                              }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}
