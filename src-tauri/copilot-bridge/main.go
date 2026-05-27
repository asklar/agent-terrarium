package main

/*
#include <stdlib.h>

// Tool callback: Rust provides this function pointer.
// session_id, tool_name, args_json → result_json (caller must free with copilot_free_string)
typedef char* (*tool_callback_t)(char* session_id, char* tool_name, char* args_json);

// Wrapper to call the function pointer from Go (cgo cannot call fn ptrs directly)
static char* call_tool_callback(tool_callback_t cb, char* sid, char* name, char* args) {
    return cb(sid, name, args);
}
*/
import "C"

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
	"unsafe"

	copilot "github.com/github/copilot-sdk/go"
)

var (
	globalClient   *copilot.Client
	clientMu       sync.Mutex
	sessions       = make(map[string]*copilot.Session)
	sessionsMu     sync.Mutex
	toolCallback   C.tool_callback_t
	toolCallbackMu sync.Mutex
)

// SessionConfig mirrors the Rust BackendConfig for JSON deserialization
type SessionConfig struct {
	Model            string `json:"model,omitempty"`
	SystemPrompt     string `json:"system_prompt,omitempty"`
	CustomAgent      string `json:"custom_agent,omitempty"`
	WorkingDirectory string `json:"working_directory,omitempty"`
	ConfigDir        string `json:"config_dir,omitempty"`
}

// configDir returns the agent-terrarium-specific copilot config directory
func configDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	dir := filepath.Join(home, "agent-terrarium", ".copilot")
	os.MkdirAll(dir, 0755)
	return dir
}

//export copilot_init
func copilot_init(errorOut **C.char) C.int {
	clientMu.Lock()
	defer clientMu.Unlock()

	if globalClient != nil {
		return 0
	}

	// Find the copilot CLI executable
	conn := copilot.StdioConnection{}
	if cliPath := os.Getenv("COPILOT_CLI_PATH"); cliPath != "" {
		conn.Path = cliPath
	} else if path, err := exec.LookPath("copilot"); err == nil {
		conn.Path = path
	} else if path, err := exec.LookPath("copilot.exe"); err == nil {
		conn.Path = path
	} else {
		fmt.Fprintf(os.Stderr, "[copilot-bridge] WARNING: copilot CLI not found in PATH\n")
	}
	if conn.Path != "" {
		fmt.Fprintf(os.Stderr, "[copilot-bridge] Found CLI at: %s\n", conn.Path)
	}

	logPath := filepath.Join(os.TempDir(), "copilot-bridge-cli.log")
	fmt.Fprintf(os.Stderr, "[copilot-bridge] CLI log: %s\n", logPath)

	// Don't set BaseDirectory — let the CLI use default ~/.copilot so auth
	// tokens are found. Per-session isolation uses ConfigDir on SessionConfig.
	opts := &copilot.ClientOptions{
		Connection: conn,
		LogLevel:   "error",
		Env:        append(os.Environ(), "COPILOT_DEBUG_LOG="+logPath),
	}

	client := copilot.NewClient(opts)

	// Use background context for Start — the CLI process must live for the
	// lifetime of the app. A timeout context would kill it on cancel.
	if err := client.Start(context.Background()); err != nil {
		*errorOut = C.CString(fmt.Sprintf("Failed to start Copilot client: %v", err))
		return 1
	}

	globalClient = client
	return 0
}

//export copilot_stop
func copilot_stop() {
	clientMu.Lock()
	defer clientMu.Unlock()

	if globalClient != nil {
		globalClient.Stop()
		globalClient = nil
	}

	sessionsMu.Lock()
	sessions = make(map[string]*copilot.Session)
	sessionsMu.Unlock()
}

