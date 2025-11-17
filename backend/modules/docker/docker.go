package docker

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/client"
)

func ListContainers(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()

	cli, err := client.NewClientWithOpts(
		client.FromEnv,
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	containers, err := cli.ContainerList(ctx, container.ListOptions{
		All: true,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(containers)
}

func StopContainer(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()

	id := r.URL.Path[len("/api/docker/container/"):]
	// ID endet z.B. auf /stop → deshalb cutten
	id = id[:len(id)-len("/stop")]

	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	if err := cli.ContainerStop(ctx, id, container.StopOptions{}); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	w.Write([]byte(`{"status":"stopped"}`))
}

func StartContainer(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()

	id := r.URL.Path[len("/api/docker/container/"):]
	id = id[:len(id)-len("/start")]

	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	if err := cli.ContainerStart(ctx, id, container.StartOptions{}); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	w.Write([]byte(`{"status":"started"}`))
}

func RestartContainer(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()

	id := r.URL.Path[len("/api/docker/container/"):]
	id = id[:len(id)-len("/restart")]

	cli, err := client.NewClientWithOpts(
		client.FromEnv,
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	// Docker erwartet hier StopOptions – auch für Restart!
	stopOptions := container.StopOptions{}

	if err := cli.ContainerRestart(ctx, id, stopOptions); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	w.Write([]byte(`{"status":"restarted"}`))
}

func GetContainerLogs(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()

	// Container ID aus der URL extrahieren
	path := r.URL.Path
	id := path[len("/api/docker/container/"):]
	id = id[:len(id)-len("/logs")]

	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	// Logs abrufen – Tail=100 (letzte 100 Zeilen)
	options := container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Timestamps: false,
		Tail:       "100",
	}

	out, err := cli.ContainerLogs(ctx, id, options)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer out.Close()

	w.Header().Set("Content-Type", "text/plain")
	io.Copy(w, out)
}

func GetContainerStats(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	path := r.URL.Path
	id := path[len("/api/docker/container/"):]
	id = id[:len(id)-len("/stats")]

	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	inspect, err := cli.ContainerInspect(ctx, id)
	if err != nil {
		http.Error(w, "Container nicht gefunden oder nicht erreichbar: "+err.Error(), http.StatusNotFound)
		return
	}

	if inspect.State == nil || !inspect.State.Running {
		http.Error(w, "Container läuft nicht", http.StatusBadRequest)
		return
	}

	statsResp, err := cli.ContainerStats(ctx, id, false)
	if err != nil {
		http.Error(w, "Container-Stats nicht verfügbar (ggf. gestoppt oder gelöscht): "+err.Error(), http.StatusBadRequest)
		return
	}
	defer statsResp.Body.Close()

	var stats container.StatsResponse
	if err := json.NewDecoder(statsResp.Body).Decode(&stats); err != nil {
		http.Error(w, "Konnte Stats nicht lesen: "+err.Error(), http.StatusInternalServerError)
		return
	}

	resp := map[string]interface{}{
		"cpu_percent":    calculateCPUPercent(stats),
		"memory_used":    float64(stats.MemoryStats.Usage),
		"memory_limit":   float64(stats.MemoryStats.Limit),
		"memory_percent": memoryPercent(stats),
		"network_rx":     float64(totalNetworkRx(stats)),
		"network_tx":     float64(totalNetworkTx(stats)),
		"block_read":     float64(totalBlkIO(stats, "Read")),
		"block_write":    float64(totalBlkIO(stats, "Write")),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func RemoveContainer(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()

	id := r.URL.Path[len("/api/docker/container/"):]
	id = id[:len(id)-len("/remove")]

	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	opts := container.RemoveOptions{
		Force:         true,
		RemoveVolumes: true,
	}

	if err := cli.ContainerRemove(ctx, id, opts); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"deleted"}`))
}

func DeleteImage(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()

	// /api/docker/image/<id>/delete
	path := r.URL.Path
	id := strings.TrimSuffix(strings.TrimPrefix(path, "/api/docker/image/"), "/delete")

	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	_, err = cli.ImageRemove(ctx, id, image.RemoveOptions{Force: true, PruneChildren: true})
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"deleted"}`))
}

func calculateCPUPercent(stats container.StatsResponse) float64 {
	cpuDelta := float64(stats.CPUStats.CPUUsage.TotalUsage - stats.PreCPUStats.CPUUsage.TotalUsage)
	systemDelta := float64(stats.CPUStats.SystemUsage - stats.PreCPUStats.SystemUsage)

	onlineCPUs := float64(stats.CPUStats.OnlineCPUs)
	if onlineCPUs == 0 && len(stats.CPUStats.CPUUsage.PercpuUsage) > 0 {
		onlineCPUs = float64(len(stats.CPUStats.CPUUsage.PercpuUsage))
	}

	if systemDelta > 0 && cpuDelta > 0 && onlineCPUs > 0 {
		return (cpuDelta / systemDelta) * onlineCPUs * 100
	}
	return 0
}

func memoryPercent(stats container.StatsResponse) float64 {
	limit := float64(stats.MemoryStats.Limit)
	if limit == 0 {
		return 0
	}
	return (float64(stats.MemoryStats.Usage) / limit) * 100
}

func totalNetworkRx(stats container.StatsResponse) uint64 {
	var total uint64
	for _, n := range stats.Networks {
		total += n.RxBytes
	}
	return total
}

func totalNetworkTx(stats container.StatsResponse) uint64 {
	var total uint64
	for _, n := range stats.Networks {
		total += n.TxBytes
	}
	return total
}

func totalBlkIO(stats container.StatsResponse, op string) uint64 {
	var total uint64
	for _, entry := range stats.BlkioStats.IoServiceBytesRecursive {
		if entry.Op == op {
			total += entry.Value
		}
	}
	return total
}
