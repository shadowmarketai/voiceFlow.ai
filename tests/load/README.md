# Load Testing & Quality Harness

## Running load tests

```bash
# Install (once)
pip install locust

# Smoke — 10 users, 1 min
locust -f tests/load/locustfile.py \
  --host=https://voice.shadowmarket.ai \
  --users 10 --spawn-rate 2 -t 1m --headless

# Sustained — 500 users, 30 min, CSV output
locust -f tests/load/locustfile.py \
  --host=https://voice.shadowmarket.ai \
  --users 500 --spawn-rate 10 -t 30m --headless \
  --csv=reports/load

# Peak — 1000 users, 5 min
locust -f tests/load/locustfile.py \
  --host=https://voice.shadowmarket.ai \
  --users 1000 --spawn-rate 50 -t 5m --headless
```

The `locustfile.py` exits non-zero when any SLO is violated, so it plugs
straight into CI.

## Running the accuracy benchmark

```bash
# Uses data/benchmarks/manifest.json; writes results to DB
python scripts/benchmark_accuracy.py

# STT-only / TTS-only
python scripts/benchmark_accuracy.py --only stt
python scripts/benchmark_accuracy.py --only tts

# Preview without persisting
python scripts/benchmark_accuracy.py --dry-run --output /tmp/report.json
```

Scores (WER + TTS MOS) show up on the Quality Dashboard next refresh.

## Uptime monitor

Runs automatically in-process on API startup — see
`src/api/services/uptime_monitor.py`. To disable, set
`UPTIME_PROBE_ENABLED=false`. Interval is `UPTIME_PROBE_INTERVAL` (seconds,
default 60).

## Where the metrics end up

| Source                          | Table                     | Endpoint                          |
|---------------------------------|---------------------------|-----------------------------------|
| Provider probe (dashboard tick) | quality_provider_probes   | GET /api/v1/quality/providers     |
| Uptime monitor (cron)           | quality_uptime_probes     | GET /api/v1/quality/uptime        |
| Voice turn (live calls)         | quality_call_metrics      | GET /api/v1/quality/pipeline-latency + /trends |
| Accuracy benchmark (CLI)        | quality_call_metrics.wer/mos | GET /api/v1/quality/accuracy (future read-through) |
| Locust ingest                   | quality_call_metrics      | POST /api/v1/quality/ingest/call  |
