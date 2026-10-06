"""CLI.

python -m tunewick_audio process <master> --out <dir> [--report report.json]
python -m tunewick_audio worker [--once] [--poll 5]   (queue in Supabase, files in S3/R2)
"""

from __future__ import annotations

import argparse
import json
import logging
import sys

from .pipeline import process


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="tunewick_audio")
    commands = parser.add_subparsers(dest="command", required=True)
    run = commands.add_parser("process", help="validate, analyse and transcode one master")
    run.add_argument("master")
    run.add_argument("--out", required=True, help="directory for the delivery variants")
    run.add_argument("--report", help="write the JSON report here instead of stdout")
    worker = commands.add_parser("worker", help="process uploaded masters from the queue")
    worker.add_argument("--once", action="store_true", help="process at most one job and exit")
    worker.add_argument("--poll", type=float, default=5.0, help="seconds between empty polls")
    args = parser.parse_args(argv)

    if args.command == "worker":
        from .jobs import run_forever, run_once
        from .services import S3Storage, SupabaseQueue

        logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)
        for noisy in ("httpx", "botocore", "boto3", "urllib3"):
            logging.getLogger(noisy).setLevel(logging.WARNING)
        queue, storage = SupabaseQueue.from_env(), S3Storage.from_env()
        if args.once:
            run_once(queue, storage)
        else:
            run_forever(queue, storage, args.poll)
        return 0

    report = process(args.master, args.out)
    text = json.dumps(report, indent=2)
    if args.report:
        with open(args.report, "w", encoding="utf-8") as handle:
            handle.write(text + "\n")
    else:
        print(text)
    return 0 if report["status"] == "accepted" else 2


if __name__ == "__main__":
    sys.exit(main())
