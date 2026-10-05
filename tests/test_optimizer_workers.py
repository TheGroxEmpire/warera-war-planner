import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class OptimizerWorkerTest(unittest.TestCase):
    def run_js(self, source):
        result = subprocess.run(['node', '-e', source], cwd=ROOT, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_versioned_workers_finish_search_and_refinement_with_continuous_progress(self):
        result = self.run_js('''
            const fs=require('fs'), vm=require('vm');require('./static/optimizer-core.js');
            const urls=[], imports=[], messages=[], progress=[];
            class Worker {
                constructor(url) {
                    urls.push(url);this.closed=false;
                    const location=new URL(url);
                    const context={URL,location};context.self=context;
                    context.postMessage=data=>queueMicrotask(()=>{if(!this.closed)this.onmessage({data:structuredClone(data)});});
                    vm.createContext(context);
                    context.importScripts=url=>{
                        imports.push(url);
                        vm.runInContext(fs.readFileSync('./static/'+new URL(url).pathname.split('/').pop(),'utf8'),context);
                    };
                    this.context=context;
                    queueMicrotask(()=>vm.runInContext(fs.readFileSync('./static/optimizer-worker.js','utf8'),context));
                }
                postMessage(data){messages.push(data.type);queueMicrotask(()=>{if(!this.closed)this.context.onmessage({data:structuredClone(data)});});}
                terminate(){this.closed=true;}
            }
            const storage=new Map();
            const sandbox={WareraOptimizer:globalThis.WareraOptimizer, URL, AbortSignal, Worker, setTimeout, clearTimeout,
                navigator:{hardwareConcurrency:2}, localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
                document:{currentScript:{src:'https://example.com/static/browser-optimizer.js?v=new-release'}},
                window:{Worker,location:{href:'https://example.com'}},
                fetch:async url=>({ok:true,json:async()=>url.includes('getEquipmentAvgByCode')
                    ? Array.from({length:42},()=>({result:{data:500}}))
                    : url.includes('itemTrading.getPrices') ? [{result:{data:{}}}]
                    : {result:{data:{items:[]}}}})};
            vm.createContext(sandbox);vm.runInContext(fs.readFileSync('./static/browser-optimizer.js','utf8'),sandbox);
            const form=new FormData();form.set('level','3');form.set('warera_api_key','fixture');form.set('workers','2');
            form.set('pinned_gear','[6,0,0,0,0,null]');form.set('pinned_ammo','1');form.set('pinned_food','0');
            (async()=>{
                const responses=[];
                for(const campaign of [false,true]) {
                    if(campaign){form.set('eco_profile_imported','true');form.set('stockpiled_money','500');}
                    const events=[];
                    const response=await sandbox.window.WareraBrowserOptimizer.run(form,{onProgress:p=>events.push(p)});
                    responses.push(response.builds.length);progress.push(events);
                }
                console.log(JSON.stringify({urls,imports,messages,responses,progress}));
            })().catch(e=>{console.error(e);process.exitCode=1});
        ''')
        self.assertTrue(all(count > 0 for count in result['responses']))
        self.assertEqual(result['messages'].count('run'), 4)
        self.assertEqual(result['messages'].count('refine'), 2)
        self.assertTrue(all(url.endswith('?v=new-release') for url in result['urls'] + result['imports']))
        for events in result['progress']:
            search = [event['evaluated'] / event['total'] for event in events if 'evaluated' in event]
            self.assertEqual(search[-1], 1)
            self.assertEqual(search, sorted(search))
            self.assertGreater(len([value for value in search if 0 < value < 0.8]), 5)
            refinement = [event for event in events if event.get('phase') == 'roll-refinement']
            self.assertEqual(refinement[0]['completed'], 0)
            self.assertEqual(refinement[-1]['completed'], refinement[-1]['total'])

    def test_unresponsive_cached_worker_fails_and_terminates_instead_of_waiting_forever(self):
        result = self.run_js('''
            const fs=require('fs'),vm=require('vm');require('./static/optimizer-core.js');
            const timers=new Map();let timerId=0,terminated=0;
            class Worker { postMessage(){} terminate(){terminated++;} }
            const sandbox={WareraOptimizer:globalThis.WareraOptimizer,URL,AbortSignal,Worker,
                setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),
                navigator:{hardwareConcurrency:1},localStorage:{getItem:()=>null,setItem:()=>{}},
                document:{currentScript:{src:'https://example.com/static/browser-optimizer.js?v=2'}},
                window:{Worker,location:{href:'https://example.com'}},
                fetch:async url=>({ok:true,json:async()=>url.includes('getEquipmentAvgByCode')
                    ? Array.from({length:42},()=>({result:{data:500}})) : {result:{data:{items:[]}}}})};
            vm.createContext(sandbox);vm.runInContext(fs.readFileSync('./static/browser-optimizer.js','utf8'),sandbox);
            const form=new FormData();form.set('warera_api_key','fixture');form.set('pinned_gear','[0,0,0,0,0,0]');
            const running=sandbox.window.WareraBrowserOptimizer.run(form,{});
            (async()=>{
                for(let i=0;i<100 && !timers.size;i++)await Promise.resolve();
                if(!timers.size)throw new Error('Worker watchdog not installed');
                [...timers.values()][0]();
                try {await running;throw new Error('Expected timeout');}
                catch(e){console.log(JSON.stringify({error:e.message,terminated,timers:timers.size}));}
            })().catch(e=>{console.error(e);process.exitCode=1});
        ''')
        self.assertIn('stopped responding', result['error'])
        self.assertEqual(result['terminated'], 1)
        self.assertEqual(result['timers'], 0)


if __name__ == '__main__':
    unittest.main()
