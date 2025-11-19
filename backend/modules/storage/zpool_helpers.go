package storage

import (
	"bufio"
	"bytes"
	"os/exec"
	"strings"
)

// detectZpoolForDevice returns the zpool name that currently owns the given /dev path.
func detectZpoolForDevice(device string) string {
	devShort := strings.TrimPrefix(strings.TrimSpace(device), "/dev/")
	if devShort == "" {
		return ""
	}
	pools := detectZpoolDevices()
	for name, devs := range pools {
		for _, d := range devs {
			if strings.TrimPrefix(d, "/dev/") == devShort {
				return name
			}
		}
	}
	return ""
}

// detectZpoolDevices parses `zpool status -P` and returns pool -> []device mappings (with /dev prefix).
func detectZpoolDevices() map[string][]string {
	res := make(map[string][]string)
	cmd := exec.Command("zpool", "status", "-P")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return res
	}
	scanner := bufio.NewScanner(bytes.NewReader(out))
	currentPool := ""
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "pool:") {
			currentPool = strings.TrimSpace(strings.TrimPrefix(line, "pool:"))
			continue
		}
		if currentPool == "" || line == "" {
			continue
		}
		lower := strings.ToLower(line)
		if strings.HasPrefix(lower, "state:") ||
			strings.HasPrefix(lower, "status:") ||
			strings.HasPrefix(lower, "scan:") ||
			strings.HasPrefix(lower, "config:") ||
			strings.HasPrefix(lower, "errors:") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) == 0 {
			continue
		}
		nameField := fields[0]
		if nameField == "NAME" {
			continue
		}
		if strings.HasPrefix(nameField, "/dev/") {
			res[currentPool] = append(res[currentPool], nameField)
		}
	}
	return res
}
