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
	"gr3mctrl/modules/settings"
	"gr3mctrl/modules/storage"
	"libvirt.org/go/libvirt"
)

type DomainInfo struct {
	Name   string `json:"name"`
	ID     uint32 `json:"id"`
	UUID   string `json:"uuid"`
	State  string `json:"state"`
	Active bool   `json:"active"`
}

type DomainNetwork struct {
	Type   string `json:"type"`   // network | bridge | direct
	Source string `json:"source"` // network name or bridge device
	Mac    string `json:"mac"`
	Model  string `json:"model"`
	Target string `json:"target"`
}

type DomainDisk struct {
	Device   string `json:"device"` // disk | cdrom
	Source   string `json:"source"`
	Target   string `json:"target"`
	Bus      string `json:"bus"`
	ReadOnly bool   `json:"read_only"`
}

type DomainDetail struct {
	Name      string          `json:"name"`
	Console   map[string]any  `json:"console"`
	Cdrom     string          `json:"cdrom"`
	MemoryMB  uint64          `json:"memory_mb"`
	VCPUs     uint            `json:"vcpus"`
	Autostart bool            `json:"autostart"`
	Networks  []DomainNetwork `json:"networks"`
	Disks     []DomainDisk    `json:"disks"`
}

type diskAttachRequest struct {
	SizeGB uint   `json:"size_gb"`          // required if Path empty
	Path   string `json:"path,omitempty"`   // optional existing qcow2
	Pool   string `json:"pool,omitempty"`   // optional pool for new disk
	Format string `json:"format,omitempty"` // default qcow2
	Bus    string `json:"bus,omitempty"`    // default virtio
}

