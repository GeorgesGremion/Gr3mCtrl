import { useState } from "react";

export default function Sidebar({ current, onChange }) {
  const items = [
    { id: "dashboard", label: "Dashboard" },
    { id: "containers", label: "Containers" },
    { id: "images", label: "Images" },
    { id: "compose", label: "Compose" },
    { id: "networks", label: "Networks" },
    { id: "pools", label: "Pools" },
    { id: "shares", label: "Shares" },
    { id: "vmnets", label: "VM Networks" },
    { id: "volumes", label: "Volumes" },
    { id: "isos", label: "ISOs" },
    { id: "vms", label: "VMs" },
    { id: "settings", label: "Settings" },
    { id: "system", label: "System Info" },
  ];

  return (
    <div className="w-64 bg-gray-800 min-h-screen text-white p-6 border-r border-gray-700 flex flex-col">
      <h1 className="text-2xl font-bold mb-8">LabCore</h1>

      <nav className="flex-1 flex flex-col gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={`text-left px-3 py-2 rounded transition 
                        ${
                          current === item.id
                            ? "bg-blue-600"
                            : "hover:bg-gray-700"
                        }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
