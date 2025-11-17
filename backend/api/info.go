package api

import (
    "encoding/json"
    "net"
    "net/http"
)

type Info struct {
    Host string `json:"host"`
    Port int    `json:"port"`
}

func GetSystemIPAddress() string {
    interfaces, err := net.Interfaces()
    if err != nil {
        return "127.0.0.1"
    }

    for _, iface := range interfaces {
        if (iface.Flags&net.FlagUp) != 0 && (iface.Flags&net.FlagLoopback) == 0 {
            addrs, _ := iface.Addrs()
            for _, addr := range addrs {
                var ip net.IP
                switch v := addr.(type) {
                case *net.IPNet:
                    ip = v.IP
                case *net.IPAddr:
                    ip = v.IP
                }

                if ip == nil || ip.IsLoopback() {
                    continue
                }

                // nur IPv4
                if ipv4 := ip.To4(); ipv4 != nil {
                    return ipv4.String()
                }
            }
        }
    }

    return "127.0.0.1"
}

func InfoHandler(w http.ResponseWriter, r *http.Request) {
    host := GetSystemIPAddress()

    out := Info{
        Host: host,
        Port: 8080,
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(out)
}

