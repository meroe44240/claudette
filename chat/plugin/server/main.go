// Humanup Agents: enforces Humanup Chat channel rules inside Mattermost, before a post lands.
// The rules (which channel is read-only for whom, which bots are paused) come from the Agent Hub.
// If the Hub cannot be reached, the last rules stay in force; before the first fetch nothing is blocked.
package main

import (
	"bytes"
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"slices"
	"sync"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
)

type configuration struct {
	HubURL    string
	HubSecret string
}

type policy struct {
	ReadOnly   map[string][]string `json:"read_only"`
	NoBots     []string            `json:"no_bots"`
	Bots       []string            `json:"bots"`
	PausedBots []string            `json:"paused_bots"`
	Messages   map[string]string   `json:"messages"`
}

type Plugin struct {
	plugin.MattermostPlugin

	mu     sync.RWMutex
	cfg    configuration
	pol    *policy
	stop   chan struct{}
	client *http.Client
}

func (p *Plugin) OnConfigurationChange() error {
	var c configuration
	if err := p.API.LoadPluginConfiguration(&c); err != nil {
		return err
	}
	if c.HubURL == "" {
		c.HubURL = "http://hub:3100"
	}
	p.mu.Lock()
	p.cfg = c
	p.mu.Unlock()
	go p.refresh()
	return nil
}

func (p *Plugin) OnActivate() error {
	p.client = &http.Client{Timeout: 5 * time.Second}
	p.stop = make(chan struct{})
	go func() {
		p.refresh()
		t := time.NewTicker(30 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-t.C:
				p.refresh()
			case <-p.stop:
				return
			}
		}
	}()
	return nil
}

func (p *Plugin) OnDeactivate() error {
	if p.stop != nil {
		close(p.stop)
	}
	return nil
}

func (p *Plugin) config() configuration {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.cfg
}

func (p *Plugin) refresh() {
	cfg := p.config()
	if cfg.HubSecret == "" || p.client == nil {
		return
	}
	req, err := http.NewRequest(http.MethodGet, cfg.HubURL+"/mm/policy", nil)
	if err != nil {
		return
	}
	req.Header.Set("Authorization", "Bearer "+cfg.HubSecret)
	resp, err := p.client.Do(req)
	if err != nil {
		p.API.LogWarn("humanup-agents: cannot reach the Agent Hub, keeping the last rules", "error", err.Error())
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		p.API.LogWarn("humanup-agents: Agent Hub refused the policy request", "status", resp.StatusCode)
		return
	}
	var pol policy
	if err := json.NewDecoder(resp.Body).Decode(&pol); err != nil {
		p.API.LogWarn("humanup-agents: bad policy", "error", err.Error())
		return
	}
	p.mu.Lock()
	p.pol = &pol
	p.mu.Unlock()
}

// MessageWillBePosted runs before every post is saved. Returning a non-empty string rejects it.
func (p *Plugin) MessageWillBePosted(_ *plugin.Context, post *model.Post) (*model.Post, string) {
	p.mu.RLock()
	pol := p.pol
	p.mu.RUnlock()
	if pol == nil || post.IsSystemMessage() {
		return post, ""
	}
	if slices.Contains(pol.PausedBots, post.UserId) {
		return p.reject(post, pol, "paused")
	}
	if allowed, ok := pol.ReadOnly[post.ChannelId]; ok && !slices.Contains(allowed, post.UserId) {
		return p.reject(post, pol, "read_only")
	}
	if slices.Contains(pol.NoBots, post.ChannelId) && slices.Contains(pol.Bots, post.UserId) {
		return p.reject(post, pol, "no_bots")
	}
	return post, ""
}

func (p *Plugin) reject(post *model.Post, pol *policy, reason string) (*model.Post, string) {
	msg := pol.Messages[reason]
	if msg == "" {
		msg = "This post is not allowed here."
	}
	if !slices.Contains(pol.Bots, post.UserId) {
		p.API.SendEphemeralPost(post.UserId, &model.Post{ChannelId: post.ChannelId, Message: msg})
	}
	go p.audit(post, reason)
	return nil, "humanup-agents: " + reason
}

func (p *Plugin) audit(post *model.Post, reason string) {
	cfg := p.config()
	if cfg.HubSecret == "" || p.client == nil {
		return
	}
	body, _ := json.Marshal(map[string]string{"user_id": post.UserId, "channel_id": post.ChannelId, "reason": reason})
	req, err := http.NewRequest(http.MethodPost, cfg.HubURL+"/mm/audit", bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Authorization", "Bearer "+cfg.HubSecret)
	req.Header.Set("Content-Type", "application/json")
	if resp, err := p.client.Do(req); err == nil {
		resp.Body.Close()
	}
}

// ServeHTTP: POST /plugins/humanup-agents/refresh with X-Hub-Secret makes the rules apply at once
// (the Hub calls it after a pause or resume).
func (p *Plugin) ServeHTTP(_ *plugin.Context, w http.ResponseWriter, r *http.Request) {
	cfg := p.config()
	given := []byte(r.Header.Get("X-Hub-Secret"))
	if r.Method != http.MethodPost || r.URL.Path != "/refresh" || cfg.HubSecret == "" ||
		subtle.ConstantTimeCompare(given, []byte(cfg.HubSecret)) != 1 {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	p.refresh()
	w.WriteHeader(http.StatusNoContent)
}

func main() {
	plugin.ClientMain(&Plugin{})
}
