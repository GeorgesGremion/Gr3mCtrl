import axios from "axios";

// Base URL dynamisch über Proxy
export async function getBaseURL() {
  const res = await axios.get("/api/info");
  return ""; // leere Base, weil Proxy alles regelt
}

// GET
export async function apiGet(path) {
  const res = await axios.get(path);
  return res.data;
}

// POST
export async function apiPost(path, data) {
  const res = await axios.post(path, data);
  return res.data;
}

export async function apiPut(path, data) {
  const res = await axios.put(path, data);
  return res.data;
}

// DELETE
export async function apiDelete(path, config = {}) {
  const res = await axios.delete(path, config);
  return res.data;
}

// DELETE with confirmation from caller
export async function apiDeleteJson(path) {
  const res = await axios.delete(path);
  return res.data;
}
// Generic helper for text uploads (compose files)
export async function apiPostText(path, text) {
  const res = await axios.post(path, text, {
    headers: { "Content-Type": "text/plain" },
  });
  return res.data;
}

// GET helper returning data directly
export async function apiGetJson(path) {
  const res = await axios.get(path);
  return res.data;
}

// GET list helper (used for templates)
export async function apiGetList(path) {
  const res = await axios.get(path);
  return res.data;
}
