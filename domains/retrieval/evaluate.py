"""Run the synthetic retrieval smoke set against the actual local Meta encoder.

Only synthetic passages are submitted. Output contains no tokens or credentials.
"""
from pathlib import Path
import argparse, hashlib, json, math, urllib.request
ROOT = Path(__file__).resolve().parents[2]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output')
    parser.add_argument('--dataset')
    parser.add_argument('--center-reference')
    args = parser.parse_args()
    data = json.loads((Path(args.dataset) if args.dataset else Path(__file__).with_name('evaluation.json')).read_text())
    token = (ROOT / '.local/embedding-token').read_text().strip()
    texts = [p['text'] for p in data['passages']] + [q['text'] for q in data['queries']]
    vectors = []; response = None
    for offset in range(0,len(texts),16):
        request = urllib.request.Request('http://127.0.0.1:8767/embed', data=json.dumps({'texts':texts[offset:offset+16]}).encode(), headers={'Content-Type':'application/json','Authorization':'Bearer '+token})
        response = json.load(urllib.request.urlopen(request,timeout=60)); vectors.extend(response['vectors'])
    input_space = response['revision']; output_space = input_space
    if args.center_reference:
        if 'refmean' in response['revision']:
            raise ValueError('The sidecar already applies reference centering; do not apply it twice')
        reference = json.loads(Path(args.center_reference).read_text()); mean = reference['mean']
        transformed = []
        for vector in vectors:
            centered = [x-y for x,y in zip(vector,mean)]; norm = math.sqrt(sum(x*x for x in centered))
            transformed.append([x/norm for x in centered])
        vectors = transformed
        output_space = input_space + ':fixed-reference-mean-l2:' + hashlib.sha256(Path(args.center_reference).read_bytes()).hexdigest()
    passages = vectors[:len(data['passages'])]; queries = vectors[len(data['passages']):]
    def cosine(a,b): return sum(x*y for x,y in zip(a,b))/(math.sqrt(sum(x*x for x in a))*math.sqrt(sum(y*y for y in b)))
    results = []
    for query,vec in zip(data['queries'],queries):
        ranked = sorted([{'id':p['id'],'similarity':cosine(vec,pvec)} for p,pvec in zip(data['passages'],passages)],key=lambda item:-item['similarity'])
        rank = next(i+1 for i,item in enumerate(ranked) if item['id']==query['expected'])
        results.append({'query':query['text'],'expected':query['expected'],'rank':rank,'top':ranked[:3],'margin':ranked[0]['similarity']-ranked[1]['similarity']})
    report = {'model':response['model'],'inputSpace':input_space,'outputSpace':output_space,'revision':output_space,'centeringReference':args.center_reference,'description':data['description'],'queries':len(results),'recallAt1':sum(r['rank']<=1 for r in results)/len(results),'recallAt3':sum(r['rank']<=3 for r in results)/len(results),'results':results}
    if args.output:
        path = Path(args.output); path.parent.mkdir(parents=True,exist_ok=True); path.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))

if __name__=='__main__': main()
