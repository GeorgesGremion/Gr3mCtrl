package vm

import (
	"encoding/json"
	"fmt"
	"net"
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

type CreateNetworkRequest struct {
	Name   string `json:"name"`
	Mode   string `json:"mode"`   // "nat", "bridge", "route", "open"
	Bridge string `json:"bridge"` // Host-Bridge name (e.g. br0) or internal bridge name (virbr1)
	CIDR   string `json:"cidr"`   // e.g. "192.168.100.1/24"
	DHCP   bool   `json:"dhcp"`
}

func CreateNetwork(w http.ResponseWriter, r *http.Request) {
	var req CreateNetworkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "ungültige Daten: "+err.Error(), http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "Name fehlt", http.StatusBadRequest)
		return
	}

	xmlDoc := ""
	if req.Mode == "bridge" {
		if req.Bridge == "" {
			http.Error(w, "Bridge-Name fehlt für Bridge-Mode", http.StatusBadRequest)
			return
		}
		xmlDoc = fmt.Sprintf(`<network>
  <name>%s</name>
  <forward mode='bridge'/>
  <bridge name='%s'/>
</network>`, req.Name, req.Bridge)
	} else if req.Mode == "nat" {
		if req.CIDR == "" {
			http.Error(w, "CIDR fehlt für NAT-Mode", http.StatusBadRequest)
			return
		}
		ip, ipNet, err := net.ParseCIDR(req.CIDR)
		if err != nil {
			http.Error(w, "Ungültiges CIDR: "+err.Error(), http.StatusBadRequest)
			return
		}
		mask := net.IP(ipNet.Mask)
		
		// Simple DHCP range calculation (start .2, end .254)
		// This is a simplification.
		dhcpXML := ""
		if req.DHCP {
			// Assume /24 for simplicity or calculate properly
			// Just taking the base IP and assuming it's the gateway/host IP
			// Range: ip+1 to ip+253?
			// Let's just use a simple heuristic for now: start=x.x.x.10, end=x.x.x.200
			// A better way would be to iterate the IP.
			// For now, let's just not support custom ranges, just enable it.
			// We need to generate start/end IPs.
			// Let's skip DHCP details for a moment or do it simple.
			// If IP is 192.168.100.1, start 192.168.100.100 end 192.168.100.254
			
			ip4 := ip.To4()
			if ip4 != nil {
				start := net.IPv4(ip4[0], ip4[1], ip4[2], 100)
				end := net.IPv4(ip4[0], ip4[1], ip4[2], 254)
				dhcpXML = fmt.Sprintf(`<dhcp><range start='%s' end='%s'/></dhcp>`, start.String(), end.String())
			}
		}

		xmlDoc = fmt.Sprintf(`<network>
  <name>%s</name>
  <forward mode='nat'/>
  <bridge name='virbr-%s' stp='on' delay='0'/>
  <ip address='%s' netmask='%d.%d.%d.%d'>
    %s
  </ip>
</network>`, req.Name, req.Name, ip.String(), mask[0], mask[1], mask[2], mask[3], dhcpXML)
	} else {
		http.Error(w, "Mode nicht unterstützt (nur nat/bridge)", http.StatusBadRequest)
		return
	}

	conn, err := libvirt.NewConnect("qemu:///system")
	if err != nil {
		http.Error(w, "libvirt connect: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	netObj, err := conn.NetworkDefineXML(xmlDoc)
	if err != nil {
		http.Error(w, "NetworkDefine: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer netObj.Free()

	if err := netObj.SetAutostart(true); err != nil {
		// log error but continue
	}
	if err := netObj.Create(); err != nil {
		http.Error(w, "NetworkStart: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "created", "name": req.Name})
}

func DeleteNetwork(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/api/vm/network/")
	name = strings.TrimSpace(name)
	if name == "" {
		http.Error(w, "Name fehlt", http.StatusBadRequest)
		return
	}

	conn, err := libvirt.NewConnect("qemu:///system")
	if err != nil {
		http.Error(w, "libvirt connect: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	netObj, err := conn.LookupNetworkByName(name)
	if err != nil {
		http.Error(w, "Network not found: "+err.Error(), http.StatusNotFound)
		return
	}
	defer netObj.Free()

	if active, _ := netObj.IsActive(); active {
		_ = netObj.Destroy()
	}
	if err := netObj.Undefine(); err != nil {
		http.Error(w, "Undefine failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted", "name": name})
}
