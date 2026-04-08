// Command im-gateway is the entry point for the IM gateway sidecar process.
//
// Subcommands:
//
//	im-gateway init      Generate ~/.vetta/im-gateway/config.yaml + credentials.yaml
//	im-gateway start     Connect to the configured IM and start serving (Milestone F)
//	im-gateway status    Print connection / pool status of a running gateway (Milestone F)
//	im-gateway logs      Tail ~/.vetta/im-gateway/logs/im-gateway.log (Milestone F)
//
// In Milestone B only `init` is fully implemented; the other subcommands
// print a "not implemented yet" message and exit non-zero so the dispatch
// table is exercised end-to-end.
package main

import (
	"errors"
	"fmt"
	"os"

	"vetta-im-gateway/internal/config"
)

func main() {
	if len(os.Args) < 2 {
		printUsage(os.Stderr)
		os.Exit(2)
	}

	cmd := os.Args[1]
	args := os.Args[2:]

	switch cmd {
	case "init":
		os.Exit(runInit(args))
	case "start":
		fmt.Fprintln(os.Stderr, "im-gateway start: not implemented yet (planned for Milestone F)")
		os.Exit(64)
	case "status":
		fmt.Fprintln(os.Stderr, "im-gateway status: not implemented yet (planned for Milestone F)")
		os.Exit(64)
	case "logs":
		fmt.Fprintln(os.Stderr, "im-gateway logs: not implemented yet (planned for Milestone F)")
		os.Exit(64)
	case "-h", "--help", "help":
		printUsage(os.Stdout)
		os.Exit(0)
	default:
		fmt.Fprintf(os.Stderr, "im-gateway: unknown subcommand %q\n\n", cmd)
		printUsage(os.Stderr)
		os.Exit(2)
	}
}

func runInit(args []string) int {
	_ = args // no flags yet; --force / --path planned for Milestone F

	configPath, credentialsPath, err := config.GenerateTemplate()
	if errors.Is(err, config.ErrAlreadyInitialized) {
		fmt.Fprintf(os.Stderr, "im-gateway: %s already exists; refusing to overwrite\n", configPath)
		fmt.Fprintln(os.Stderr, "edit it directly, or remove it first if you want a fresh template")
		return 1
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "im-gateway init: %v\n", err)
		return 1
	}

	fmt.Printf("Created %s\n", configPath)
	if credentialsPath != "" {
		fmt.Printf("Created %s (chmod 0600)\n", credentialsPath)
	}
	fmt.Println()
	fmt.Println("Next steps:")
	fmt.Println("  1. Edit the config to choose a transport (mock / feishu)")
	fmt.Println("  2. For feishu: fill in credentials.yaml or run")
	fmt.Println("       keyring set vetta-im-gateway feishu_app_id")
	fmt.Println("       keyring set vetta-im-gateway feishu_app_secret")
	fmt.Println("  3. Run: im-gateway start")
	return 0
}

func printUsage(w *os.File) {
	fmt.Fprintln(w, "usage: im-gateway <command> [args]")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Commands:")
	fmt.Fprintln(w, "  init      Generate config + credentials templates at ~/.vetta/im-gateway/")
	fmt.Fprintln(w, "  start     Run the gateway (not yet implemented)")
	fmt.Fprintln(w, "  status    Show running gateway status (not yet implemented)")
	fmt.Fprintln(w, "  logs      Tail gateway logs (not yet implemented)")
	fmt.Fprintln(w, "  help      Print this message")
}
