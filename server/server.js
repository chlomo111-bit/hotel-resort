// Serveur du jeu "מלון הפאר" — sans dépendances (Node 18+). Données: data.json
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=+process.env.PORT||8099,ADMIN_PW=process.env.ADMIN_PW||'',DIR=process.env.DATA_DIR||__dirname,DB=path.join(DIR,'data.json');
if(ADMIN_PW.length<8){console.error('ADMIN_PW (8+ caractères) requis');process.exit(1)}
let D={players:{},msgs:[]};try{D=JSON.parse(fs.readFileSync(DB,'utf8'))}catch(e){}
D.players=D.players||{};D.msgs=D.msgs||[];
let dirty=0;const sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
function flush(){if(!dirty)return;dirty=0;const t=DB+'.tmp';fs.writeFileSync(t,JSON.stringify(D));fs.renameSync(t,DB)}
setInterval(flush,5000);
setInterval(()=>{try{fs.mkdirSync(path.join(DIR,'backups'),{recursive:true});flush();const b=path.join(DIR,'backups','data-'+new Date().toISOString().slice(0,13)+'.json');fs.copyFileSync(DB,b);const f=fs.readdirSync(path.join(DIR,'backups')).sort();while(f.length>72)fs.unlinkSync(path.join(DIR,'backups',f.shift()))}catch(e){}},36e5);
process.on('SIGTERM',()=>{flush();process.exit(0)});process.on('SIGINT',()=>{flush();process.exit(0)});
const num=(v,a,b)=>{v=+v;return Number.isFinite(v)?Math.min(b,Math.max(a,v)):0};
const pubOf=p=>({id:p.id,n:p.n,c:p.pub.c||0,inc:p.pub.inc||0,lv:p.pub.lv||1,o:p.pub.o||0,se:p.pub.se||0,ss:p.pub.ss||0,tt:p.pub.tt||'',ts:p.last});
const ADM={},FAIL={};
function body(req){return new Promise((ok,no)=>{let b='',n=0;req.on('data',c=>{n+=c.length;if(n>2e6){no(new Error('big'));req.destroy()}else b+=c});req.on('end',()=>{try{ok(b?JSON.parse(b):{})}catch(e){no(e)}});req.on('error',no)})}
function send(res,c,o,h={}){res.writeHead(c,Object.assign({'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','access-control-allow-headers':'content-type,x-admin','cache-control':'no-store'},h));res.end(typeof o==='string'?o:JSON.stringify(o))}
const clean=s=>String(s||'').replace(/[<>]/g,'').slice(0,14);
http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://x'),p=u.pathname;
 if(req.method==='OPTIONS')return send(res,204,'');
 if(p==='/'||p==='/health')return send(res,200,{ok:1,players:Object.keys(D.players).length});
 if(p==='/admin'||p==='/admin/')return send(res,200,fs.readFileSync(path.join(__dirname,'admin.html'),'utf8'),{'content-type':'text/html; charset=utf-8'});
 // ---- jeu ----
 if(p==='/api/sync'&&req.method==='POST'){const b=await body(req),id=String(b.id||'').slice(0,14),tok=String(b.tok||''),nk=String(b.nk||'').slice(0,32);if(!/^[0-9a-f]{14}$/.test(id)||tok.length<32)return send(res,400,{err:'bad'});
  let pl=D.players[id];const th=sha(tok);
  if(!pl){const dup=Object.values(D.players).find(x=>x.nk&&x.nk===nk);if(dup)return send(res,409,{err:'name'});pl=D.players[id]={id,tok:th,nk,n:clean(b.n),created:Date.now(),last:Date.now(),ban:0,pub:{},save:'',grants:[]};dirty=1}
  else if(pl.tok!==th)return send(res,403,{err:'auth'});
  if(pl.ban)return send(res,200,{banned:1});
  if(b.n)pl.n=clean(b.n);const q=b.pub||{};pl.pub={c:num(q.c,0,1e300),inc:num(q.inc,0,1e300),lv:Math.floor(num(q.lv,1,9999)),o:num(q.o,0,999),se:num(q.se,0,1e6),ss:num(q.ss,0,1e300),tt:String(q.tt||'').slice(0,4)};
  if(typeof b.save==='string'&&b.save.length<1.5e6&&!b.noSave){pl.save=b.save}
  pl.last=Date.now();const gr=pl.grants;pl.grants=[];dirty=1;
  const m=num(b.m,0,9e15);return send(res,200,{ok:1,grants:gr,msgs:D.msgs.filter(x=>x.t>m).slice(-5),count:Object.keys(D.players).length,now:Date.now()})}
 if(p==='/api/load'){const pl=D.players[u.searchParams.get('id')];const tok=u.searchParams.get('tok')||'';if(!pl||pl.tok!==sha(tok)||pl.ban)return send(res,403,{err:'auth'});return send(res,200,{save:pl.save||''})}
 if(p==='/api/check'){const nk=u.searchParams.get('nk')||'',id=u.searchParams.get('id')||'';const d=Object.values(D.players).find(x=>x.nk&&x.nk===nk);return send(res,200,{taken:!!(d&&d.id!==id)})}
 if(p==='/api/board'){const L=Object.values(D.players).filter(x=>!x.ban&&x.pub.c!=null).map(pubOf);return send(res,200,{count:L.length,list:L.sort((a,b)=>b.c-a.c).slice(0,300),now:Date.now()})}
 if(p==='/api/hotel'){const pl=D.players[u.searchParams.get('id')];if(!pl||pl.ban||!pl.save)return send(res,404,{err:'none'});return send(res,200,{sn:pl.save})}
 // ---- admin ----
 if(p==='/admin/api/login'&&req.method==='POST'){const ip=req.headers['x-forwarded-for']||req.socket.remoteAddress,f=FAIL[ip]||(FAIL[ip]={n:0,t:Date.now()});if(Date.now()-f.t>6e4){f.n=0;f.t=Date.now()}if(f.n>=5)return send(res,429,{err:'wait'});const b=await body(req);const a=Buffer.from(sha(b.pw||'')),c=Buffer.from(sha(ADMIN_PW));if(!crypto.timingSafeEqual(a,c)){f.n++;return send(res,403,{err:'pw'})}const t=crypto.randomBytes(24).toString('hex');ADM[t]=Date.now()+12*36e5;return send(res,200,{token:t})}
 if(p.startsWith('/admin/api/')){const t=req.headers['x-admin'];if(!t||!ADM[t]||ADM[t]<Date.now())return send(res,401,{err:'auth'});const a=p.slice(11);
  if(a==='players'){const now=Date.now(),L=Object.values(D.players);return send(res,200,{total:L.length,on:L.filter(x=>now-x.last<12e4).length,d1:L.filter(x=>now-x.last<864e5).length,new1:L.filter(x=>now-x.created<864e5).length,list:L.map(x=>Object.assign(pubOf(x),{created:x.created,ban:x.ban,pend:x.grants.length,size:(x.save||'').length}))})}
  const b=await body(req),pl=D.players[b.id];
  if(a==='grant'&&pl){const g={};if(b.cash)g.cash=num(b.cash,-1e300,1e300);if(b.lv)g.lv=Math.floor(num(b.lv,0,500));if(b.note)g.note=String(b.note).slice(0,80);pl.grants.push(g);dirty=1;return send(res,200,{ok:1})}
  if(a==='ban'&&pl){pl.ban=b.on?1:0;dirty=1;return send(res,200,{ok:1})}
  if(a==='delete'&&pl){delete D.players[b.id];dirty=1;return send(res,200,{ok:1})}
  if(a==='rename'&&pl){pl.n=clean(b.n);dirty=1;return send(res,200,{ok:1})}
  if(a==='resetpw'&&pl){delete D.players[b.id];dirty=1;return send(res,200,{ok:1,note:'compte supprimé: le joueur peut se réinscrire'})}
  if(a==='msg'){const txt=String(b.txt||'').slice(0,120);if(!txt)return send(res,400,{});D.msgs.push({t:Date.now(),txt});D.msgs=D.msgs.slice(-20);dirty=1;return send(res,200,{ok:1})}
  if(a==='view'&&pl){return send(res,200,{save:pl.save})}
  return send(res,404,{err:'?'})}
 send(res,404,{err:'?'})}catch(e){send(res,500,{err:'x'})}}).listen(PORT,'127.0.0.1',()=>console.log('hotel-server sur 127.0.0.1:'+PORT));
