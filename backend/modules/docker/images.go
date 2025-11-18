package docker

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/client"
)

func ListImages(w http.ResponseWriter, r *http.Request) {
	cli, err := client.NewClientWithOpts(client.FromEnv)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	cli.NegotiateAPIVersion(context.Background())

	images, err := cli.ImageList(context.Background(), image.ListOptions{})
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	json.NewEncoder(w).Encode(images)
}
