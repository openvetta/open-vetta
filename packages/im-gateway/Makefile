.PHONY: build test run lint vet tidy clean

BIN_DIR := bin
BINARY  := $(BIN_DIR)/im-gateway

build:
	@mkdir -p $(BIN_DIR)
	go build -o $(BINARY) ./cmd/im-gateway

test:
	go test ./...

# Run with mock transport for local development
run:
	go run ./cmd/im-gateway start --transport mock

vet:
	go vet ./...

tidy:
	go mod tidy

# Requires golangci-lint installed: brew install golangci-lint
lint:
	golangci-lint run ./...

clean:
	rm -rf $(BIN_DIR) tmp coverage.out
