import argparse
import json
import sys
import time
from typing import Any

import httpx


def main() -> None:
    args = parse_args()
    input_data = json.loads(args.input_json)

    for run_index in range(1, args.runs + 1):
        started_at = time.perf_counter()
        result = run_prompt(
            base_url=args.base_url,
            provider=args.provider,
            model=args.model,
            prompt=args.prompt,
            input_data=input_data,
        )
        latency_ms = int((time.perf_counter() - started_at) * 1000)

        print(
            json.dumps(
                {
                    "runIndex": run_index,
                    "latencyMs": latency_ms,
                    **result,
                },
                sort_keys=True,
            )
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a small controlled benchmark against FlowPilot AI Orchestrator."
    )
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--provider", default="deterministic")
    parser.add_argument("--model", default="mock-flowpilot-llm")
    parser.add_argument("--prompt", default="Summarize this lead.")
    parser.add_argument("--input-json", default='{"leadId":"lead-1","source":"benchmark"}')

    return parser.parse_args()


def run_prompt(
    *,
    base_url: str,
    provider: str,
    model: str,
    prompt: str,
    input_data: dict[str, Any],
) -> dict[str, Any]:
    request_body = {
        "context": {
            "workspaceId": "benchmark-workspace",
            "workflowId": "benchmark-workflow",
            "executionId": "benchmark-execution",
            "nodeExecutionId": "benchmark-node-execution",
            "nodeId": "benchmark-ai-node",
            "correlationId": "benchmark",
        },
        "config": {
            "prompt": prompt,
            "provider": provider,
            "model": model,
            "temperature": 0,
        },
        "input": input_data,
    }

    try:
        response = httpx.post(
            f"{base_url.rstrip('/')}/v1/prompts/run",
            json=request_body,
            timeout=30,
        )
        response_body: Any = response.json()
    except httpx.HTTPError as error:
        return {
            "ok": False,
            "error": str(error),
        }
    except ValueError:
        return {
            "ok": False,
            "error": "Response body is not valid JSON",
        }

    if response.status_code >= 400:
        return {
            "ok": False,
            "statusCode": response.status_code,
            "error": response_body,
        }

    result = response_body.get("result") if isinstance(response_body, dict) else None

    if not isinstance(result, dict):
        return {
            "ok": False,
            "statusCode": response.status_code,
            "error": "Response body does not contain a result object",
        }

    return {
        "ok": True,
        "statusCode": response.status_code,
        "provider": result.get("provider"),
        "model": result.get("model"),
        "tokens": result.get("tokens"),
        "trace": result.get("trace"),
    }


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
