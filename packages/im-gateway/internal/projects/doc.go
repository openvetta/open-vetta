// Package projects defines the ProjectDirectory interface and its
// implementations (DesktopConfigDirectory in Milestone B).
//
// # Boundary rules
//
//   - The first-milestone implementation reads ~/.vetta/desktop-config.json
//     directly. desktop-app already writes that file atomically (commit
//     b78dec5), so a concurrent reader will always see a consistent JSON
//     blob — never a torn write.
//   - Project IDs MUST be derived from the absolute path so renames in
//     the desktop app don't break (im_user, project) routing entries.
//   - This package MUST NOT cache the project list across calls; List()
//     re-reads the file every time so newly added desktop projects show up
//     immediately in /projects without restarting the gateway.
//
// # Future implementations
//
//   - ServerProjectDirectory: pulls from a central registry for the
//     enterprise mode. Same interface, different source.
package projects
