#!/usr/bin/env python3
"""Stop a launcher recorded by scripts/dev.py, after checking its command identity."""
import argparse,json,os,pathlib,signal,subprocess,sys
p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=3000);args=p.parse_args()
root=pathlib.Path(__file__).resolve().parent.parent;state=root/'.local'/('server-%s.json'%args.port)
if not state.exists():sys.exit('No managed launcher record for that port. Stop the foreground launcher with Ctrl-C.')
d=json.loads(state.read_text());pid=int(d['launcherPid']);cmd=subprocess.run(['ps','-p',str(pid),'-o','args='],capture_output=True,text=True).stdout
if 'scripts/dev.py' not in cmd or d.get('root')!=str(root):sys.exit('Recorded process no longer matches this workspace; nothing stopped.')
os.kill(pid,signal.SIGTERM);print('Stopped the Further launcher on port',args.port)
