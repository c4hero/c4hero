# Oracle Validation Mode Decision

## Probe Output
`java -version` output:
```
openjdk version "25.0.2" 2026-01-20
OpenJDK Runtime Environment (build 25.0.2+10-69)
OpenJDK 64-Bit Server VM (build 25.0.2+10-69, mixed mode, sharing)
```

## Decision
As per lane requirements (container-pile rule: docker = fallback ONLY, --restart never), the sidecar java child-process is PREFERRED for performance and reduced layers. However, since the Structurizr CLI JAR might not be present on the host environment (or its path isn't strictly known), the `oracle.ts` implementation will implement a smart fallback:
1. Try Java sidecar (via `STRUCTURIZR_CLI_PATH` env var or `structurizr` command).
2. Fallback to `docker run --rm ... structurizr/structurizr` one-shot container.
