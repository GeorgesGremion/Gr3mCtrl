package system

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	// System stats
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/mem"

	// Docker SDK
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/client"
)

type SystemInfo struct {
	Hostname          string  `json:"hostname"`
	OS                string  `json:"os"`
	Kernel            string  `json:"kernel"`
	Uptime            string  `json:"uptime"`
	CPUCount          int     `json:"cpu_count"`
	CPULoad           float64 `json:"cpu_load"`
	RAMTotal          uint64  `json:"ram_total"`
	RAMUsed           uint64  `json:"ram_used"`
	DiskTotal         uint64  `json:"disk_total"`
	DiskUsed          uint64  `json:"disk_used"`
	ContainersTotal   int     `json:"containers_total"`
	ContainersRunning int     `json:"containers_running"`
	ContainersStopped int     `json:"containers_stopped"`
	ImagesTotal       int     `json:"images_total"`
	Version           string  `json:"version"`
	Branch            string  `json:"branch"`
	Commit            string  `json:"commit"`
	BuildDate         string  `json:"build_date"`
	Channel           string  `json:"channel"`
}

func GetSystemInfo(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()

	host, _ := os.Hostname()

	// CPU
	cpuCount, _ := cpu.Counts(true)
	cpuLoad, _ := cpu.Percent(time.Second, false)

	// RAM
	vm, _ := mem.VirtualMemory()

	// Disk
	d, _ := disk.Usage("/")

	// Kernel
	kern, _ := exec.Command("uname", "-r").Output()
	kernel := strings.TrimSpace(string(kern))

	// Uptime
	up, _ := exec.Command("uptime", "-p").Output()
	uptime := strings.TrimSpace(string(up))

	// Docker client
	cli, _ := client.NewClientWithOpts(client.FromEnv)

	// List containers
	containers, _ := cli.ContainerList(ctx, container.ListOptions{All: true})

	// List images
	images, _ := cli.ImageList(ctx, image.ListOptions{})

	running := 0
	stopped := 0
	for _, c := range containers {
		if c.State == "running" {
			running++
		} else {
			stopped++
		}
	}

	versionInfo := loadVersionInfo()

	info := SystemInfo{
		Hostname:          host,
		OS:                runtime.GOOS,
		Kernel:            kernel,
		Uptime:            uptime,
		CPUCount:          cpuCount,
		CPULoad:           cpuLoad[0],
		RAMTotal:          vm.Total,
		RAMUsed:           vm.Used,
		DiskTotal:         d.Total,
		DiskUsed:          d.Used,
		ContainersTotal:   len(containers),
		ContainersRunning: running,
		ContainersStopped: stopped,
		ImagesTotal:       len(images),
		Version:           versionInfo.Version,
		Branch:            versionInfo.Branch,
		Commit:            versionInfo.Commit,
		BuildDate:         versionInfo.BuildDate,
		Channel:           versionInfo.Channel,
	}

	json.NewEncoder(w).Encode(info)
}
