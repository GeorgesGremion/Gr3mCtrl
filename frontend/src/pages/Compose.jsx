import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiGetJson, apiDeleteJson, apiGetList, apiPut } from "../api";

const defaultCompose = `version: "3.8"
services:
  app:
    image: nginx:alpine
    ports:
      - "8080:80"
`;

export default function Compose() {
  const qc = useQueryClient();
  const [name, setName] = useState("example");
  const [content, setContent] = useState(defaultCompose);
  const [actionState, setActionState] = useState({});
  const [selected, setSelected] = useState(null);
  const [templateName, setTemplateName] = useState("");
  const [envContent, setEnvContent] = useState("");
  const [pool, setPool] = useState("");

  const { data: stacks, isLoading } = useQuery({
    queryKey: ["compose-stacks"],
    queryFn: () => apiGet("/api/compose/stacks"),
    refetchInterval: 6000,
  });

  const { data: templates } = useQuery({
    queryKey: ["compose-templates"],
    queryFn: () => apiGetList("/api/compose/templates"),
    refetchInterval: 15000,
  });

  const { data: volumes } = useQuery({
    queryKey: ["volumes"],
    queryFn: () => apiGet("/api/docker/volumes"),
    refetchInterval: 10000,
  });

  const { data: pools } = useQuery({
    queryKey: ["pools"],
    queryFn: () => apiGet("/api/storage/pools"),
  });

  const envQuery = useMutation({
    mutationFn: (stackName) => apiGetJson(`/api/compose/stack/${stackName}/env`),
    onSuccess: (data) => setEnvContent(data.env ?? ""),
  });

  const saveEnv = useMutation({
    mutationFn: () => apiPut(`/api/compose/stack/${name}/env`, { env: envContent }),
  });

  const create = useMutation({
    mutationFn: (payload) => apiPost("/api/compose/stacks", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compose-stacks"] }),
  });

  const callAction = async (stack, action) => {
    setActionState({ [stack]: action });
    try {
      await apiPost(`/api/compose/stack/${stack}/${action}`);
      qc.invalidateQueries({ queryKey: ["compose-stacks"] });
    } catch (e) {
      console.error(e);
      alert(e?.response?.data || e.message);
    } finally {
      setActionState({});
    }
  };

  const loadStack = useMutation({
    mutationFn: (stackName) => apiGetJson(`/api/compose/stack/${stackName}`),
    onSuccess: (data) => {
      setName(data.name);
      setContent(data.file);
      setSelected(data.name);
      setPool(data.pool || "");
      envQuery.mutate(data.name);
    },
  });

  const deleteStack = async (stack) => {
    if (!confirm(`Stack "${stack}" wirklich löschen?`)) return;
    setActionState({ [stack]: "delete" });
    try {
      await apiDeleteJson(`/api/compose/stack/${stack}`);
      qc.invalidateQueries({ queryKey: ["compose-stacks"] });
      if (selected === stack) {
        setSelected(null);
        setName("example");
        setContent(defaultCompose);
      }
    } catch (e) {
      alert(e?.response?.data || e.message);
    } finally {
      setActionState({});
    }
  };

  const saveTemplate = useMutation({
    mutationFn: () =>
      apiPost(`/api/compose/templates`, {
        name: templateName || name || "template",
        file: content,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compose-templates"] });
      setTemplateName("");
    },
  });

  return (
    <div className="text-white min-h-full space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Compose Stacks</h1>
          <p className="text-gray-400">
            Verwalte Docker-Compose-Projekte, speichere und starte sie direkt.
          </p>
        </div>
        <span className="text-sm text-gray-500">Auto-Refresh 6s</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl shadow-[0_20px_45px_rgba(15,23,42,0.35)]">
          <h2 className="text-xl font-semibold mb-4">Neuen Stack speichern</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-300">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full mt-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 focus:border-blue-500 outline-none"
                placeholder="my-stack"
              />
            </div>

            <div>
              <label className="text-sm text-gray-300">Pool (optional)</label>
              <select
                value={pool}
                onChange={(e) => setPool(e.target.value)}
                className="w-full mt-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 focus:border-blue-500 outline-none"
              >
                <option value="">Default (/var/lib/c0r3nex/stacks)</option>
                {pools?.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm text-gray-300">docker-compose.yml</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={12}
                className="w-full mt-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 font-mono text-sm focus:border-blue-500 outline-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => create.mutate({ name, file: content, pool })}
                disabled={create.isPending}
                className="w-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-lg py-2 font-semibold shadow-lg shadow-purple-500/30 disabled:opacity-60"
              >
                {create.isPending ? "Speichere..." : selected ? "Aktualisieren" : "Stack speichern"}
              </button>
              {selected && (
                <button
                  onClick={() => {
                    setSelected(null);
                    setName("example");
                    setContent(defaultCompose);
                  }}
                  className="px-4 py-2 rounded-lg border border-white/10 text-sm text-gray-200 hover:border-white/30"
                  type="button"
                >
                  Neu
                </button>
              )}
            </div>

            {create.isError && (
              <p className="text-sm text-red-400">
                {create.error?.response?.data || create.error?.message}
              </p>
            )}
            {create.isSuccess && (
              <p className="text-sm text-emerald-400">Gespeichert!</p>
            )}

            <div className="border-t border-white/10 pt-4 space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm text-gray-300 whitespace-nowrap">Als Template speichern</p>
                <input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                  placeholder={name || "template-name"}
                />
                <button
                  onClick={() => saveTemplate.mutate()}
                  disabled={saveTemplate.isPending}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm"
                  type="button"
                >
                  {saveTemplate.isPending ? "Speichere..." : "Save"}
                </button>
              </div>
              {saveTemplate.isError && (
                <p className="text-xs text-red-400">
                  {saveTemplate.error?.response?.data || saveTemplate.error?.message}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="xl:col-span-2 space-y-4">
          {volumes && volumes.length > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-xl shadow-[0_20px_45px_rgba(15,23,42,0.35)] space-y-2">
              <h3 className="text-lg font-semibold">Volumes einfügen</h3>
              <div className="flex flex-wrap gap-2">
                {volumes.map((vol) => (
                  <button
                    key={vol.name}
                    type="button"
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm"
                    onClick={() => {
                      const snippet = `\nvolumes:\n  ${vol.name}:\n    external: true\n\nservices:\n  # service-name-hier:\n  #   volumes:\n  #     - ${vol.name}:/data\n`;
                      setContent((prev) => prev + snippet);
                    }}
                  >
                    {vol.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-xl shadow-[0_20px_45px_rgba(15,23,42,0.35)] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">.env Editor</h3>
              <button
                onClick={() => saveEnv.mutate()}
                disabled={saveEnv.isPending}
                className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm"
              >
                {saveEnv.isPending ? "Speichert..." : "Save .env"}
              </button>
            </div>
            <textarea
              value={envContent}
              onChange={(e) => setEnvContent(e.target.value)}
              rows={6}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 font-mono text-sm focus:border-blue-500 outline-none"
              placeholder="KEY=value"
            />
          </div>
          {templates && templates.length > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-xl shadow-[0_20px_45px_rgba(15,23,42,0.35)] flex gap-3 overflow-x-auto min-h-[64px]">
              {templates.map((tpl) => (
                <button
                  key={tpl.name}
                  onClick={() => {
                    setName(tpl.name);
                    setContent(tpl.file);
                    setSelected(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm whitespace-nowrap"
                  type="button"
                >
                  {tpl.name}
                </button>
              ))}
            </div>
          )}
          {isLoading && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-gray-400">
              Lade Stacks...
            </div>
          )}

          {!isLoading && stacks?.length === 0 && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-gray-400">
              Noch keine Stacks gespeichert. Lege einen neuen an.
            </div>
          )}

          {stacks?.map((stack) => (
            <div
              key={stack.name}
              onClick={() => loadStack.mutate(stack.name)}
              className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl shadow-[0_20px_45px_rgba(15,23,42,0.35)] cursor-pointer hover:border-white/20 transition"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-2xl font-semibold">{stack.name}</h3>
                  <p className="text-gray-400 text-sm">
                    Services: {stack.services} · Status: {stack.status} · Pool: {stack.pool || "default"}
                  </p>
                  {selected === stack.name && (
                    <p className="text-xs text-emerald-400">Ausgewählt für Bearbeitung</p>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteStack(stack.name);
                    }}
                    disabled={!!actionState[stack.name]}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => callAction(stack.name, "pull")}
                    disabled={!!actionState[stack.name]}
                    className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm"
                  >
                    Pull
                  </button>
                  <button
                    onClick={() => callAction(stack.name, "up")}
                    disabled={!!actionState[stack.name]}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm"
                  >
                    Up
                  </button>
                  <button
                    onClick={() => callAction(stack.name, "down")}
                    disabled={!!actionState[stack.name]}
                    className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-sm"
                  >
                    Down
                  </button>
                </div>
              </div>

              {actionState[stack.name] && (
                <p className="text-xs text-gray-400 mt-2">
                  Aktion {actionState[stack.name]} läuft...
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
