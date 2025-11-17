package settings

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

const configPath = "/var/lib/labcore/config.json"
const defaultDataPath = "/var/lib/labcore/data"

type Config struct {
	DataPath    string `json:"data_path"`
	DefaultPool string `json:"default_pool"`
	ISO_Pool    string `json:"iso_pool"`
	DockerPool  string `json:"docker_pool"`
	VMPool      string `json:"vm_pool"`
}

func ensureDir(path string) error {
	return os.MkdirAll(path, 0o755)
}

// LoadConfig lädt die Konfiguration oder legt Defaults an.
func LoadConfig() (Config, error) {
	cfg := Config{DataPath: defaultDataPath}

	// Sicherstellen, dass Basisverzeichnis existiert
	if err := ensureDir(filepath.Dir(configPath)); err != nil {
		return cfg, err
	}

	f, err := os.Open(configPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			// Erstschreiben
			if err := SaveConfig(cfg); err != nil {
				return cfg, err
			}
			return cfg, nil
		}
		return cfg, err
	}
	defer f.Close()

	if err := json.NewDecoder(f).Decode(&cfg); err != nil {
		return cfg, err
	}

	if cfg.DataPath == "" {
		cfg.DataPath = defaultDataPath
	}

	if err := ensureDir(cfg.DataPath); err != nil {
		return cfg, err
	}

	return cfg, nil
}

func SaveConfig(cfg Config) error {
	if cfg.DataPath == "" {
		cfg.DataPath = defaultDataPath
	}
	if err := ensureDir(cfg.DataPath); err != nil {
		return err
	}
	if err := ensureDir(filepath.Dir(configPath)); err != nil {
		return err
	}

	tmpFile := configPath + ".tmp"
	f, err := os.Create(tmpFile)
	if err != nil {
		return err
	}
	if err := json.NewEncoder(f).Encode(cfg); err != nil {
		f.Close()
		return err
	}
	f.Close()
	return os.Rename(tmpFile, configPath)
}

func ConfigPath() string {
	return configPath
}
