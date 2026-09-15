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
        db.execute('DROP TRIGGER IF EXISTS keep_last_admin_role')
        db.execute('DROP TRIGGER IF EXISTS keep_last_admin_account')
        for table in ['sessions','bookings','users','settings','attempts']:
            db.execute('DELETE FROM '+table)
    else:
        for table in ['sessions','bookings','users','settings','attempts','app_state']:
            db.execute('DROP TABLE IF EXISTS '+table)
        db.executescript(Path('drizzle/0000_odd_karnak.sql').read_text())
        db.executescript(Path('drizzle/0002_migration_packages.sql').read_text())
    db.executescript(Path('drizzle/0001_keep_last_admin.sql').read_text())
SETUP_TOKEN = os.environ.get('SCHEDU_SETUP_TOKEN','')
class Client:
    def __init__(self):
        self.jar=http.cookiejar.CookieJar()
        self.opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPCookieProcessor(self.jar))
    def call(self,body=None,origin=BASE,path='/api/app'):
        req=urllib.request.Request(BASE+path, data=json.dumps(body).encode() if body is not None else None, headers={'Content-Type':'application/json','Origin':origin})
        try:
            with self.opener.open(req,timeout=120) as r:return r.status,json.load(r)
        except urllib.error.HTTPError as e:
            with e:return e.code,json.load(e)
    def ok(self,body=None,**kw):
        code,data=self.call(body,**kw)
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
settings['classrooms']=['A302','B201','Edited room']
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
        self.assertEqual(admin.call({'action':'role','id':'testadmin','role':'student'})[1]['error'],'last_admin')
        self.assertEqual(admin.call({'action':'role','id':'teacher1','role':'student'})[1]['error'],'assigned_instructor')
        stale=Client();stale.ok({'action':'login','id':'student1','password':apass})
        a.ok({'action':'password','current':apass,'password':'a-new-secure-password'})
        self.assertIsNone(stale.ok()['user'])
        self.assertEqual(Client().call({'action':'login','id':'student1','password':apass})[1]['error'],'invalid_credentials')
        reset=admin.ok({'action':'resetPassword','id':'student1'})['credentials'][0]
        self.assertIsNone(a.ok()['user'])
        a.ok({'action':'login','id':'student1','password':reset['password']});self.assertTrue(a.ok()['user']['firstLogin'])
    def test_06_user_crud_and_bulk_actions(self):
        one,oldpass=issue('bulk1'); two,_=issue('bulk2')
        self.assertEqual(a.call({'action':'bulkUsers','ids':['bulk1'],'operation':'delete'})[0],403)
        self.assertEqual(a.call({'action':'updateUser','id':'bulk1','profile':profile()})[0],403)
        updated=profile('修改后的姓名',fresh=False)
        admin.ok({'action':'updateUser','id':'bulk1','profile':updated})
        self.assertEqual(one.ok()['user']['profile'],updated)
        self.assertEqual(admin.call({'action':'bulkUsers','ids':['bulk1','student1'],'operation':'delete'})[1]['error'],'user_has_history')
        self.assertIsNotNone(one.ok()['user'])
        self.assertEqual(admin.call({'action':'bulkUsers','ids':['bulk1','testadmin'],'operation':'instructor'})[1]['error'],'last_admin')
        self.assertEqual(one.ok()['user']['role'],'student')
        admin.ok({'action':'bulkUsers','ids':['bulk1','bulk2'],'operation':'instructor'})
        self.assertIsNone(one.ok()['user'])
        creds=admin.ok({'action':'bulkUsers','ids':['bulk1','bulk2'],'operation':'resetPassword'})['credentials']
        self.assertEqual(len(creds),2)
        self.assertEqual(Client().call({'action':'login','id':'bulk1','password':oldpass})[1]['error'],'invalid_credentials')
        one.ok({'action':'login','id':creds[0]['id'],'password':creds[0]['password']})
        self.assertTrue(one.ok()['user']['firstLogin'])
        admin.ok({'action':'bulkUsers','ids':['bulk1','bulk2'],'operation':'delete'})
        self.assertIsNone(one.ok()['user'])
        self.assertFalse(any(u['id'] in ['bulk1','bulk2'] for u in admin.ok()['users']))

    def test_07_slot_crud_and_booking_protection(self):
        state=admin.ok(); cfg=state['settings']; original=state['slots'][0]
        override={k:original[k] for k in ['id','windowId','date','start','end','location','instructors','capacity']}
        override.update(enabled=True,location='Edited room')
        cfg['slotOverrides']=[override]
        admin.ok({'action':'settings','settings':cfg})
        self.assertEqual(next(s for s in admin.ok()['slots'] if s['id']==original['id'])['location'],'Edited room')
        student,_=issue('slotstudent')
        booking=student.ok({'action':'book','slotId':original['id']})
        override['enabled']=False
        self.assertEqual(admin.call({'action':'settings','settings':cfg})[1]['error'],'booked_slot_locked')
        self.assertEqual(admin.call({'action':'bulkUsers','ids':['slotstudent'],'operation':'instructor'})[1]['error'],'active_bookings')
        self.assertEqual(admin.call({'action':'bulkUsers','ids':['teacher1'],'operation':'student'})[1]['error'],'assigned_instructor')
        admin.ok({'action':'transition','id':booking['id'],'status':'cancelled'})
        admin.ok({'action':'settings','settings':cfg})
        self.assertFalse(any(s['id']==original['id'] for s in student.ok()['slots']))
        override['enabled']=True
        admin.ok({'action':'settings','settings':cfg})
        self.assertTrue(any(s['id']==original['id'] for s in student.ok()['slots']))
        extra={**override,'id':'extra-slot','windowId':'','start':'21:00','end':'21:10'}
        cfg['slotOverrides'].append(extra)
        admin.ok({'action':'settings','settings':cfg})
        self.assertTrue(any(s['id']=='extra-slot' for s in student.ok()['slots']))
        extra['instructors']=['missing-teacher']
        self.assertEqual(admin.call({'action':'settings','settings':cfg})[1]['error'],'invalid_instructor')
        cfg['slotOverrides']=[]
        cfg['windows']=[]
        admin.ok({'action':'settings','settings':cfg})
        self.assertEqual(student.ok()['slots'],[])

    def test_08_admin_grant_revoke_and_last_admin_race(self):
        second,password=issue('admincandidate','instructor')
        self.assertEqual(a.call({'action':'role','id':'student1','role':'admin'})[0],403)
        self.assertEqual(admin.call({'action':'bulkUsers','ids':['testadmin'],'operation':'delete'})[1]['error'],'protected_admin')
        admin.ok({'action':'role','id':'admincandidate','role':'admin'})
        self.assertIsNone(second.ok()['user'])
        second.ok({'action':'login','id':'admincandidate','password':password})
        self.assertEqual(second.ok()['user']['role'],'admin')
        self.assertTrue(second.ok()['users'])
        # Even a bulk request that removes every admin must roll back in full.
        self.assertEqual(admin.call({'action':'bulkUsers','ids':['admincandidate','testadmin'],'operation':'instructor'})[1]['error'],'last_admin')
        self.assertEqual(second.ok()['user']['role'],'admin')
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            responses=list(pool.map(lambda pair:pair[0].call({'action':'role','id':pair[1],'role':'instructor'}),[(admin,'testadmin'),(second,'admincandidate')]))
        self.assertEqual(sorted(r[0] for r in responses),[200,400])
        survivor=second if responses[0][0]==200 else admin
        self.assertEqual(len([u for u in survivor.ok()['users'] if u['role']=='admin']),1)
        if survivor is second:
            second.ok({'action':'role','id':'testadmin','role':'admin'})
            admin.ok({'action':'login','id':'testadmin','password':'test-passphrase-2026'})
            admin.ok({'action':'role','id':'admincandidate','role':'instructor'})
        self.assertEqual(admin.ok()['user']['role'],'admin')
        self.assertIsNone(second.ok()['user'])

    def test_09_large_roster_and_optional_phone(self):
        rows=[{'id':f'large{i:04d}','role':'student',**profile(fresh=i%2==0)} for i in range(1200)]
        for row in rows:row.pop('phone')
        before=len(admin.ok()['users'])
        invalid=[*rows,dict(rows[0])]
        self.assertEqual(admin.call({'action':'import','rows':invalid})[1]['error'],'invalid_roster')
        self.assertEqual(len(admin.ok()['users']),before)
        result=admin.ok({'action':'import','rows':rows})
        self.assertEqual(len(result['credentials']),1200)
        self.assertEqual(len(admin.ok()['users']),before+1200)
        credential=result['credentials'][-1];student=Client()
        student.ok({'action':'login','id':credential['id'],'password':credential['password']})
        self.assertEqual(student.ok()['user']['profile']['phone'],'')
        p=profile(fresh=False);p['phone']=''
        student.ok({'action':'profile','profile':p})
        p['phone']='invalid';self.assertEqual(student.call({'action':'profile','profile':p})[1]['error'],'profile_incomplete')
        self.assertNotIn('password',json.dumps(admin.ok()['users']))
        cfg=admin.ok()['settings'];cfg['windows']=[{'id':'optional-phone-window','day':day,'start':'18:30','end':'20:05','location':'B201','instructors':['teacher1'],'capacity':1,'enabled':True}]
        admin.ok({'action':'settings','settings':cfg})
        student.ok({'action':'book','slotId':student.ok()['slots'][0]['id']})

    def test_10_bulk_lift_booking_pauses(self):
        first,_=issue('pause1'); second,_=issue('pause2')
        slots=first.ok()['slots']
        for client,slot in [(first,slots[1]),(second,slots[2])]:
            booking=client.ok({'action':'book','slotId':slot['id']})
            client.ok({'action':'transition','id':booking['id'],'status':'cancelled'})
            self.assertGreater(client.ok()['user']['blockedUntil'],now.timestamp()*1000)
        self.assertEqual(first.call({'action':'bulkUsers','ids':['pause1'],'operation':'liftBookingPause'})[0],403)
        teacher_before=teacher.ok()['user']
        result=admin.ok({'action':'bulkUsers','ids':['pause1','pause2','teacher1','testadmin','large0000'],'operation':'liftBookingPause'})
        self.assertEqual(result['updated'],2)
        self.assertEqual(first.ok()['user']['blockedUntil'],0)
        self.assertEqual(second.ok()['user']['blockedUntil'],0)
        self.assertEqual(teacher.ok()['user'],teacher_before)
        self.assertEqual(len(first.ok()['bookings']),1)
        self.assertEqual(first.ok()['bookings'][0]['status'],'cancelled')
        first.ok({'action':'book','slotId':slots[1]['id']})
        self.assertEqual(admin.ok({'action':'bulkUsers','ids':['pause1'],'operation':'liftBookingPause'})['updated'],0)

    def test_11_reset_clears_all_dependants_and_retains_admins(self):
        keeper,password=issue('resetKeeper','instructor')
        admin.ok({'action':'role','id':'resetKeeper','role':'admin'})
        keeper.ok({'action':'login','id':'resetKeeper','password':password})
        cfg=admin.ok()['settings'];cfg['cancellationWeeks']=3
        cfg['closedDates']=[(tomorrow+datetime.timedelta(days=1)).strftime('%Y-%m-%d')]
        cfg['slotOverrides']=[{'id':'resetextra','windowId':'','date':tomorrow.strftime('%Y-%m-%d'),'start':'21:00','end':'21:10','location':'B201','instructors':['teacher1'],'capacity':1,'enabled':True}]
        admin.ok({'action':'settings','settings':cfg})
        before=admin.ok();admins_before=[u for u in before['users'] if u['role']=='admin']
        self.assertEqual(a.call({'action':'resetData','confirmation':'RESET SchedU','currentPassword':'test-passphrase-2026'})[0],403)
        self.assertEqual(admin.call({'action':'resetData','confirmation':'RESET','currentPassword':'test-passphrase-2026'})[1]['error'],'reset_confirmation_required')
        self.assertEqual(admin.call({'action':'resetData','confirmation':'RESET SchedU','currentPassword':'wrong-password'})[1]['error'],'incorrect_current_password')
        unchanged=admin.ok()
        self.assertEqual(len(unchanged['users']),len(before['users']))
        self.assertEqual(len(unchanged['bookings']),len(before['bookings']))
        self.assertEqual(unchanged['settings'],cfg)
        admin.ok({'action':'resetData','confirmation':'RESET SchedU','currentPassword':'test-passphrase-2026'})
        after=admin.ok()
        self.assertEqual(after['users'],admins_before)
        self.assertEqual(after['bookings'],[])
        self.assertEqual(after['slots'],[])
        self.assertEqual(after['settings']['windows'],[])
        self.assertEqual(after['settings']['classrooms'],[])
        self.assertEqual(after['settings']['closedDates'],[])
        self.assertEqual(after['settings'].get('slotOverrides',[]),[])
        self.assertEqual(after['settings']['cancellationWeeks'],2)
        self.assertEqual(keeper.ok()['user']['role'],'admin')
        self.assertIsNone(a.ok()['user'])
        self.assertFalse(anon.ok()['needsSetup'])
        with sqlite3.connect(DB) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM bookings').fetchone()[0],0)
            self.assertEqual(db.execute("SELECT count(*) FROM sessions WHERE user_id NOT IN (SELECT id FROM users WHERE role='admin')").fetchone()[0],0)
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
        fresh,_=issue('afterReset')
        self.assertEqual(fresh.ok()['user']['id'],'afterReset')

    def test_12_classroom_configuration_and_legacy_upgrade(self):
        student,_=issue('classroomstudent')
        issue('classroomteacher','instructor')
        cfg=admin.ok()['settings'];cfg['classrooms']=['Room 101','Room 102']
        self.assertEqual(student.call({'action':'settings','settings':cfg})[0],403)
        admin.ok({'action':'settings','settings':cfg})
        window={'id':'classroom-window','day':day,'start':'18:30','end':'20:05','location':'Unknown room','instructors':['classroomteacher'],'capacity':1,'enabled':True}
        cfg['windows']=[window]
        self.assertEqual(admin.call({'action':'settings','settings':cfg})[1]['error'],'invalid_classroom')
        self.assertEqual(admin.ok()['settings']['windows'],[])
        window['location']='Room 101';admin.ok({'action':'settings','settings':cfg})
        extra={'id':'classroom-extra','windowId':'','date':tomorrow.strftime('%Y-%m-%d'),'start':'21:00','end':'21:10','location':'Unknown room','instructors':['classroomteacher'],'capacity':1,'enabled':True}
        cfg['slotOverrides']=[extra]
        self.assertEqual(admin.call({'action':'settings','settings':cfg})[1]['error'],'invalid_classroom')
        extra['location']='Room 102';admin.ok({'action':'settings','settings':cfg})
        cfg['classrooms']=['Room 101']
        self.assertEqual(admin.call({'action':'settings','settings':cfg})[1]['error'],'invalid_classroom')
        self.assertEqual(admin.ok()['settings']['classrooms'],['Room 101','Room 102'])
        # Simulate a pre-upgrade installation in the isolated fixture database.
        legacy=dict(cfg);legacy.pop('classrooms')
        with sqlite3.connect(DB) as db:
            db.execute('UPDATE settings SET value=? WHERE id=1',(json.dumps(legacy),))
        upgraded=admin.ok()['settings']
        self.assertEqual(upgraded['classrooms'],['Room 101','Room 102'])
        self.assertEqual(upgraded['windows'],legacy['windows'])
        self.assertEqual(upgraded['slotOverrides'],legacy['slotOverrides'])
        admin.ok({'action':'settings','settings':upgraded})
        with sqlite3.connect(DB) as db:
            saved=json.loads(db.execute('SELECT value FROM settings WHERE id=1').fetchone()[0])
            self.assertEqual(saved['classrooms'],['Room 101','Room 102'])

    def test_13_semester_bulk_removal_keeps_booked_sessions_beyond_28_days(self):
        student,_=issue('semesterstudent')
        cfg=admin.ok()['settings']
        cfg.update(semesterStart=now.strftime('%Y-%m-%d'),semesterEnd=(now+datetime.timedelta(days=70)).strftime('%Y-%m-%d'),horizonDays=90,meetingMinutes=1,breakMinutes=0,closedDates=[],slotOverrides=[])
        cfg['windows']=[{'id':'semester-window','day':day,'start':'18:30','end':'20:05','location':'Room 101','instructors':['classroomteacher'],'capacity':1,'enabled':True,'startWeek':1,'repeatWeeks':10}]
        self.assertEqual(student.call({'action':'settings','settings':cfg})[0],403)
        admin.ok({'action':'settings','settings':cfg})
        state=admin.ok();slots=state['slots']
        self.assertGreater(len(slots),500)
        self.assertTrue(all(cfg['semesterStart']<=slot['date']<=cfg['semesterEnd'] for slot in slots))
        far=next(slot for slot in slots if slot['date']>(now+datetime.timedelta(days=40)).strftime('%Y-%m-%d'))
        booking=student.ok({'action':'book','slotId':far['id']})
        cfg['horizonDays']=1;admin.ok({'action':'settings','settings':cfg})
        # Existing bookings are protected even after the booking horizon is shortened.
        shortened={**cfg,'semesterEnd':tomorrow.strftime('%Y-%m-%d')}
        self.assertEqual(admin.call({'action':'settings','settings':shortened})[1]['error'],'booked_slot_locked')
        request={'action':'deleteSlots','from':cfg['semesterStart'],'to':cfg['semesterEnd'],'ids':[slot['id'] for slot in slots]}
        self.assertEqual(student.call(request)[0],403)
        self.assertEqual(admin.call({**request,'ids':['not-a-real-slot']})[1]['error'],'schedule_changed')
        result=admin.ok(request)
        self.assertEqual(result['removed'],len(slots)-1);self.assertEqual(result['kept'],1)
        after=student.ok();self.assertEqual(after['user']['blockedUntil'],0)
        self.assertEqual(next(b for b in after['bookings'] if b['id']==booking['id'])['status'],'approved')
        self.assertEqual(admin.ok({**request,'ids':[far['id']]})['removed'],0)
        cfg=admin.ok()['settings'];self.assertEqual(len(cfg['slotOverrides']),len(slots)-1)
        cfg['horizonDays']=90;admin.ok({'action':'settings','settings':cfg})
        self.assertEqual([slot['id'] for slot in admin.ok()['slots']],[far['id']])

    def test_14_booking_and_batch_removal_race_never_deletes_a_booked_slot(self):
        student,_=issue('racesemester')
        cfg=admin.ok()['settings']
        extra={'id':'race-semester-slot','windowId':'','date':tomorrow.strftime('%Y-%m-%d'),'start':'21:00','end':'21:10','location':'Room 102','instructors':['classroomteacher'],'capacity':1,'enabled':True}
        cfg['slotOverrides'].append(extra);admin.ok({'action':'settings','settings':cfg})
        remove={'action':'deleteSlots','from':extra['date'],'to':extra['date'],'ids':[extra['id']]}
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            booking=pool.submit(student.call,{'action':'book','slotId':extra['id']})
            deletion=pool.submit(admin.call,remove)
            booked,deleted=booking.result(),deletion.result()
        state=admin.ok();exists=any(slot['id']==extra['id'] for slot in state['slots'])
        active=any(b['slot']['id']==extra['id'] and b['status']=='approved' for b in state['bookings'])
        self.assertFalse(active and not exists)
        if booked[0]==200:
            self.assertTrue(exists)
            if deleted[0]==200:self.assertEqual(deleted[1]['kept'],1)
            else:self.assertEqual(deleted[1]['error'],'schedule_changed')
        else:
            self.assertEqual(deleted[0],200)
            self.assertEqual(deleted[1]['removed'],1)
            self.assertFalse(exists)
        self.assertEqual(student.ok()['user']['blockedUntil'],0)

    def test_15_full_export_restore_and_reset_gate(self):
        path='/api/migration'
        student,password=issue('migration-login',fresh=False)
        rows=[{'id':f'migrate{i:04d}','role':'student',**profile(fresh=False)} for i in range(1200)]
        for row in rows:row['phone']=''
        admin.ok({'action':'import','rows':rows})
        with sqlite3.connect(DB) as db:db.execute("UPDATE users SET blocked_until=? WHERE id='migration-login'",(int(now.timestamp()*1000)+86400000,))
        before=admin.ok();student_before=student.ok()['user']
        self.assertFalse(before['migration']['ready'])
        self.assertEqual(anon.call({'action':'export','currentPassword':'test-passphrase-2026'},path=path)[0],401)
        self.assertEqual(student.call({'action':'export','currentPassword':password},path=path)[0],403)
        self.assertEqual(admin.call({'action':'export','currentPassword':'wrong'},path=path)[1]['error'],'incorrect_current_password')
        self.assertEqual(admin.call({'action':'export','currentPassword':'test-passphrase-2026'},origin='https://evil.example',path=path)[0],403)
        pkg=admin.ok({'action':'export','currentPassword':'test-passphrase-2026'},path=path)
        self.assertGreaterEqual(len(pkg['data']['users']),1200)
        self.assertNotIn('sessions',pkg['data']);self.assertNotIn('attempts',pkg['data'])
        self.assertEqual(pkg['data']['settings'],before['settings'])
        self.assertEqual(len(pkg['data']['bookings']),len(before['bookings']))
        self.assertTrue(all(len(user['password'])==97 for user in pkg['data']['users']))
        inspected=admin.ok({'action':'inspect','package':pkg},path=path)
        self.assertEqual(inspected['summary']['users'],len(before['users']))
        self.assertFalse(inspected['reset']['ready'])
        restore={'action':'restore','package':pkg,'currentPassword':'test-passphrase-2026','confirmation':'RESTORE SchedU'}
        self.assertEqual(admin.call(restore,path=path)[1]['error'],'restore_requires_reset')
        admin.ok({'action':'resetData','currentPassword':'test-passphrase-2026','confirmation':'RESET SchedU'})
        self.assertTrue(admin.ok()['migration']['ready'])
        self.assertEqual(admin.call({**restore,'confirmation':'RESTORE'},path=path)[1]['error'],'restore_confirmation_required')
        self.assertEqual(admin.call({**restore,'currentPassword':'wrong'},path=path)[1]['error'],'incorrect_current_password')
        corrupt=json.loads(json.dumps(pkg));corrupt['data']['users'][0]['blocked_until']+=1
        self.assertEqual(admin.call({'action':'inspect','package':corrupt},path=path)[1]['error'],'export_checksum_mismatch')
        self.assertEqual(admin.call({**restore,'package':corrupt},path=path)[1]['error'],'export_checksum_mismatch')
        self.assertTrue(admin.ok()['migration']['ready'])
        self.assertEqual(admin.call({'action':'inspect','package':{**pkg,'version':2}},path=path)[1]['error'],'unsupported_export_version')
        # Saving unchanged defaults still exits the explicit reset state.
        admin.ok({'action':'settings','settings':admin.ok()['settings']})
        self.assertFalse(admin.ok()['migration']['ready'])
        self.assertEqual(admin.call(restore,path=path)[1]['error'],'restore_requires_reset')
        admin.ok({'action':'resetData','currentPassword':'test-passphrase-2026','confirmation':'RESET SchedU'})
        self.assertEqual(admin.ok(restore,path=path)['summary']['users'],len(before['users']))
        self.assertIsNone(admin.ok()['user']);self.assertIsNone(student.ok()['user'])
        with sqlite3.connect(DB) as db:self.assertEqual(db.execute('SELECT count(*) FROM sessions').fetchone()[0],0)
        admin.ok({'action':'login','id':'testadmin','password':'test-passphrase-2026'})
        after=admin.ok()
        self.assertEqual(after['users'],before['users'])
        self.assertEqual(after['bookings'],before['bookings'])
        self.assertEqual(after['settings'],before['settings'])
        self.assertFalse(after['migration']['ready'])
        student.ok({'action':'login','id':'migration-login','password':password})
        self.assertEqual(student.ok()['user'],student_before)
        self.assertEqual(admin.call(restore,path=path)[1]['error'],'restore_requires_reset')
        self.assertFalse(anon.ok()['needsSetup'])

if __name__=='__main__':unittest.main(verbosity=2)