//export copilot_create_session
func copilot_create_session(configJSON *C.char, sessionIDOut **C.char, errorOut **C.char) C.int {
	clientMu.Lock()
	client := globalClient
	clientMu.Unlock()

	if client == nil {
		*errorOut = C.CString("Client not initialized")
		return 1
	}

	var cfg SessionConfig
	if err := json.Unmarshal([]byte(C.GoString(configJSON)), &cfg); err != nil {
		*errorOut = C.CString(fmt.Sprintf("Invalid config JSON: %v", err))
		return 1
	}

	sessionCfg := &copilot.SessionConfig{
		Model:               cfg.Model,
		WorkingDirectory:    cfg.WorkingDirectory,
		ConfigDir:           configDir(),
		OnPermissionRequest: copilot.PermissionHandler.ApproveAll,
	}

	if cfg.SystemPrompt != "" {
		sessionCfg.SystemMessage = &copilot.SystemMessageConfig{
			Mode:    "replace",
			Content: cfg.SystemPrompt,
		}
	}

	if cfg.CustomAgent != "" {
		sessionCfg.CustomAgents = []copilot.CustomAgentConfig{
			{
				Name:   cfg.CustomAgent,
				Prompt: cfg.SystemPrompt,
				Infer:  boolPtr(true),
			},
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	session, err := client.CreateSession(ctx, sessionCfg)
	if err != nil {
		*errorOut = C.CString(fmt.Sprintf("Failed to create session: %v", err))
		return 1
	}

	sessionsMu.Lock()
	sessions[session.SessionID] = session
	sessionsMu.Unlock()

	*sessionIDOut = C.CString(session.SessionID)
	return 0
}

//export copilot_resume_session
func copilot_resume_session(savedID *C.char, configJSON *C.char, sessionIDOut **C.char, errorOut **C.char) C.int {
	clientMu.Lock()
	client := globalClient
	clientMu.Unlock()

	if client == nil {
		*errorOut = C.CString("Client not initialized")
		return 1
	}

	var cfg SessionConfig
	if err := json.Unmarshal([]byte(C.GoString(configJSON)), &cfg); err != nil {
		*errorOut = C.CString(fmt.Sprintf("Invalid config JSON: %v", err))
		return 1
	}

	resumeCfg := &copilot.ResumeSessionConfig{
		Model:               cfg.Model,
		WorkingDirectory:    cfg.WorkingDirectory,
		ConfigDir:           configDir(),
		OnPermissionRequest: copilot.PermissionHandler.ApproveAll,
	}

	if cfg.CustomAgent != "" {
		resumeCfg.CustomAgents = []copilot.CustomAgentConfig{
			{
				Name:   cfg.CustomAgent,
				Prompt: cfg.SystemPrompt,
				Infer:  boolPtr(true),
			},
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	session, err := client.ResumeSession(ctx, C.GoString(savedID), resumeCfg)
	if err != nil {
		*errorOut = C.CString(fmt.Sprintf("Failed to resume session: %v", err))
		return 1
	}

	sessionsMu.Lock()
	sessions[session.SessionID] = session
	sessionsMu.Unlock()

	*sessionIDOut = C.CString(session.SessionID)
	return 0
}

//export copilot_send_and_wait
func copilot_send_and_wait(sessionID *C.char, prompt *C.char, timeoutSecs C.int, responseOut **C.char, errorOut **C.char) C.int {
	sid := C.GoString(sessionID)

	sessionsMu.Lock()
	session, ok := sessions[sid]
	sessionsMu.Unlock()

	if !ok {
		*errorOut = C.CString(fmt.Sprintf("Session not found: %s", sid))
		return 1
	}

	timeout := time.Duration(timeoutSecs) * time.Second
	if timeout <= 0 {
		timeout = 60 * time.Second
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	event, err := session.SendAndWait(ctx, copilot.MessageOptions{
		Prompt: C.GoString(prompt),
	})
	if err != nil {
		*errorOut = C.CString(fmt.Sprintf("Send failed: %v", err))
		return 1
	}

	if event != nil {
		if d, ok := event.Data.(*copilot.AssistantMessageData); ok && d.Content != "" {
			*responseOut = C.CString(d.Content)
		} else {
			*responseOut = C.CString("")
		}
	} else {
		*responseOut = C.CString("")
	}
	return 0
}

//export copilot_create_session_with_tools
func copilot_create_session_with_tools(configJSON *C.char, toolsJSON *C.char, sessionIDOut **C.char, errorOut **C.char) C.int {
	clientMu.Lock()
	client := globalClient
	clientMu.Unlock()

	if client == nil {
		*errorOut = C.CString("Client not initialized")
		return 1
	}

	var cfg SessionConfig
	if err := json.Unmarshal([]byte(C.GoString(configJSON)), &cfg); err != nil {
		*errorOut = C.CString(fmt.Sprintf("Invalid config JSON: %v", err))
		return 1
	}

	// Parse tool definitions from JSON
	type ToolDef struct {
		Name        string         `json:"name"`
		Description string         `json:"description"`
		Parameters  map[string]any `json:"parameters,omitempty"`
	}
	var toolDefs []ToolDef
	if err := json.Unmarshal([]byte(C.GoString(toolsJSON)), &toolDefs); err != nil {
		*errorOut = C.CString(fmt.Sprintf("Invalid tools JSON: %v", err))
		return 1
	}

	// Build Tool slice with handlers that call back to Rust
	var tools []copilot.Tool
	for _, td := range toolDefs {
		toolName := td.Name
		tools = append(tools, copilot.Tool{
			Name:        td.Name,
			Description: td.Description,
			Parameters:  td.Parameters,
			Handler: func(inv copilot.ToolInvocation) (copilot.ToolResult, error) {
				toolCallbackMu.Lock()
				cb := toolCallback
				toolCallbackMu.Unlock()

				if cb == nil {
					return copilot.ToolResult{}, fmt.Errorf("no tool callback registered")
				}

				argsJSON, _ := json.Marshal(inv.Arguments)
				cSid := C.CString(inv.SessionID)
				cName := C.CString(toolName)
				cArgs := C.CString(string(argsJSON))

				result := C.call_tool_callback(cb, cSid, cName, cArgs)

				C.free(unsafe.Pointer(cSid))
				C.free(unsafe.Pointer(cName))
				C.free(unsafe.Pointer(cArgs))

				if result == nil {
					return copilot.ToolResult{}, fmt.Errorf("tool callback returned nil")
				}
				goResult := C.GoString(result)
				C.free(unsafe.Pointer(result))

				return copilot.ToolResult{
					TextResultForLLM: goResult,
					ResultType:       "success",
				}, nil
			},
		})
	}

	sessionCfg := &copilot.SessionConfig{
		Model:               cfg.Model,
		WorkingDirectory:    cfg.WorkingDirectory,
		ConfigDir:           configDir(),
		Tools:               tools,
		OnPermissionRequest: copilot.PermissionHandler.ApproveAll,
	}

	if cfg.SystemPrompt != "" {
		sessionCfg.SystemMessage = &copilot.SystemMessageConfig{
			Mode:    "replace",
			Content: cfg.SystemPrompt,
		}
	}

	if cfg.CustomAgent != "" {
		sessionCfg.CustomAgents = []copilot.CustomAgentConfig{
			{
				Name:   cfg.CustomAgent,
				Prompt: cfg.SystemPrompt,
				Infer:  boolPtr(true),
			},
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	session, err := client.CreateSession(ctx, sessionCfg)
	if err != nil {
		*errorOut = C.CString(fmt.Sprintf("Failed to create session: %v", err))
		return 1
	}

	sessionsMu.Lock()
	sessions[session.SessionID] = session
	sessionsMu.Unlock()

	*sessionIDOut = C.CString(session.SessionID)
	return 0
}

//export copilot_send_with_tools
func copilot_send_with_tools(sessionID *C.char, prompt *C.char, timeoutSecs C.int, responseOut **C.char, errorOut **C.char) C.int {
	return copilot_send_and_wait(sessionID, prompt, timeoutSecs, responseOut, errorOut)
}

//export copilot_set_tool_callback
func copilot_set_tool_callback(cb C.tool_callback_t) {
	toolCallbackMu.Lock()
	toolCallback = cb
	toolCallbackMu.Unlock()
}

//export copilot_destroy_session
func copilot_destroy_session(sessionID *C.char) {
	sid := C.GoString(sessionID)

	sessionsMu.Lock()
	session, ok := sessions[sid]
	if ok {
		delete(sessions, sid)
	}
	sessionsMu.Unlock()

	if ok {
		session.Disconnect()
	}
}

//export copilot_list_models
func copilot_list_models(jsonOut **C.char, errorOut **C.char) C.int {
	clientMu.Lock()
	client := globalClient
	clientMu.Unlock()

	if client == nil {
		*errorOut = C.CString("Client not initialized")
		return 1
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	models, err := client.ListModels(ctx)
	if err != nil {
		*errorOut = C.CString(fmt.Sprintf("Failed to list models: %v", err))
		return 1
	}

	type modelOut struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	var out []modelOut
	for _, m := range models {
		out = append(out, modelOut{ID: m.ID, Name: m.Name})
	}

	data, err := json.Marshal(out)
	if err != nil {
		*errorOut = C.CString(fmt.Sprintf("JSON marshal failed: %v", err))
		return 1
	}

	*jsonOut = C.CString(string(data))
	return 0
}

//export copilot_free_string
func copilot_free_string(s *C.char) {
	if s != nil {
		C.free(unsafe.Pointer(s))
	}
}

func boolPtr(b bool) *bool {
	return &b
}

func main() {}
