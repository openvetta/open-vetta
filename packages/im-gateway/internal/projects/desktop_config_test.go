package projects

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeConfig(t *testing.T, dir, content string) string {
	t.Helper()
	path := filepath.Join(dir, "desktop-config.json")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestDesktopConfigDirectory_MissingFile(t *testing.T) {
	dir := NewDesktopConfigDirectory(filepath.Join(t.TempDir(), "missing.json"))
	got, err := dir.List(context.Background())
	if err != nil {
		t.Fatalf("missing file should yield empty list, not error: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("expected empty list, got %d", len(got))
	}
}

func TestDesktopConfigDirectory_EmptyProjects(t *testing.T) {
	tmp := t.TempDir()
	path := writeConfig(t, tmp, `{"projects": []}`)
	dir := NewDesktopConfigDirectory(path)
	got, err := dir.List(context.Background())
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("expected empty list, got %d", len(got))
	}
}

func TestDesktopConfigDirectory_ListWithNamedAndUnnamed(t *testing.T) {
	tmp := t.TempDir()
	path := writeConfig(t, tmp, `{
  "projects": [
    {"path": "/Users/me/code/foo", "name": "Foo Project"},
    {"path": "/Users/me/code/bar"}
  ]
}`)
	dir := NewDesktopConfigDirectory(path)
	got, err := dir.List(context.Background())
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("want 2 projects, got %d", len(got))
	}
	// Named project keeps its explicit name
	if got[0].Name != "Foo Project" {
		t.Errorf("first project name: %q", got[0].Name)
	}
	// Unnamed project falls back to basename
	if got[1].Name != "bar" {
		t.Errorf("second project should default to basename, got %q", got[1].Name)
	}
	// IDs are stable hashes (16 hex chars)
	for _, p := range got {
		if len(p.ID) != 16 {
			t.Errorf("project ID should be 16 hex chars, got %q", p.ID)
		}
	}
	// Different paths produce different IDs
	if got[0].ID == got[1].ID {
		t.Error("different paths should produce different IDs")
	}
}

func TestDesktopConfigDirectory_IDStableAcrossNameRename(t *testing.T) {
	tmp := t.TempDir()
	path := writeConfig(t, tmp, `{"projects":[{"path":"/code/foo","name":"Foo"}]}`)
	dir := NewDesktopConfigDirectory(path)
	first, _ := dir.List(context.Background())

	// Rewrite with a different display name but same path
	if err := os.WriteFile(path, []byte(`{"projects":[{"path":"/code/foo","name":"Foo Renamed"}]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	second, _ := dir.List(context.Background())

	if first[0].ID != second[0].ID {
		t.Error("ID must remain stable across name changes — that's the point of hashing the path")
	}
	if second[0].Name != "Foo Renamed" {
		t.Errorf("display name not refreshed: %q", second[0].Name)
	}
}

func TestDesktopConfigDirectory_HotReload(t *testing.T) {
	tmp := t.TempDir()
	path := writeConfig(t, tmp, `{"projects":[{"path":"/a","name":"a"}]}`)
	dir := NewDesktopConfigDirectory(path)

	first, _ := dir.List(context.Background())
	if len(first) != 1 {
		t.Fatalf("first list: %d", len(first))
	}

	// Simulate desktop-app adding a project; List() should pick it up
	// without restart.
	if err := os.WriteFile(path, []byte(`{"projects":[{"path":"/a","name":"a"},{"path":"/b","name":"b"}]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	second, _ := dir.List(context.Background())
	if len(second) != 2 {
		t.Errorf("hot reload failed: got %d", len(second))
	}
}

func TestDesktopConfigDirectory_Resolve_ByName(t *testing.T) {
	tmp := t.TempDir()
	path := writeConfig(t, tmp, `{"projects":[
		{"path":"/code/foo","name":"Foo"},
		{"path":"/code/bar","name":"Bar"}
	]}`)
	dir := NewDesktopConfigDirectory(path)

	got, err := dir.Resolve(context.Background(), "Foo")
	if err != nil {
		t.Fatalf("Resolve Foo: %v", err)
	}
	if got.Path != "/code/foo" {
		t.Errorf("Resolve returned wrong project: %+v", got)
	}
}

func TestDesktopConfigDirectory_Resolve_ByBasename(t *testing.T) {
	tmp := t.TempDir()
	path := writeConfig(t, tmp, `{"projects":[
		{"path":"/code/foo"},
		{"path":"/code/bar"}
	]}`)
	dir := NewDesktopConfigDirectory(path)

	got, err := dir.Resolve(context.Background(), "foo")
	if err != nil {
		t.Fatalf("Resolve basename: %v", err)
	}
	if got.Path != "/code/foo" {
		t.Errorf("got %+v", got)
	}
}

func TestDesktopConfigDirectory_Resolve_NotFound(t *testing.T) {
	tmp := t.TempDir()
	path := writeConfig(t, tmp, `{"projects":[{"path":"/code/foo","name":"Foo"}]}`)
	dir := NewDesktopConfigDirectory(path)

	_, err := dir.Resolve(context.Background(), "nope")
	if !errors.Is(err, ErrProjectNotFound) {
		t.Errorf("expected ErrProjectNotFound, got %v", err)
	}
}

func TestDesktopConfigDirectory_Resolve_AmbiguousBasename(t *testing.T) {
	tmp := t.TempDir()
	// Two projects with the same basename — neither has an explicit name.
	path := writeConfig(t, tmp, `{"projects":[
		{"path":"/work/code/foo"},
		{"path":"/personal/code/foo"}
	]}`)
	dir := NewDesktopConfigDirectory(path)

	_, err := dir.Resolve(context.Background(), "foo")
	if err == nil || errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("expected ambiguous error, got %v", err)
	}
	if !strings.Contains(err.Error(), "ambiguous") {
		t.Errorf("error should mention ambiguity, got: %v", err)
	}
}

func TestDesktopConfigDirectory_Resolve_NamedTakesPrecedenceOverBasename(t *testing.T) {
	tmp := t.TempDir()
	// One project named "foo" explicitly + another whose basename is "foo".
	// The lookup for "foo" should match the explicitly-named one only,
	// not return ambiguous.
	path := writeConfig(t, tmp, `{"projects":[
		{"path":"/code/something","name":"foo"},
		{"path":"/elsewhere/foo"}
	]}`)
	dir := NewDesktopConfigDirectory(path)

	got, err := dir.Resolve(context.Background(), "foo")
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if got.Path != "/code/something" {
		t.Errorf("named match should win, got %+v", got)
	}
}

func TestDesktopConfigDirectory_MalformedJSON(t *testing.T) {
	tmp := t.TempDir()
	path := writeConfig(t, tmp, `not json`)
	dir := NewDesktopConfigDirectory(path)
	_, err := dir.List(context.Background())
	if err == nil {
		t.Fatal("expected parse error for malformed JSON")
	}
}

func TestDesktopConfigDirectory_SkipsEmptyPathEntries(t *testing.T) {
	tmp := t.TempDir()
	path := writeConfig(t, tmp, `{"projects":[
		{"path":"/code/foo","name":"Foo"},
		{"path":"","name":"WatchOut"}
	]}`)
	dir := NewDesktopConfigDirectory(path)
	got, err := dir.List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Errorf("expected entries with empty path to be skipped, got %d", len(got))
	}
}
