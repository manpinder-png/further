#!/usr/bin/env python3
"""Read only safe deployment outputs; never retrieve a database/provider secret."""
import argparse,json,os,pathlib,shutil,subprocess,sys

ROOT=pathlib.Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser()
p.add_argument('--profile',default='groundlab');p.add_argument('--region',default='us-east-1')
p.add_argument('--stack',default='further-dev');p.add_argument('--account',required=True,help='Expected shared AWS account ID supplied by the project owner')
args=p.parse_args()
aws=shutil.which('aws')
if not aws:
    bundled=ROOT/'.local/tools/aws-cli/unpacked/aws-cli.pkg/Payload/aws-cli/aws'
    if bundled.exists():aws=str(bundled)
if not aws:sys.exit('Install AWS CLI v2 and authenticate with aws login --profile groundlab.')
def call(*arguments):
    r=subprocess.run([aws,*arguments,'--profile',args.profile,'--region',args.region,'--no-cli-pager','--output','json'],capture_output=True,text=True)
    if r.returncode:sys.exit('AWS request failed. Check the named profile, session and region. '+r.stderr.strip())
    return json.loads(r.stdout)
identity=call('sts','get-caller-identity')
if identity['Account']!=args.account:sys.exit('AWS account does not match the intended deployment; configuration was not written.')
stack=call('cloudformation','describe-stacks','--stack-name',args.stack)['Stacks'][0]
if stack['StackStatus'] not in ('CREATE_COMPLETE','UPDATE_COMPLETE'):sys.exit('Stack is not ready: '+stack['StackStatus'])
outputs={o['OutputKey']:o['OutputValue'] for o in stack['Outputs']}
config={'region':outputs['AwsRegion'],'profile':args.profile,'expectedAccount':identity['Account'],'stackName':args.stack,
    'dataBackend':'aurora-data-api','authProvider':'cognito',
    'database':{'resourceArn':outputs['DatabaseClusterArn'],'secretArn':outputs['DatabaseSecretArn'],'name':outputs['DatabaseName']},
    'cognito':{'userPoolId':outputs['UserPoolId'],'clientId':outputs['UserPoolClientId'],'domain':outputs['CognitoDomain'],'facebookConfigured':outputs['FacebookConfigured']=='true'},
    'media':{'bucket':outputs['MediaBucketName']}}
destination=ROOT/'.local/aws.json';destination.parent.mkdir(parents=True,exist_ok=True)
fd=os.open(destination,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
with os.fdopen(fd,'w') as f:json.dump(config,f,indent=2);f.write('\n')
destination.chmod(0o600)
print('Configured AWS data, Cognito and media from the completed stack in account '+identity['Account']+'.')
print('Run: python3 scripts/dev.py --aws')
