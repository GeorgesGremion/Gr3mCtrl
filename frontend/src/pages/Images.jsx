import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet } from "../api";

export default function Images() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["images"],
    queryFn: () => apiGet("/api/docker/images"),
    refetchInterval: 5000,
  });

  if (isLoading)
    return (
      <div className="rounded-2xl border border-white/10 p-6 bg-white/5 backdrop-blur-xl text-white/70">
        Images werden geladen...
      </div>
    );

  const formatSize = (byte) => (byte / 1024 / 1024).toFixed(1) + " MB";

  return (
    <div className="text-white space-y-6 min-h-full">
      <div>
        <h1 className="text-3xl font-bold">Docker Images</h1>
        <p className="text-gray-400">
          Uebersicht ueber lokale Images und Container-Nutzung.
        </p>
      </div>

      <div className="space-y-4">
        {data.map((img) => {
          const tags = img.RepoTags?.length ? img.RepoTags.join(", ") : "<none>";

          return (
            <div
              key={img.Id}
              className="bg-white/5 backdrop-blur-xl p-6 rounded-2xl border border-white/10 shadow-[0_20px_45px_rgba(15,23,42,0.35)]"
            >
              <h2 className="text-xl font-semibold">{tags}</h2>

              <p className="text-gray-400 text-sm mt-1">ID: {img.Id}</p>

              <div className="mt-3 text-gray-200 text-sm">
                <p>Size: {formatSize(img.Size)}</p>
                <p>Used by: {img.Containers} container(s)</p>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  className="bg-red-600/80 hover:bg-red-500 px-4 py-2 rounded-lg text-sm font-semibold"
                  onClick={async () => {
                    if (!confirm("Image wirklich loeschen?")) return;
                    try {
                      await apiDelete(`/api/docker/image/${img.Id}/delete`);
                      qc.invalidateQueries({ queryKey: ["images"] });
                    } catch (e) {
                      alert(e?.response?.data || e.message);
                    }
                  }}
                >
                  Delete
                </button>

                <button
                  className="bg-blue-600/70 hover:bg-blue-500 px-4 py-2 rounded-lg opacity-50 cursor-not-allowed text-sm font-semibold"
                  disabled
                >
                  Pull (coming soon)
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


