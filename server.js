const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {DatabaseSync}=require('node:sqlite');
fs.mkdirSync(path.dirname(process.env.DB_PATH||path.join(__dirname,'data','x')),{recursive:true});const db=new DatabaseSync(process.env.DB_PATH||path.join(__dirname,'data','organiseur.db'));
db.exec(`PRAGMA journal_mode=WAL;CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY,owner TEXT,type TEXT,data TEXT,created INTEGER,updated INTEGER);CREATE INDEX IF NOT EXISTS i1 ON items(owner,type);`);
const PORT=process.env.PORT||8080, PUB=path.join(__dirname,'public');
const TYPES=['journal','reves','planning','plats','recettes','taches','livres','films','podcasts'];
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.apk':'application/vnd.android.package-archive','.json':'application/json','.png':'image/png'};
const owner=r=>{const p=r.headers['x-pin'];return p&&p.length>=4?crypto.createHash('sha256').update('org:'+p).digest('hex'):null};
const send=(res,c,o)=>{res.writeHead(c,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,X-PIN','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS'});res.end(JSON.stringify(o))};
const body=r=>new Promise(ok=>{let b='';r.on('data',d=>b+=d);r.on('end',()=>{try{ok(JSON.parse(b||'{}'))}catch{ok({})}})});
http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://x');let p=u.pathname;
 if(req.method==='OPTIONS')return send(res,204,{});
 if(p.startsWith('/api/')){
  if(p==='/api/health')return send(res,200,{ok:true});
  const o=owner(req);if(!o)return send(res,401,{error:'PIN requis (4+ caractères)'});
  const [,,type,id]=p.split('/');if(!TYPES.includes(type))return send(res,404,{error:'type inconnu'});
  const now=Date.now();
  if(req.method==='GET')return send(res,200,db.prepare('SELECT id,data,created,updated FROM items WHERE owner=? AND type=? ORDER BY created DESC').all(o,type).map(r=>({...JSON.parse(r.data),id:r.id,created:r.created,updated:r.updated})));
  if(req.method==='POST'){const d=await body(req);const nid=crypto.randomUUID();delete d.id;db.prepare('INSERT INTO items VALUES(?,?,?,?,?,?)').run(nid,o,type,JSON.stringify(d),now,now);return send(res,201,{...d,id:nid})}
  if(req.method==='PUT'&&id){const d=await body(req);delete d.id;delete d.created;delete d.updated;const r=db.prepare('UPDATE items SET data=?,updated=? WHERE id=? AND owner=? AND type=?').run(JSON.stringify(d),now,id,o,type);return send(res,r.changes?200:404,{...d,id})}
  if(req.method==='DELETE'&&id){db.prepare('DELETE FROM items WHERE id=? AND owner=?').run(id,o);return send(res,200,{ok:true})}
  return send(res,405,{});
 }
 if(p==='/download'||p==='/download/')p='/download.html';
 if(p==='/')p='/index.html'; if(p.endsWith('/'))p+='index.html';
 const f=path.normalize(path.join(PUB,p));if(!f.startsWith(PUB)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end('404')}
 const h={'Content-Type':mime[path.extname(f)]||'application/octet-stream','Cache-Control':'no-cache'};
 if(f.endsWith('.apk'))h['Content-Disposition']='attachment; filename="organiseur.apk"';
 res.writeHead(200,h);fs.createReadStream(f).pipe(res);
}).listen(PORT,'0.0.0.0',()=>console.log('Organiseur on '+PORT));
