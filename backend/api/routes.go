package api

import (
	"net/http"
	"strings"

	"gr3mctrl/modules/compose"
	"gr3mctrl/modules/docker"
	"gr3mctrl/modules/nas"
	"gr3mctrl/modules/settings"
	"gr3mctrl/modules/storage"
	"gr3mctrl/modules/system"
	"gr3mctrl/modules/vm"
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
		switch r.Method {
		case http.MethodGet:
			vm.ListNetworks(w, r)
		case http.MethodPost:
			vm.CreateNetwork(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	http.HandleFunc("/api/vm/network/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			vm.DeleteNetwork(w, r)
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
		if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/autostart") {
			vm.SetAutostart(w, r)
			return
		}
		if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/resources") {
			vm.UpdateResources(w, r)
			return
		}
		if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/net/attach") {
			vm.AttachNetwork(w, r)
			return
		}
		if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/net/detach") {
			vm.DetachNetwork(w, r)
			return
		}
		if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/disk/attach") {
			vm.AttachDisk(w, r)
			return
		}
		if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/disk/detach") {
			vm.DetachDisk(w, r)
			return
		}
		if r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/snapshots") {
			vm.ListSnapshots(w, r)
			return
		}
		if r.Method == http.MethodPost && strings.Contains(r.URL.Path, "/snapshot/") && strings.HasSuffix(r.URL.Path, "/revert") {
			vm.RevertSnapshot(w, r)
			return
		}
		if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/snapshot") {
			vm.CreateSnapshot(w, r)
			return
		}
		if r.Method == http.MethodDelete && strings.Contains(r.URL.Path, "/snapshot/") {
			vm.DeleteSnapshot(w, r)
			return
		}
		if r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/logs") {
			vm.GetVMLogs(w, r)
			return
		}
		if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/media") {
			vm.ChangeMedia(w, r)
			return
		}
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
	// VNC/SPICE Websocket Proxy
	http.HandleFunc("/ws/vnc/", vm.VNCProxy)
	http.HandleFunc("/ws/spice/", vm.SPICEProxy)
	http.HandleFunc("/ws/shell", system.ShellWS)

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

	// File Manager (Shares)
	http.HandleFunc("/api/fs/list", storage.FSList)
	http.HandleFunc("/api/fs/download", storage.FSDownload)
	http.HandleFunc("/api/fs/upload", storage.FSUpload)
	http.HandleFunc("/api/fs/mkdir", storage.FSMkdir)
	http.HandleFunc("/api/fs/delete", storage.FSDelete)
	http.HandleFunc("/api/storage/pools", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			storage.ListPools(w, r)
		case http.MethodPost:
			storage.CreatePool(w, r)
		case http.MethodDelete:
			storage.DeletePool(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
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
	http.HandleFunc("/api/storage/shares/reload", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			storage.ReloadShares(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})
	http.HandleFunc("/api/storage/share/", func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/move") && r.Method == http.MethodPut:
			storage.MoveShare(w, r)
		case r.Method == http.MethodDelete:
			storage.DeleteShare(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	http.HandleFunc("/api/storage/disks", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			storage.ListDisks(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})
	http.HandleFunc("/api/storage/disk/format", storage.FormatDisk)
	http.HandleFunc("/api/storage/smb", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			storage.HandleServiceStatus(w, r, "smbd")
		case http.MethodPost:
			storage.HandleServiceAction(w, r, "smbd")
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	http.HandleFunc("/api/storage/nfs", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			storage.HandleServiceStatus(w, r, "nfs-server")
		case http.MethodPost:
			storage.HandleServiceAction(w, r, "nfs-server")
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// System Info
	http.HandleFunc("/api/system/info", system.GetSystemInfo)
	http.HandleFunc("/api/system/update", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			system.CheckUpdate(w, r)
		case http.MethodPost:
			system.ApplyUpdate(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	http.HandleFunc("/api/system/service/restart", system.RestartService)
	http.HandleFunc("/api/system/logs", system.GetLogs)
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

	// NAS Users (trailing slash tolerant)
	http.HandleFunc("/api/nas/users", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			nas.ListUsers(w, r)
		case http.MethodPost:
			nas.CreateUser(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	http.HandleFunc("/api/nas/users/", func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPut:
			nas.UpdateUser(w, r)
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/pwd"):
			nas.SetPassword(w, r)
		case r.Method == http.MethodDelete:
			nas.DeleteUser(w, r)
		case r.Method == http.MethodGet:
			nas.ListUsers(w, r)
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
