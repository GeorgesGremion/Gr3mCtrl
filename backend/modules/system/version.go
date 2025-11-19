package system

import (
	"bufio"
	"os"
	"strings"
)

const (
	versionFilePath = "/opt/gr3mctrl/VERSION"
	branchFilePath  = "/opt/gr3mctrl/BRANCH"
)

type VersionInfo struct {
	Version   string `json:"version"`
	Branch    string `json:"branch"`
	Commit    string `json:"commit"`
	BuildDate string `json:"build_date"`
	Channel   string `json:"channel"`
}

func loadVersionInfo() VersionInfo {
	v := VersionInfo{
		Version:   "unknown",
		Branch:    readBranchFile(),
		Commit:    "unknown",
		BuildDate: "",
		Channel:   "branch",
	}

	file, err := os.Open(versionFilePath)
	if err != nil {
		return v
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "VERSION=") {
			v.Version = strings.TrimSpace(strings.TrimPrefix(line, "VERSION="))
		}
		if strings.HasPrefix(line, "BRANCH=") {
			v.Branch = strings.TrimSpace(strings.TrimPrefix(line, "BRANCH="))
		}
		if strings.HasPrefix(line, "COMMIT=") {
			v.Commit = strings.TrimSpace(strings.TrimPrefix(line, "COMMIT="))
		}
		if strings.HasPrefix(line, "BUILD_DATE=") {
			v.BuildDate = strings.TrimSpace(strings.TrimPrefix(line, "BUILD_DATE="))
		}
		if strings.HasPrefix(line, "CHANNEL=") {
			v.Channel = strings.TrimSpace(strings.TrimPrefix(line, "CHANNEL="))
		}
	}

	return v
}

func readBranchFile() string {
	data, err := os.ReadFile(branchFilePath)
	if err != nil {
		return "main"
	}
	return strings.TrimSpace(string(data))
}
