package nas

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
)

type NASUser struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	Enabled     bool   `json:"enabled"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

type userState struct {
	Users []NASUser `json:"users"`
}

const userFile = "/var/lib/labcore/nas_users.json"

func loadUsers() (userState, error) {
	st := userState{}
	data, err := os.ReadFile(userFile)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return st, nil
		}
		return st, err
	}
	if len(data) == 0 {
		return st, nil
	}
	err = json.Unmarshal(data, &st)
	return st, err
}

func saveUsers(st userState) error {
	tmp := userFile + ".tmp"
	if err := os.MkdirAll(filepath.Dir(userFile), 0o755); err != nil {
		return err
	}
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if err := json.NewEncoder(f).Encode(st); err != nil {
		f.Close()
		return err
	}
	f.Close()
	return os.Rename(tmp, userFile)
}

// GET /api/nas/users
func ListUsers(w http.ResponseWriter, r *http.Request) {
	st, err := loadUsers()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(st.Users)
}

type createUserRequest struct {
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	Password    string `json:"password"`
}

// POST /api/nas/users
func CreateUser(w http.ResponseWriter, r *http.Request) {
	var req createUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "ungültige Daten", http.StatusBadRequest)
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || req.Password == "" {
		http.Error(w, "Username und Passwort erforderlich", http.StatusBadRequest)
		return
	}

	st, err := loadUsers()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	for _, u := range st.Users {
		if u.Username == req.Username {
			http.Error(w, "User existiert bereits", http.StatusConflict)
			return
		}
	}

	user := NASUser{
		ID:          uuid.New().String(),
		Username:    req.Username,
		DisplayName: req.DisplayName,
		Enabled:     true,
		CreatedAt:   time.Now().Format(time.RFC3339),
		UpdatedAt:   time.Now().Format(time.RFC3339),
	}

	// system user add
	_ = exec.Command("useradd", "-M", "-s", "/usr/sbin/nologin", req.Username).Run()
	_ = setPassword(req.Username, req.Password)
	_ = exec.Command("smbpasswd", "-e", req.Username).Run()

	st.Users = append(st.Users, user)
	if err := saveUsers(st); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

type updateUserRequest struct {
	DisplayName string `json:"display_name"`
	Enabled     *bool  `json:"enabled"`
}

// PUT /api/nas/users/{id}
func UpdateUser(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/nas/users/")
	id = strings.TrimSpace(id)
	if id == "" {
		http.Error(w, "ID fehlt", http.StatusBadRequest)
		return
	}
	var req updateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "ungültige Daten", http.StatusBadRequest)
		return
	}
	st, err := loadUsers()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	updated := false
	for i, u := range st.Users {
		if u.ID == id {
			if req.DisplayName != "" {
				u.DisplayName = req.DisplayName
			}
			if req.Enabled != nil {
				u.Enabled = *req.Enabled
				if u.Enabled {
					_ = exec.Command("smbpasswd", "-e", u.Username).Run()
				} else {
					_ = exec.Command("smbpasswd", "-d", u.Username).Run()
				}
			}
			u.UpdatedAt = time.Now().Format(time.RFC3339)
			st.Users[i] = u
			updated = true
			break
		}
	}
	if !updated {
		http.Error(w, "User nicht gefunden", http.StatusNotFound)
		return
	}
	if err := saveUsers(st); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
}

type passwordRequest struct {
	Password string `json:"password"`
}

// POST /api/nas/users/{id}/pwd
func SetPassword(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/nas/users/")
	id = strings.TrimSuffix(id, "/pwd")
	id = strings.TrimSpace(id)
	if id == "" {
		http.Error(w, "ID fehlt", http.StatusBadRequest)
		return
	}
	var req passwordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "ungültige Daten", http.StatusBadRequest)
		return
	}
	req.Password = strings.TrimSpace(req.Password)
	if req.Password == "" {
		http.Error(w, "Passwort fehlt", http.StatusBadRequest)
		return
	}
	st, err := loadUsers()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	var username string
	for _, u := range st.Users {
		if u.ID == id {
			username = u.Username
			break
		}
	}
	if username == "" {
		http.Error(w, "User nicht gefunden", http.StatusNotFound)
		return
	}
	if err := setPassword(username, req.Password); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "password_set"})
}

// DELETE /api/nas/users/{id}
func DeleteUser(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/nas/users/")
	id = strings.TrimSpace(id)
	if id == "" {
		http.Error(w, "ID fehlt", http.StatusBadRequest)
		return
	}
	st, err := loadUsers()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	filtered := st.Users[:0]
	var username string
	for _, u := range st.Users {
		if u.ID == id {
			username = u.Username
			continue
		}
		filtered = append(filtered, u)
	}
	st.Users = filtered
	if err := saveUsers(st); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if username != "" {
		_ = exec.Command("smbpasswd", "-x", username).Run()
		_ = exec.Command("userdel", "-r", username).Run()
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
}

func setPassword(username, password string) error {
	cmd := exec.Command("bash", "-lc", "echo -e \""+password+"\\n"+password+"\" | smbpasswd -s -a "+username)
	if out, err := cmd.CombinedOutput(); err != nil {
		return errors.New("smbpasswd: " + string(out) + err.Error())
	}
	_ = exec.Command("bash", "-lc", "echo \""+username+":"+password+"\" | chpasswd").Run()
	return nil
}
