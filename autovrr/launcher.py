"""Run the Discord bot and the guest parking web page in one container.

Both share vrr.py and its Chromium install, so they ship in one image.
Exits non-zero as soon as either child dies so restart=unless-stopped
brings the whole container back.
"""

import subprocess
import sys
import time

CHILDREN = [
    ["python", "-u", "bot.py"],
    ["uvicorn", "web:app", "--host", "0.0.0.0", "--port", "8003"],
]

procs = [subprocess.Popen(cmd) for cmd in CHILDREN]
names = [cmd[1] for cmd in CHILDREN]

while True:
    for name, proc in zip(names, procs):
        if proc.poll() is not None:
            print(f"{name} exited with {proc.returncode} - shutting down", flush=True)
            for other in procs:
                if other.poll() is None:
                    other.terminate()
            sys.exit(1)
    time.sleep(2)
