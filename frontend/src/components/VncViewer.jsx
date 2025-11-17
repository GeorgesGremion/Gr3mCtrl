import { useEffect, useRef, useState } from "react";

export default function VncViewer({ vmName, onClose }) {
  const canvasRef = useRef(null);
  const rfbRef = useRef(null);
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState("");
  const [scale, setScale] = useState(true);

  useEffect(() => {
    if (!vmName || !canvasRef.current) return;

    const loadRFB = async () => {
      // lokale Kopie aus public (vermeidet Build-Probleme)
      if (window.RFB) return window.RFB;
      const script = document.createElement("script");
      script.src = "/vendor/novnc/rfb.js";
      script.async = true;
      document.body.appendChild(script);
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
      });
      return window.RFB;
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="max-w-5xl w-full bg-white/5 border border-white/10 rounded-2xl shadow-2xl p-4 text-white relative">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold">Console: {vmName}</h3>
            <p className="text-xs text-gray-300">Status: {status}</p>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm"
          >
            Close
          </button>
        </div>
        {error && (
          <div className="text-red-400 text-sm mb-2">
            {error}
          </div>
        )}
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
        </div>
        <div
          ref={canvasRef}
          className="w-full h-[70vh] bg-black"
          style={{ aspectRatio: "16/9" }}
        />
      </div>
    </div>
  );
}
