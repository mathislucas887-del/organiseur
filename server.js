const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
let store;
if(process.env.DATABASE_URL){
 const {Pool}=require('pg');const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)?false:{rejectUnauthorized:false},max:5});
 const ready=pool.query('CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY,owner TEXT,type TEXT,data TEXT,created BIGINT,updated BIGINT);CREATE INDEX IF NOT EXISTS i1 ON items(owner,type);');
 const q=async(t,v)=>{await ready;return pool.query(t,v)};
 store={kind:'postgres',
  list:async(o,t)=>(await q('SELECT id,data,created,updated FROM items WHERE owner=$1 AND type=$2 ORDER BY created DESC',[o,t])).rows.map(r=>({...r,created:+r.created,updated:+r.updated})),
  insert:(id,o,t,d,n)=>q('INSERT INTO items VALUES($1,$2,$3,$4,$5,$5)',[id,o,t,d,n]),
  update:async(id,o,t,d,n)=>(await q('UPDATE items SET data=$1,updated=$2 WHERE id=$3 AND owner=$4 AND type=$5',[d,n,id,o,t])).rowCount,
  del:(id,o)=>q('DELETE FROM items WHERE id=$1 AND owner=$2',[id,o]),ping:()=>q('SELECT 1')};
}else{
 const DBP=process.env.DB_PATH||path.join(__dirname,'data','organiseur.db');fs.mkdirSync(path.dirname(DBP),{recursive:true});
 const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(DBP);
 db.exec('PRAGMA journal_mode=WAL;CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY,owner TEXT,type TEXT,data TEXT,created INTEGER,updated INTEGER);CREATE INDEX IF NOT EXISTS i1 ON items(owner,type);');
 store={kind:'sqlite',list:async(o,t)=>db.prepare('SELECT id,data,created,updated FROM items WHERE owner=? AND type=? ORDER BY created DESC').all(o,t),
  insert:async(id,o,t,d,n)=>db.prepare('INSERT INTO items VALUES(?,?,?,?,?,?)').run(id,o,t,d,n,n),
  update:async(id,o,t,d,n)=>db.prepare('UPDATE items SET data=?,updated=? WHERE id=? AND owner=? AND type=?').run(d,n,id,o,t).changes,
  del:async(id,o)=>db.prepare("DELETE FROM items WHERE id=? AND owner=?").run(id,o).changes,ping:async()=>1};
}
let podCache={t:0,d:null};const dzCache={};const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
async function deezer(t){if(dzCache[t])return dzCache[t];let u='https://www.deezer.com/fr/search/'+encodeURIComponent(t)+'/show';
 try{const j=await (await fetch('https://api.deezer.com/search/podcast?q='+encodeURIComponent(t))).json();const d=j.data||[];const h=d.find(x=>norm(x.title)==norm(t))||d.find(x=>norm(x.title).includes(norm(t))||norm(t).includes(norm(x.title)));if(h){u='https://www.deezer.com/fr/show/'+h.id;dzCache[t]=u}}catch(e){}return u}
async function podTrends(){if(podCache.d&&Date.now()-podCache.t<6*3600e3)return podCache.d;
 const r=await fetch('https://rss.marketingtools.apple.com/api/v2/fr/podcasts/top/15/podcasts.json');if(!r.ok)throw new Error(r.status);const j=await r.json();
 const items=j.feed.results.map((x,i)=>({rang:i+1,titre:x.name,sous:x.artistName+' · '+(x.genres||[]).map(g=>g.name).slice(0,2).join(', '),cover:(x.artworkUrl100||'').replace('100x100bb','400x400bb'),lien:x.url}));
 for(const it of items)it.deezer=await deezer(it.titre);
 podCache={t:Date.now(),d:{maj:new Date(j.feed.updated).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}),items}};return podCache.d}
const PORT=process.env.PORT||8080, PUB=path.join(__dirname,'public');
const TYPES=['journal','reves','planning','plats','recettes','taches','livres','films','podcasts'];
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.apk':'application/vnd.android.package-archive','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const owner=r=>{const p=r.headers['x-pin'];return p&&p.length>=4?crypto.createHash('sha256').update('org:'+p).digest('hex'):null};
const send=(res,c,o)=>{res.writeHead(c,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,X-PIN','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS'});res.end(JSON.stringify(o))};
const body=r=>new Promise(ok=>{let b='';r.on('data',d=>b+=d);r.on('end',()=>{try{ok(JSON.parse(b||'{}'))}catch{ok({})}})});
http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://x');let p=u.pathname;
 if(req.method==='OPTIONS')return send(res,204,{});
 if(p.startsWith('/api/')){
  if(p==='/api/trends/podcasts'){try{return send(res,200,await podTrends())}catch(e){return send(res,502,{error:'indisponible'})}}
  if(p==='/api/health'){try{await store.ping();return send(res,200,{ok:true,db:store.kind})}catch(e){return send(res,503,{ok:false})}}
  const o=owner(req);if(!o)return send(res,401,{error:'PIN requis (4+ caractères)'});
  const [,,type,id]=p.split('/');if(!TYPES.includes(type))return send(res,404,{error:'type inconnu'});
  const now=Date.now();
  if(req.method==='GET')return send(res,200,(await store.list(o,type)).map(r=>({...JSON.parse(r.data),id:r.id,created:r.created,updated:r.updated})));
  if(req.method==='POST'){const d=await body(req);const nid=crypto.randomUUID();delete d.id;await store.insert(nid,o,type,JSON.stringify(d),now);return send(res,201,{...d,id:nid})}
  if(req.method==='PUT'&&id){const d=await body(req);delete d.id;delete d.created;delete d.updated;const c=await store.update(id,o,type,JSON.stringify(d),now);return send(res,c?200:404,{...d,id})}
  if(req.method==='DELETE'&&id){await store.del(id,o);return send(res,200,{ok:true})}
  return send(res,405,{});
 }
 if(p==='/download'||p==='/download/')p='/download.html';
 if(p==='/')p='/index.html'; if(p.endsWith('/'))p+='index.html';
 const f=path.normalize(path.join(PUB,p));if(!f.startsWith(PUB)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end('404')}
 const h={'Content-Type':mime[path.extname(f)]||'application/octet-stream','Cache-Control':'no-cache'};
 if(f.endsWith('.apk'))h['Content-Disposition']='attachment; filename="organiseur.apk"';
 res.writeHead(200,h);fs.createReadStream(f).pipe(res);
}catch(e){console.error(e);send(res,500,{error:'erreur serveur'})}}).listen(PORT,'0.0.0.0',()=>console.log('Bella Vita on '+PORT));
