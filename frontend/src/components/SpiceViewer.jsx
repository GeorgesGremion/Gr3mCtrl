import { useEffect, useRef, useState } from "react";

// Lazy-load spice-html5 from CDN and create a session
export default function SpiceViewer({ vmName, onClose }) {
  const screenRef = useRef(null);
  const connRef = useRef(null);
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!vmName) return;

    const loadSpice = async () => {
      if (window.SpiceMainConn) return window;
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/spice-html5-bower@0.1.7/spice-html5.js";
      script.async = true;
      document.body.appendChild(script);
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
      });
      return window;
    };

    let active = true;
    loadSpice()
      .then(() => {
        if (!active) return;
        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        const wsUrl = `${protocol}://${window.location.host}/ws/spice/${vmName}`;
        try {
          const conn = new window.SpiceMainConn({
            uri: wsUrl,
            screen_id: `spice-screen-${vmName}`,
            passticket: undefined,
          });
          connRef.current = conn;
          setStatus("connected");
        } catch (e) {
          setError(e.message);
          setStatus("error");
        }
      })
      .catch((e) => {
        if (!active) return;
        setError(e.message || "SPICE konnte nicht geladen werden");
        setStatus("error");
      });

    return () => {
      active = false;
      if (connRef.current && connRef.current.disconnect) {
        try {
          connRef.current.disconnect();
        } catch (e) {
          /* ignore */
        }
      }
    };
  }, [vmName]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="max-w-5xl w-full bg-white/5 border border-white/10 rounded-2xl shadow-2xl p-4 text-white relative">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold">SPICE Console: {vmName}</h3>
            <p className="text-xs text-gray-300">Status: {status}</p>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm"
          >
            Close
          </button>
        </div>
        {error && <div className="text-red-400 text-sm mb-2">{error}</div>}
        <div
          id={`spice-screen-${vmName}`}
          ref={screenRef}
          className="w-full h-[70vh] bg-black rounded-lg overflow-hidden"
          style={{ aspectRatio: "16/9" }}
        />
      </div>
    </div>
  );
}
  // Simple fallback UI; currently not used if VNC is preferred
