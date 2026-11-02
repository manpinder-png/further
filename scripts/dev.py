#!/usr/bin/env python3
"""Run the complete local workspace. Secrets remain in child-process environment."""
import argparse,json,os,pathlib,shutil,signal,subprocess,sys,urllib.request
from launcher_env import load_environment
ROOT=pathlib.Path(__file__).resolve().parent.parent
os.chdir(ROOT)
p=argparse.ArgumentParser();p.add_argument('--fixture',action='store_true');p.add_argument('--port',type=int,default=3000);p.add_argument('--no-embeddings',action='store_true');p.add_argument('--production',action='store_true')
storage=p.add_mutually_exclusive_group();storage.add_argument('--aws',action='store_true',help='Use the deployed AWS data/auth/media layer');storage.add_argument('--local',action='store_true',help='Use isolated local data/auth/media (default)');args=p.parse_args()
env=os.environ.copy();env['NEXT_TELEMETRY_DISABLED']='1';env['FURTHER_MODEL_MODE']='fixture' if args.fixture else 'live'
node=shutil.which('node')
if not node or '/Applications/ChatGPT.app/' in node:
    candidates=sorted(ROOT.glob('.local/tools/node-*/bin/node'));node=str(candidates[-1]) if candidates else node
if not node:sys.exit('Install Node 24 LTS, then run npm ci. See docs/ONBOARDING.md.')
version=subprocess.run([node,'--version'],capture_output=True,text=True)
if not version.stdout.startswith('v24.'):sys.exit('Use Node 24 LTS for this snapshot, then run npm ci.')
env['PATH']=str(pathlib.Path(node).parent)+os.pathsep+env.get('PATH','')
try:env=load_environment(node,ROOT,env,args.production)
except (RuntimeError,ValueError) as error:sys.exit(str(error))
if args.aws:
    if args.fixture:sys.exit('--fixture must use local storage; omit --aws.')
    config_path=ROOT/'.local/aws.json'
    if not config_path.exists():sys.exit('Missing .local/aws.json. Run python3 scripts/configure-aws.py after deployment.')
    cloud=json.loads(config_path.read_text());db=cloud['database'];auth=cloud['cognito']
    env.update({'FURTHER_DATA_BACKEND':'aurora-data-api','FURTHER_AUTH_PROVIDER':'cognito','FURTHER_ENABLE_LOCAL_PROFILES':'0',
        'AWS_PROFILE':cloud.get('profile','groundlab'),'AWS_REGION':cloud['region'],'FURTHER_AWS_REGION':cloud['region'],
        'FURTHER_AURORA_RESOURCE_ARN':db['resourceArn'],'FURTHER_AURORA_SECRET_ARN':db['secretArn'],'FURTHER_AURORA_DATABASE':db['name'],
        'FURTHER_COGNITO_USER_POOL_ID':auth['userPoolId'],'FURTHER_COGNITO_CLIENT_ID':auth['clientId'],'FURTHER_COGNITO_DOMAIN':auth['domain'],
        'FURTHER_COGNITO_FACEBOOK_CONFIGURED':str(auth['facebookConfigured']).lower(),'FURTHER_MEDIA_BUCKET':cloud['media']['bucket']})
else:
    # Explicitly isolate rehearsals from inherited cloud configuration, including .env.local.
    env['FURTHER_DATA_BACKEND']='pglite';env['FURTHER_AUTH_PROVIDER']='local'
if not args.fixture:
    config=ROOT/'.local/providers.json'
    if config.exists() and shutil.which('security',path=env['PATH']):
        for provider,item in json.loads(config.read_text()).items():
            variable={'meta':'MODEL_API_KEY','baseten':'BASETEN_API_KEY'}.get(provider)
            if variable and not env.get(variable):
                result=subprocess.run(['security','find-generic-password','-s',item['service'],'-a',item['account'],'-w'],capture_output=True,text=True)
                if result.returncode==0:env[variable]=result.stdout.strip()
    if not (env.get('META_API_KEY') or env.get('MODEL_API_KEY')):sys.exit('Meta key is not configured. Set MODEL_API_KEY in .env.local or your environment. Use --fixture for an explicit offline rehearsal.')
    env.setdefault('FURTHER_METADATA_PROVIDER','baseten' if env.get('BASETEN_API_KEY') else 'meta')
# Unrelated OpenAI inference configuration is never needed by this project.
for key in ['OPENAI_API_KEY','OPENAI_BASE_URL','OPENAI_ORG_ID','OPENAI_PROJECT_ID']:env.pop(key,None)
children=[]
run_file=ROOT/'.local'/('server-%s.json'%args.port)
run_file.parent.mkdir(parents=True,exist_ok=True)
run_file.write_text(json.dumps({'launcherPid':os.getpid(),'port':args.port,'mode':env['FURTHER_MODEL_MODE'],'dataBackend':env['FURTHER_DATA_BACKEND'],'root':str(ROOT)}))
run_file.chmod(0o600)
def stop(*_):
    for child in reversed(children):
        if child.poll() is None:child.terminate()
    for child in reversed(children):
        try:child.wait(timeout=10)
        except subprocess.TimeoutExpired:child.kill()
    try:
        if json.loads(run_file.read_text()).get('launcherPid')==os.getpid():run_file.unlink()
    except (OSError,ValueError):pass
for s in [signal.SIGTERM,signal.SIGINT]:signal.signal(s,lambda *_:(stop(),sys.exit(0)))
try:
    if not args.no_embeddings:
        try:
            with urllib.request.urlopen('http://127.0.0.1:8767/health',timeout=1) as r:ready=json.load(r).get('status')=='ready'
        except Exception:ready=False
        if not ready:
            py=ROOT/'.local/embedding-venv/bin/python'
            if not py.exists():sys.exit('Run the embedding setup in docs/LOCAL_DEVELOPMENT.md, or explicitly use --no-embeddings.')
            embedding_env={key:value for key,value in env.items() if key not in ['MODEL_API_KEY','META_API_KEY','BASETEN_API_KEY','META_ACCESS_TOKEN','HF_TOKEN','HUGGING_FACE_HUB_TOKEN','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REDIRECT_URI']}
            children.append(subprocess.Popen([str(py),'domains/retrieval/embedding_service.py','--port','8767'],env=embedding_env))
    command=[node,'node_modules/next/dist/bin/next','start' if args.production else 'dev','--hostname','127.0.0.1','--port',str(args.port)]
    print('Further: http://127.0.0.1:%s | model mode: %s | data/auth/media: %s'%(args.port,env['FURTHER_MODEL_MODE'],'AWS' if args.aws else 'local'),flush=True)
    children.append(subprocess.Popen(command,env=env));sys.exit(children[-1].wait())
finally:stop()
