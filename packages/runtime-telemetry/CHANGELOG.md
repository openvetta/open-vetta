# Changelog

## [Unreleased]

### Added

- 新增平台无关 `RuntimeTracer` / `RuntimeObservation` tracing 契约，并提供基于 Langfuse JS/TS SDK v5 + OpenTelemetry 的 Langfuse exporter。
- `RuntimeObservationUpdate` 支持 `userId`、`sessionId`、`traceName`、`tags`、`version` 等 trace 归属字段；Langfuse exporter 会通过 attribute propagation 写入，支持 Langfuse Sessions 与 trace 维度聚合。
