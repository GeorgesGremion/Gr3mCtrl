import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "../api";

export default function NasUsers() {
  const qc = useQueryClient();
  const { data: users, isLoading, error: usersError } = useQuery({
    queryKey: ["nas-users"],
    queryFn: () => apiGet("/api/nas/users"),
    refetchInterval: 8000,
  });

  const [form, setForm] = useState({
    username: "",
    display_name: "",
    password: "",
  });

  const create = useMutation({
    mutationFn: (payload) => apiPost("/api/nas/users", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nas-users"] });
      setForm({ username: "", display_name: "", password: "" });
    },
  });

  const setPwd = useMutation({
    mutationFn: ({ id, password }) => apiPost(`/api/nas/users/${id}/pwd`, { password }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nas-users"] }),
  });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }) => apiPut(`/api/nas/users/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nas-users"] }),
  });

  const del = useMutation({
    mutationFn: (id) => apiDelete(`/api/nas/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nas-users"] }),
  });

  const [pwdUser, setPwdUser] = useState("");
  const [pwdVal, setPwdVal] = useState("");

  return (
    <div className="text-white min-h-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">NAS Benutzer</h1>
          <p className="text-gray-400">SMB-Benutzer verwalten.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl shadow-[0_20px_45px_rgba(15,23,42,0.35)]">
          <h2 className="text-xl font-semibold mb-4">Benutzer anlegen</h2>
          <div className="space-y-3">
            <Field label="Username">
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2"
              />
            </Field>
            <Field label="Display Name">
              <input
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2"
              />
            </Field>
            <Field label="Passwort">
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2"
              />
            </Field>
            <button
              onClick={() => create.mutate(form)}
              disabled={create.isPending}
              className="w-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-lg py-2 font-semibold shadow-lg shadow-purple-500/30 disabled:opacity-60"
            >
              {create.isPending ? "Speichere..." : "Benutzer speichern"}
            </button>
            {create.isError && (
              <p className="text-sm text-red-400">{create.error?.response?.data || create.error?.message}</p>
            )}
            {create.isSuccess && (
              <p className="text-sm text-emerald-400">Benutzer angelegt.</p>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-3">
          {usersError && (
            <div className="bg-rose-900/30 border border-rose-600 rounded-2xl p-4 text-sm text-rose-100">
              {usersError?.response?.data || usersError?.message}
            </div>
          )}
          {isLoading && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-gray-300">
              Lade Benutzer...
            </div>
          )}
          {users?.map((u) => (
            <div
              key={u.id}
              className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-xl shadow-[0_20px_45px_rgba(15,23,42,0.35)] flex flex-col gap-2"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{u.username}</h3>
                  <p className="text-sm text-gray-400">{u.display_name}</p>
                  <p className="text-xs text-gray-500">Status: {u.enabled ? "aktiv" : "gesperrt"}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggle.mutate({ id: u.id, enabled: !u.enabled })}
                    className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sm"
                  >
                    {u.enabled ? "Sperren" : "Aktivieren"}
                  </button>
                  <button
                    onClick={() => {
                      setPwdUser(u.id);
                      setPwdVal("");
                    }}
                    className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sm"
                  >
                    Passwort
                  </button>
                  <button
                    onClick={() => del.mutate(u.id)}
                    className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-sm"
                  >
                    Loeschen
                  </button>
                </div>
              </div>
              {pwdUser === u.id && (
                <div className="flex items-center gap-2 text-sm">
                  <input
                    type="password"
                    value={pwdVal}
                    onChange={(e) => setPwdVal(e.target.value)}
                    className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-1"
                    placeholder="Neues Passwort"
                  />
                  <button
                    onClick={() => setPwd.mutate({ id: u.id, password: pwdVal })}
                    className="px-3 py-1 rounded bg-blue-700 hover:bg-blue-600"
                  >
                    Setzen
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div className="space-y-1">
    <p className="text-sm text-gray-300">{label}</p>
    {children}
  </div>
);

