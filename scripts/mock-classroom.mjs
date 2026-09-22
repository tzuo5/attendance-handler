import { createServer } from 'node:http';

export async function createMockClassroom(port = 0) {
  const state = { version: 0, open: false, joined: false, question: null, submissions: [], joins: [], sequence: 0 };
  const control = update => {
    if (update.newQuestion) {
      state.sequence++;
      state.question = { id: `demo-session:q${state.sequence}`, kind: update.newQuestion, title: '课堂问题：请选择一个答案', ended: false, answer: null };
    }
    if (update.endQuestion && state.question) state.question.ended = true;
    if (typeof update.open === 'boolean') state.open = update.open;
    if (typeof update.joined === 'boolean') state.joined = update.joined;
    if (update.clearQuestion) state.question = null;
    state.version++;
  };
  const server = createServer(async (req, res) => {
    const address = server.address();
    if (!address) { res.writeHead(503); res.end(); return; }
    const origin = `http://127.0.0.1:${address.port}`;
    res.setHeader('Cache-Control', 'no-store');
    if (req.url === '/state') {
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ...state, courses: [{ courseId: 'demo', name: '模拟课堂' }] })); return;
    }
    if (req.method === 'POST') {
      if (req.headers.origin && req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json')) { res.writeHead(403); res.end(); return; }
      let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 8192) { res.writeHead(413); res.end(); return; } }
      let body; try { body = JSON.parse(text || '{}'); } catch { res.writeHead(400); res.end(); return; }
      if (req.url === '/control') control(body);
      else if (req.url === '/join') { state.joined = true; state.joins.push(body); state.version++; }
      else if (req.url === '/answer' && state.question && !state.question.ended && body.id === state.question.id) { state.question.answer = body.answer; state.submissions.push(body); state.version++; }
      else { res.writeHead(409); res.end(); return; }
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ success: true })); return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html);
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}`, state, control, close: () => new Promise(resolve => server.close(resolve)) };
}

const html = String.raw`<!DOCTYPE html><html><head><meta charset="utf-8"><title>iClicker · 模拟课堂</title><style>
body{margin:0;background:#f2f5f4;color:#293832;font:16px -apple-system,BlinkMacSystemFont,sans-serif}header{padding:22px 35px;background:#087d6e;color:white;display:flex;justify-content:space-between;align-items:center}header span{font-size:12px;opacity:.7}main{max-width:660px;margin:50px auto;padding:35px;background:white;border:1px solid #ddd;border-radius:12px;min-height:290px}h1{font-size:24px}h2{font-size:20px}p{color:#6b7872;line-height:1.7}button{padding:12px 20px;border:0;border-radius:7px;background:#087d6e;color:white;cursor:pointer;font:inherit}button:disabled{opacity:.5}a{color:#087d6e}app-multiple-choice-question,app-short-answer-question{display:block}.choices{display:flex;gap:12px;margin-top:30px}.choices button{width:70px;height:70px;font-size:24px;background:#e8f3ee;color:#087d6e}.choices button[aria-pressed=true]{background:#087d6e;color:white}#status-text-container-id{padding:14px;background:#f4f6ed;border-radius:6px;font-size:14px;color:#648458}input{padding:12px;font:inherit;border:1px solid #cdd5d0;border-radius:5px}.controls{position:fixed;bottom:0;left:0;right:0;padding:13px 25px;background:#e6ebe8;border-top:1px solid #c6d0c9;display:flex;gap:10px;align-items:center}.controls button{font-size:12px;padding:9px 13px;background:#6a8072}.controls strong{font-size:12px;margin-right:auto}#debug{font-size:11px;color:#89948c;margin-top:24px}</style></head><body><header><strong>iClicker Student</strong><span>本机模拟 · 不连接真实课堂</span></header><main id="content"></main><div class="controls"><strong>模拟教师控制台</strong><button onclick="control({open:true})">开始课堂</button><button onclick="control({newQuestion:'single',open:true})">新单选题</button><button onclick="control({newQuestion:'other',open:true})">新填空题</button><button onclick="control({endQuestion:true})">结束题目</button><button onclick="logout()">退出登录</button></div><script>
let version=-1, snapshot, selected='';
const post=(path,value)=>fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
async function control(value){await post('/control',value);await load(true);}
function login(){sessionStorage.setItem('access_token','demo-access-token');sessionStorage.setItem('refresh_token','demo-refresh-token');location.hash='/courses';load(true);}
function logout(){sessionStorage.clear();location.hash='/login';load(true);}
async function join(){navigator.geolocation.getCurrentPosition(async position=>{await post('/join',{latitude:position.coords.latitude,longitude:position.coords.longitude});location.hash='/class/demo';await load(true);},()=>{document.getElementById('content').innerHTML+='<p>Check In Failed: location unavailable</p>';});}
async function answer(value){selected=value;await post('/answer',{id:snapshot.question.id,answer:value});await load(true);}
async function load(force=false){
 const r=await fetch('/state');snapshot=await r.json();
 if(!force&&snapshot.version===version)return;version=snapshot.version;
 const el=document.getElementById('content');
 if(!sessionStorage.getItem('access_token')){el.innerHTML='<h1>登录模拟课堂</h1><p>这个本机页面复现 iClicker 的签到与答题流程。</p><button id="sign-in-button" onclick="login()">登录模拟账号</button>';return;}
 if(!location.hash.includes('/course/')&&!location.hash.includes('/class/')){el.innerHTML='<h1>Courses</h1><a href="#/course/demo/overview"><span class="course-title">模拟课堂</span></a>';return;}
 if(!snapshot.joined){el.innerHTML='<section class="course-content-area" data-course-overview><h1>模拟课堂</h1><p>'+ (snapshot.open?'Class is in session':'Waiting for instructor to start class')+'</p>'+(snapshot.open?'<button id="btnJoin" onclick="join()">Join</button>':'')+'</section>';return;}
 const q=snapshot.question;
 if(!q){location.hash='/class/demo';el.innerHTML='<section data-attendance="confirmed"><h1>You\'re checked in!</h1><p>Stay on this screen to remain in class. We will let you know when your instructor starts an activity.</p></section>';return;}
 location.hash='/class/demo/poll';
 let status=q.ended?'Polling ended':q.answer?'Answer Received':'Answer';
 let content='<h2 data-question-title>'+q.title+'</h2><div id="status-text-container-id">'+status+'</div>';
 if(q.kind==='single'){content+='<div class="choices">'+['A','B','C','D','E'].map(a=>'<button id="multiple-choice-'+a.toLowerCase()+'" aria-pressed="'+(q.answer===a)+'" '+(q.ended?'disabled':'')+' onclick="answer(\''+a+'\')">'+a+'</button>').join('')+'</div>';el.innerHTML='<app-multiple-choice-question data-question-id="'+q.id+'">'+content+'</app-multiple-choice-question>';}
 else {content+='<p>请填写答案。</p><input id="short-answer" '+(q.ended?'disabled':'')+'/><button '+(q.ended?'disabled':'')+' onclick="answer(document.getElementById(\'short-answer\').value)">Send</button>';el.innerHTML='<app-short-answer-question data-question-type="other" data-question-id="'+q.id+'">'+content+'</app-short-answer-question>';}
 el.innerHTML+='<div id="debug">Question '+q.id+' · 已提交 '+snapshot.submissions.length+' 次</div>';
}
window.addEventListener('hashchange',()=>load(true));setInterval(()=>load().catch(()=>{}),700);load(true);
</script></body></html>`;
