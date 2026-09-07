"""Run only against an isolated wrangler server on localhost:3001.
The fixture database must be beneath /private/tmp/schedu-integration-state.
"""
import concurrent.futures, datetime, glob, http.cookiejar, json, sqlite3, urllib.request, urllib.error, unittest, os
from pathlib import Path
NODE = os.environ.get('SCHEDU_TEST_NODE') == '1'
BASE = 'http://localhost:3002' if NODE else 'http://localhost:3001'
if NODE:
    DB = '/private/tmp/schedu-node-integration/schedu.sqlite'
    assert Path(DB).exists(), 'Start isolated Node server and request /api/health once'
else:
    DBS=[p for p in glob.glob('/private/tmp/schedu-integration-state/v3/d1/miniflare-D1DatabaseObject/*.sqlite') if not p.endswith('metadata.sqlite')]
    assert len(DBS)==1, 'Start isolated server and request /api/app once'
    DB=DBS[0]
with sqlite3.connect(DB) as db:
    if NODE:
        for table in ['sessions','bookings','users','settings','attempts']:
            db.execute('DELETE FROM '+table)
    else:
        for table in ['sessions','bookings','users','settings','attempts']:
            db.execute('DROP TABLE IF EXISTS '+table)
        db.executescript(Path('drizzle/0000_odd_karnak.sql').read_text())
SETUP_TOKEN = os.environ.get('SCHEDU_SETUP_TOKEN','')
class Client:
    def __init__(self):
        self.jar=http.cookiejar.CookieJar()
        self.opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPCookieProcessor(self.jar))
    def call(self,body=None,origin=BASE):
        req=urllib.request.Request(BASE+'/api/app', data=json.dumps(body).encode() if body is not None else None, headers={'Content-Type':'application/json','Origin':origin})
        try:
            with self.opener.open(req,timeout=30) as r:return r.status,json.load(r)
        except urllib.error.HTTPError as e:
            with e:return e.code,json.load(e)
    def ok(self,body=None):
        code,data=self.call(body)
        assert code==200,(body.get('action') if body else 'GET',code,data)
        return data
admin=Client(); anon=Client()
assert anon.ok()['needsSetup']
if NODE:
    assert anon.ok()['requiresSetupToken']
    assert anon.call({'action':'setup','id':'badadmin','password':'test-password','profile':{'chineseName':'test'}})[1]['error']=='invalid_setup_token'
admin.ok({'action':'setup','setupToken':SETUP_TOKEN,'id':'testadmin','password':'test-passphrase-2026','profile':{'chineseName':'测试管理员'}})
assert anon.call({'action':'setup','setupToken':SETUP_TOKEN,'id':'otheradmin','password':'test-passphrase-2026','profile':{'chineseName':'测试'}})[1]['error']=='setup_complete'
settings=admin.ok()['settings']
now=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8)))
year=now.year
def profile(name='学生',fresh=True):return {'grade':year if fresh else year-1,'adminClass':'26电H一','teachingClass':'Class 1' if fresh else '', 'chineseName':name,'englishName':'Test Student','phone':'13800000000'}
def issue(id,role='student',fresh=True):
    c=admin.ok({'action':'issue','user':{'id':id,'role':role,'profile':profile(id,fresh)}})['credentials'][0]
    client=Client();client.ok({'action':'login','id':id,'password':c['password']});return client,c['password']
