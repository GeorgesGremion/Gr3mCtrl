package storage

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// Mount a single disk to target (assumes ext4) if not already mounted.
func mountDisk(device, target string) error {
	if err := os.MkdirAll(target, 0o755); err != nil {
		return err
	}
	// check already mounted
	out, _ := exec.Command("findmnt", "-n", target).Output()
	if len(out) > 0 {
		return nil
	}
	cmd := exec.Command("mount", "-t", "auto", device, target)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("mount %s: %s %w", device, string(out), err)
	}
	return nil
}

// Combine data dirs with mergerfs
func createMerger(target string, sources []string) error {
	if err := os.MkdirAll(target, 0o755); err != nil {
		return err
	}
	// check already mounted
	out, _ := exec.Command("findmnt", "-n", target).Output()
	if len(out) > 0 {
		return nil
	}
	if len(sources) == 0 {
		return nil
	}
	src := strings.Join(sources, ":")
	opts := "defaults,allow_other,category.create=mfs,moveonenospc=true,link_cow=on"
	cmd := exec.Command("mergerfs", "-o", opts, src, target)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("mergerfs: %s %w", string(out), err)
	}
	return nil
}
