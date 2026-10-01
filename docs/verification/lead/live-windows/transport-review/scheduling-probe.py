import asyncio, importlib.util, json, sys
from pathlib import Path
root=Path(sys.argv[1]); sys.path.insert(0,str(root))
spec=importlib.util.spec_from_file_location('owned_live_test_helpers',root/'services/worker/connectors/tests/test_chatgpt_live.py')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
async def check():
    policy={'max_submissions':60,'max_session_ms':1800000,'min_observation_interval_ms':30000}
    result={}
    async with m.bridge(start_params=m.start(policy=policy),clock=m.Clock()) as c:
        result['configured_policy']=policy
        result['start_result']=c.started
        result['configured_bounds_honored']=(c.started.get('result',{}).get('remaining_submissions')==60 and c.started.get('result',{}).get('expires_in_ms')==1800000)
        c.client.release.clear()
        focus=await c.send('companion/turn',m.turn('focus-at-3'))
        await asyncio.wait_for(c.client.sent.wait(),1)
        observation=await c.send('companion/turn',m.turn('observation-at-4',4,'observation'))
        c.client.release.set()
        answer=await c.receive(focus)
        observed=await c.receive(observation)
        result['focus_completed_with_newer_observation']='result' in answer
        result['focus_reply']={k:v for k,v in answer.items() if k!='result'} if 'error' in answer else {'kind':answer['result']['kind'],'frame_seq':answer['result']['provenance']['context']['frame_seq']}
        result['observation_completed']='result' in observed
        result['turn_writes']=c.client.turn_writes
        result['max_running']=c.client.max_running
    return result
output=asyncio.run(check())
Path(sys.argv[2]).write_text(json.dumps({'scope':'synthetic actual bridge/Learning, no account/model/capture','candidate_root':str(root),**output},indent=2)+'\n')
print(json.dumps(output,indent=2))