teacher,_=issue('teacher1','instructor'); outsider,_=issue('teacher2','instructor')
a,apass=issue('student1'); b,bpass=issue('student2',fresh=False)
tomorrow=now+datetime.timedelta(days=1); day=(tomorrow.weekday()+1)%7
settings['windows']=[{'id':'test-window','day':day,'start':'18:30','end':'20:05','location':'A302','instructors':['teacher1'],'capacity':1,'enabled':True}]
admin.ok({'action':'settings','settings':settings})
class Flows(unittest.TestCase):
    def test_01_auth_and_privacy(self):
        self.assertEqual(anon.call({'action':'settings','settings':settings})[0],401)
        self.assertEqual(a.call({'action':'settings','settings':settings})[0],403)
        self.assertEqual(a.call({'action':'profile','profile':profile()},origin='https://evil.example')[0],403)
        self.assertEqual(a.ok()['users'],[])
        self.assertNotIn('password',json.dumps(admin.ok()['users']))
        self.assertTrue(a.ok()['user']['firstLogin'])
        a.ok({'action':'password','keep':True});self.assertFalse(a.ok()['user']['firstLogin'])
        retained=Client();retained.ok({'action':'login','id':'student1','password':apass})
    def test_02_profiles(self):
        p=profile();p['teachingClass']='';self.assertEqual(a.call({'action':'profile','profile':p})[1]['error'],'teaching_class_required')
        b.ok({'action':'profile','profile':profile(fresh=False)})
        p=profile(fresh=False);p['adminClass']='';self.assertEqual(b.call({'action':'profile','profile':p})[1]['error'],'admin_class_required')
    def test_03_booking_race_and_cancellation(self):
        slots=a.ok()['slots'];self.assertEqual(len([s for s in slots if s['date']==tomorrow.strftime('%Y-%m-%d')]),6)
        target=slots[0]['id'];draft=a.ok({'action':'draft','slotId':target,'topic':'Review differentiation'})
        self.assertEqual(a.ok()['slots'][0]['remaining'],1)
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            responses=list(pool.map(lambda c:c.call({'action':'book','slotId':target}),[a,b]))
        self.assertEqual(sorted(r[0] for r in responses),[200,400])
        winner=a if responses[0][0]==200 else b
        loser=b if winner is a else a
        booking=next(x for x in winner.ok()['bookings'] if x['status']=='approved')
        self.assertEqual([h['status'] for h in booking['history']],['draft','submitted','approved'])
        self.assertEqual(winner.call({'action':'book','slotId':slots[1]['id']})[1]['error'],'booking_conflict')
        self.assertEqual(len(outsider.ok()['bookings']),0)
        self.assertEqual(outsider.call({'action':'transition','id':booking['id'],'status':'cancelled'})[0],403)
        self.assertIn(booking['id'],[x['id'] for x in teacher.ok()['bookings']])
        winner.ok({'action':'transition','id':booking['id'],'status':'cancelled'})
        until=winner.ok()['user']['blockedUntil'];self.assertAlmostEqual((until-datetime.datetime.now().timestamp()*1000)/86400000,14,delta=.01)
        self.assertEqual(winner.call({'action':'book','slotId':slots[1]['id']})[1]['error'],'booking_blocked')
        loser.ok({'action':'book','slotId':target})
        self.assertEqual(winner.call({'action':'transition','id':booking['id'],'status':'approved'})[0],400)
        winnerid=winner.ok()['user']['id']
        with sqlite3.connect(DB) as db:db.execute('UPDATE users SET blocked_until=0 WHERE id=?',(winnerid,))
        winner.ok({'action':'book','slotId':slots[1]['id']})
        for client in [a,b]:
            for record in client.ok()['bookings']:
                if record['status']=='approved':admin.ok({'action':'transition','id':record['id'],'status':'cancelled'})
        a.ok({'action':'deleteDraft','id':draft['id']})
    def test_04_pool_feedback_and_archive(self):
        settings['windows'][0]['capacity']=2;settings['windows'][0]['instructors']=['teacher1','teacher2'];admin.ok({'action':'settings','settings':settings})
        target=a.ok()['slots'][2]['id']
        one=a.ok({'action':'book','slotId':target});two=b.ok({'action':'book','slotId':target})
        self.assertEqual(next(s for s in a.ok()['slots'] if s['id']==target)['remaining'],0)
        self.assertEqual(a.call({'action':'transition','id':two['id'],'status':'cancelled'})[0],403)
        self.assertEqual(teacher.call({'action':'transition','id':one['id'],'status':'in_progress'})[1]['error'],'invalid_transition')
        past=int(datetime.datetime.now().timestamp()*1000)-1200000
        with sqlite3.connect(DB) as db:
            for ident in [one['id'],two['id']]:
                slot=json.loads(db.execute('SELECT slot FROM bookings WHERE id=?',(ident,)).fetchone()[0]);slot['startsAt']=past;slot['endsAt']=past+600000
                db.execute('UPDATE bookings SET starts_at=?,ends_at=?,slot=? WHERE id=?',(past,past+600000,json.dumps(slot),ident))
        teacher.ok({'action':'transition','id':one['id'],'status':'in_progress'})
        teacher.ok({'action':'transition','id':one['id'],'status':'completed','score':70,'feedback':'Clear reasoning. Keep practising.'})
        outsider.ok({'action':'transition','id':two['id'],'status':'completed','score':0,'feedback':'Did not attend.'})
        result=next(x for x in a.ok()['bookings'] if x['id']==one['id']);self.assertEqual(result['score'],70);self.assertEqual(result['feedback'],'Clear reasoning. Keep practising.')
        teacher.ok({'action':'transition','id':one['id'],'status':'archived'})
        self.assertEqual(next(x for x in a.ok()['bookings'] if x['id']==one['id'])['status'],'archived')
    def test_05_roster_roles_passwords(self):
        count=len(admin.ok()['users'])
        invalid=[{'id':'roster1','role':'student',**profile()},{'id':'student1','role':'student',**profile()}]
        self.assertEqual(admin.call({'action':'import','rows':invalid})[1]['error'],'invalid_roster')
        self.assertEqual(len(admin.ok()['users']),count)
        valid=[{'id':'roster1','role':'student',**profile()},{'id':'roster2','role':'student',**profile(fresh=False)}]
        self.assertEqual(len(admin.ok({'action':'import','rows':valid})['credentials']),2)
        admin.ok({'action':'role','id':'roster1','role':'instructor'})
        self.assertEqual(admin.call({'action':'role','id':'testadmin','role':'student'})[0],403)
        self.assertEqual(admin.call({'action':'role','id':'teacher1','role':'student'})[1]['error'],'assigned_instructor')
        stale=Client();stale.ok({'action':'login','id':'student1','password':apass})
        a.ok({'action':'password','current':apass,'password':'a-new-secure-password'})
        self.assertIsNone(stale.ok()['user'])
        self.assertEqual(Client().call({'action':'login','id':'student1','password':apass})[1]['error'],'invalid_credentials')
        reset=admin.ok({'action':'resetPassword','id':'student1'})['credentials'][0]
        self.assertIsNone(a.ok()['user'])
        a.ok({'action':'login','id':'student1','password':reset['password']});self.assertTrue(a.ok()['user']['firstLogin'])
if __name__=='__main__':unittest.main(verbosity=2)
