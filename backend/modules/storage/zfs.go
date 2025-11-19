package storage

import (
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
)

type zpoolListEntry struct {
	Name   string
	Size   uint64
	Alloc  uint64
	Free   uint64
	Health string
}

func CreateZFSPool(p Pool) error {
	if len(p.DataDisks) == 0 {
		return errors.New("keine Disks angegeben")
	}
	args := []string{"create", "-f"}
	// ensure mountpoint base exists
	_ = exec.Command("mkdir", "-p", filepath.Join("/mnt/gr3mctrl/pools", p.Name)).Run()
	layout := strings.ToLower(p.Layout)
	switch layout {
	case "mirror":
		args = append(args, p.Name, "mirror")
		args = append(args, p.DataDisks...)
	case "raidz1", "raidz":
		args = append(args, p.Name, "raidz1")
		args = append(args, p.DataDisks...)
	case "raidz2":
		args = append(args, p.Name, "raidz2")
		args = append(args, p.DataDisks...)
	case "raidz3":
		args = append(args, p.Name, "raidz3")
		args = append(args, p.DataDisks...)
	default: // stripe
		args = append(args, p.Name)
		args = append(args, p.DataDisks...)
	}
	if out, err := exec.Command("zpool", args...).CombinedOutput(); err != nil {
		return fmt.Errorf("zpool create: %s %w", string(out), err)
	}
	// Set mountpoint for root dataset
	mp := filepath.Join("/mnt/gr3mctrl/pools", p.Name)
	_ = exec.Command("zfs", "set", "mountpoint="+mp, p.Name).Run()
	// Create datasets for shares/vm
	_ = exec.Command("zfs", "create", p.Name+"/shares").Run()
	_ = exec.Command("zfs", "create", p.Name+"/vm").Run()
	_ = exec.Command("zfs", "set", "mountpoint="+filepath.Join(mp, "shares"), p.Name+"/shares").Run()
	_ = exec.Command("zfs", "set", "mountpoint="+filepath.Join(mp, "vm"), p.Name+"/vm").Run()
	return nil
}

func DestroyZFSPool(p Pool) {
	// best-effort unmount datasets
	_ = exec.Command("zfs", "unmount", "-f", p.Name+"/shares").Run()
	_ = exec.Command("zfs", "unmount", "-f", p.Name+"/vm").Run()
	_ = exec.Command("zfs", "unmount", "-f", p.Name).Run()
	// destroy datasets recursively
	_ = exec.Command("zfs", "destroy", "-Rf", p.Name).Run()
	_ = exec.Command("zpool", "destroy", "-f", p.Name).Run()
	_ = exec.Command("zpool", "export", "-f", p.Name).Run()
}

// cleanupPoolDisks wipes partition tables/labels of pool disks (best effort).
func cleanupPoolDisks(p Pool) error {
	all := []string{}
	if p.ParityDisk != "" {
		all = append(all, strings.TrimPrefix(p.ParityDisk, "/dev/"))
	}
	for _, d := range p.DataDisks {
		if strings.TrimSpace(d) == "" {
			continue
		}
		all = append(all, strings.TrimPrefix(d, "/dev/"))
	}
	for _, d := range all {
		dev := "/dev/" + d
		_ = exec.Command("zpool", "labelclear", "-f", dev).Run()
		_ = exec.Command("wipefs", "-a", dev).Run()
		_ = exec.Command("sgdisk", "--zap-all", dev).Run()
	}
	return nil
}

func getZpoolList() ([]zpoolListEntry, error) {
	out, err := exec.Command("zpool", "list", "-Hp", "-o", "name,size,alloc,free,health").Output()
	if err != nil {
		return nil, err
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	var res []zpoolListEntry
	for _, l := range lines {
		if strings.TrimSpace(l) == "" {
			continue
		}
		parts := strings.Fields(l)
		if len(parts) < 5 {
			continue
		}
		size := parseUint(parts[1])
		alloc := parseUint(parts[2])
		free := parseUint(parts[3])
		res = append(res, zpoolListEntry{
			Name:   parts[0],
			Size:   size,
			Alloc:  alloc,
			Free:   free,
			Health: parts[4],
		})
	}
	return res, nil
}

func buildZfsPoolInfo(pools []Pool, shares []Share) []PoolInfo {
	zlist, _ := getZpoolList()
	info := make([]PoolInfo, 0, len(pools))
	for _, p := range pools {
		pi := PoolInfo{Pool: p}
		for _, z := range zlist {
			if z.Name == p.Name {
				pi.TotalData = z.Size
				pi.Usable = z.Free
				pi.Health = z.Health
			}
		}
		if p.Name == "rpool" || p.Name == "root" {
			pi.Health = "system"
		}
		for _, sh := range shares {
			if sh.Pool == p.Name {
				pi.Shares = append(pi.Shares, sh)
			}
		}
		mp := filepath.Join("/mnt/gr3mctrl/pools", p.Name)
		pi.Mounts = []string{mp}
		info = append(info, pi)
	}
	return info
}

func ensureDisksFree(devices []string) error {
	disks, err := fetchDisks()
	if err != nil {
		return err
	}
	checkDisk := func(dev string) error {
		name := strings.TrimPrefix(dev, "/dev/")
		di, ok := findDisk(disks, name)
		if !ok {
			return fmt.Errorf("Disk %s nicht gefunden", dev)
		}
		if di.Used {
			mp := firstMount(di)
			if mp == "" {
				mp = "bereits gemountet"
			}
			return fmt.Errorf("Disk %s wird bereits verwendet (%s)", dev, mp)
		}
		return nil
	}
	for _, d := range devices {
		if d == "" {
			continue
		}
		if err := checkDisk(d); err != nil {
			return err
		}
	}
	return nil
}

func parseUint(s string) uint64 {
	var v uint64
	_, _ = fmt.Sscan(s, &v)
	return v
}

// simple probe used in Health endpoint (optional)
func zfsAvailable() bool {
	_, err := exec.LookPath("zpool")
	return err == nil
}
