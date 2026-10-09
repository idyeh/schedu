import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { openSqlite } from '../../../db/sqlite.ts';
import { defaultSettings, slotsInRange, validateSettings } from '../../../lib/model.ts';
import type { Settings, Slot } from '../../../lib/model.ts';
const root=resolve(import.meta.dirname,'../../..');
// A fixed, disposable path prevents accidental seeding of the live application.
const path=resolve(root,'tmp/pdfs/schedu-manual/demo.sqlite');
if(existsSync(path) && !process.argv.includes('--replace-fixture')) throw Error('Fixture already exists. Stop its server and use --replace-fixture to rebuild it.');
mkdirSync(dirname(path),{recursive:true});
const db=openSqlite(path,resolve(root,'drizzle'));
const now=Date.parse('2026-10-04T18:35:00+08:00');
const password='SchedU-demo-2026!';
const salt=randomBytes(16).toString('hex');
const hash=`${salt}:${pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex')}`;
const settings:Settings={...structuredClone(defaultSettings),defaultLanguage:'en-GB',defaultTheme:'light',semesterStart:'2026-09-07',semesterEnd:'2027-01-15',classrooms:['Engineering Building · Room 302','Learning Centre · Room 105'],windows:[
 {id:'sunday-clinic',day:0,start:'18:00',end:'20:05',location:'Engineering Building · Room 302',instructors:['STAFF1001','STAFF1002'],capacity:2,enabled:true,startWeek:1},
 {id:'monday-clinic',day:1,start:'19:00',end:'20:05',location:'Learning Centre · Room 105',instructors:['STAFF1001'],capacity:1,enabled:true,startWeek:1},
 {id:'tuesday-clinic',day:2,start:'18:30',end:'20:05',location:'Engineering Building · Room 302',instructors:['STAFF1001','STAFF1002'],capacity:2,enabled:true,startWeek:1},
 {id:'thursday-clinic',day:4,start:'19:00',end:'20:05',location:'Learning Centre · Room 105',instructors:['STAFF1002'],capacity:1,enabled:true,startWeek:1},
],closedDates:['2026-10-11'],slotOverrides:[{id:'extra-unstaffed',windowId:'',date:'2026-10-07',start:'19:00',end:'19:10',location:'Learning Centre · Room 105',instructors:[],capacity:1,enabled:true}]};
validateSettings(settings);
const people=[
 ['OWNER0001','sysadmin','系统管理员','System Administrator',2015,'','',0,0],
 ['STAFF0001','admin','罗安','Alex Morgan',2019,'','',0,0],
 ['STAFF1001','instructor','林伟','Wei Lin',2018,'','',0,0],
 ['STAFF1002','instructor','周颖','Emma Zhou',2020,'','',0,0],
 ['20260001','student','陈美','Mei Chen',2026,'26电H一','Class 1',0,0],
 ['20260002','student','王浩','Hao Wang',2026,'26电H一','Class 1',1,0],
 ['20250003','student','刘宁','Ning Liu',2025,'26自H一','',0,Date.parse('2026-10-18T18:35:00+08:00')],
 ['20260004','student','李安','An Li',2026,'26电H二','Class 2',0,0],
 ['20260005','student','孙琪','Qi Sun',2026,'26智H一','Class 3',0,0],
 ['20260006','student','许嘉','Jia Xu',2026,'26人工H一','Class 4',0,0],
 ['20260007','student','何言','Yan He',2026,'26自H三','Class 5',0,0],
 ['20260008','student','赵琳','Lin Zhao',2026,'26智H二','Class 6',0,0],
];
const surnames=['Zhang','Wu','Zhou','Tang','Guo','Hu','Gao','Luo'];
const given=['Jin','Yu','Rui','Xin','Lei','Min','Yue','Kai'];
for(let i=9;i<=64;i++)people.push([`2026${String(i).padStart(4,'0')}`,'student',`示例学生${i}`,`${given[(i-9)%8]} ${surnames[Math.floor((i-9)/8)]}`,2026,settings.adminClasses[i%settings.adminClasses.length],`Class ${1+i%16}`,i%9===0?1:0,i%13===0?now+7*86400000:0]);
const profile=(u:any[])=>JSON.stringify({chineseName:u[2],englishName:u[3],grade:u[4],adminClass:u[5],teachingClass:u[6],phone:''});
const slots=slotsInRange(settings,'2026-09-07','2027-01-15');
const find=(date:string,start:string)=>{const slot=slots.find(s=>s.date===date&&s.start===start);if(!slot)throw Error(`Missing ${date} ${start}`);return slot;};
const records:any[]=[];
function book(id:string,student:string,status:string,slot:Slot,seat:number,topic:string,score:number|null=null,feedback=''){
 const created=slot.startsAt-2*86400000;
 const history=[{status:'draft',at:created,by:student}];
 if(status!=='draft') history.push({status:'submitted',at:created+60000,by:student});
 if(!['draft','submitted'].includes(status))history.push({status:'approved',at:created+61000,by:'system'});
 if(['in_progress','completed','archived'].includes(status))history.push({status:'in_progress',at:slot.startsAt,by:'STAFF1001'});
 if(['completed','archived'].includes(status))history.push({status:'completed',at:slot.endsAt+60000,by:'STAFF1001'});
 if(status==='archived')history.push({status:'archived',at:slot.endsAt+3600000,by:'STAFF1001'});
 if(status==='cancelled')history.push({status:'cancelled',at:now,by:student});
 records.push({id,student,status,slot,seat,topic,score,feedback,history,created});
}
book('mei-feedback','20260001','completed',find('2026-09-29','18:30'),0,'Applying Kirchhoff’s laws to a two-loop circuit',70,'You chose the current directions consistently and checked both loop equations. Next, practise a circuit with a dependent source and explain each sign before calculating.');
book('mei-archive','20260001','archived',find('2026-09-22','18:30'),0,'Interpreting a circuit diagram',40,'The circuit connections are clear. Label each branch current before writing the equations.');
book('mei-draft','20260001','draft',find('2026-10-06','18:30'),0,'Checking the signs in a two-loop circuit');
book('current-session','20260004','in_progress',find('2026-10-04','18:30'),0,'Solving simultaneous equations for branch currents');
book('recent-attended','20260005','completed',find('2026-10-04','18:00'),0,'Choosing a reference node',40,'Your reference node was suitable. Practise checking units in the final answer.');
book('current-waiting','20260006','approved',find('2026-10-04','18:30'),1,'Using superposition with two sources');
book('future-today','20260007','approved',find('2026-10-04','18:45'),0,'Reading a voltage-current graph');
book('future-tuesday','20260008','approved',find('2026-10-06','18:45'),0,'Working with Thevenin equivalents');
book('pending-approval','20260009','submitted',slots.find(s=>s.id==='extra-unstaffed')!,0,'Choosing a method for circuit analysis');
book('paused-student','20250003','cancelled',find('2026-10-06','19:00'),0,'Reviewing laboratory measurements');
book('past-absent','20260010','completed',find('2026-09-29','18:45'),1,'Preparing for the next laboratory session',0,'No attendance recorded for this tutorial.');
await db.batch([
 db.prepare("UPDATE app_state SET restore_token='manual-fixture' WHERE id=1"),
 ...['sessions','bookings','users','settings','attempts'].map(table=>db.prepare(`DELETE FROM ${table}`)),
 ...people.map(u=>db.prepare('INSERT INTO users(id,role,password,profile,first_login,blocked_until,admin_granted_at) VALUES(?,?,?,?,?,?,?)').bind(u[0],u[1],hash,profile(u),u[7],u[8],['admin','sysadmin'].includes(String(u[1]))?now-90*86400000:null)),
 db.prepare('INSERT INTO settings(id,value) VALUES(1,?)').bind(JSON.stringify(settings)),
 ...records.map(r=>db.prepare('INSERT INTO bookings(id,student_id,status,slot_id,seat,slot,starts_at,ends_at,topic,score,feedback,history,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(r.id,r.student,r.status,r.slot.id,r.seat,JSON.stringify(r.slot),r.slot.startsAt,r.slot.endsAt,r.topic,r.score,r.feedback,JSON.stringify(r.history),r.created)),
 db.prepare("UPDATE app_state SET restore_token='',restore_ready=0,reset_at=NULL WHERE id=1"),
]);
const fk=await db.prepare('PRAGMA foreign_key_check').all();if(fk.results.length)throw Error('Invalid fixture references');
db.close();
writeFileSync(resolve(root,'docs/manual/assets/roster-example.csv'),'\uFEFFid,role,grade,adminClass,teachingClass,chineseName,englishName,phone\n20260901,student,2026,26电H一,Class 1,林悦,Yue Lin,\n20250902,student,2025,26自H一,,徐安,An Xu,\n');
writeFileSync(resolve(root,'docs/manual/assets/timetable-example.csv'),'\uFEFFday,instructors,start,end,location,capacity,startWeek,repeatWeeks\nWednesday,STAFF1001;STAFF1002,18:30,20:05,Engineering Building · Room 302,2,5,12\n');
writeFileSync(resolve(root,'tmp/pdfs/schedu-manual/fixture.json'),JSON.stringify({now:'2026-10-04T18:35:00+08:00',accounts:people.length,bookings:records.length,database:path},null,2));
console.log(`Manual fixture: ${people.length} fictional accounts, ${records.length} bookings. Database: ${path}`);
