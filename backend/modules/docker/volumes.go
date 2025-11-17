package docker

import (
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"strings"

	"labcore/modules/settings"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/volume"
	"github.com/docker/docker/client"
)

type VolumeInfo struct {
	Name       string            `json:"name"`
	Driver     string            `json:"driver"`
	Mountpoint string            `json:"mountpoint"`
	Containers []VolumeContainer `json:"containers"`
}

type VolumeCreateRequest struct {
	Name     string `json:"name"`
	HostPath string `json:"host_path"`
	Pool     string `json:"pool"`
}

type VolumeContainer struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func ListVolumes(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()

	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	vols, err := cli.VolumeList(ctx, volume.ListOptions{Filters: filters.NewArgs()})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	containers, _ := cli.ContainerList(ctx, container.ListOptions{All: true})

	// Map VolumeName -> []VolumeContainer
	usage := make(map[string][]VolumeContainer)
	for _, c := range containers {
		cName := strings.TrimPrefix(c.Names[0], "/")
		for _, m := range c.Mounts {
			if m.Name != "" {
				usage[m.Name] = append(usage[m.Name], VolumeContainer{
					ID:   c.ID[:12],
					Name: cName,
				})
			}
		}
	}

	resp := make([]VolumeInfo, 0, len(vols.Volumes))
	for _, v := range vols.Volumes {
		resp = append(resp, VolumeInfo{
			Name:       v.Name,
			Driver:     v.Driver,
			Mountpoint: v.Mountpoint,
			Containers: usage[v.Name],
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func CreateVolume(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()

	var req VolumeCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "ungültige Anfrage: "+err.Error(), http.StatusBadRequest)
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		http.Error(w, "Name fehlt", http.StatusBadRequest)
		return
	}

	cfg, err := settings.LoadConfig()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	hostPath := strings.TrimSpace(req.HostPath)
	if hostPath == "" {
		if req.Pool != "" {
			hostPath = filepath.Join("/mnt/labcore/pools", req.Pool, "docker", "volumes", req.Name)
		} else {
			hostPath = filepath.Join(cfg.DataPath, "volumes", req.Name)
		}
	}

	opts := volume.CreateOptions{
		Name:   req.Name,
		Driver: "local",
		DriverOpts: map[string]string{
			"type":   "none",
			"o":      "bind",
			"device": hostPath,
		},
		Labels: map[string]string{
			"managed-by": "labcore",
		},
	}

	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	vol, err := cli.VolumeCreate(ctx, opts)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(vol)
}

func DeleteVolume(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()
	name := strings.TrimPrefix(r.URL.Path, "/api/docker/volume/")
	name = strings.TrimSpace(name)
	if name == "" {
		http.Error(w, "Name fehlt", http.StatusBadRequest)
		return
	}

	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := cli.VolumeRemove(ctx, name, true); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"deleted"}`))
}
