import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";

export default function ContainerStats({ id }) {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["stats", id],
    queryFn: () => apiGet(`/api/docker/container/${id}/stats`),
    refetchInterval: (data) => {
      if (data?.error === "Container läuft nicht") return false;
      return 3000;
    },
    retry: false,
  });

  if (isLoading)
    return <p className="text-gray-500 text-sm">Lade Container-Stats...</p>;

  if (isError)
    return (
      <div className="text-sm text-red-400">
        Stats nicht verfügbar
        <button
          className="ml-2 underline text-red-300"
          onClick={() => refetch()}
        >
          Erneut versuchen
        </button>
        <p className="text-xs text-red-300 mt-1">
          {error?.response?.data || error?.message}
        </p>
      </div>
    );

  return (
    <div className="text-sm text-gray-300 mt-3">
      <p>
        CPU: {data.cpu_percent.toFixed(2)}%
        {isFetching && <span className="text-gray-500 text-xs ml-2">↻</span>}
      </p>
      <p>
        RAM: {(data.memory_used / 1024 / 1024).toFixed(1)}MB /{" "}
        {(data.memory_limit / 1024 / 1024 / 1024).toFixed(1)}GB
      </p>
      <p>
        NET: ↓ {data.network_rx}B / ↑ {data.network_tx}B
      </p>
    </div>
  );
}
