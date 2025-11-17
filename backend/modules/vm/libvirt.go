package vm

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"labcore/modules/settings"
	"labcore/modules/storage"
	"libvirt.org/go/libvirt"
)

type DomainInfo struct {
	Name   string `json:"name"`
	ID     uint32 `json:"id"`
	UUID   string `json:"uuid"`
	State  string `json:"state"`
	Active bool   `json:"active"`
}

// List virtual machines via libvirt (KVM)
func ListDomains(w http.ResponseWriter, r *http.Request) {
	conn, err := libvirt.NewConnect("qemu:///system")
	if err != nil {
		http.Error(w, "libvirt connect: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	doms, err := conn.ListAllDomains(0)
	if err != nil {
		http.Error(w, "list domains: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer func() {
		for _, d := range doms {
			d.Free()
		}
	}()

	resp := make([]DomainInfo, 0, len(doms))
	for _, d := range doms {
		name, _ := d.GetName()
		id, _ := d.GetID()
		uuid, _ := d.GetUUIDString()
		info, _ := d.GetInfo()
		active, _ := d.IsActive()
		resp = append(resp, DomainInfo{
			Name:   name,
			ID:     uint32(id),
			UUID:   uuid,
			State:  mapState(info),
			Active: active,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func mapState(info *libvirt.DomainInfo) string {
	if info == nil {
		return "unknown"
	}
	switch info.State {
	case libvirt.DOMAIN_RUNNING:
		return "running"
	case libvirt.DOMAIN_BLOCKED:
		return "blocked"
	case libvirt.DOMAIN_PAUSED:
		return "paused"
	case libvirt.DOMAIN_SHUTDOWN:
		return "shutdown"
	case libvirt.DOMAIN_SHUTOFF:
		return "off"
	case libvirt.DOMAIN_CRASHED:
		return "crashed"
	case libvirt.DOMAIN_PMSUSPENDED:
		return "suspended"
	default:
		return "unknown"
	}
}

// Start/Stop for existing domains
func DomainAction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// path: /api/vm/{name}/{action}
	path := strings.TrimPrefix(r.URL.Path, "/api/vm/")
	p := strings.Split(path, "/")
	if len(p) < 2 {
		http.Error(w, "Pfad erwartet /api/vm/{name}/{action}", http.StatusBadRequest)
		return
	}
	name := p[0]
	action := p[1]

	conn, err := libvirt.NewConnect("qemu:///system")
	if err != nil {
		http.Error(w, "libvirt connect: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	dom, err := conn.LookupDomainByName(name)
	if err != nil {
		http.Error(w, "domain lookup: "+err.Error(), http.StatusNotFound)
		return
	}
	defer dom.Free()

	switch action {
	case "start":
		err = dom.Create()
	case "shutdown":
		err = dom.Shutdown()
	case "destroy":
		err = dom.Destroy()
	case "reboot":
		// Reboot flags=0 for soft reboot
		err = dom.Reboot(0)
	default:
		http.Error(w, "unknown action", http.StatusBadRequest)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "ok",
		"action": action,
	})
}

// Health check for libvirt availability
func Health(w http.ResponseWriter, r *http.Request) {
	conn, err := libvirt.NewConnect("qemu:///system")
	if err != nil {
		http.Error(w, "libvirt connect: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()
	_, _ = conn.GetCapabilities()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "ok",
		"time":   time.Now().Format(time.RFC3339),
	})
}

type CreateVMRequest struct {
	Name     string `json:"name"`
	MemoryMB uint   `json:"memory_mb"`
	VCPUs    uint   `json:"vcpus"`
	DiskGB   uint   `json:"disk_gb"`
	ISO      string `json:"iso"`
	Network  string `json:"network"` // either libvirt network (default) or bridge name if Prefix "br:"
	Pool     string `json:"pool"`    // optional storage pool (merged path)
}

// POST /api/vm/create
func CreateVM(w http.ResponseWriter, r *http.Request) {
	var req CreateVMRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "ungültige Daten: "+err.Error(), http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.ISO == "" || req.DiskGB == 0 || req.VCPUs == 0 || req.MemoryMB == 0 {
		http.Error(w, "Name, ISO, DiskGB, VCPUs, MemoryMB erforderlich", http.StatusBadRequest)
		return
	}

	cfg, err := settings.LoadConfig()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if req.Pool != "" {
		if err := storage.EnsurePoolDirs(req.Pool); err != nil {
			http.Error(w, "Pool nicht verfügbar: "+err.Error(), http.StatusBadRequest)
			return
		}
	}
	vmDir := filepath.Join(cfg.DataPath, "vm", req.Name)
	if req.Pool != "" {
		// store disks on pool vm dataset
		vmDir = filepath.Join("/mnt/labcore/pools", req.Pool, "vm", req.Name)
	}
	diskPath := filepath.Join(vmDir, req.Name+".qcow2")
	if err := os.MkdirAll(vmDir, 0o755); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	cmd := exec.Command("qemu-img", "create", "-f", "qcow2", diskPath, fmt.Sprintf("%dG", req.DiskGB))
	if out, err := cmd.CombinedOutput(); err != nil {
		http.Error(w, "qemu-img: "+string(out)+err.Error(), http.StatusInternalServerError)
		return
	}

	conn, err := libvirt.NewConnect("qemu:///system")
	if err != nil {
		http.Error(w, "libvirt connect: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	xml := buildDomainXML(req, diskPath)
	dom, err := conn.DomainDefineXML(xml)
	if err != nil {
		http.Error(w, "DomainDefine: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer dom.Free()

	if err := dom.Create(); err != nil {
		http.Error(w, "DomainStart: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "created", "name": req.Name})
}

func buildDomainXML(req CreateVMRequest, diskPath string) string {
	netVal := req.Network
	if netVal == "" {
		netVal = "default"
	}
	netXML := fmt.Sprintf("<interface type='network'><source network='%s'/><model type='virtio'/></interface>", netVal)
	if strings.HasPrefix(netVal, "br:") {
		br := strings.TrimPrefix(netVal, "br:")
		netXML = fmt.Sprintf("<interface type='bridge'><source bridge='%s'/><model type='virtio'/></interface>", br)
	}
	return fmt.Sprintf(`
<domain type='qemu'>
  <name>%s</name>
  <memory unit='MiB'>%d</memory>
  <vcpu placement='static'>%d</vcpu>
  <os>
    <type arch='x86_64' machine='pc'>hvm</type>
    <boot dev='cdrom'/>
    <boot dev='hd'/>
  </os>
  <features>
    <acpi/>
    <apic/>
  </features>
  <clock offset='utc'/>
  <on_poweroff>destroy</on_poweroff>
  <on_reboot>restart</on_reboot>
  <on_crash>destroy</on_crash>
  <devices>
    <disk type='file' device='disk'>
      <driver name='qemu' type='qcow2'/>
      <source file='%s'/>
      <target dev='vda' bus='virtio'/>
    </disk>
    <disk type='file' device='cdrom'>
      <driver name='qemu' type='raw'/>
      <source file='%s'/>
      <target dev='sda' bus='sata'/>
      <readonly/>\n    </disk>
    %s
    <graphics type='vnc' port='-1' autoport='yes'/>
    <console type='pty'/>
  </devices>
</domain>`, req.Name, req.MemoryMB, req.VCPUs, diskPath, req.ISO, netXML)
}

// GET /api/vm/domain/{name}
func GetDomain(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/api/vm/domain/")
	name = strings.TrimSpace(name)
	if name == "" {
		http.Error(w, "Name fehlt", http.StatusBadRequest)
		return
	}

	conn, err := libvirt.NewConnect("qemu:///system")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	dom, err := conn.LookupDomainByName(name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	defer dom.Free()

	xmlDesc, err := dom.GetXMLDesc(0)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	type Graphics struct {
		Type   string `xml:"type,attr"`
		Port   int    `xml:"port,attr"`
		Listen struct {
			Address string `xml:"address,attr"`
		} `xml:"listen"`
	}
	type DomainXML struct {
		XMLName  xml.Name   `xml:"domain"`
		Graphics []Graphics `xml:"devices>graphics"`
	}

	var dxml DomainXML
	_ = xml.Unmarshal([]byte(xmlDesc), &dxml)

	console := map[string]interface{}{}
	if len(dxml.Graphics) > 0 {
		g := dxml.Graphics[0]
		console["type"] = g.Type
		console["port"] = g.Port
		console["address"] = g.Listen.Address
	}

	resp := map[string]interface{}{
		"name":    name,
		"console": console,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// DELETE /api/vm/{name}/delete
func DeleteVM(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/api/vm/")
	name = strings.TrimSuffix(name, "/delete")
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

	dom, err := conn.LookupDomainByName(name)
	if err == nil {
		defer dom.Free()
		xmlDesc, _ := dom.GetXMLDesc(0)
		diskPath := extractDiskPath(xmlDesc)
		_ = dom.Destroy()
		if err := dom.Undefine(); err != nil {
			http.Error(w, "Undefine fehlgeschlagen: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if diskPath != "" {
			_ = os.RemoveAll(filepath.Dir(diskPath))
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted", "name": name})
}

// WebSocket VNC Proxy: /ws/vnc/{name}
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// extractDiskPath returns the first disk file path from domain XML (vda)
func extractDiskPath(xmlDesc string) string {
	type Source struct {
		File string `xml:"file,attr"`
	}
	type Disk struct {
		Device string `xml:"device,attr"`
		Target struct {
			Dev string `xml:"dev,attr"`
		} `xml:"target"`
		Source Source `xml:"source"`
	}
	type Root struct {
		Disks []Disk `xml:"devices>disk"`
	}
	var d Root
	if err := xml.Unmarshal([]byte(xmlDesc), &d); err != nil {
		return ""
	}
	for _, disk := range d.Disks {
		if disk.Device == "disk" && disk.Source.File != "" {
			return disk.Source.File
		}
	}
	return ""
}

func VNCProxy(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/ws/vnc/")
	name = strings.TrimSpace(name)
	if name == "" {
		http.Error(w, "Name fehlt", http.StatusBadRequest)
		return
	}

	conn, err := libvirt.NewConnect("qemu:///system")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	dom, err := conn.LookupDomainByName(name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	defer dom.Free()

	xmlDesc, err := dom.GetXMLDesc(0)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	type Graphics struct {
		Type   string `xml:"type,attr"`
		Port   int    `xml:"port,attr"`
		Listen struct {
			Address string `xml:"address,attr"`
		} `xml:"listen"`
	}
	type DomainXML struct {
		Graphics []Graphics `xml:"devices>graphics"`
	}
	var d DomainXML
	_ = xml.Unmarshal([]byte(xmlDesc), &d)
	if len(d.Graphics) == 0 || d.Graphics[0].Port <= 0 {
		http.Error(w, "kein VNC Port gefunden", http.StatusBadRequest)
		return
	}

	host := d.Graphics[0].Listen.Address
	if host == "" {
		host = "127.0.0.1"
	}
	port := d.Graphics[0].Port

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer ws.Close()

	tcp, err := net.Dial("tcp", fmt.Sprintf("%s:%d", host, port))
	if err != nil {
		http.Error(w, "tcp dial failed: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer tcp.Close()

	errCh := make(chan error, 2)

	go func() {
		for {
			_, msg, err := ws.ReadMessage()
			if err != nil {
				errCh <- err
				return
			}
			if _, err := tcp.Write(msg); err != nil {
				errCh <- err
				return
			}
		}
	}()

	go func() {
		buf := make([]byte, 8192)
		for {
			n, err := tcp.Read(buf)
			if err != nil {
				errCh <- err
				return
			}
			if err := ws.WriteMessage(websocket.BinaryMessage, buf[:n]); err != nil {
				errCh <- err
				return
			}
		}
	}()

	<-errCh
}