type diskDetachRequest struct {
	Target     string `json:"target"`       // e.g. vdb
	DeleteFile bool   `json:"delete_file"`  // remove backing file
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

// POST /api/vm/{name}/autostart {enabled: bool}
func SetAutostart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	name := strings.TrimPrefix(r.URL.Path, "/api/vm/")
	name = strings.TrimSuffix(name, "/autostart")
	name = strings.TrimSpace(name)
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
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
	if err := dom.SetAutostart(req.Enabled); err != nil {
		http.Error(w, "set autostart: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"status": "ok", "autostart": req.Enabled})
}

// POST /api/vm/{name}/resources {memory_mb, vcpus, live:bool}
func UpdateResources(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	name := strings.TrimPrefix(r.URL.Path, "/api/vm/")
	name = strings.TrimSuffix(name, "/resources")
	name = strings.TrimSpace(name)

	var req struct {
		MemoryMB uint  `json:"memory_mb"`
		VCPUs    uint  `json:"vcpus"`
		Live     *bool `json:"live,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if req.MemoryMB == 0 && req.VCPUs == 0 {
		http.Error(w, "memory_mb oder vcpus erforderlich", http.StatusBadRequest)
		return
	}

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

	active, _ := dom.IsActive()
	applyLive := active
	if req.Live != nil {
		applyLive = *req.Live
	}

	if req.MemoryMB > 0 {
		memFlags := libvirt.DOMAIN_MEM_CONFIG
		if applyLive {
			memFlags |= libvirt.DOMAIN_MEM_LIVE
		}
		if err := dom.SetMemoryFlags(uint64(req.MemoryMB)*1024, memFlags); err != nil {
			http.Error(w, "set memory: "+err.Error(), http.StatusInternalServerError)
			return
		}
	}
	if req.VCPUs > 0 {
		vcpuFlags := libvirt.DOMAIN_VCPU_CONFIG
		if applyLive {
			vcpuFlags |= libvirt.DOMAIN_VCPU_LIVE
		}
		if err := dom.SetVcpusFlags(uint(req.VCPUs), vcpuFlags); err != nil {
			http.Error(w, "set vcpus: "+err.Error(), http.StatusInternalServerError)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"status": "ok", "memory_mb": req.MemoryMB, "vcpus": req.VCPUs})
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
		vmDir = filepath.Join("/mnt/gr3mctrl/pools", req.Pool, "vm", req.Name)
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
type Source struct {
	File string `xml:"file,attr"`
}
type Disk struct {
	Device string `xml:"device,attr"`
	Source Source `xml:"source"`
	Target struct {
		Dev string `xml:"dev,attr"`
		Bus string `xml:"bus,attr"`
	} `xml:"target"`
	ReadOnly *struct{} `xml:"readonly"`
}
type Interface struct {
	XMLName xml.Name `xml:"interface"`
	Type    string   `xml:"type,attr"`
	Mac     struct {
		Address string `xml:"address,attr"`
	} `xml:"mac"`
	Source struct {
		Network string `xml:"network,attr"`
		Bridge  string `xml:"bridge,attr"`
		Dev     string `xml:"dev,attr"`
	} `xml:"source"`
	Target struct {
		Dev string `xml:"dev,attr"`
	} `xml:"target"`
	Model struct {
		Type string `xml:"type,attr"`
	} `xml:"model"`
}

type DomainXML struct {
	XMLName   xml.Name    `xml:"domain"`
	Graphics  []Graphics  `xml:"devices>graphics"`
	Disks     []Disk      `xml:"devices>disk"`
	Interfaces []Interface `xml:"devices>interface"`
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

var cdrom string
disks := []DomainDisk{}
for _, d := range dxml.Disks {
	if d.Device == "cdrom" {
		cdrom = d.Source.File
	}
	disks = append(disks, DomainDisk{
		Device:   d.Device,
		Source:   d.Source.File,
		Target:   d.Target.Dev,
		Bus:      d.Target.Bus,
		ReadOnly: d.ReadOnly != nil,
	})
}

nets := []DomainNetwork{}
for _, iface := range dxml.Interfaces {
	source := iface.Source.Network
	if source == "" {
		source = iface.Source.Bridge
	}
	netType := iface.Type
	if netType == "" {
		if iface.Source.Bridge != "" {
			netType = "bridge"
		} else {
			netType = "network"
		}
	}
	nets = append(nets, DomainNetwork{
		Type:   netType,
		Source: source,
		Mac:    iface.Mac.Address,
		Model:  iface.Model.Type,
		Target: iface.Target.Dev,
	})
}

info, _ := dom.GetInfo()
memMB := uint64(0)
vcpus := uint(0)
if info != nil {
	memMB = uint64(info.Memory) / 1024
	vcpus = uint(info.NrVirtCpu)
}
autostart, _ := dom.GetAutostart()

	resp := DomainDetail{
		Name:      name,
		Console:   console,
		Cdrom:     cdrom,
		MemoryMB:  memMB,
		VCPUs:     vcpus,
		Autostart: autostart,
		Networks:  nets,
		Disks:     disks,
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
	keepDisks := r.URL.Query().Get("keep_disks") == "true"

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
		if diskPath != "" && !keepDisks {
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

// SPICE WebSocket Proxy: /ws/spice/{name}
func SPICEProxy(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/ws/spice/")
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

	var g Graphics
	for _, gg := range d.Graphics {
		if gg.Type == "spice" {
			g = gg
			break
		}
	}
	if g.Port <= 0 {
		http.Error(w, "kein SPICE Port gefunden", http.StatusBadRequest)
		return
	}

	host := g.Listen.Address
	if host == "" {
		host = "127.0.0.1"
	}
	port := g.Port

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

type ChangeMediaRequest struct {
	ISO string `json:"iso"` // path to iso, or empty to eject
}

// POST /api/vm/{name}/media
func ChangeMedia(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/api/vm/")
	name = strings.TrimSuffix(name, "/media")
	name = strings.TrimSpace(name)

	var req ChangeMediaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	conn, err := libvirt.NewConnect("qemu:///system")
	if err != nil {
		http.Error(w, "libvirt connect: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	dom, err := conn.LookupDomainByName(name)
	if err != nil {
		http.Error(w, "domain not found: "+err.Error(), http.StatusNotFound)
		return
	}
	defer dom.Free()

	// Find CDROM device target (usually hda, sda, or sr0)
	xmlDesc, err := dom.GetXMLDesc(0)
	if err != nil {
		http.Error(w, "get xml: "+err.Error(), http.StatusInternalServerError)
		return
	}

	targetDev, bus, err := findCDROMTarget(xmlDesc)
	if err != nil {
		http.Error(w, "no cdrom device found: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Construct new disk XML
	// If ISO is empty, we eject (empty source)
	sourceXML := ""
	if req.ISO != "" {
		sourceXML = fmt.Sprintf("<source file='%s'/>", req.ISO)
	}

	// We must match the existing device definition mostly
	diskXML := fmt.Sprintf(`
		<disk type='file' device='cdrom'>
			<driver name='qemu' type='raw'/>
			%s
			<target dev='%s' bus='%s'/>
			<readonly/>
		</disk>`, sourceXML, targetDev, bus)

	// Update live and config
	flags := libvirt.DOMAIN_DEVICE_MODIFY_LIVE | libvirt.DOMAIN_DEVICE_MODIFY_CONFIG
	isActive, _ := dom.IsActive()
	if !isActive {
		flags = libvirt.DOMAIN_DEVICE_MODIFY_CONFIG
	}

	if err := dom.UpdateDeviceFlags(diskXML, flags); err != nil {
		http.Error(w, "update device: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok", "iso": req.ISO})
}

func findCDROMTarget(xmlDesc string) (dev, bus string, err error) {
	type Disk struct {
		Device string `xml:"device,attr"`
		Target struct {
			Dev string `xml:"dev,attr"`
			Bus string `xml:"bus,attr"`
		} `xml:"target"`
	}
	type Domain struct {
		Disks []Disk `xml:"devices>disk"`
	}
	var d Domain
	if err := xml.Unmarshal([]byte(xmlDesc), &d); err != nil {
		return "", "", err
	}
	for _, disk := range d.Disks {
		if disk.Device == "cdrom" {
			return disk.Target.Dev, disk.Target.Bus, nil
		}
	}
	return "", "", fmt.Errorf("cdrom not found")
}

// POST /api/vm/{name}/disk/attach
func AttachDisk(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/api/vm/")
	name = strings.TrimSuffix(name, "/disk/attach")
	name = strings.TrimSpace(name)

	var req diskAttachRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if req.Path == "" && req.SizeGB == 0 {
		http.Error(w, "size_gb oder path erforderlich", http.StatusBadRequest)
		return
	}
	if req.Format == "" {
		req.Format = "qcow2"
	}
	if req.Bus == "" {
		req.Bus = "virtio"
	}

	conn, err := libvirt.NewConnect("qemu:///system")
	if err != nil {
		http.Error(w, "libvirt connect: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	dom, err := conn.LookupDomainByName(name)
	if err != nil {
		http.Error(w, "domain not found: "+err.Error(), http.StatusNotFound)
		return
	}
	defer dom.Free()

	// Build disk path if needed
	backingPath := strings.TrimSpace(req.Path)
	if backingPath == "" {
		cfg, err := settings.LoadConfig()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		vmDir := filepath.Join(cfg.DataPath, "vm", name)
		if strings.TrimSpace(req.Pool) != "" {
			if err := storage.EnsurePoolDirs(req.Pool); err != nil {
				http.Error(w, "Pool nicht verfuegbar: "+err.Error(), http.StatusBadRequest)
				return
			}
			vmDir = filepath.Join("/mnt/gr3mctrl/pools", req.Pool, "vm", name)
		}
		if err := os.MkdirAll(vmDir, 0o755); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		backingPath = filepath.Join(vmDir, fmt.Sprintf("%s-%d.qcow2", name, time.Now().Unix()))
		if out, err := exec.Command("qemu-img", "create", "-f", req.Format, backingPath, fmt.Sprintf("%dG", req.SizeGB)).CombinedOutput(); err != nil {
			http.Error(w, "qemu-img: "+string(out)+err.Error(), http.StatusInternalServerError)
			return
		}
	}

	xmlDesc, err := dom.GetXMLDesc(0)
	if err != nil {
		http.Error(w, "get xml: "+err.Error(), http.StatusInternalServerError)
		return
	}
	targetDev := nextVirtioDev(xmlDesc)

	diskXML := fmt.Sprintf(`
<disk type='file' device='disk'>
  <driver name='qemu' type='%s'/>
  <source file='%s'/>
  <target dev='%s' bus='%s'/>
</disk>`, req.Format, backingPath, targetDev, req.Bus)

	flags := libvirt.DOMAIN_DEVICE_MODIFY_CONFIG
	active, _ := dom.IsActive()
	if active {
		flags |= libvirt.DOMAIN_DEVICE_MODIFY_LIVE
	}

	if err := dom.AttachDeviceFlags(diskXML, flags); err != nil {
		http.Error(w, "attach disk: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"status": "ok", "target": targetDev, "path": backingPath})
}

// POST /api/vm/{name}/disk/detach
func DetachDisk(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/api/vm/")
	name = strings.TrimSuffix(name, "/disk/detach")
	name = strings.TrimSpace(name)

	var req diskDetachRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if req.Target == "" {
		http.Error(w, "target erforderlich", http.StatusBadRequest)
		return
	}

	conn, err := libvirt.NewConnect("qemu:///system")
	if err != nil {
		http.Error(w, "libvirt connect: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	dom, err := conn.LookupDomainByName(name)
	if err != nil {
		http.Error(w, "domain not found: "+err.Error(), http.StatusNotFound)
		return
	}
	defer dom.Free()

	xmlDesc, err := dom.GetXMLDesc(0)
	if err != nil {
		http.Error(w, "get xml: "+err.Error(), http.StatusInternalServerError)
		return
	}

	diskXML, srcPath, err := buildDiskXMLForTarget(xmlDesc, req.Target)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	flags := libvirt.DOMAIN_DEVICE_MODIFY_CONFIG
	active, _ := dom.IsActive()
	if active {
		flags |= libvirt.DOMAIN_DEVICE_MODIFY_LIVE
	}

	if err := dom.DetachDeviceFlags(diskXML, flags); err != nil {
		http.Error(w, "detach disk: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if req.DeleteFile && srcPath != "" {
		_ = os.Remove(srcPath)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"status": "ok", "target": req.Target})
}

// POST /api/vm/{name}/net/attach {network:string, mac?:string, model?:string}
func AttachNetwork(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/api/vm/")
	name = strings.TrimSuffix(name, "/net/attach")
	name = strings.TrimSpace(name)

	var req struct {
		Network string `json:"network"` // "default" or "br:dev"
		Mac     string `json:"mac"`
		Model   string `json:"model"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if req.Network == "" {
		http.Error(w, "network required", http.StatusBadRequest)
		return
	}
	if req.Model == "" {
		req.Model = "virtio"
	}

	conn, err := libvirt.NewConnect("qemu:///system")
	if err != nil {
		http.Error(w, "libvirt connect: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	dom, err := conn.LookupDomainByName(name)
	if err != nil {
		http.Error(w, "domain not found: "+err.Error(), http.StatusNotFound)
		return
	}
	defer dom.Free()

	netType := "network"
	source := req.Network
	if strings.HasPrefix(req.Network, "br:") {
		netType = "bridge"
		source = strings.TrimPrefix(req.Network, "br:")
	}
	macXML := ""
	if strings.TrimSpace(req.Mac) != "" {
		macXML = fmt.Sprintf("<mac address='%s'/>", strings.TrimSpace(req.Mac))
	}

	var srcXML string
	if netType == "bridge" {
		srcXML = fmt.Sprintf("<source bridge='%s'/>", source)
	} else {
		srcXML = fmt.Sprintf("<source network='%s'/>", source)
	}

	ifaceXML := fmt.Sprintf(`
<interface type='%s'>
  %s
  %s
  <model type='%s'/>
</interface>`, netType, macXML, srcXML, req.Model)

	flags := libvirt.DOMAIN_DEVICE_MODIFY_CONFIG
	active, _ := dom.IsActive()
	if active {
		flags |= libvirt.DOMAIN_DEVICE_MODIFY_LIVE
	}

	if err := dom.AttachDeviceFlags(ifaceXML, flags); err != nil {
		http.Error(w, "attach interface: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"status": "ok"})
}

// POST /api/vm/{name}/net/detach {mac:string}
func DetachNetwork(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/api/vm/")
	name = strings.TrimSuffix(name, "/net/detach")
	name = strings.TrimSpace(name)

	var req struct {
		Mac string `json:"mac"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	mac := strings.ToLower(strings.TrimSpace(req.Mac))
	if mac == "" {
		http.Error(w, "mac required", http.StatusBadRequest)
		return
	}

	conn, err := libvirt.NewConnect("qemu:///system")
	if err != nil {
		http.Error(w, "libvirt connect: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	dom, err := conn.LookupDomainByName(name)
	if err != nil {
		http.Error(w, "domain not found: "+err.Error(), http.StatusNotFound)
		return
	}
	defer dom.Free()

	xmlDesc, err := dom.GetXMLDesc(0)
	if err != nil {
		http.Error(w, "get xml: "+err.Error(), http.StatusInternalServerError)
		return
	}

	ifaceXML, err := buildInterfaceXMLForMAC(xmlDesc, mac)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	flags := libvirt.DOMAIN_DEVICE_MODIFY_CONFIG
	active, _ := dom.IsActive()
	if active {
		flags |= libvirt.DOMAIN_DEVICE_MODIFY_LIVE
	}

	if err := dom.DetachDeviceFlags(ifaceXML, flags); err != nil {
		http.Error(w, "detach interface: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"status": "ok"})
}

func buildInterfaceXMLForMAC(xmlDesc, mac string) (string, error) {
	type Iface struct {
		XMLName xml.Name `xml:"interface"`
		Type    string   `xml:"type,attr"`
		Mac     struct {
			Address string `xml:"address,attr"`
		} `xml:"mac"`
		Source struct {
			Network string `xml:"network,attr"`
			Bridge  string `xml:"bridge,attr"`
			Dev     string `xml:"dev,attr"`
		} `xml:"source"`
		Model struct {
			Type string `xml:"type,attr"`
		} `xml:"model"`
	}
	type Domain struct {
		Interfaces []Iface `xml:"devices>interface"`
	}
	var d Domain
	if err := xml.Unmarshal([]byte(xmlDesc), &d); err != nil {
		return "", fmt.Errorf("parse xml: %w", err)
	}
	for _, iface := range d.Interfaces {
		if strings.ToLower(iface.Mac.Address) != mac {
			continue
		}
		netType := iface.Type
		if netType == "" {
			if iface.Source.Bridge != "" {
				netType = "bridge"
			} else {
				netType = "network"
			}
		}
		var srcXML string
		if iface.Source.Bridge != "" {
			srcXML = fmt.Sprintf("<source bridge='%s'/>", iface.Source.Bridge)
		} else if iface.Source.Network != "" {
			srcXML = fmt.Sprintf("<source network='%s'/>", iface.Source.Network)
		} else if iface.Source.Dev != "" {
			srcXML = fmt.Sprintf("<source dev='%s'/>", iface.Source.Dev)
		}
		return fmt.Sprintf(`
<interface type='%s'>
  <mac address='%s'/>
  %s
  <model type='%s'/>
</interface>`, netType, iface.Mac.Address, srcXML, iface.Model.Type), nil
	}
	return "", fmt.Errorf("interface mit MAC %s nicht gefunden", mac)
}

func nextVirtioDev(xmlDesc string) string {
	used := map[string]bool{}
	type Disk struct {
		Target struct {
			Dev string `xml:"dev,attr"`
		} `xml:"target"`
	}
	type Dom struct {
		Disks []Disk `xml:"devices>disk"`
	}
	var d Dom
	_ = xml.Unmarshal([]byte(xmlDesc), &d)
	for _, disk := range d.Disks {
		used[strings.ToLower(disk.Target.Dev)] = true
	}
	// start from vdb (vda meist Systemdisk)
	for _, dev := range []string{"vdb", "vdc", "vdd", "vde", "vdf", "vdg", "vdh", "vdi", "vdj", "vdk", "vdl", "vdm", "vdn", "vdo", "vdp", "vdq", "vdr", "vds", "vdt", "vdu", "vdv", "vdw", "vdx", "vdy", "vdz"} {
		if !used[dev] {
			return dev
		}
	}
	return "vdb"
}

func buildDiskXMLForTarget(xmlDesc, target string) (string, string, error) {
	type Disk struct {
		Device string `xml:"device,attr"`
		Source struct {
			File string `xml:"file,attr"`
		} `xml:"source"`
		Target struct {
			Dev string `xml:"dev,attr"`
			Bus string `xml:"bus,attr"`
		} `xml:"target"`
	}
	type Dom struct {
		Disks []Disk `xml:"devices>disk"`
	}
	var d Dom
	if err := xml.Unmarshal([]byte(xmlDesc), &d); err != nil {
		return "", "", fmt.Errorf("parse xml: %w", err)
	}
	tgt := strings.ToLower(target)
	for _, disk := range d.Disks {
		if strings.ToLower(disk.Target.Dev) != tgt {
			continue
		}
		if disk.Device != "disk" {
			return "", "", fmt.Errorf("target %s ist kein Disk-Device", target)
		}
		bus := disk.Target.Bus
		if bus == "" {
			bus = "virtio"
		}
		xml := fmt.Sprintf(`
<disk type='file' device='disk'>
  <source file='%s'/>
  <target dev='%s' bus='%s'/>
</disk>`, disk.Source.File, disk.Target.Dev, bus)
		return xml, disk.Source.File, nil
	}
	return "", "", fmt.Errorf("Disk %s nicht gefunden", target)
}
