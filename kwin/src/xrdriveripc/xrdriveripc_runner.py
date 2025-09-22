#!/usr/bin/env python3
"""Wrapper script invoked by xrdriveripc.cpp via QProcess.

It reads environment variables to determine which XRDriverIPC method to call
and prints the JSON-serialized result to stdout, mirroring the prior inline
python one-liner implementation.
"""

from __future__ import annotations

import logging
import json
import os
import sys
import traceback
from logging.handlers import TimedRotatingFileHandler

state_home = os.environ.get('XDG_STATE_HOME', '~/.local/state')
state_dir = os.path.expanduser(state_home)
breezy_state_dir = os.path.join(state_dir, 'breezy_kwin')
log_dir = os.path.join(breezy_state_dir, 'logs')
os.makedirs(log_dir, exist_ok=True)

logger = logging.getLogger('xrdriveripc')
logger.setLevel(logging.INFO)
logname = os.path.join(log_dir, "xrdriveripc.log")
handler = TimedRotatingFileHandler(logname, when="midnight", backupCount=30)
handler.suffix = "%Y%m%d"
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)

class Logger:
	def info(self, *args, **kwargs):
		logger.info(*args, **kwargs)

	def error(self, *args, **kwargs):
		logger.error(*args, **kwargs)


def main() -> int:
	# Ensure the current directory (where xrdriveripc.py lives) is in sys.path
	script_dir = os.path.dirname(os.path.abspath(__file__))
	if script_dir not in sys.path:
		sys.path.insert(0, script_dir)

	try:
		import xrdriveripc  # type: ignore
	except Exception as e:  # pragma: no cover - import failure path
		print("Failed to import xrdriveripc: %s" % e, file=sys.stderr)
		return 2

	method = os.environ.get("BREEZY_METHOD")
	if not method:
		print("BREEZY_METHOD not set", file=sys.stderr)
		return 2

	config_home = os.environ.get("BREEZY_CONFIG_HOME")
	inst = xrdriveripc.XRDriverIPC(logger=Logger(), config_home=config_home)

	arg = os.environ.get("BREEZY_ARG")
	payload_raw = os.environ.get("BREEZY_PAYLOAD")

	# Dispatch replicating previous inline logic
	try:
		if method == "retrieve_config":
			res = getattr(inst, method)(int(arg) if arg else 1)
		elif method in ("write_config", "write_control_flags") and payload_raw:
			res = getattr(inst, method)(json.loads(payload_raw))
		elif method in ("request_token", "verify_token") and arg:
			res = getattr(inst, method)(arg)
		else:
			res = getattr(inst, method)()
	except Exception:  # pragma: no cover - runtime failure path
		traceback.print_exc()
		return 3

	try:
		print(json.dumps(res))
	except Exception:  # pragma: no cover
		traceback.print_exc()
		return 3
	return 0


if __name__ == "__main__":  # pragma: no cover
	sys.exit(main())
