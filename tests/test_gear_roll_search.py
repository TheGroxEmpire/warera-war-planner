import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class GearRollSearchTest(unittest.TestCase):
    def run_js(self, source):
        result = subprocess.run(['node', '-e', source], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_integer_refinement_matches_exhaustive_weapon_rolls_under_budget(self):
        result = self.run_js('''
            require('./static/optimizer-core.js');
            const o = globalThis.WareraOptimizer;
            const curve = [{quality:0,price:100},{quality:1,price:500}];
            const options = {adjustedLevel:0,rankBonus:1,pill:false,objective:'damage',
                pinnedSkills:Array(9).fill(0),pinnedGear:[6,0,0,0,0,0],pinnedAmmo:1,pinnedFood:0,
                dailyBudget:60,priceOverrides:{searchGearRolls:true,gearPriceCurves:{weapon:{jet:curve}},ammoCosts:{lightAmmo:0}}};
            const original = o.prepareResponse([o.runSearch(options)],options);
            const refined = o.refineGearRolls(original,options);
            const affordable = builds => builds.filter(b=>b.net_cost<=60+1e-8).sort((a,b)=>b.total_damage-a.total_damage)[0];
            const ctx=o.createModelContext(options.priceOverrides);
            let expected=0, expectedMods;
            for(let atk=221;atk<=300;atk++) for(let critc=41;critc<=50;critc++){
                const mods={atk,critc};
                const cost=o.interpolateRollPrice(curve,o.rollQuality(mods,ctx.rollRanges.weapon.jet),0);
                ctx.gearChoices.weapon[6]={...ctx.gearChoices.weapon[6],mods,cost};ctx.gearCache.clear();
                const t=o.computeTotals(Array(9).fill(0),[6,0,0,0,0,0],1,0,options,ctx);
                if(t.totalCost<=60+1e-8 && t.totalDamage>expected){expected=t.totalDamage;expectedMods=mods;}
            }
            const best=affordable(refined.all_builds);
            console.log(JSON.stringify({expected,expectedMods,actual:best.total_damage,mods:best.gear[0].mods,
                cost:best.net_cost,baseline:affordable(original.all_builds).total_damage,
                tiers:best.gear_idx,evaluated:refined.gear_search.evaluated}));
        ''')
        self.assertAlmostEqual(result['actual'], result['expected'], places=7)
        self.assertEqual(result['mods'], result['expectedMods'])
        self.assertLessEqual(result['cost'], 60 + 1e-8)
        self.assertGreater(result['actual'], result['baseline'])
        self.assertEqual(result['tiers'], [6, 0, 0, 0, 0, 0])
        self.assertGreaterEqual(result['evaluated'], 800)

    def test_exact_roll_pins_survive_search_refinement_and_output(self):
        result = self.run_js('''
            require('./static/optimizer-core.js');const o=globalThis.WareraOptimizer;
            const mods={atk:250,critc:49};
            const options={adjustedLevel:2,rankBonus:1,pill:false,objective:'damage',pinnedGear:[6,0,0,0,0,0],
                pinnedGearStats:[mods,null,null,null,null,null],pinnedAmmo:1,pinnedFood:0,
                priceOverrides:{searchGearRolls:true,pinnedGearRolls:[{tierIndex:6,mods}],
                    gearPriceCurves:{weapon:{jet:[{quality:0,price:100},{quality:1,price:500}]}}}};
            const response=o.refineGearRolls(o.prepareResponse([o.runSearch(options)],options),options);
            console.log(JSON.stringify({builds:response.all_builds.map(b=>({mods:b.gear[0].mods,tiers:b.gear_idx})),
                points:response.all_builds.map(b=>b.skill_cost)}));
        ''')
        self.assertTrue(result['builds'])
        for build in result['builds']:
            self.assertEqual(build['mods'], {'atk': 250, 'critc': 49})
            self.assertEqual(build['tiers'], [6, 0, 0, 0, 0, 0])
        self.assertTrue(all(points <= 8 for points in result['points']))

    def test_market_curve_uses_actual_stats_price_and_durability(self):
        result = self.run_js('''
            const fs=require('fs'),vm=require('vm');require('./static/optimizer-core.js');
            const sandbox={WareraOptimizer:globalThis.WareraOptimizer,URL,AbortSignal,
                document:{currentScript:{src:'https://example.com/static/browser-optimizer.js'}},window:{location:{href:'https://example.com'}}};
            vm.createContext(sandbox);vm.runInContext(fs.readFileSync('./static/browser-optimizer.js','utf8'),sandbox);
            const rows=[];
            for(let i=0;i<5;i++){
                rows.push({_id:'l'+i,money:50,quantity:1,item:{code:'jet',state:50,maxState:100,skills:{attack:221,criticalChance:41}}});
                rows.push({_id:'h'+i,money:200,quantity:1,item:{code:'jet',state:100,maxState:100,skills:{attack:300,criticalChance:50}}});
            }
            rows.push(rows[0],{money:999999,item:{code:'jet',state:100,maxState:100,skills:{attack:270,criticalChance:45}}},
                {money:1,item:{code:'jet',state:100,maxState:100,skills:{attack:999,criticalChance:45}}});
            const ranges=globalThis.WareraOptimizer.constants.GEAR_STAT_RANGES.weapon.jet;
            console.log(JSON.stringify(sandbox.window.WareraBrowserOptimizer.analyzeGearTransactions(rows,ranges,'jet')));
        ''')
        self.assertEqual(result['samples'], 10)
        self.assertEqual(result['curve'], [
            {'quality': 0, 'price': 100, 'sampleSize': 5},
            {'quality': 1, 'price': 200, 'sampleSize': 5},
        ])

    def test_sparse_data_uses_legal_midpoint_not_free_maximum_roll(self):
        result = self.run_js('''
            require('./static/optimizer-core.js');const o=globalThis.WareraOptimizer;
            const options={adjustedLevel:0,pill:false,rankBonus:1,objective:'damage',pinnedSkills:Array(9).fill(0),
                pinnedGear:[2,0,0,0,0,0],pinnedAmmo:1,pinnedFood:0,priceOverrides:{searchGearRolls:true}};
            const r=o.refineGearRolls(o.prepareResponse([o.runSearch(options)],options),options);
            console.log(JSON.stringify(r.all_builds[0].gear[0]));
        ''')
        self.assertEqual(result['mods'], {'atk': 56, 'critc': 8})
        self.assertEqual(result['price_source'], 'tier-average')

    def test_browser_fetches_paginated_roll_history_and_caches_only_market_summary(self):
        result = self.run_js('''
            const fs=require('fs'),vm=require('vm');require('./static/optimizer-core.js');
            const storage=new Map(),calls=[],progress=[];
            const sandbox={WareraOptimizer:globalThis.WareraOptimizer,URL,AbortSignal,console,
                navigator:{hardwareConcurrency:4},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
                document:{currentScript:{src:'https://example.com/static/browser-optimizer.js'}},window:{location:{href:'https://example.com'}},
                fetch:async(url,init)=>{
                    calls.push({url,method:init.method,headers:init.headers});
                    let data;
                    if(url.includes('getEquipmentAvgByCode')) data=Array.from({length:42},()=>({result:{data:500}}));
                    else if(url.includes('itemTrading.getPrices')) data=[{result:{data:{lightAmmo:1}}}];
                    else if(url.includes('gameConfig.getGameConfig')) data={result:{data:{items:{}}}};
                    else {
                        const input=JSON.parse(init.body),page=Number(input.cursor||0);
                        const items=Array.from({length:100},(_,i)=>({_id:page+'-'+i,money:i<50?100:200,quantity:1,
                            item:{code:input.itemCode,state:100,maxState:100,skills:{attack:i<50?221:300,criticalChance:i<50?41:50}}}));
                        data={result:{data:{items,nextCursor:page<4?String(page+1):null}}};
                    }
                    return {ok:true,json:async()=>data};
                }};
            vm.createContext(sandbox);vm.runInContext(fs.readFileSync('./static/browser-optimizer.js','utf8'),sandbox);
            const form=new FormData();form.set('level','1');form.set('warera_api_key','test-secret');
            form.set('pinned_skills',JSON.stringify(Array(9).fill(0)));form.set('pinned_gear','[6,0,0,0,0,0]');
            form.set('pinned_ammo','1');form.set('pinned_food','0');
            (async()=>{
                const first=await sandbox.window.WareraBrowserOptimizer.run(form,{onProgress:p=>progress.push(p.phase)});
                const before=calls.filter(c=>c.url.includes('getPaginatedTransactions')).length;
                await sandbox.window.WareraBrowserOptimizer.run(form,{});
                console.log(JSON.stringify({before,after:calls.filter(c=>c.url.includes('getPaginatedTransactions')).length,
                    calls:calls.filter(c=>c.url.includes('getPaginatedTransactions')),
                    cached:[...storage.values()].join(''),mods:first.all_builds[0].gear[0].mods,progress,
                    samples:first.gear_search.market.sampleCounts.weapon.jet}));
            })().catch(e=>{console.error(e);process.exitCode=1});
        ''')
        self.assertEqual(result['before'], 5)
        self.assertEqual(result['after'], 5)
        self.assertEqual(result['samples'], 500)
        self.assertEqual(result['mods'], {'atk': 300, 'critc': 50})
        self.assertIn('roll-refinement', result['progress'])
        self.assertNotIn('test-secret', result['cached'])
        self.assertNotIn('"item"', result['cached'])
        for call in result['calls']:
            self.assertTrue(call['url'].startswith('https://api2.warera.io/'))
            self.assertNotIn('test-secret', call['url'])
            self.assertEqual(call['method'], 'POST')
            self.assertEqual(call['headers']['X-API-Key'], 'test-secret')

    def test_profile_import_preserves_actual_rolls_and_clears_replaced_pins(self):
        result = self.run_js('''
            const importer=require('./static/profile-import.js');
            const user={_id:'p1',username:'Fixture',leveling:{level:1},skills:{attack:{militaryRankPercent:0}}};
            const profile=importer.normalizeProfile(user,{weapon:{code:'gun',skills:{attack:58,criticalChance:9}}});
            const current={skills:Array(9).fill(null),gear:Array(6).fill(6),gearStats:Array(6).fill({atk:300,critc:50}),ammo:3,food:2};
            const pinned=importer.buildImportedConstraints(current,profile,{pinLoadout:true});
            const unchanged=importer.buildImportedConstraints(current,profile,{});
            console.log(JSON.stringify({pinned,unchanged,stats:profile.gearStats}));
        ''')
        self.assertEqual(result['stats'], [{'atk': 58, 'critc': 9}, None, None, None, None, None])
        self.assertEqual(result['pinned']['gearStats'], result['stats'])
        self.assertEqual(result['pinned']['gear'], [2, 0, 0, 0, 0, 0])
        self.assertEqual(result['pinned']['food'], 2)
        self.assertEqual(result['unchanged']['gearStats'][0], {'atk': 300, 'critc': 50})


if __name__ == '__main__':
    unittest.main()
