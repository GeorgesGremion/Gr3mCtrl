package storage

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// MountPool mounts all data disks of a pool and creates a merged view.
func MountPool(pool Pool) error {
	// legacy mergerfs flow (kept for compatibility, not used in ZFS mode)
	if err := EnsurePoolDirs(pool.Name); err != nil {
		return err
	}
	base := filepath.Join("/mnt/labcore/pools", pool.Name)
	dataMounts := []string{}
	for _, d := range pool.DataDisks {
		if d == "" {
			continue
		}
		if err := formatDiskIfNeeded(d); err != nil {
			return err
		}
		target := filepath.Join(base, "data", strings.TrimPrefix(d, "/dev/"))
		if err := mountDisk(d, target); err != nil {
			return err
		}
		dataMounts = append(dataMounts, target)
	}
	// optional parity wipe/format to ensure clean state
	if pool.ParityDisk != "" {
		_ = formatDiskIfNeeded(pool.ParityDisk)
	}
	merged := filepath.Join(base, "merged")
	if len(dataMounts) > 0 {
		if err := createMerger(merged, dataMounts); err != nil {
			return err
		}
	}
	return nil
}

// EnsurePoolMounted checks if merged mount exists; wenn nicht, mountet neu.
func EnsurePoolMounted(pool Pool) error {
	base := filepath.Join("/mnt/labcore/pools", pool.Name)
	merged := filepath.Join(base, "merged")
	if mountExists(merged) {
		return nil
	}
	return MountPool(pool)
}

// EnsurePoolDirs ensures base paths exist.
func EnsurePoolDirs(poolName string) error {
	base := filepath.Join("/mnt/labcore/pools", poolName)
	sub := []string{
		base,
		filepath.Join(base, "data"),
		filepath.Join(base, "merged"),
		filepath.Join(base, "shares"),
		filepath.Join(base, "vm"),
	}
	for _, p := range sub {
		if err := os.MkdirAll(p, 0o755); err != nil {
			return err
		}
	}
	return nil
}

// Helper to handle share target path.
func ResolveSharePath(pool, name, explicit string) string {
	if explicit != "" {
		return explicit
	}
	if pool != "" {
		// Shares standardmäßig im gemergten Pool-Volume ablegen
		return filepath.Join("/mnt/labcore/pools", pool, "merged", "shares", name)
	}
	return filepath.Join("/var/lib/labcore/data/shares", name)
}

// Placeholder for exporting (Samba/NFS) - to be expanded.
func ExportShare(s Share) error {
	if !s.SMB && !s.NFS {
		return nil
	}

	if s.SMB {
		if err := os.MkdirAll("/etc/samba/smb.conf.d", 0o755); err != nil {
			return err
		}
		content := fmt.Sprintf("[%s]\npath = %s\nbrowseable = yes\nwritable = yes\nguest ok = yes\ncomment = %s\ncreate mask = %s\ndirectory mask = %s\nforce user = %s\nforce group = %s\n", s.Name, s.Path, s.Comment, s.Mode, s.Mode, s.Owner, s.Group)
		conf := filepath.Join("/etc/samba/smb.conf.d", "labcore-"+s.Name+".conf")
		if err := os.WriteFile(conf, []byte(content), 0o644); err != nil {
			return err
		}
		_ = exec.Command("systemctl", "reload", "smbd").Run()
	}
	if s.NFS {
		if err := os.MkdirAll("/etc/exports.d", 0o755); err != nil {
			return err
		}
		line := fmt.Sprintf("%s *(rw,sync,no_subtree_check,no_root_squash)\n", s.Path)
		conf := filepath.Join("/etc/exports.d", "labcore-"+s.Name+".exports")
		if err := os.WriteFile(conf, []byte(line), 0o644); err != nil {
			return err
		}
		_ = exec.Command("exportfs", "-ra").Run()
	}
	return nil
}

func removeExport(name string) error {
	smbConf := filepath.Join("/etc/samba/smb.conf.d", "labcore-"+name+".conf")
	_ = os.Remove(smbConf)
	_ = exec.Command("systemctl", "reload", "smbd").Run()

	nfsConf := filepath.Join("/etc/exports.d", "labcore-"+name+".exports")
	_ = os.Remove(nfsConf)
	_ = exec.Command("exportfs", "-ra").Run()
	return nil
}

// Safety check for Parity selection: must not be in data disks.
func ValidatePoolDisks(p Pool) error {
	seen := map[string]bool{}
	for _, d := range p.DataDisks {
		if d == "" {
			continue
		}
		if d == p.ParityDisk {
			return fmt.Errorf("Parity Disk darf nicht als Data Disk verwendet werden")
		}
		if seen[d] {
			return fmt.Errorf("Data Disk mehrfach: %s", d)
		}
		seen[d] = true
	}
	return nil
}

// formatDiskIfNeeded wipes and formats a device with ext4 if no filesystem is present.
func formatDiskIfNeeded(device string) error {
	fs, err := currentFsType(device)
	if err != nil {
		return err
	}
	if fs != "" {
		return nil
	}
	if out, err := exec.Command("wipefs", "-a", device).CombinedOutput(); err != nil {
		return fmt.Errorf("wipefs %s: %s %w", device, string(out), err)
	}
	if out, err := exec.Command("mkfs.ext4", "-F", device).CombinedOutput(); err != nil {
		return fmt.Errorf("mkfs.ext4 %s: %s %w", device, string(out), err)
	}
	return nil
}

func currentFsType(device string) (string, error) {
	out, err := exec.Command("lsblk", "-n", "-o", "FSTYPE", device).Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

func mountExists(target string) bool {
	out, _ := exec.Command("findmnt", "-n", target).Output()
	return len(out) > 0
}

// unmountPath tries to umount if mounted.
func unmountPath(target string) {
	if !mountExists(target) {
		return
	}
	_ = exec.Command("umount", target).Run()
}
