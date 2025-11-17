import { useEffect, useRef, useState } from "react";

export default function VncViewer({ vmName, onClose, inline = false }) {
  const canvasRef = useRef(null);
  const rfbRef = useRef(null);
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState("");
  const [scale, setScale] = useState(true);

  useEffect(() => {
    if (!vmName || !canvasRef.current) return;

    const loadRFB = async () => {
      if (window.RFB) return window.RFB;
      const candidates = [
        "https://cdn.jsdelivr.net/npm/@novnc/novnc@1.4.0/core/rfb.js",
        "https://esm.sh/@novnc/novnc@1.4.0/core/rfb.js",
      ];
      for (const url of candidates) {
        try {
          const mod = await import(/* @vite-ignore */ url);
          const Cls = mod?.default || mod?.RFB || window.RFB;
          if (Cls) return Cls;
        } catch (e) {
          // try next
        }
      }
      throw new Error("noVNC konnte nicht geladen werden");
    };

    let active = true;
    loadRFB()
      .then((RFB) => {
        if (!active) return;
        const Cls = RFB?.default || RFB || window.RFB;
        if (typeof Cls !== "function") {
          throw new Error("RFB Konstruktor fehlt");
        }
        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        const url = `${protocol}://${window.location.host}/ws/vnc/${vmName}`;
        const rfb = new Cls(canvasRef.current, url, { credentials: {} });
        rfb.scaleViewport = scale;
        rfb.resizeSession = scale;
        rfb.background = "#000";
        rfbRef.current = rfb;
        rfb.addEventListener("connect", () => setStatus("connected"));
        rfb.addEventListener("disconnect", (e) => {
          setStatus("disconnected");
          if (e.detail?.clean === false) setError("Verbindung getrennt");
        });
      })
      .catch((e) => {
        if (!active) return;
        setError(e.message);
        setStatus("error");
      });

    return () => {
      active = false;
      if (rfbRef.current) {
        try {
          rfbRef.current.disconnect();
        } catch (e) {
          /* ignore */
        }
      }
    };
  }, [vmName, scale]);

  const Toolbar = () => (
    <div className="flex items-center gap-2 mb-2 text-sm">
      <button
        onClick={() => {
          try {
            rfbRef.current?.sendCtrlAltDel();
          } catch (e) {
            setError(e.message);
          }
        }}
        className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700"
      >
        Ctrl+Alt+Del
      </button>
      <button
        onClick={() => {
          const next = !scale;
          setScale(next);
          if (rfbRef.current) {
            rfbRef.current.scaleViewport = next;
            rfbRef.current.resizeSession = next;
          }
        }}
        className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700"
      >
        {scale ? "No Scale" : "Scale"}
      </button>
      {onClose && !inline && (
        <button
          onClick={onClose}
          className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700"
        >
          Close
        </button>
      )}
    </div>
  );

  if (inline) {
    return (
      <div className="w-full h-full bg-black/40 border border-white/10 rounded-lg p-2">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm font-semibold">Console: {vmName}</p>
            <p className="text-xs text-gray-400">Status: {status}</p>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <Toolbar />
        <div
          ref={canvasRef}
          className="w-full h-[70vh] bg-black rounded"
          style={{ aspectRatio: "16/9" }}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="max-w-5xl w-full bg-white/5 border border-white/10 rounded-2xl shadow-2xl p-4 text-white relative">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold">Console: {vmName}</h3>
            <p className="text-xs text-gray-300">Status: {status}</p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm"
            >
              Close
            </button>
          )}
        </div>
        {error && (
          <div className="text-red-400 text-sm mb-2">
            {error}
          </div>
        )}
        <Toolbar />
        <div
          ref={canvasRef}
          className="w-full h-[70vh] bg-black"
          style={{ aspectRatio: "16/9" }}
        />
      </div>
    </div>
  );
}
