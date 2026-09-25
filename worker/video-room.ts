interface VideoEnv { TURN_KEY_ID?: string; TURN_API_TOKEN?: string }
type Member = { id: string; name: string; ready: boolean; seen: number; window: number; count: number; callId?: string; iceAt?: number };
export class VideoRoom {
  constructor(private state: DurableObjectState, private env: VideoEnv) {}
  members() { return this.state.getWebSockets().filter(ws => ws.readyState === 1); }
  send(ws: WebSocket, data: unknown) { try { ws.send(JSON.stringify(data)); } catch {} }
  leave(ws: WebSocket) {
    const current = ws.deserializeAttachment() as Member | null;
    if (!current) return;
    ws.serializeAttachment(null);
    for (const peer of this.members()) {
      if (peer === ws) continue;
      const m = peer.deserializeAttachment() as Member | null;
      if (!m) continue;
      delete m.callId; peer.serializeAttachment(m);
      this.send(peer, {type:'peer-left'});
    }
  }
  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/ice')) {
      if (request.method !== 'POST') return new Response('Method not allowed', {status:405});
      const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');
      const ws=this.members().find(s=>(s.deserializeAttachment() as Member|null)?.id===token);
      if (!token || !ws) return new Response('Join the call first', {status:403});
      const m=ws.deserializeAttachment() as Member;
      if (m.iceAt && Date.now()-m.iceAt<60_000) return new Response('Please wait before retrying', {status:429});
      m.iceAt=Date.now();ws.serializeAttachment(m);
      const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
      if (!this.env.TURN_KEY_ID || !this.env.TURN_API_TOKEN) return reply({iceServers:[{urls:'stun:stun.cloudflare.com:3478'}],relay:false});
      try {
        const r=await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(this.env.TURN_KEY_ID)}/credentials/generate-ice-servers`,{
          method:'POST',headers:{Authorization:`Bearer ${this.env.TURN_API_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({ttl:3600}),signal:AbortSignal.timeout(12000),redirect:'manual'});
        if(!r.ok) return reply({error:'Relay setup failed. Check TURN_KEY_ID and TURN_API_TOKEN in Cloudflare.'},502);
        const data=await r.json() as {iceServers?:unknown[]};
        if(!Array.isArray(data.iceServers)||!data.iceServers.length) throw new Error('Missing ICE servers');
        return reply({iceServers:data.iceServers,relay:true});
      } catch {return reply({error:'Could not reach the relay service. Please try joining again.'},502);}
    }
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required',{status:426});
    const [client,server]=Object.values(new WebSocketPair());
    this.state.acceptWebSocket(server);
    if (this.members().filter(s=>s!==server && s.deserializeAttachment()).length>=2) {
      this.send(server,{type:'full'});server.close(1000,'Video room full');
    } else {
      const m:Member={id:crypto.randomUUID(),name:(url.searchParams.get('name')||'Guest').slice(0,32),ready:false,seen:Date.now(),window:Date.now(),count:0};
      server.serializeAttachment(m);this.send(server,{type:'joined',token:m.id});
      await this.state.storage.setAlarm(Date.now()+60_000);
    }
    return new Response(null,{status:101,webSocket:client});
  }
  webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const m=ws.deserializeAttachment() as Member|null;if(!m)return;
    if(typeof raw!=='string'||raw.length>65536){this.leave(ws);ws.close(1009,'Signal too large');return;}
    if(Date.now()-m.window>10000){m.window=Date.now();m.count=0;}
    if(++m.count>200){this.leave(ws);ws.close(1008,'Too many signals');return;}
    m.seen=Date.now();ws.serializeAttachment(m);
    let data;try{data=JSON.parse(raw);}catch{return;}
    if(data.type==='ping'){this.send(ws,{type:'pong'});return;}
    if(data.type==='leave'){this.leave(ws);ws.close(1000,'Left call');return;}
    if(data.type==='ready') {
      if(m.ready)return;m.ready=true;ws.serializeAttachment(m);
      const peer=this.members().find(s=>s!==ws && (s.deserializeAttachment() as Member|null)?.ready);
      if(peer){const other=peer.deserializeAttachment() as Member;const callId=crypto.randomUUID();
        m.callId=callId;other.callId=callId;ws.serializeAttachment(m);peer.serializeAttachment(other);
        this.send(peer,{type:'start',offerer:true,callId,name:m.name});this.send(ws,{type:'start',offerer:false,callId,name:other.name});
      } else this.send(ws,{type:'waiting'});
      return;
    }
    if(!m.callId||data.callId!==m.callId)return;
    if(data.type==='description' && (!data.description||!['offer','answer'].includes(data.description.type)||typeof data.description.sdp!=='string'))return;
    if(data.type==='candidate' && (!data.candidate||typeof data.candidate.candidate!=='string'||data.candidate.candidate.length>4096))return;
    if(!['description','candidate'].includes(data.type))return;
    for(const peer of this.members())if(peer!==ws&&(peer.deserializeAttachment() as Member|null)?.callId===m.callId)this.send(peer,data);
  }
  webSocketClose(ws:WebSocket){this.leave(ws);}
  webSocketError(ws:WebSocket){this.leave(ws);try{ws.close(1011,'Connection lost');}catch{}}
  async alarm(){for(const ws of this.members()){const m=ws.deserializeAttachment() as Member|null;if(m&&Date.now()-m.seen>90_000){this.leave(ws);ws.close(1000,'Timed out');}}
    if(this.members().some(s=>s.deserializeAttachment()))await this.state.storage.setAlarm(Date.now()+60_000);
  }
}
