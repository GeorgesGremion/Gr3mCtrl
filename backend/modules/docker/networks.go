package docker

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
)

type NetworkContainerInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	IPv4 string `json:"ipv4"`
	IPv6 string `json:"ipv6"`
	MAC  string `json:"mac"`
}

type NetworkInfo struct {
	ID             string                 `json:"id"`
	Name           string                 `json:"name"`
	Driver         string                 `json:"driver"`
	Scope          string                 `json:"scope"`
	Internal       bool                   `json:"internal"`
	Attachable     bool                   `json:"attachable"`
	Subnet         string                 `json:"subnet"`
	Gateway        string                 `json:"gateway"`
	ContainerCount int                    `json:"container_count"`
	Containers     []NetworkContainerInfo `json:"containers"`
}

type networkCreateRequest struct {
	Name    string `json:"name"`
	Driver  string `json:"driver"`
	Subnet  string `json:"subnet"`
	Gateway string `json:"gateway"`
}

func ListNetworks(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()

	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	networks, err := cli.NetworkList(ctx, network.ListOptions{})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	resp := make([]NetworkInfo, 0, len(networks))
	for _, n := range networks {
		info := NetworkInfo{
			ID:         n.ID,
			Name:       n.Name,
			Driver:     n.Driver,
			Scope:      n.Scope,
			Internal:   n.Internal,
			Attachable: n.Attachable,
		}

		if len(n.IPAM.Config) > 0 {
			info.Subnet = n.IPAM.Config[0].Subnet
			info.Gateway = n.IPAM.Config[0].Gateway
		}

		if len(n.Containers) > 0 {
			containers := make([]NetworkContainerInfo, 0, len(n.Containers))
			for _, c := range n.Containers {
				containers = append(containers, NetworkContainerInfo{
					ID:   truncateID(c.EndpointID),
					Name: c.Name,
					IPv4: c.IPv4Address,
					IPv6: c.IPv6Address,
					MAC:  c.MacAddress,
				})
			}
			info.Containers = containers
			info.ContainerCount = len(containers)
		}

		resp = append(resp, info)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func CreateNetwork(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()

	var req networkCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Name) == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}

	driver := req.Driver
	if driver == "" {
		driver = "bridge"
	}

	opts := network.CreateOptions{
		Driver: driver,
	}

	if req.Subnet != "" {
		opts.IPAM = &network.IPAM{
			Config: []network.IPAMConfig{
				{
					Subnet:  req.Subnet,
					Gateway: req.Gateway,
				},
			},
		}
	}

	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	result, err := cli.NetworkCreate(ctx, req.Name, opts)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"id":      result.ID,
		"warning": result.Warning,
	})
}

func DeleteNetwork(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()

	id := strings.TrimPrefix(r.URL.Path, "/api/docker/network/")
	if id == "" {
		http.Error(w, "network id required", http.StatusBadRequest)
		return
	}

	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := cli.NetworkRemove(ctx, id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "deleted",
	})
}

func truncateID(id string) string {
	if len(id) <= 12 {
		return id
	}
	return id[:12]
}
