import { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

const wsURL = () => {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/shell`;
};

export default function TerminalModal({ open, onClose }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const wsRef = useRef(null);
  const [status, setStatus] = useState("verbinden...");

  useEffect(() => {
    if (!open) return;

    const term = new Terminal({
      convertEol: true,
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, "Courier New", monospace',
      theme: {
        background: "#0b1220",
        foreground: "#e5e7eb",
        cursor: "#22d3ee",
        black: "#1f2937",
        green: "#10b981",
        blue: "#3b82f6",
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    termRef.current = term;
    fitRef.current = fitAddon;

    term.open(containerRef.current);
    fitAddon.fit();
    term.focus();

    const socket = new WebSocket(wsURL());
    wsRef.current = socket;

    socket.binaryType = "arraybuffer";

    const sendResize = () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows })
        );
      }
    };

    socket.onopen = () => {
      setStatus("verbunden");
      sendResize();
    };
    socket.onclose = () => setStatus("getrennt");
    socket.onerror = () => setStatus("Fehler");
    socket.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        term.write(ev.data);
      } else {
        const data = new Uint8Array(ev.data);
        term.write(data);
      }
    };

    const onData = term.onData((d) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(d);
      }
    });

    const handleResize = () => {
      fitAddon.fit();
      sendResize();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      onData.dispose();
      window.removeEventListener("resize", handleResize);
      socket.close();
      term.dispose();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900/95 border border-white/10 rounded-2xl w-full max-w-5xl h-[70vh] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Host Shell</p>
            <p className="text-xs text-slate-500">Status: {status}</p>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
          >
            Schließen
          </button>
        </div>
        <div className="flex-1 bg-black">
          <div ref={containerRef} className="w-full h-full" />
        </div>
      </div>
    </div>
  );
}
