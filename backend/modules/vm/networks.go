package vm

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"libvirt.org/go/libvirt"
)

type VirtualNetwork struct {
	Name      string `json:"name"`
	Active    bool   `json:"active"`
	Autostart bool   `json:"autostart"`
	Kind      string `json:"kind"` // "libvirt" oder "bridge"
}

func ListNetworks(w http.ResponseWriter, r *http.Request) {
	conn, err := libvirt.NewConnect("qemu:///system")
	if err != nil {
		http.Error(w, "libvirt connect: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	nets, err := conn.ListAllNetworks(0)
	if err != nil {
		http.Error(w, "list networks: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer func() {
		for _, n := range nets {
			n.Free()
		}
	}()

	resp := make([]VirtualNetwork, 0, len(nets))
	for _, n := range nets {
		name, _ := n.GetName()
		active, _ := n.IsActive()
		auto, _ := n.GetAutostart()
		resp = append(resp, VirtualNetwork{
			Name:      name,
			Active:    active,
			Autostart: auto,
			Kind:      "libvirt",
		})
	}

	// Host-Bridges ergänzen (z.B. br0)
	if bridges, err := listHostBridges(); err == nil {
		resp = append(resp, bridges...)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func listHostBridges() ([]VirtualNetwork, error) {
	paths, err := filepath.Glob("/sys/class/net/*/bridge")
	if err != nil {
		return nil, err
	}
	var res []VirtualNetwork
	for _, p := range paths {
		if !strings.Contains(p, "/bridge") {
			continue
		}
		iface := filepath.Base(filepath.Dir(p))
		// skip docker/nft bridges
		if strings.HasPrefix(iface, "docker") || strings.HasPrefix(iface, "veth") || strings.HasPrefix(iface, "br-") {
			continue
		}
		active := readOperstate(iface) == "up"
		res = append(res, VirtualNetwork{
			Name:      iface,
			Active:    active,
			Autostart: active,
			Kind:      "bridge",
		})
	}
	return res, nil
}

func readOperstate(iface string) string {
	data, err := os.ReadFile(filepath.Join("/sys/class/net", iface, "operstate"))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}
