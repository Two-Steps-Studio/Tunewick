"""CLI: python -m tunewick_audio process <master> --out <dir> [--report report.json]"""

from __future__ import annotations

import argparse
import json
import sys

from .pipeline import process


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="tunewick_audio")
    commands = parser.add_subparsers(dest="command", required=True)
    run = commands.add_parser("process", help="validate, analyse and transcode one master")
    run.add_argument("master")
    run.add_argument("--out", required=True, help="directory for the delivery variants")
    run.add_argument("--report", help="write the JSON report here instead of stdout")
    args = parser.parse_args(argv)

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
