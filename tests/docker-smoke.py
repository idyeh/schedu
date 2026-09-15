"""Exercise only the isolated schedu-check stack at localhost:18080.
Requires /private/tmp/schedu-compose-test.env, generated separately with a random setup token.
"""
import datetime, http.cookiejar, json, subprocess, urllib.request, urllib.error
from pathlib import Path
BASE='http://127.0.0.1:18080'
ORIGIN='http://localhost:18080'
ENV_FILE='/private/tmp/schedu-compose-test.env'
COMPOSE=['docker','compose','--env-file',ENV_FILE,'-p','schedu-check']
values=dict(line.split('=',1) for line in Path(ENV_FILE).read_text().splitlines() if '=' in line)
class Client:
    def __init__(self): self.opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def call(self,body=None,origin=ORIGIN,path='/api/app'):
        req=urllib.request.Request(BASE+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json','Origin':origin})
        try:
            with self.opener.open(req,timeout=30) as r:return r.status,json.load(r)
        except urllib.error.HTTPError as e:
            with e:return e.code,json.load(e)
    def ok(self,body=None,**kw):
        code,result=self.call(body,**kw);assert code==200,(code,result);return result
admin=Client()
assert admin.ok(path='/api/health')['status']=='ok'
assert admin.ok()['needsSetup'] and admin.ok()['requiresSetupToken']
assert admin.call({'action':'setup','id':'dockeradmin','password':'docker-test-passphrase','profile':{'chineseName':'测试管理员'}})[1]['error']=='invalid_setup_token'
admin.ok({'action':'setup','setupToken':values['SCHEDU_SETUP_TOKEN'],'id':'dockeradmin','password':'docker-test-passphrase','profile':{'chineseName':'测试管理员'}})
settings=admin.ok()['settings']
assert admin.call({'action':'settings','settings':settings},origin='https://evil.example')[0]==403
now=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8)))
profiles={'grade':now.year,'adminClass':'26电H一','teachingClass':'Class 1','chineseName':'测试学生','englishName':'Test Student','phone':'13800000000'}
credentials=admin.ok({'action':'import','rows':[{'id':'dockerstudent','role':'student',**profiles}]})['credentials']
teacher=admin.ok({'action':'issue','user':{'id':'dockerteacher','role':'instructor','profile':{**profiles,'chineseName':'测试教师'}}})
settings['classrooms']=['A302']
settings['windows']=[{'id':'dockerwindow','day':(now.weekday()+2)%7,'start':'18:30','end':'20:05','location':'A302','instructors':['dockerteacher'],'capacity':2,'enabled':True}]
admin.ok({'action':'settings','settings':settings})
student=Client();student.ok({'action':'login','id':'dockerstudent','password':credentials[0]['password']})
student.ok({'action':'password','keep':True})
slot=student.ok()['slots'][0]
record=student.ok({'action':'book','slotId':slot['id'],'topic':'Docker persistence check'})
assert record['status']=='approved'
student.ok({'action':'transition','id':record['id'],'status':'cancelled'})
assert student.ok()['user']['blockedUntil']>now.timestamp()*1000
print('PASS: setup token, institutional login, roster import, authorisation, booking and cancellation')
subprocess.run(COMPOSE+['up','-d','--force-recreate','--no-build','--wait'],check=True,stdout=subprocess.DEVNULL)
assert not Client().ok()['needsSetup']
assert student.ok()['user']['id']=='dockerstudent'
assert any(b['id']==record['id'] and b['status']=='cancelled' for b in student.ok()['bookings'])
assert student.ok()['user']['blockedUntil']>now.timestamp()*1000
print('PASS: accounts, session, bookings and cancellation restriction survive container replacement')
subprocess.run(COMPOSE+['exec','-T','app','node','deploy/backup.mjs'],check=True,stdout=subprocess.DEVNULL)
code="const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/app/data/backups/schedu-backup.sqlite',{readOnly:true});if(d.prepare('SELECT count(*) AS n FROM bookings').get().n!==1)process.exit(1);d.close()"
subprocess.run(COMPOSE+['exec','-T','app','node','-e',code],check=True)
print('PASS: consistent SQLite backup contains the saved booking')
uid=subprocess.check_output(COMPOSE+['exec','-T','app','id','-u'],text=True).strip();assert uid=='1000'
print('PASS: application runs as non-root UID 1000')
