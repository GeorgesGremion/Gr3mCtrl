package api

import (
	"net/http"
	"strings"

	"labcore/modules/compose"
	"labcore/modules/docker"
	"labcore/modules/settings"
	"labcore/modules/storage"
	"labcore/modules/system"
	"labcore/modules/vm"
)

func RegisterRoutes() {

	// Base info for frontend
	http.HandleFunc("/api/info", InfoHandler)

	// Docker container endpoints
	http.HandleFunc("/api/docker/containers", docker.ListContainers)
	http.HandleFunc("/api/docker/images", docker.ListImages)
	http.HandleFunc("/api/docker/image/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			docker.DeleteImage(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})
	http.HandleFunc("/api/docker/volumes", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			docker.ListVolumes(w, r)
		case http.MethodPost:
			docker.CreateVolume(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	http.HandleFunc("/api/docker/volume/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			docker.DeleteVolume(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})

	// Docker Compose
	http.HandleFunc("/api/compose/stacks", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			compose.ListStacks(w, r)
		case http.MethodPost:
			compose.CreateStack(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	// Trailing slash tolerant
	http.HandleFunc("/api/compose/stacks/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			compose.ListStacks(w, r)
		case http.MethodPost:
			compose.CreateStack(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	http.HandleFunc("/api/compose/stack/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/env") {
			switch r.Method {
			case http.MethodGet:
				compose.GetEnv(w, r)
			case http.MethodPut:
				compose.SaveEnv(w, r)
			default:
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}

		switch r.Method {
		case http.MethodPost:
			compose.StackAction(w, r)
		case http.MethodGet:
			compose.GetStack(w, r)
		case http.MethodDelete:
			compose.DeleteStack(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	http.HandleFunc("/api/compose/templates", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			compose.ListTemplates(w, r)
		case http.MethodPost:
			compose.SaveTemplate(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	http.HandleFunc("/api/compose/template/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			compose.DeleteTemplate(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})
	http.HandleFunc("/api/docker/networks", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			docker.ListNetworks(w, r)
		case http.MethodPost:
			docker.CreateNetwork(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	http.HandleFunc("/api/docker/network/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			docker.DeleteNetwork(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})

	// VM / Libvirt
	http.HandleFunc("/api/vm/domains", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			vm.ListDomains(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})
	http.HandleFunc("/api/vm/domain/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			vm.GetDomain(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})
	http.HandleFunc("/api/vm/create", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			vm.CreateVM(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})
	http.HandleFunc("/api/vm/networks", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			vm.ListNetworks(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})
	http.HandleFunc("/api/vm/health", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			vm.Health(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})
	http.HandleFunc("/api/vm/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			vm.DomainAction(w, r)
			return
		}
		if r.Method == http.MethodDelete && strings.HasSuffix(r.URL.Path, "/delete") {
			vm.DeleteVM(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})
	// VNC Websocket Proxy
	http.HandleFunc("/ws/vnc/", vm.VNCProxy)

	// Storage - ISOs
	http.HandleFunc("/api/storage/isos", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			storage.ListISOs(w, r)
		case http.MethodPost:
			storage.UploadISO(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	http.HandleFunc("/api/storage/iso/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			storage.DeleteISO(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})
	http.HandleFunc("/api/storage/pools", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			storage.ListPools(w, r)
		case http.MethodPost:
			storage.CreatePool(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	http.HandleFunc("/api/storage/pool/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			storage.DeletePool(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})
	http.HandleFunc("/api/storage/shares", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			storage.ListShares(w, r)
		case http.MethodPost:
			storage.CreateShare(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	http.HandleFunc("/api/storage/share/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			storage.DeleteShare(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})
	http.HandleFunc("/api/storage/disks", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			storage.ListDisks(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})
	http.HandleFunc("/api/storage/disk/format", storage.FormatDisk)

	// System Info
	http.HandleFunc("/api/system/info", system.GetSystemInfo)
	// Settings
	http.HandleFunc("/api/settings", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			settings.GetSettings(w, r)
		case http.MethodPut:
			settings.UpdateSettings(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Dynamic container actions
	http.HandleFunc("/api/docker/container/", func(w http.ResponseWriter, r *http.Request) {

		path := r.URL.Path

		switch {
		case len(path) >= 5 && path[len(path)-5:] == "/stop":
			docker.StopContainer(w, r)

		case len(path) >= 6 && path[len(path)-6:] == "/start":
			docker.StartContainer(w, r)

		case len(path) >= 8 && path[len(path)-8:] == "/restart":
			docker.RestartContainer(w, r)

		case len(path) >= 5 && path[len(path)-5:] == "/logs":
			docker.GetContainerLogs(w, r)

		case len(path) >= 6 && path[len(path)-6:] == "/stats":
			docker.GetContainerStats(w, r)

		case len(path) >= 7 && path[len(path)-7:] == "/remove":
			docker.RemoveContainer(w, r)

		default:
			http.NotFound(w, r)
		}
	})
}
