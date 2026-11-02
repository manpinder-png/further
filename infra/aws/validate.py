"""Local syntax/schema and project security validation. Does not call AWS."""
from pathlib import Path
import json, shutil, subprocess, sys
root=Path(__file__).resolve().parents[2]
output=root/'.local/aws-validation';output.mkdir(parents=True,exist_ok=True)
template=root/'infra/aws/further-dev.json'
json.loads(template.read_text())
def tool(name):
 local=output/'bin'/name
 found=str(local) if local.exists() else shutil.which(name)
 if not found:raise SystemExit(f'{name} is missing. See docs/AWS_DEPLOYMENT.md for validation tool setup.')
 return found
lint=subprocess.run([tool('cfn-lint'),'--format','json','--regions','us-east-1','-t',str(template)],capture_output=True,text=True)
(output/'lint.json').write_text(lint.stdout)
if lint.returncode:print(lint.stdout);print(lint.stderr,file=sys.stderr);raise SystemExit(lint.returncode)
guard=subprocess.run([tool('cfn-guard'),'validate','--data',str(template),'--rules',str(root/'infra/aws/security.guard'),'--output-format','json','--show-summary','none'],capture_output=True,text=True)
(output/'guard.json').write_text(guard.stdout)
if guard.returncode:print(guard.stdout);print(guard.stderr,file=sys.stderr);raise SystemExit(guard.returncode)
report=json.loads(guard.stdout)
if report.get('status')!='PASS':raise SystemExit('Guard did not report PASS.')
# Prove that the selected guard suite catches material configuration regressions.
unsafe=json.loads(template.read_text());unsafe['Resources']['DatabaseWriter']['Properties']['PubliclyAccessible']=True
unversioned=json.loads(template.read_text());del unversioned['Resources']['FacebookIdentityProvider']['Properties']['ProviderDetails']['api_version']
for name,fixture in [('public-database',unsafe),('unversioned-facebook',unversioned)]:
 negative=output/f'{name}-validation-fixture.json';negative.write_text(json.dumps(fixture))
 rejected=subprocess.run([tool('cfn-guard'),'validate','--data',str(negative),'--rules',str(root/'infra/aws/security.guard'),'--output-format','json','--show-summary','none'],capture_output=True,text=True)
 (output/f'guard-negative-{name}.json').write_text(rejected.stdout)
 if json.loads(rejected.stdout).get('status')!='FAIL':raise SystemExit(f'Negative check failed: {name} was not rejected.')
print('CloudFormation: zero schema findings; eight security rules pass; public-database and unversioned-Facebook negative fixtures are rejected.')
